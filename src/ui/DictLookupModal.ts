/**
 * DictLookupModal.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bottom-sheet dictionary lookup modal — Yomitan-style, mobile-first.
 * Optimised for iPhone 17 / iPad Mini 7.
 *
 * Features:
 *  - Bottom-sheet slide-up animation
 *  - Large touch targets (44pt+)
 *  - Swipe-down to dismiss
 *  - Keyboard-aware repositioning
 *  - Safe area insets (Dynamic Island)
 *  - Scan mode: tap text → auto-lookup from cursor position
 *  - Save entry as collocation (jp-collocations integration)
 *  - Save individual example sentence to vault
 *
 * CSS classes: jp-surfer-dict-*
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { App, Modal, Notice, TFile, MarkdownView } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DictEngine } from '../dictionary/dict-engine';
import { DictSearchResult } from '../dictionary/dict-types';
import { JP_COLLOCATIONS_PLUGIN_ID } from '../constants';

export class DictLookupModal extends Modal {
    private plugin: JpSentenceSurferPlugin;
    private engine: DictEngine;
    private initialQuery: string;

    // DOM refs
    private sheetEl!: HTMLElement;
    private handleEl!: HTMLElement;
    private searchInputEl!: HTMLInputElement;
    private statusEl!: HTMLElement;
    private resultsEl!: HTMLElement;
    private currentQuery = '';

    // Swipe state
    private dragStartY = 0;
    private isDragging = false;

    // Keyboard listener cleanup
    private _viewportResizeHandler: (() => void) | null = null;

    constructor(app: App, plugin: JpSentenceSurferPlugin, engine: DictEngine, initialQuery = '') {
        super(app);
        this.plugin = plugin;
        this.engine = engine;
        this.initialQuery = initialQuery;
        this.modalEl.addClass('jp-surfer-dict-modal-container');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('jp-surfer-dict-modal-content');

        // Sheet wrapper (the actual bottom sheet)
        this.sheetEl = contentEl.createDiv({ cls: 'jp-surfer-dict-sheet' });

        // Drag handle
        this.handleEl = this.sheetEl.createDiv({ cls: 'jp-surfer-dict-handle' });
        this.handleEl.createDiv({ cls: 'jp-surfer-dict-handle-bar' });

        // Header row
        const header = this.sheetEl.createDiv({ cls: 'jp-surfer-dict-header' });
        header.createEl('h2', { text: '辞書検索', cls: 'jp-surfer-dict-title' });
        const closeBtn = header.createEl('button', { cls: 'jp-surfer-dict-close', text: '✕' });
        closeBtn.setAttribute('aria-label', '閉じる');
        closeBtn.addEventListener('click', () => this.close());

        // Search bar
        const searchBar = this.sheetEl.createDiv({ cls: 'jp-surfer-dict-searchbar' });
        this.searchInputEl = searchBar.createEl('input', {
            cls: 'jp-surfer-dict-input',
            attr: {
                type: 'search',
                placeholder: '日本語で検索…',
                'aria-label': '辞書検索',
                autocomplete: 'off',
                autocorrect: 'off',
                autocapitalize: 'none',
                spellcheck: 'false',
            },
        }) as HTMLInputElement;
        this.searchInputEl.value = this.initialQuery;

        const searchBtn = searchBar.createEl('button', { cls: 'jp-surfer-dict-search-btn', text: '検索' });
        searchBtn.setAttribute('aria-label', '検索');
        searchBtn.addEventListener('click', () => this.doSearch());
        this.searchInputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') this.doSearch();
        });

        // Scan button (from cursor)
        const scanBtn = this.sheetEl.createEl('button', { cls: 'jp-surfer-dict-scan-btn', text: '📍 カーソル位置をスキャン' });
        scanBtn.addEventListener('click', () => this.scanFromCursor());

        // Status line
        this.statusEl = this.sheetEl.createDiv({ cls: 'jp-surfer-dict-status' });

        // Results area
        this.resultsEl = this.sheetEl.createDiv({ cls: 'jp-surfer-dict-results' });

        // Swipe-to-dismiss
        this.attachSwipeHandlers();

        // Keyboard-aware: shift sheet up when keyboard opens
        this.attachKeyboardHandlers();

        // Auto-search if initial query provided
        if (this.initialQuery) {
            this.doSearch();
        } else {
            this.updateStatus('辞書: ' + (this.engine.isLoaded()
                ? this.engine.getDictionaryNames().join(', ') || '辞書が見つかりません'
                : '辞書を読み込み中…'));
        }

        // Focus input
        setTimeout(() => this.searchInputEl.focus(), 100);
    }

    onClose(): void {
        // Clean up keyboard listener
        if (this._viewportResizeHandler && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this._viewportResizeHandler);
            this._viewportResizeHandler = null;
        }
        this.contentEl.empty();
    }

    // ─── Search ───────────────────────────────────────────────────────────────

    private async doSearch(): Promise<void> {
        const query = this.searchInputEl.value.trim();
        if (!query) return;
        this.currentQuery = query;
        this.updateStatus('検索中…');
        this.resultsEl.empty();

        try {
            const results = await this.engine.search(query, {
                maxResults: this.plugin.settings.dictionary.dictScanLength || 20,
                includeDeconjugated: true,
            });
            this.renderResults(results, query);
        } catch (e) {
            this.updateStatus('エラー: ' + String(e));
        }
    }

    private async scanFromCursor(): Promise<void> {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            this.updateStatus('アクティブなエディタがありません');
            return;
        }
        const cursor = view.editor.getCursor();
        const line = view.editor.getLine(cursor.line);
        const fromCh = cursor.ch;
        const snippet = line.slice(fromCh);

        if (!snippet.trim()) {
            this.updateStatus('カーソル位置にテキストがありません');
            return;
        }

        this.updateStatus('スキャン中…');
        this.resultsEl.empty();

        try {
            const results = await this.engine.scan(snippet, 0, {
                maxResults: 20,
                scanLength: this.plugin.settings.dictionary.dictScanLength || 10,
            });
            if (results.length > 0) {
                this.searchInputEl.value = results[0].matchedSurface;
                this.currentQuery = results[0].matchedSurface;
            }
            this.renderResults(results, snippet);
        } catch (e) {
            this.updateStatus('エラー: ' + String(e));
        }
    }

    // ─── Rendering results ────────────────────────────────────────────────────

    private renderResults(results: DictSearchResult[], query: string): void {
        this.resultsEl.empty();

        if (!this.engine.isLoaded() && results.length === 0) {
            this.updateStatus('辞書が読み込まれていません。設定でフォルダを指定してください。');
            return;
        }

        if (results.length === 0) {
            this.updateStatus(`「${query}」の結果なし`);
            this.resultsEl.createEl('p', { cls: 'jp-surfer-dict-no-results', text: '結果が見つかりませんでした' });
            return;
        }

        this.updateStatus(`${results.length}件 (${results[0].dictName})`);

        for (const result of results) {
            this.renderResultCard(result);
        }
    }

    private renderResultCard(result: DictSearchResult): void {
        const card = this.resultsEl.createDiv({ cls: 'jp-surfer-dict-card' });

        // Header: term + reading
        const cardHeader = card.createDiv({ cls: 'jp-surfer-dict-card-header' });
        const termEl = cardHeader.createEl('span', { cls: 'jp-surfer-dict-term', text: result.entry.term });
        if (result.entry.reading && result.entry.reading !== result.entry.term) {
            cardHeader.createEl('span', { cls: 'jp-surfer-dict-reading', text: ` [${result.entry.reading}]` });
        }

        // Match type badge
        const badge = cardHeader.createEl('span', { cls: `jp-surfer-dict-badge jp-surfer-dict-badge--${result.matchType}` });
        badge.textContent = result.matchType === 'exact' ? '完全一致'
            : result.matchType === 'prefix' ? '前方一致'
            : '活用';

        // Tags
        if (result.entry.termTags || result.entry.definitionTags) {
            const tags = card.createDiv({ cls: 'jp-surfer-dict-tags' });
            const rawTags = (result.entry.termTags + ' ' + result.entry.definitionTags).trim();
            rawTags.split(/\s+/).filter(Boolean).forEach(tag => {
                tags.createSpan({ cls: 'jp-surfer-dict-tag', text: tag });
            });
        }

        // Definitions
        const defsEl = card.createDiv({ cls: 'jp-surfer-dict-defs' });
        for (const def of result.entry.definitions) {
            this.renderDefinition(defsEl, def);
        }

        // Actions row
        const actionsRow = card.createDiv({ cls: 'jp-surfer-dict-actions' });

        // Save as collocation
        const saveCollBtn = actionsRow.createEl('button', {
            cls: 'jp-surfer-dict-action-btn',
            text: '💾 コロケーション保存',
            attr: { 'aria-label': 'コロケーションとして保存' },
        });
        saveCollBtn.addEventListener('click', () => this.saveAsCollocation(result));

        // Save sentence
        const saveSentBtn = actionsRow.createEl('button', {
            cls: 'jp-surfer-dict-action-btn',
            text: '📝 例文保存',
            attr: { 'aria-label': '例文を保存' },
        });
        saveSentBtn.addEventListener('click', () => this.saveExampleSentence(result));

        // Copy
        const copyBtn = actionsRow.createEl('button', {
            cls: 'jp-surfer-dict-action-btn',
            text: '📋 コピー',
            attr: { 'aria-label': 'コピー' },
        });
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(result.entry.term + ' — ' + this.defToText(result.entry.definitions[0]));
            new Notice('クリップボードにコピーしました');
        });
    }

    private renderDefinition(parent: HTMLElement, def: any): void {
        if (typeof def === 'string') {
            parent.createEl('p', { cls: 'jp-surfer-dict-def-text', text: def });
        } else if (def && typeof def === 'object') {
            if (def.type === 'structured-content') {
                parent.createEl('p', { cls: 'jp-surfer-dict-def-text', text: this.structuredToText(def) });
            } else if (def.content) {
                const content = Array.isArray(def.content) ? def.content : [def.content];
                for (const c of content) this.renderDefinition(parent, c);
            } else if (def.text) {
                parent.createEl('p', { cls: 'jp-surfer-dict-def-text', text: def.text });
            }
        }
    }

    private structuredToText(obj: any): string {
        if (typeof obj === 'string') return obj;
        if (!obj) return '';
        if (obj.text) return obj.text;
        if (Array.isArray(obj)) return obj.map((c: any) => this.structuredToText(c)).join(' ');
        if (obj.content) {
            const c = Array.isArray(obj.content) ? obj.content : [obj.content];
            return c.map((item: any) => this.structuredToText(item)).join(' ');
        }
        return '';
    }

    private defToText(def: any): string {
        if (typeof def === 'string') return def;
        return this.structuredToText(def);
    }

    // ─── Actions ─────────────────────────────────────────────────────────────

    private async saveAsCollocation(result: DictSearchResult): Promise<void> {
        const plugins = (this.plugin.app as any).plugins as
            | { plugins: Record<string, { searchTerm?: (term: string) => void }> }
            | undefined;
        const collPlugin = plugins?.plugins?.[JP_COLLOCATIONS_PLUGIN_ID];
        if (collPlugin && typeof collPlugin.searchTerm === 'function') {
            collPlugin.searchTerm(result.entry.term);
            new Notice(`「${result.entry.term}」をjp-collocationsで検索しました`);
        } else {
            // Fallback: write to configured folder
            const folder = this.plugin.settings.dictionary.savedCollocationFolder || 'Collocations';
            const filename = `${folder}/${result.entry.term}.md`;
            const content = [
                `# ${result.entry.term}`,
                result.entry.reading ? `**読み**: ${result.entry.reading}` : '',
                '',
                '## 定義',
                ...result.entry.definitions.map((d, i) => `${i + 1}. ${this.defToText(d)}`),
                '',
                `*出典: ${result.entry.dictName}*`,
                `*保存日: ${new Date().toLocaleDateString('ja-JP')}*`,
            ].filter(l => l !== null).join('\n');

            try {
                const existing = this.plugin.app.vault.getAbstractFileByPath(filename);
                if (existing instanceof TFile) {
                    await this.plugin.app.vault.modify(existing, content);
                } else {
                    try {
                        await this.plugin.app.vault.createFolder(folder);
                    } catch (_) { /* folder may exist */ }
                    await this.plugin.app.vault.create(filename, content);
                }
                new Notice(`「${result.entry.term}」をコロケーションとして保存しました`);
            } catch (e) {
                new Notice('保存に失敗しました: ' + String(e));
            }
        }
    }

    private async saveExampleSentence(result: DictSearchResult): Promise<void> {
        const folder = this.plugin.settings.dictionary.savedSentencesFolder || 'Sentences';
        const date = new Date().toISOString().slice(0, 10);
        const filename = `${folder}/例文_${result.entry.term}_${date}.md`;
        const content = [
            `# 例文: ${result.entry.term}`,
            `**語彙**: ${result.entry.term}${result.entry.reading ? ` [${result.entry.reading}]` : ''}`,
            '',
            '## 定義',
            ...result.entry.definitions.slice(0, 3).map((d, i) => `${i + 1}. ${this.defToText(d)}`),
            '',
            '## 例文',
            '> （例文をここに追加してください）',
            '',
            `*出典: ${result.entry.dictName}*`,
        ].join('\n');

        try {
            try { await this.plugin.app.vault.createFolder(folder); } catch (_) { /* exists */ }
            await this.plugin.app.vault.create(filename, content);
            new Notice(`例文ノートを保存しました: ${filename}`);
        } catch (e) {
            new Notice('保存に失敗しました: ' + String(e));
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private updateStatus(text: string): void {
        if (this.statusEl) this.statusEl.textContent = text;
    }

    // ─── Swipe to dismiss ─────────────────────────────────────────────────────

    private attachSwipeHandlers(): void {
        this.handleEl.addEventListener('touchstart', (e: TouchEvent) => {
            this.dragStartY = e.touches[0].clientY;
            this.isDragging = true;
        }, { passive: true });

        document.addEventListener('touchmove', (e: TouchEvent) => {
            if (!this.isDragging) return;
            const dy = e.touches[0].clientY - this.dragStartY;
            if (dy > 0) {
                this.sheetEl.style.transform = `translateY(${dy}px)`;
            }
        }, { passive: true });

        document.addEventListener('touchend', (e: TouchEvent) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            const dy = e.changedTouches[0].clientY - this.dragStartY;
            if (dy > 120) {
                this.close();
            } else {
                this.sheetEl.style.transform = '';
            }
        }, { passive: true });
    }

    // ─── Keyboard awareness ───────────────────────────────────────────────────

    private attachKeyboardHandlers(): void {
        if (typeof window.visualViewport === 'undefined') return;
        const vv = window.visualViewport!;
        const onResize = () => {
            const keyboardHeight = window.innerHeight - vv.height;
            if (keyboardHeight > 50) {
                this.sheetEl.style.marginBottom = `${keyboardHeight}px`;
            } else {
                this.sheetEl.style.marginBottom = '';
            }
        };
        this._viewportResizeHandler = onResize;
        vv.addEventListener('resize', onResize);
    }
}
