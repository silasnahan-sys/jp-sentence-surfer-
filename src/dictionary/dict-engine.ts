/**
 * dict-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dictionary loading, search, and deconjugation for Yomitan-format
 * term_bank JSON files.
 *
 * Dictionaries are stored as .zip files (Yomitan format) in a configurable
 * vault folder.  This engine loads them on demand and caches in memory.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { App, TFile } from 'obsidian';
import {
    DictEntry,
    DictSearchOptions,
    DictSearchResult,
    DeconjugationRule,
    LoadedDictionary,
    YomitanTermRow,
} from './dict-types';

// ─── Deconjugation rules ──────────────────────────────────────────────────────

/** Minimal Japanese verb/adjective deconjugation rules. */
const DECONJ_RULES: DeconjugationRule[] = [
    // て-form / た-form
    { inflected: 'いた', base: 'く', type: 'v5k', reason: 'past' },
    { inflected: 'いで', base: 'ぐ', type: 'v5g', reason: 'te-form' },
    { inflected: 'いて', base: 'く', type: 'v5k', reason: 'te-form' },
    { inflected: 'った', base: 'う', type: 'v5u', reason: 'past' },
    { inflected: 'った', base: 'つ', type: 'v5t', reason: 'past' },
    { inflected: 'った', base: 'る', type: 'v5r', reason: 'past' },
    { inflected: 'って', base: 'う', type: 'v5u', reason: 'te-form' },
    { inflected: 'って', base: 'つ', type: 'v5t', reason: 'te-form' },
    { inflected: 'って', base: 'る', type: 'v5r', reason: 'te-form' },
    { inflected: 'んだ', base: 'む', type: 'v5m', reason: 'past' },
    { inflected: 'んだ', base: 'ぬ', type: 'v5n', reason: 'past' },
    { inflected: 'んだ', base: 'ぶ', type: 'v5b', reason: 'past' },
    { inflected: 'んで', base: 'む', type: 'v5m', reason: 'te-form' },
    { inflected: 'んで', base: 'ぬ', type: 'v5n', reason: 'te-form' },
    { inflected: 'んで', base: 'ぶ', type: 'v5b', reason: 'te-form' },
    { inflected: 'した', base: 'す', type: 'v5s', reason: 'past' },
    { inflected: 'して', base: 'す', type: 'v5s', reason: 'te-form' },
    { inflected: 'いた', base: 'く', type: 'v5k', reason: 'past' },
    // ます-form
    { inflected: 'います', base: 'う', type: 'v5', reason: 'polite' },
    { inflected: 'きます', base: 'く', type: 'v5', reason: 'polite' },
    { inflected: 'ぎます', base: 'ぐ', type: 'v5', reason: 'polite' },
    { inflected: 'します', base: 'す', type: 'v5', reason: 'polite' },
    { inflected: 'ちます', base: 'つ', type: 'v5', reason: 'polite' },
    { inflected: 'にます', base: 'ぬ', type: 'v5', reason: 'polite' },
    { inflected: 'びます', base: 'ぶ', type: 'v5', reason: 'polite' },
    { inflected: 'みます', base: 'む', type: 'v5', reason: 'polite' },
    { inflected: 'ります', base: 'る', type: 'v5', reason: 'polite' },
    { inflected: 'ます', base: 'る', type: 'v1', reason: 'polite' },
    // ない-form
    { inflected: 'わない', base: 'う', type: 'v5', reason: 'negative' },
    { inflected: 'かない', base: 'く', type: 'v5', reason: 'negative' },
    { inflected: 'がない', base: 'ぐ', type: 'v5', reason: 'negative' },
    { inflected: 'さない', base: 'す', type: 'v5', reason: 'negative' },
    { inflected: 'たない', base: 'つ', type: 'v5', reason: 'negative' },
    { inflected: 'なない', base: 'ぬ', type: 'v5', reason: 'negative' },
    { inflected: 'ばない', base: 'ぶ', type: 'v5', reason: 'negative' },
    { inflected: 'まない', base: 'む', type: 'v5', reason: 'negative' },
    { inflected: 'らない', base: 'る', type: 'v5', reason: 'negative' },
    { inflected: 'ない', base: 'る', type: 'v1', reason: 'negative' },
    // Potential
    { inflected: 'える', base: 'う', type: 'v5', reason: 'potential' },
    { inflected: 'ける', base: 'く', type: 'v5', reason: 'potential' },
    { inflected: 'げる', base: 'ぐ', type: 'v5', reason: 'potential' },
    { inflected: 'せる', base: 'す', type: 'v5', reason: 'potential' },
    { inflected: 'てる', base: 'つ', type: 'v5', reason: 'potential' },
    { inflected: 'ねる', base: 'ぬ', type: 'v5', reason: 'potential' },
    { inflected: 'べる', base: 'ぶ', type: 'v5', reason: 'potential' },
    { inflected: 'める', base: 'む', type: 'v5', reason: 'potential' },
    { inflected: 'れる', base: 'る', type: 'v5', reason: 'potential' },
    { inflected: 'られる', base: 'る', type: 'v1', reason: 'potential' },
    // Volitional
    { inflected: 'おう', base: 'う', type: 'v5', reason: 'volitional' },
    { inflected: 'こう', base: 'く', type: 'v5', reason: 'volitional' },
    { inflected: 'ごう', base: 'ぐ', type: 'v5', reason: 'volitional' },
    { inflected: 'そう', base: 'す', type: 'v5', reason: 'volitional' },
    { inflected: 'とう', base: 'つ', type: 'v5', reason: 'volitional' },
    { inflected: 'のう', base: 'ぬ', type: 'v5', reason: 'volitional' },
    { inflected: 'ぼう', base: 'ぶ', type: 'v5', reason: 'volitional' },
    { inflected: 'もう', base: 'む', type: 'v5', reason: 'volitional' },
    { inflected: 'ろう', base: 'る', type: 'v5', reason: 'volitional' },
    { inflected: 'よう', base: 'る', type: 'v1', reason: 'volitional' },
    // i-adjective
    { inflected: 'かった', base: 'い', type: 'adj-i', reason: 'past' },
    { inflected: 'くて', base: 'い', type: 'adj-i', reason: 'te-form' },
    { inflected: 'くない', base: 'い', type: 'adj-i', reason: 'negative' },
    { inflected: 'くなかった', base: 'い', type: 'adj-i', reason: 'negative past' },
    // suru compounds
    { inflected: 'した', base: 'する', type: 'vs', reason: 'past' },
    { inflected: 'して', base: 'する', type: 'vs', reason: 'te-form' },
    { inflected: 'しない', base: 'する', type: 'vs', reason: 'negative' },
    { inflected: 'できた', base: 'できる', type: 'v1', reason: 'past' },
    { inflected: 'できて', base: 'できる', type: 'v1', reason: 'te-form' },
    { inflected: 'できない', base: 'できる', type: 'v1', reason: 'negative' },
];

