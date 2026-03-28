import { App, Modal, Notice } from 'obsidian';
import { DictEngine, DictSearchResult } from '../dictionary/dict-engine';

export class DictLookupModal extends Modal {
    private engine: DictEngine;
    private initialQuery: string | undefined;
    private resultsContainer: HTMLElement | null = null;
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(app: App, engine: DictEngine, initialQuery?: string) {
        super(app);
        this.engine = engine;
        this.initialQuery = initialQuery;
    }

    onOpen(): void {
        this.modalEl.addClass('jp-dict-modal');
        const { contentEl } = this;
        contentEl.empty();

        // ── Search bar row ────────────────────────────────────────────────────
        const searchRow = contentEl.createDiv({ cls: 'jp-dict-search-row' });

        const input = searchRow.createEl('input', {
            type: 'text',
            placeholder: '日本語を入力...',
            cls: 'jp-dict-input',
        });
        input.style.fontSize = '18px';

        const pasteBtn = searchRow.createEl('button', {
            text: '📋',
            cls: 'jp-dict-paste-btn',
        });
        pasteBtn.title = 'クリップボードから貼り付け';
        pasteBtn.addEventListener('click', () => {
            navigator.clipboard.readText().then(text => {
                if (text) {
                    input.value = text.trim();
                    this.performSearch(input.value);
                }
            }).catch(() => {
                new Notice('クリップボードを読み取れませんでした');
            });
        });

        // ── Results container ────────────────────────────────────────────────
        this.resultsContainer = contentEl.createDiv({ cls: 'jp-dict-results' });

        // ── Debounced input handler ──────────────────────────────────────────
        input.addEventListener('input', () => {
            if (this.searchTimer !== null) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                this.performSearch(input.value);
            }, 300);
        });

        // Pre-fill and search if initial query provided
        if (this.initialQuery) {
            input.value = this.initialQuery;
            this.performSearch(this.initialQuery);
        }

        // Focus input after a short delay to allow the modal to settle
        setTimeout(() => input.focus(), 50);
    }

    performSearch(query: string): void {
        if (!this.resultsContainer) return;
        this.resultsContainer.empty();

        const trimmed = query.trim();
        if (!trimmed) return;

        const results: DictSearchResult[] = this.engine.search(trimmed, 'deconjugated');

        if (results.length === 0) {
            this.resultsContainer.createDiv({ text: '結果なし', cls: 'jp-dict-no-results' });
            return;
        }

        for (const result of results) {
            this.renderResultCard(this.resultsContainer, result);
        }
    }

    private renderResultCard(container: HTMLElement, result: DictSearchResult): void {
        const { entry } = result;
        const card = container.createDiv({ cls: 'jp-dict-result-card' });

        // Headword
        card.createDiv({ text: entry.term, cls: 'jp-dict-headword' });

        // Reading (only if different from term)
        if (entry.reading && entry.reading !== entry.term) {
            card.createDiv({ text: entry.reading, cls: 'jp-dict-reading' });
        }

        // Definitions
        const defsEl = card.createDiv({ cls: 'jp-dict-defs' });
        const defs = entry.definitions;
        for (let i = 0; i < defs.length; i++) {
            const raw = defs[i];
            const text = typeof raw === 'string' ? raw : this.flattenStructuredContent(raw);
            defsEl.createDiv({ text: `${i + 1}. ${text}`, cls: 'jp-dict-def' });
        }

        // Action buttons row
        const actionsRow = card.createDiv({ cls: 'jp-dict-actions' });

        const saveCollBtn = actionsRow.createEl('button', {
            text: 'コロケーション保存',
            cls: 'jp-dict-save-coll',
        });
        saveCollBtn.addEventListener('click', () => {
            new Notice(`Saved as collocation: ${entry.term}`);
        });

        const saveExBtn = actionsRow.createEl('button', {
            text: '例文保存',
            cls: 'jp-dict-save-ex',
        });
        saveExBtn.addEventListener('click', () => {
            new Notice('Example sentence saved');
        });
    }

    /** Recursively flatten StructuredContent to a plain string. */
    private flattenStructuredContent(node: unknown): string {
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(n => this.flattenStructuredContent(n)).join('');
        if (node !== null && typeof node === 'object') {
            const n = node as { content?: unknown };
            if (n.content !== undefined) return this.flattenStructuredContent(n.content);
        }
        return '';
    }

    onClose(): void {
        if (this.searchTimer !== null) {
            clearTimeout(this.searchTimer);
            this.searchTimer = null;
        }
        this.resultsContainer = null;
        const { contentEl } = this;
        contentEl.empty();
    }
}
