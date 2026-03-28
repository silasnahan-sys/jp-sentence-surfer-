/**
 * Yomitan-Style Dictionary Lookup UI
 *
 * Mobile-first (iPhone 17 / iPad Mini 7) dictionary modal.
 * Features:
 *  - Large thumb-friendly search input
 *  - Auto-search on type (debounced)
 *  - Scan mode (from selected text)
 *  - Save as collocation
 *  - Save example sentences
 *  - Bottom-sheet style on mobile
 */

import { App, Modal, Notice, TFile, TFolder } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DictEntry, DictGlossary, SavedSentence } from '../types';
import { glossaryToText, glossaryToHtml } from '../dictionary/dict-engine';
import { JP_COLLOCATIONS_PLUGIN_ID } from '../constants';

export class DictLookupModal extends Modal {
    private plugin: JpSentenceSurferPlugin;
    private initialQuery: string;
    private searchInput: HTMLInputElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(plugin: JpSentenceSurferPlugin, initialQuery = '') {
        super(plugin.app);
        this.plugin = plugin;
        this.initialQuery = initialQuery;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('dict-lookup-modal');

        this.buildUI(contentEl);

        // Auto-search if initial query provided
        if (this.initialQuery) {
            if (this.searchInput) {
                this.searchInput.value = this.initialQuery;
            }
            this.doSearch(this.initialQuery);
        } else {
            // Focus search input
            requestAnimationFrame(() => this.searchInput?.focus());
        }
    }

    onClose(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        const { contentEl } = this;
        contentEl.empty();
    }

    // ─── UI Construction ───────────────────────────────────────────────────────

    private buildUI(root: HTMLElement): void {
        // Header
        const header = root.createDiv({ cls: 'dict-header' });
        header.createEl('h2', { text: '辞書検索', cls: 'dict-title' });

        const closeBtn = header.createEl('button', { cls: 'dict-close-btn', text: '✕' });
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.addEventListener('click', () => this.close());

        // Search bar
        const searchBar = root.createDiv({ cls: 'dict-search-bar' });

        const inputWrapper = searchBar.createDiv({ cls: 'dict-input-wrapper' });
        this.searchInput = inputWrapper.createEl('input', {
            cls: 'dict-search-input',
            attr: {
                type: 'text',
                placeholder: '検索... (日本語を入力)',
                autocomplete: 'off',
                autocorrect: 'off',
                autocapitalize: 'none',
                spellcheck: 'false',
            },
        }) as HTMLInputElement;

        this.searchInput.addEventListener('input', () => {
            const q = this.searchInput!.value;
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.doSearch(q), 250);
        });

