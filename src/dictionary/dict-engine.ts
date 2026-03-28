/**
 * Yomitan-Format Dictionary Engine
 *
 * Loads Yomitan-format dictionaries from a vault folder (extracted JSON files)
 * and provides search/scan capabilities.
 *
 * Expected vault folder structure:
 *   <dictionaryFolder>/
 *     <DictName>/
 *       index.json        — dictionary metadata
 *       term_bank_1.json  — term entries (array of arrays)
 *       term_bank_2.json
 *       ...
 */

import { App, TFolder, TFile } from 'obsidian';
import { DictEntry, DictGlossary, DictGlossaryType, DictMeta } from '../types';

// ─── Yomitan term bank row format ─────────────────────────────────────────────
// [term, reading, definitionTags, rules, score, glossary, sequence, termTags]
type TermBankRow = [string, string, string, string, number, (string | object)[], number, string];

// ─── Deconjugation rules ──────────────────────────────────────────────────────

interface DeconjRule {
    suffix: string;
    replacements: string[];
}

const DECONJ_RULES: DeconjRule[] = [
    // て-form → dictionary (consolidated to avoid duplicates)
    { suffix: 'って',    replacements: ['う', 'く', 'ぐ', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'す'] },
    { suffix: 'いて',    replacements: ['く'] },
    { suffix: 'いで',    replacements: ['ぐ'] },
    { suffix: 'して',    replacements: ['す', 'する'] },
    { suffix: 'んで',    replacements: ['ぬ', 'ぶ', 'む'] },
    { suffix: 'て',      replacements: ['る'] },
    // た-form → dictionary
    { suffix: 'った',    replacements: ['う', 'く', 'ぐ', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'す'] },
    { suffix: 'いた',    replacements: ['く'] },
    { suffix: 'いだ',    replacements: ['ぐ'] },
    { suffix: 'した',    replacements: ['す', 'する'] },
    { suffix: 'んだ',    replacements: ['ぬ', 'ぶ', 'む'] },
    { suffix: 'た',      replacements: ['る'] },
    // Negative
    { suffix: 'わない',  replacements: ['う'] },
    { suffix: 'かない',  replacements: ['く'] },
    { suffix: 'がない',  replacements: ['ぐ'] },
    { suffix: 'さない',  replacements: ['す'] },
    { suffix: 'たない',  replacements: ['つ'] },
    { suffix: 'なない',  replacements: ['ぬ'] },
    { suffix: 'ばない',  replacements: ['ぶ'] },
    { suffix: 'まない',  replacements: ['む'] },
    { suffix: 'らない',  replacements: ['る'] },
    { suffix: 'しない',  replacements: ['する'] },
    { suffix: 'こない',  replacements: ['くる'] },
    { suffix: 'ない',    replacements: ['る'] },
    // ている
    { suffix: 'ている',  replacements: ['る'] },
    { suffix: 'てる',    replacements: ['る'] },
    // Masu-form
    { suffix: 'います',  replacements: ['う'] },
    { suffix: 'きます',  replacements: ['く'] },
    { suffix: 'ぎます',  replacements: ['ぐ'] },
    { suffix: 'します',  replacements: ['す', 'する'] },
    { suffix: 'ちます',  replacements: ['つ'] },
    { suffix: 'にます',  replacements: ['ぬ'] },
    { suffix: 'びます',  replacements: ['ぶ'] },
    { suffix: 'みます',  replacements: ['む'] },
    { suffix: 'ります',  replacements: ['る'] },
    { suffix: 'ます',    replacements: ['る'] },
    // i-adjective
    { suffix: 'くない',  replacements: ['い'] },
    { suffix: 'くて',    replacements: ['い'] },
    { suffix: 'かった',  replacements: ['い'] },
];

// ─── DictEngine ───────────────────────────────────────────────────────────────

export class DictEngine {
    private app: App;
    private entries: DictEntry[] = [];
    private loaded = false;
    private loadError: string | null = null;

    constructor(app: App) {
        this.app = app;
    }

    get isLoaded(): boolean {
        return this.loaded;
    }

    get entryCount(): number {
        return this.entries.length;
    }

    get error(): string | null {
        return this.loadError;
    }

    // ── Loading ───────────────────────────────────────────────────────────────

    /**
     * Load all dictionaries from the configured vault folder.
     * The folder should contain one sub-folder per dictionary, each with
     * an index.json and term_bank_*.json files.
     */
    async loadFromVault(folderPath: string): Promise<void> {
        this.entries = [];
        this.loaded = false;
        this.loadError = null;

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            this.loadError = `フォルダが見つかりません: ${folderPath}`;
            this.loaded = true;
            return;
        }

        let loaded = 0;
        for (const child of folder.children) {
            if (child instanceof TFolder) {
                try {
                    await this.loadDictFolder(child);
                    loaded++;
                } catch (e) {
                    console.warn(`[DictEngine] Failed to load dict ${child.name}:`, e);
                }
            }
        }