// ─── Engine ───────────────────────────────────────────────────────────────────

export class DictEngine {
    private app: App;
    private dictionaryFolder: string;
    private dictionaries: LoadedDictionary[] = [];
    private loaded = false;
    private loading = false;

    constructor(app: App, dictionaryFolder: string) {
        this.app = app;
        this.dictionaryFolder = dictionaryFolder;
    }

    updateFolder(folder: string): void {
        if (folder !== this.dictionaryFolder) {
            this.dictionaryFolder = folder;
            this.dictionaries = [];
            this.loaded = false;
        }
    }

    // ─── Loading ──────────────────────────────────────────────────────────────

    async loadDictionaries(): Promise<void> {
        if (this.loaded || this.loading) return;
        this.loading = true;
        this.dictionaries = [];

        try {
            const folder = this.app.vault.getAbstractFileByPath(this.dictionaryFolder);
            if (!folder) {
                console.warn(`[DictEngine] Dictionary folder not found: ${this.dictionaryFolder}`);
                return;
            }

            const allFiles = this.app.vault.getFiles().filter(f =>
                f.path.startsWith(this.dictionaryFolder + '/') ||
                f.path.startsWith(this.dictionaryFolder)
            );

            // Look for JSON term banks directly (pre-extracted Yomitan folders)
            const termBankFiles = allFiles.filter(f =>
                /term_bank_\d+\.json$/i.test(f.name)
            );

            if (termBankFiles.length === 0) {
                // Look for index.json to find dict name
                const indexFile = allFiles.find(f => f.name === 'index.json');
                if (indexFile) {
                    await this.loadDictFolder(
                        indexFile.parent?.path ?? this.dictionaryFolder,
                        allFiles
                    );
                } else {
                    // Try each subfolder as a separate dictionary
                    const subFolders = new Set(
                        allFiles.map(f => f.parent?.path ?? '').filter(Boolean)
                    );
                    for (const folder of subFolders) {
                        const folderFiles = allFiles.filter(f =>
                            (f.parent?.path ?? '') === folder
                        );
                        await this.loadDictFolder(folder, folderFiles);
                    }
                }
            } else {
                await this.loadDictFolder(this.dictionaryFolder, allFiles);
            }
        } finally {
            this.loaded = true;
            this.loading = false;
        }
    }