        this.searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (this.debounceTimer) clearTimeout(this.debounceTimer);
                this.doSearch(this.searchInput!.value);
            }
        });

        // Clear button
        const clearBtn = inputWrapper.createEl('button', { cls: 'dict-clear-btn', text: '✕' });
        clearBtn.addEventListener('click', () => {
            if (this.searchInput) this.searchInput.value = '';
            this.clearResults();
            this.searchInput?.focus();
        });

        // Paste from clipboard button
        const pasteBtn = searchBar.createEl('button', { cls: 'dict-paste-btn', text: '📋 貼付け' });
        pasteBtn.setAttribute('aria-label', 'Paste from clipboard');
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (this.searchInput && text) {
                    this.searchInput.value = text.slice(0, 30);
                    this.doSearch(this.searchInput.value);
                }
            } catch {
                new Notice('クリップボードの読み取りに失敗しました。');
            }
        });

        // Status bar (dict loaded indicator)
        const statusBar = root.createDiv({ cls: 'dict-status-bar' });
        const engine = this.plugin.dictEngine;
        if (!engine || !engine.isLoaded) {
            statusBar.createSpan({ cls: 'dict-status-warning', text: '⚠ 辞書が読み込まれていません' });
            const loadBtn = statusBar.createEl('button', { cls: 'dict-btn', text: '辞書を読み込む' });
            loadBtn.addEventListener('click', async () => {
                await this.plugin.loadDictionaries();
                statusBar.empty();
                statusBar.createSpan({ cls: 'dict-status-ok', text: `✓ ${engine?.entryCount ?? 0} エントリ` });
                if (this.searchInput?.value) {
                    this.doSearch(this.searchInput.value);
                }
            });
        } else {
            const count = engine.entryCount.toLocaleString();
            statusBar.createSpan({ cls: 'dict-status-ok', text: `✓ ${count} エントリ読み込み済` });
            if (engine.error) {
                statusBar.createSpan({ cls: 'dict-status-warning', text: ` | ${engine.error}` });
            }
        }

        // Results area
        this.resultsEl = root.createDiv({ cls: 'dict-results' });
        this.resultsEl.createEl('p', { cls: 'dict-hint', text: '上の入力欄に検索語を入力してください。' });
    }

    // ─── Search logic ──────────────────────────────────────────────────────────

    private doSearch(query: string): void {
        if (!this.resultsEl) return;

        const q = query.trim();
        if (!q) {
            this.clearResults();
            return;
        }

        const engine = this.plugin.dictEngine;
        if (!engine || !engine.isLoaded) {
            this.showError('辞書が読み込まれていません。まず辞書フォルダを設定してください。');
            return;
        }

        const results = engine.search(q, 40);
        this.renderResults(results, q);
    }

    private clearResults(): void {
        if (!this.resultsEl) return;
        this.resultsEl.empty();
        this.resultsEl.createEl('p', { cls: 'dict-hint', text: '上の入力欄に検索語を入力してください。' });
    }

    private showError(msg: string): void {
        if (!this.resultsEl) return;
        this.resultsEl.empty();
        this.resultsEl.createEl('p', { cls: 'dict-error', text: msg });
    }

    // ─── Results rendering ────────────────────────────────────────────────────

    private renderResults(results: DictEntry[], query: string): void {
        if (!this.resultsEl) return;
        this.resultsEl.empty();

        if (results.length === 0) {
            this.resultsEl.createEl('p', { cls: 'dict-empty', text: `「${query}」は見つかりませんでした。` });
            return;
        }

        const countEl = this.resultsEl.createDiv({ cls: 'dict-results-count' });
        countEl.createSpan({ text: `${results.length} 件` });

        for (const entry of results) {
            this.renderEntry(this.resultsEl, entry);
        }
    }

    private renderEntry(parent: HTMLElement, entry: DictEntry): void {
        const card = parent.createDiv({ cls: 'dict-entry-card' });

        // Term + reading header
        const termHeader = card.createDiv({ cls: 'dict-entry-header' });

        if (entry.reading && entry.reading !== entry.term) {
            termHeader.createDiv({ cls: 'dict-entry-reading', text: entry.reading });
        }
        termHeader.createDiv({ cls: 'dict-entry-term', text: entry.term });

        // Tags row
        const tagsRow = card.createDiv({ cls: 'dict-entry-tags' });
        tagsRow.createSpan({ cls: 'dict-tag dict-tag-dict', text: entry.dictionary });
        for (const tag of entry.definitionTags.slice(0, 3)) {
            tagsRow.createSpan({ cls: 'dict-tag', text: tag });
        }
        for (const rule of entry.rules.slice(0, 2)) {
            tagsRow.createSpan({ cls: 'dict-tag dict-tag-rule', text: rule });
        }

        // Glossary
        const defsEl = card.createDiv({ cls: 'dict-entry-defs' });
        const sentences: Array<{ jp: string; en: string }> = [];

        for (let i = 0; i < entry.glossary.length; i++) {
            const g = entry.glossary[i];
            const defEl = defsEl.createDiv({ cls: 'dict-def' });
            defEl.createSpan({ cls: 'dict-def-num', text: `${i + 1}. ` });

            if (g.type === 'text') {
                defEl.createSpan({ cls: 'dict-def-text', text: String(g.content) });
            } else if (g.type === 'structured-content') {
                // Render as HTML
                const html = glossaryToHtml(g);
                const span = defEl.createEl('span', { cls: 'dict-def-structured' });
                span.innerHTML = html;
                // Extract example sentences from structured content
                this.extractSentences(g, sentences);
            }
        }

        // Example sentences (if any were extracted)
        if (sentences.length > 0) {
            const sentSection = card.createDiv({ cls: 'dict-sentences' });
            sentSection.createEl('h4', { cls: 'dict-sentences-title', text: '例文' });
            for (const s of sentences) {
                this.renderExampleSentence(sentSection, s, entry);
            }
        }

        // Action buttons
        const actions = card.createDiv({ cls: 'dict-entry-actions' });

        const saveCollBtn = actions.createEl('button', {
            cls: 'dict-btn dict-btn-primary',
            text: '＋ コロケーション',
            attr: { 'aria-label': 'Save as collocation' },
        });
        saveCollBtn.addEventListener('click', () => this.saveAsCollocation(entry));

        if (sentences.length > 0) {
            const saveSentBtn = actions.createEl('button', {
                cls: 'dict-btn',
                text: `📖 例文を保存 (${sentences.length})`,
            });
            saveSentBtn.addEventListener('click', () => {
                this.showSaveSentenceDialog(sentences, entry, card);
            });
        }
    }

    private renderExampleSentence(
        parent: HTMLElement,
        sentence: { jp: string; en: string },
        entry: DictEntry,
    ): void {
        const row = parent.createDiv({ cls: 'dict-sentence-row' });

        const textEl = row.createDiv({ cls: 'dict-sentence-text' });
        textEl.createDiv({ cls: 'dict-sentence-jp', text: sentence.jp });
        if (sentence.en) {
            textEl.createDiv({ cls: 'dict-sentence-en', text: sentence.en });
        }

        const saveBtn = row.createEl('button', {
            cls: 'dict-btn dict-btn-sm',
            text: '保存',
            attr: { 'aria-label': 'Save this sentence' },
        });
        saveBtn.addEventListener('click', async () => {
            await this.saveSentence(sentence.jp, sentence.en, entry.reading, entry.dictionary, entry.term);
            saveBtn.textContent = '✓';
            saveBtn.disabled = true;
        });
    }

    private showSaveSentenceDialog(
        sentences: Array<{ jp: string; en: string }>,
        entry: DictEntry,
        insertAfter: HTMLElement,
    ): void {
        // Inline expand — show all sentences with save buttons
        const existing = insertAfter.querySelector('.dict-sentence-expand');
        if (existing) {
            existing.remove();
            return;
        }
        const expand = insertAfter.createDiv({ cls: 'dict-sentence-expand' });
        expand.createEl('h4', { text: '全例文' });
        for (const s of sentences) {
            this.renderExampleSentence(expand, s, entry);
        }
    }

    // ─── Saving ────────────────────────────────────────────────────────────────

    private async saveAsCollocation(entry: DictEntry): Promise<void> {
        const plugins = (this.app as any).plugins as
            | { plugins: Record<string, { searchTerm?: (t: string) => void; addCollocation?: (t: string) => void }> }
            | undefined;
        const collPlugin = plugins?.plugins?.[JP_COLLOCATIONS_PLUGIN_ID];

        if (collPlugin) {
            if (typeof collPlugin.addCollocation === 'function') {
                collPlugin.addCollocation(entry.term);
                new Notice(`「${entry.term}」をコロケーションに追加しました。`);
                return;
            }
        }

        // Fallback: create a markdown note in the configured folder
        const folder = this.plugin.settings.savedCollocationFolder || 'JP Collocations';
        try {
            await this.ensureFolder(folder);
            const fileName = `${folder}/${sanitizeFilename(entry.term)}.md`;
            const existing = this.app.vault.getAbstractFileByPath(fileName);
            if (!existing) {
                const content = `---
term: "${entry.term}"
reading: "${entry.reading}"
tags: [collocation, japanese]
added: "${new Date().toISOString()}"
---

# ${entry.term}

**読み:** ${entry.reading}

**辞書:** ${entry.dictionary}

## 定義

${entry.glossary.map((g, i) => `${i + 1}. ${glossaryToText(g)}`).join('\n')}
`;
                await this.app.vault.create(fileName, content);
            }
            new Notice(`「${entry.term}」をコロケーションに保存しました。`);
        } catch (e) {
            new Notice(`保存に失敗しました: ${String(e)}`);
        }
    }

    private async saveSentence(
        japanese: string,
        translation: string,
        reading: string,
        dictionary: string,
        term: string,
    ): Promise<void> {
        const folder = this.plugin.settings.savedSentencesFolder || 'Saved Sentences';
        try {
            await this.ensureFolder(folder);
            const dateStr = new Date().toISOString().slice(0, 10);
            const fileName = `${folder}/${dateStr}-${sanitizeFilename(japanese.slice(0, 15))}.md`;
            const content = `---
japanese: "${escapeYaml(japanese)}"
reading: "${escapeYaml(reading)}"
translation: "${escapeYaml(translation)}"
source_dictionary: "${escapeYaml(dictionary)}"
term: "${escapeYaml(term)}"
saved_at: "${new Date().toISOString()}"
tags: [sentence, japanese]
---

# ${japanese}

**読み:** ${reading}

**訳:** ${translation}

**出典:** ${dictionary}
`;
            const existing = this.app.vault.getAbstractFileByPath(fileName);
            if (!existing) {
                await this.app.vault.create(fileName, content);
            } else {
                // Append to existing sentence bank
                await this.app.vault.append(existing as TFile, `\n---\n\n${japanese}\n\n${translation}\n`);
            }
            new Notice('例文を保存しました。');
        } catch (e) {
            new Notice(`保存に失敗しました: ${String(e)}`);
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private extractSentences(
        g: DictGlossary,
        out: Array<{ jp: string; en: string }>,
    ): void {
        if (typeof g.content !== 'object') return;
        extractSentencesFromStructured(g.content as object, out);
    }

    private async ensureFolder(path: string): Promise<void> {
        const parts = path.split('/');
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            const existing = this.app.vault.getAbstractFileByPath(current);
            if (!existing) {
                await this.app.vault.createFolder(current);
            }
        }
    }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function extractSentencesFromStructured(
    obj: object,
    out: Array<{ jp: string; en: string }>,
): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
        for (const item of obj as unknown[]) {
            if (typeof item === 'object') extractSentencesFromStructured(item as object, out);
        }
        return;
    }

    const record = obj as Record<string, unknown>;

    // Yomitan structured-content for examples often uses data-content="example-sentence"
    if (
        record.data &&
        typeof record.data === 'object' &&
        (record.data as Record<string, unknown>)['content'] === 'example-sentence'
    ) {
        const jp = extractText(record, 'ja') || extractText(record, 'jp') || '';
        const en = extractText(record, 'en') || '';
        if (jp) out.push({ jp, en });
        return;
    }

    if (record.content) extractSentencesFromStructured(record.content as object, out);
    if (record.data) extractSentencesFromStructured(record.data as object, out);
}

function extractText(obj: Record<string, unknown>, lang: string): string {
    if (!obj || typeof obj !== 'object') return '';
    if (obj.lang === lang && typeof obj.content === 'string') return obj.content;
    let result = '';
    for (const val of Object.values(obj)) {
        if (typeof val === 'object' && val !== null) {
            result = extractText(val as Record<string, unknown>, lang);
            if (result) return result;
        }
    }
    return '';
}

function sanitizeFilename(str: string): string {
    return str
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 50);
}

function escapeYaml(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
