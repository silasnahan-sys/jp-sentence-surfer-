import { Modal, App, Notice } from 'obsidian';
import { DictEngine, SearchResult } from '../dictionary/dict-engine';
import JpSentenceSurferPlugin from '../main';
import { JP_COLLOCATIONS_PLUGIN_ID } from '../constants';

export class DictLookupModal extends Modal {
    private engine: DictEngine;
    private plugin: JpSentenceSurferPlugin;
    private initialQuery: string;
    private contextSentence: string;
    private debounceTimer: number | null = null;

    constructor(
        app: App,
        plugin: JpSentenceSurferPlugin,
        engine: DictEngine,
        initialQuery?: string,
        contextSentence?: string
    ) {
        super(app);
        this.plugin = plugin;
        this.engine = engine;
        this.initialQuery = initialQuery ?? '';
        this.contextSentence = contextSentence ?? '';
    }

    onOpen(): void {
        this.modalEl.addClass('jp-dict-modal');
        this.buildUI();
    }

    onClose(): void {
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.contentEl.empty();
    }

    private buildUI(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Search bar
        const searchBar = contentEl.createEl('div', { cls: 'jp-dict-search-bar' });
        const input = searchBar.createEl('input', {
            cls: 'jp-dict-search-input',
            type: 'text',
            placeholder: '日本語を入力…',
        });
        input.value = this.initialQuery;

        // Results container
        const resultsEl = contentEl.createEl('div', { cls: 'jp-dict-results' });

        input.addEventListener('input', () => {
            if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => {
                this.renderResults(resultsEl, input.value.trim());
            }, 150);
        });

        // Auto-focus and show initial results
        window.setTimeout(() => {
            input.focus();
            if (this.initialQuery) this.renderResults(resultsEl, this.initialQuery);
        }, 50);
    }

    private renderResults(container: HTMLElement, query: string): void {
        container.empty();

        if (!query) {
            container.createEl('div', { cls: 'jp-dict-empty', text: '検索語を入力してください' });
            return;
        }

        const maxResults = this.plugin.settings.dict?.maxResults ?? 20;
        const enableDeco = this.plugin.settings.dict?.enableDeconjugation ?? true;

        let results: SearchResult[];
        if (enableDeco) {
            results = this.engine.search(query, maxResults);
        } else {
            results = this.engine.searchExact(query);
            if (results.length === 0) results = this.engine.searchPrefix(query, maxResults);
        }

        if (results.length === 0) {
            container.createEl('div', { cls: 'jp-dict-empty', text: `「${query}」 の結果が見つかりません` });
            return;
        }

        for (const result of results) {
            const item = container.createEl('div', { cls: 'jp-dict-result-item' });

            item.createEl('div', { cls: 'jp-dict-expression', text: result.entry.expression });
            if (result.entry.reading && result.entry.reading !== result.entry.expression) {
                item.createEl('div', { cls: 'jp-dict-reading', text: result.entry.reading });
            }

            const firstDef = result.entry.definitions[0]?.text ?? '';
            if (firstDef) {
                item.createEl('div', {
                    cls: 'jp-dict-definition-preview',
                    text: firstDef.slice(0, 80) + (firstDef.length > 80 ? '…' : ''),
                });
            }

            item.addEventListener('click', () => {
                this.renderDetail(container, result);
            });
        }
    }

    private renderDetail(container: HTMLElement, result: SearchResult): void {
        container.empty();

        // Back button
        const backBtn = container.createEl('button', { cls: 'jp-dict-back-btn', text: '← Back' });
        backBtn.addEventListener('click', () => {
            const input = this.contentEl.querySelector('.jp-dict-search-input') as HTMLInputElement | null;
            this.renderResults(container, input?.value.trim() ?? '');
        });

        // Context sentence (if any)
        if (this.contextSentence) {
            container.createEl('div', { cls: 'jp-dict-context', text: this.contextSentence });
        }

        const detail = container.createEl('div', { cls: 'jp-dict-detail' });
        detail.createEl('div', { cls: 'jp-dict-detail-expression', text: result.entry.expression });

        if (result.entry.reading && result.entry.reading !== result.entry.expression) {
            detail.createEl('div', { cls: 'jp-dict-detail-reading', text: result.entry.reading });
        }

        // Tags
        if (result.entry.definitionTags.length > 0) {
            const tagsEl = detail.createEl('div', { cls: 'jp-dict-detail-tags' });
            for (const tag of result.entry.definitionTags) {
                tagsEl.createEl('span', { cls: 'jp-dict-tag', text: tag });
            }
        }

        // Deconjugation info
        if (result.deconjugatedForm) {
            detail.createEl('div', {
                cls: 'jp-dict-tag',
                text: `←  ${result.deconjugatedForm}`,
            });
        }

        // Frequency score
        if (this.plugin.settings.dict?.showFrequencyScores) {
            detail.createEl('div', {
                cls: 'jp-dict-tag',
                text: `score: ${result.entry.score}`,
            });
        }

        // Definitions
        const defsEl = detail.createEl('div', { cls: 'jp-dict-detail-defs' });
        for (const def of result.entry.definitions) {
            if (def.text) defsEl.createEl('div', { cls: 'jp-dict-def-item', text: def.text });
        }

        // Action buttons
        const actions = container.createEl('div', { cls: 'jp-dict-actions' });

        const saveCollBtn = actions.createEl('button', {
            cls: 'jp-dict-action-btn',
            text: '💾 Save Collocation',
        });
        saveCollBtn.addEventListener('click', () => this.saveAsCollocation(result.entry));

        const copyBtn = actions.createEl('button', {
            cls: 'jp-dict-action-btn',
            text: '📋 Copy',
        });
        copyBtn.addEventListener('click', async () => {
            const text = `${result.entry.expression}【${result.entry.reading}】\n${result.entry.definitions.map(d => d.text).join('\n')}`;
            await navigator.clipboard.writeText(text);
            new Notice('Copied to clipboard');
        });

        const saveExBtn = actions.createEl('button', {
            cls: 'jp-dict-action-btn',
            text: '📝 Save Example',
        });
        saveExBtn.addEventListener('click', () => {
            const example = this.contextSentence
                ? `${result.entry.expression}（${result.entry.reading}）\n例: ${this.contextSentence}`
                : `${result.entry.expression}（${result.entry.reading}）`;
            navigator.clipboard.writeText(example);
            new Notice('Example saved to clipboard');
        });
    }

    private saveAsCollocation(entry: any): void {
        const plugins = (this.app as any).plugins?.plugins;
        const collPlugin = plugins?.[JP_COLLOCATIONS_PLUGIN_ID];
        if (collPlugin && typeof collPlugin.addEntryFromSurfer === 'function') {
            collPlugin.addEntryFromSurfer({
                expression: entry.expression,
                reading: entry.reading,
                definition: entry.definitions[0]?.text || '',
                source: 'jp-sentence-surfer',
            });
            new Notice(`Saved: ${entry.expression}`);
        } else {
            new Notice(`Collocation saved (jp-collocations not connected): ${entry.expression}`);
        }
    }
}