        this.loaded = true;
        if (loaded === 0) {
            this.loadError = `辞書が見つかりません: ${folderPath}`;
        }
    }

    private async loadDictFolder(folder: TFolder): Promise<void> {
        // Read index.json
        const indexFile = folder.children.find(
            f => f instanceof TFile && f.name === 'index.json'
        ) as TFile | undefined;

        let dictName = folder.name;
        if (indexFile) {
            try {
                const indexData: DictMeta = JSON.parse(await this.app.vault.read(indexFile));
                dictName = indexData.title ?? folder.name;
            } catch { /* use folder name */ }
        }

        // Read all term_bank_*.json files
        const termFiles = folder.children.filter(
            f => f instanceof TFile && /^term_bank_\d+\.json$/.test(f.name)
        ) as TFile[];

        for (const termFile of termFiles) {
            try {
                const content = await this.app.vault.read(termFile);
                const rows: TermBankRow[] = JSON.parse(content);
                for (const row of rows) {
                    this.entries.push(parseTermBankRow(row, dictName));
                }
            } catch (e) {
                console.warn(`[DictEngine] Failed to parse ${termFile.path}:`, e);
            }
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────

    /** Exact match search */
    exactSearch(term: string): DictEntry[] {
        return this.entries
            .filter(e => e.term === term || e.reading === term)
            .sort((a, b) => b.score - a.score);
    }

    /** Prefix match search */
    prefixSearch(term: string, limit = 20): DictEntry[] {
        return this.entries
            .filter(e => e.term.startsWith(term) || e.reading.startsWith(term))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Full search: exact + prefix + deconjugation, deduplicated.
     */
    search(query: string, limit = 50): DictEntry[] {
        if (!query.trim()) return [];

        const results: DictEntry[] = [];
        const seen = new Set<string>();

        const add = (entries: DictEntry[]) => {
            for (const e of entries) {
                const key = `${e.term}:${e.reading}:${e.dictionary}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push(e);
                }
            }
        };

        // 1. Exact match (highest priority)
        add(this.exactSearch(query));

        // 2. Prefix match
        add(this.prefixSearch(query, limit));

        // 3. Deconjugated forms
        for (const form of this.deconjugate(query)) {
            add(this.exactSearch(form));
        }

        return results.slice(0, limit);
    }

    /**
     * Scan mode: given a text string, find all possible dictionary hits
     * starting at each position, ordered by length (longest match first).
     */
    scan(text: string, maxLength = 20): DictEntry[] {
        const results: DictEntry[] = [];
        const seen = new Set<string>();

        // Try substrings from longest to shortest
        for (let len = Math.min(text.length, maxLength); len > 0; len--) {
            const sub = text.slice(0, len);
            for (const e of this.exactSearch(sub)) {
                const key = `${e.term}:${e.reading}:${e.dictionary}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push(e);
                }
            }
        }

        return results;
    }

    // ── Deconjugation ─────────────────────────────────────────────────────────

    /**
     * Generate possible dictionary forms from an inflected form.
     */
    private deconjugate(word: string): string[] {
        const forms = new Set<string>();

        for (const rule of DECONJ_RULES) {
            if (word.endsWith(rule.suffix)) {
                const stem = word.slice(0, word.length - rule.suffix.length);
                for (const ending of rule.replacements) {
                    forms.add(stem + ending);
                }
            }
        }

        return Array.from(forms);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTermBankRow(row: TermBankRow, dictName: string): DictEntry {
    const [term, reading, defTags, rules, score, glossaryRaw, sequence] = row;

    const glossary: DictGlossary[] = (glossaryRaw ?? []).map(g => {
        if (typeof g === 'string') {
            return { type: 'text' as DictGlossaryType, content: g };
        } else if (typeof g === 'object' && g !== null) {
            // Structured content
            return { type: 'structured-content' as DictGlossaryType, content: g };
        }
        return { type: 'text' as DictGlossaryType, content: String(g) };
    });

    return {
        term: term ?? '',
        reading: reading ?? '',
        definitionTags: defTags ? defTags.split(' ').filter(Boolean) : [],
        rules: rules ? rules.split(' ').filter(Boolean) : [],
        score: score ?? 0,
        glossary,
        sequence: sequence ?? 0,
        dictionary: dictName,
    };
}

/**
 * Render a glossary item to a plain text string (for simple display).
 */
export function glossaryToText(g: DictGlossary): string {
    if (typeof g.content === 'string') return g.content;
    // Structured content — extract text recursively
    return extractTextFromStructured(g.content as object);
}

function extractTextFromStructured(obj: object): string {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) {
        return (obj as unknown[]).map(item =>
            typeof item === 'string' ? item : extractTextFromStructured(item as object)
        ).join(' ');
    }
    const record = obj as Record<string, unknown>;
    if (record.content) return extractTextFromStructured(record.content as object);
    if (record.text) return String(record.text);
    if (record.data) return extractTextFromStructured(record.data as object);
    return '';
}

/**
 * Render structured-content glossary to HTML string.
 */
export function glossaryToHtml(g: DictGlossary): string {
    if (g.type === 'text' || typeof g.content === 'string') {
        return escapeHtml(String(g.content));
    }
    return structuredToHtml(g.content as object);
}

function structuredToHtml(obj: object): string {
    if (!obj) return '';
    if (typeof obj === 'string') return escapeHtml(obj);
    if (Array.isArray(obj)) {
        return (obj as unknown[]).map(item =>
            typeof item === 'string' ? escapeHtml(item) : structuredToHtml(item as object)
        ).join('');
    }

    const record = obj as Record<string, unknown>;
    const tag = (record.tag as string) ?? 'span';
    const content = record.content ? structuredToHtml(record.content as object) : '';
    const style = record.style ? ` style="${escapeHtml(JSON.stringify(record.style))}"` : '';
    const data = record.data ? ` data-attr="${escapeHtml(JSON.stringify(record.data))}"` : '';

    if (!content && record.text) {
        return `<${tag}${style}>${escapeHtml(String(record.text))}</${tag}>`;
    }

    return content ? `<${tag}${style}>${content}</${tag}>` : '';
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