    private async loadDictFolder(folderPath: string, files: TFile[]): Promise<void> {
        // Read index.json for metadata
        let dictName = folderPath.split('/').pop() ?? 'Unknown';
        let version = '0';
        let revision = '0';

        const indexFile = files.find(f =>
            f.path === folderPath + '/index.json' || f.name === 'index.json'
        );
        if (indexFile) {
            try {
                const indexData = JSON.parse(await this.app.vault.read(indexFile));
                dictName = indexData.title ?? dictName;
                version = String(indexData.version ?? 0);
                revision = indexData.revision ?? '0';
            } catch (_) { /* ignore */ }
        }

        const entries: DictEntry[] = [];
        const termBankFiles = files.filter(f =>
            /term_bank_\d+\.json$/i.test(f.name)
        ).sort((a, b) => a.name.localeCompare(b.name));

        for (const tf of termBankFiles) {
            try {
                const raw = await this.app.vault.read(tf);
                const rows: YomitanTermRow[] = JSON.parse(raw);
                for (const row of rows) {
                    if (!Array.isArray(row) || row.length < 8) continue;
                    entries.push({
                        term: row[0],
                        reading: row[1],
                        definitionTags: row[2],
                        rules: row[3],
                        score: row[4],
                        definitions: Array.isArray(row[5]) ? row[5] : [row[5]],
                        sequence: row[6],
                        termTags: row[7],
                        dictName,
                    });
                }
            } catch (e) {
                console.warn(`[DictEngine] Failed to parse ${tf.path}:`, e);
            }
        }

        if (entries.length > 0) {
            this.dictionaries.push({ name: dictName, version, revision, entries, path: folderPath });
            console.log(`[DictEngine] Loaded ${entries.length} entries from "${dictName}"`);
        }
    }

    // ─── Search ───────────────────────────────────────────────────────────────

    async search(query: string, options: DictSearchOptions = {}): Promise<DictSearchResult[]> {
        if (!this.loaded) await this.loadDictionaries();
        const { maxResults = 50, includeDeconjugated = true } = options;

        const results: DictSearchResult[] = [];
        const seen = new Set<string>();

        for (const dict of this.dictionaries) {
            // Exact matches
            for (const entry of dict.entries) {
                if (entry.term === query || entry.reading === query) {
                    const key = `${entry.dictName}:${entry.term}:${entry.reading}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        results.push({ entry, dictName: dict.name, matchType: 'exact', matchedSurface: query });
                    }
                }
            }
        }

        // Prefix matches
        if (results.length < maxResults) {
            for (const dict of this.dictionaries) {
                for (const entry of dict.entries) {
                    if (
                        (entry.term.startsWith(query) || entry.reading.startsWith(query)) &&
                        entry.term !== query && entry.reading !== query
                    ) {
                        const key = `${entry.dictName}:${entry.term}:${entry.reading}:prefix`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            results.push({ entry, dictName: dict.name, matchType: 'prefix', matchedSurface: query });
                        }
                    }
                    if (results.length >= maxResults) break;
                }
                if (results.length >= maxResults) break;
            }
        }

        // Deconjugated matches
        if (includeDeconjugated && results.length < maxResults) {
            const bases = this.deconjugate(query);
            for (const base of bases) {
                for (const dict of this.dictionaries) {
                    for (const entry of dict.entries) {
                        if (entry.term === base || entry.reading === base) {
                            const key = `${entry.dictName}:${entry.term}:${entry.reading}:deconj`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                results.push({ entry, dictName: dict.name, matchType: 'deconjugated', matchedSurface: query });
                            }
                        }
                        if (results.length >= maxResults) break;
                    }
                    if (results.length >= maxResults) break;
                }
            }
        }

        // Sort: exact first, then by score desc
        return results
            .sort((a, b) => {
                if (a.matchType !== b.matchType) {
                    const order = { exact: 0, prefix: 1, deconjugated: 2 };
                    return order[a.matchType] - order[b.matchType];
                }
                return b.entry.score - a.entry.score;
            })
            .slice(0, maxResults);
    }

    /**
     * Scan mode: try all substrings of `text` from position `start`,
     * working from longest to shortest (up to `scanLength` chars).
     */
    async scan(
        text: string,
        start: number = 0,
        options: DictSearchOptions = {},
    ): Promise<DictSearchResult[]> {
        if (!this.loaded) await this.loadDictionaries();
        const scanLength = options.scanLength ?? 10;

        for (let len = Math.min(scanLength, text.length - start); len > 0; len--) {
            const substr = text.slice(start, start + len);
            const results = await this.search(substr, { ...options, maxResults: 20 });
            if (results.length > 0) return results;
        }
        return [];
    }

    // ─── Deconjugation ────────────────────────────────────────────────────────

    deconjugate(inflected: string): string[] {
        const bases = new Set<string>();
        for (const rule of DECONJ_RULES) {
            if (inflected.endsWith(rule.inflected)) {
                const stem = inflected.slice(0, -rule.inflected.length);
                bases.add(stem + rule.base);
            }
        }
        return [...bases];
    }

    // ─── Accessors ────────────────────────────────────────────────────────────

    getDictionaryNames(): string[] {
        return this.dictionaries.map(d => d.name);
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    totalEntries(): number {
        return this.dictionaries.reduce((sum, d) => sum + d.entries.length, 0);
    }

    reload(): void {
        this.dictionaries = [];
        this.loaded = false;
    }
}
