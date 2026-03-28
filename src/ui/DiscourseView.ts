/**
 * Discourse Grammar Visualization Panel (Obsidian ItemView)
 *
 * Provides:
 *  1. Pattern Overlay Mode  — colored annotation of discourse markers
 *  2. Chunk Inspector Panel — detailed analysis of selected chunk
 *  3. Index Browser         — searchable / filterable index of captured chunks
 *  4. Granularity Switcher  — switch between 7 discourse levels
 */

import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import {
    DiscourseChunkEntry,
    DiscourseGranularity,
    DiscourseMarker,
    DiscoursePatternType,
    DISCOURSE_GRANULARITY_LEVELS,
    DISCOURSE_GRANULARITY_LABELS,
} from '../types';
import { analyzeDiscourseChunk, getPatternLabel, getMarkerColorClass } from '../discourse/discourse-grammar';
import { parseAtGranularity, findUnitAt, expandContext } from '../discourse/discourse-parser';

export const DISCOURSE_VIEW_TYPE = 'jp-surfer-discourse-view';

/** Extract the basename from a file path */
function basename(filePath: string): string {
    return filePath.split('/').pop() ?? filePath;
}

export class DiscourseView extends ItemView {
    private plugin: JpSentenceSurferPlugin;
    private currentTab: 'inspector' | 'index' | 'overlay' = 'inspector';
    private inspectorEntry: DiscourseChunkEntry | null = null;
    private indexSearchQuery = '';
    private indexFilterTag: DiscoursePatternType | '' = '';
    private indexFilterGranularity: DiscourseGranularity | '' = '';

    constructor(leaf: WorkspaceLeaf, plugin: JpSentenceSurferPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DISCOURSE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return '談話文法';
    }

    getIcon(): string {
        return 'layers';
    }

    async onOpen(): Promise<void> {
        this.render();
    }

    async onClose(): Promise<void> {
        // nothing
    }

    /** Called externally when a chunk is captured or settings change */
    refresh(entry?: DiscourseChunkEntry): void {
        if (entry) {
            this.inspectorEntry = entry;
            this.currentTab = 'inspector';
        }
        this.render();
    }

    // ─── Main render ───────────────────────────────────────────────────────────

    private render(): void {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('discourse-view');

        this.renderHeader(root);
        this.renderGranularitySwitcher(root);
        this.renderTabs(root);

        const content = root.createDiv({ cls: 'discourse-view-content' });
        switch (this.currentTab) {
            case 'inspector': this.renderInspector(content); break;
            case 'index':     this.renderIndexBrowser(content); break;
            case 'overlay':   this.renderOverlayPreview(content); break;
        }
    }

    // ─── Header ────────────────────────────────────────────────────────────────

    private renderHeader(parent: HTMLElement): void {
        const header = parent.createDiv({ cls: 'discourse-header' });
        header.createEl('h2', { text: '談話文法', cls: 'discourse-title' });

        const meta = header.createDiv({ cls: 'discourse-header-meta' });
        const count = this.plugin.discourseIndex?.size ?? 0;
        meta.createSpan({ text: `${count} チャンク` });
    }

    // ─── Granularity switcher ──────────────────────────────────────────────────

    private renderGranularitySwitcher(parent: HTMLElement): void {
        const bar = parent.createDiv({ cls: 'discourse-granularity-bar' });

        for (const level of DISCOURSE_GRANULARITY_LEVELS) {
            const btn = bar.createEl('button', {
                cls: 'discourse-gran-btn' + (this.plugin.settings.discourseGranularity === level ? ' active' : ''),
                text: DISCOURSE_GRANULARITY_LABELS[level],
                attr: { title: level },
            });
            btn.addEventListener('click', async () => {
                this.plugin.settings.discourseGranularity = level;
                await this.plugin.saveSettings();
                this.render();
                new Notice(`談話単位: ${DISCOURSE_GRANULARITY_LABELS[level]}`);
            });
        }
    }

    // ─── Tabs ──────────────────────────────────────────────────────────────────

    private renderTabs(parent: HTMLElement): void {
        const tabs = parent.createDiv({ cls: 'discourse-tabs' });
        const tabDefs: Array<{ id: typeof this.currentTab; label: string }> = [
            { id: 'inspector', label: '🔍 検査' },
            { id: 'index',     label: '📚 索引' },
            { id: 'overlay',   label: '🎨 表示' },
        ];
        for (const t of tabDefs) {
            const btn = tabs.createEl('button', {
                cls: 'discourse-tab-btn' + (this.currentTab === t.id ? ' active' : ''),
                text: t.label,
            });
            btn.addEventListener('click', () => {
                this.currentTab = t.id;
                this.render();
            });
        }
    }

    // ─── Chunk Inspector Panel ────────────────────────────────────────────────

    private renderInspector(parent: HTMLElement): void {
        if (!this.inspectorEntry) {
            parent.createEl('p', {
                cls: 'discourse-empty',
                text: '談話チャンクを選択・保存してください。',
            });
            parent.createEl('p', {
                cls: 'discourse-hint',
                text: '「談話チャンクを保存」コマンドを実行してください。',
            });
            return;
        }

        const entry = this.inspectorEntry;

        // Chunk text with annotations
        const textSection = parent.createDiv({ cls: 'discourse-inspector-section' });
        textSection.createEl('h3', { text: 'テキスト' });
        this.renderAnnotatedText(textSection, entry.text, [
            ...entry.openingMarkers,
            ...entry.closingMarkers,
            ...entry.internalMarkers,
            ...entry.boundaryMarkers,
        ]);

        // Metadata row
        const meta = parent.createDiv({ cls: 'discourse-inspector-meta' });
        meta.createSpan({ cls: 'discourse-badge', text: DISCOURSE_GRANULARITY_LABELS[entry.granularityLevel] });
        meta.createSpan({ cls: 'discourse-badge', text: basename(entry.sourceFile) });
        if (entry.timestamp) {
            meta.createSpan({ cls: 'discourse-badge discourse-badge-timestamp', text: `⏱ ${entry.timestamp}` });
        }

        // Discourse pattern tags
        if (entry.discoursePatternTags.length > 0) {
            const tagSection = parent.createDiv({ cls: 'discourse-inspector-section' });
            tagSection.createEl('h3', { text: '談話パターン' });
            const tagRow = tagSection.createDiv({ cls: 'discourse-tag-row' });
            for (const tag of entry.discoursePatternTags) {
                tagRow.createSpan({ cls: `discourse-tag discourse-tag-${tag}`, text: getPatternLabel(tag) });
            }
        }

        // Markers breakdown
        this.renderMarkerList(parent, '発話冒頭表現 (Opening)', entry.openingMarkers, 'opening');
        this.renderMarkerList(parent, '発話末表現 (Closing)', entry.closingMarkers, 'closing');
        this.renderMarkerList(parent, '内部表現 (Internal)', entry.internalMarkers, 'connective');
        this.renderMarkerList(parent, '談話境界 (Boundary)', entry.boundaryMarkers, 'boundary');

        // Collocations found
        if (entry.collocationsFound.length > 0) {
            const collSection = parent.createDiv({ cls: 'discourse-inspector-section' });
            collSection.createEl('h3', { text: 'コロケーション' });
            const list = collSection.createEl('ul');
            for (const c of entry.collocationsFound) {
                list.createEl('li', { text: c });
            }
        }

        // Context (expandable)
        const ctxSection = parent.createDiv({ cls: 'discourse-inspector-section' });
        const ctxHeader = ctxSection.createDiv({ cls: 'discourse-context-header' });
        ctxHeader.createEl('h3', { text: 'コンテキスト' });
        const ctxBody = ctxSection.createDiv({ cls: 'discourse-context-body' });

        if (entry.context.before) {
            const beforeEl = ctxBody.createDiv({ cls: 'discourse-context-before' });
            beforeEl.createSpan({ cls: 'discourse-context-label', text: '前: ' });
            beforeEl.createSpan({ text: entry.context.before });
        }
        const chunkEl = ctxBody.createDiv({ cls: 'discourse-context-chunk' });
        chunkEl.createSpan({ text: entry.text });

        if (entry.context.after) {
            const afterEl = ctxBody.createDiv({ cls: 'discourse-context-after' });
            afterEl.createSpan({ cls: 'discourse-context-label', text: '後: ' });
            afterEl.createSpan({ text: entry.context.after });
        }

        // Delete button
        const actions = parent.createDiv({ cls: 'discourse-inspector-actions' });
        const deleteBtn = actions.createEl('button', { cls: 'discourse-btn discourse-btn-danger', text: '削除' });
        deleteBtn.addEventListener('click', async () => {
            if (!this.inspectorEntry) return;
            await this.plugin.discourseIndex?.removeAndSave(this.inspectorEntry.id);
            this.inspectorEntry = null;
            this.render();
            new Notice('チャンクを削除しました。');
        });
    }

    // ─── Index Browser ────────────────────────────────────────────────────────

    private renderIndexBrowser(parent: HTMLElement): void {
        const index = this.plugin.discourseIndex;
        if (!index) {
            parent.createEl('p', { cls: 'discourse-empty', text: '索引が読み込まれていません。' });
            return;
        }

        // Search bar
        const searchRow = parent.createDiv({ cls: 'discourse-search-row' });
        const searchInput = searchRow.createEl('input', {
            cls: 'discourse-search-input',
            attr: { type: 'text', placeholder: '検索...', value: this.indexSearchQuery },
        }) as HTMLInputElement;
        searchInput.addEventListener('input', () => {
            this.indexSearchQuery = searchInput.value;
            renderResults();
        });

        // Filter row
        const filterRow = parent.createDiv({ cls: 'discourse-filter-row' });
        this.renderPatternTagFilter(filterRow);
        this.renderGranularityFilter(filterRow);

        // Results container
        const resultsContainer = parent.createDiv({ cls: 'discourse-results' });

        const renderResults = () => {
            resultsContainer.empty();
            let entries = index.getAll();

            if (this.indexSearchQuery) {
                entries = index.search(this.indexSearchQuery);
            }
            if (this.indexFilterTag) {
                entries = entries.filter(e => e.discoursePatternTags.includes(this.indexFilterTag as DiscoursePatternType));
            }
            if (this.indexFilterGranularity) {
                entries = entries.filter(e => e.granularityLevel === this.indexFilterGranularity);
            }

            if (entries.length === 0) {
                resultsContainer.createEl('p', { cls: 'discourse-empty', text: '結果なし' });
                return;
            }

            for (const entry of entries) {
                this.renderIndexCard(resultsContainer, entry);
            }
        };

        renderResults();
    }

    private renderPatternTagFilter(parent: HTMLElement): void {
        const index = this.plugin.discourseIndex;
        if (!index) return;

        const tags = index.allPatternTags();
        if (tags.length === 0) return;

        const sel = parent.createEl('select', { cls: 'discourse-filter-select' }) as HTMLSelectElement;
        sel.createEl('option', { value: '', text: 'パターン: 全て' });
        for (const tag of tags) {
            const opt = sel.createEl('option', { value: tag, text: getPatternLabel(tag) });
            if (this.indexFilterTag === tag) opt.selected = true;
        }
        sel.addEventListener('change', () => {
            this.indexFilterTag = sel.value as DiscoursePatternType | '';
            this.render();
        });
    }

    private renderGranularityFilter(parent: HTMLElement): void {
        const sel = parent.createEl('select', { cls: 'discourse-filter-select' }) as HTMLSelectElement;
        sel.createEl('option', { value: '', text: '粒度: 全て' });
        for (const level of DISCOURSE_GRANULARITY_LEVELS) {
            const opt = sel.createEl('option', {
                value: level,
                text: DISCOURSE_GRANULARITY_LABELS[level],
            });
            if (this.indexFilterGranularity === level) opt.selected = true;
        }
        sel.addEventListener('change', () => {
            this.indexFilterGranularity = sel.value as DiscourseGranularity | '';
            this.render();
        });
    }

    private renderIndexCard(parent: HTMLElement, entry: DiscourseChunkEntry): void {
        const card = parent.createDiv({ cls: 'discourse-index-card' });

        const cardHeader = card.createDiv({ cls: 'discourse-card-header' });
        cardHeader.createSpan({ cls: 'discourse-badge', text: DISCOURSE_GRANULARITY_LABELS[entry.granularityLevel] });
        cardHeader.createSpan({
            cls: 'discourse-card-source',
            text: basename(entry.sourceFile),
        });
        const dateStr = new Date(entry.capturedAt).toLocaleDateString('ja-JP');
        cardHeader.createSpan({ cls: 'discourse-card-date', text: dateStr });

        // Truncated text
        const preview = entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text;
        card.createEl('p', { cls: 'discourse-card-text', text: preview });

        // Tags
        if (entry.discoursePatternTags.length > 0) {
            const tagRow = card.createDiv({ cls: 'discourse-tag-row' });
            for (const tag of entry.discoursePatternTags.slice(0, 3)) {
                tagRow.createSpan({ cls: `discourse-tag discourse-tag-${tag}`, text: getPatternLabel(tag) });
            }
        }

        // Markers summary
        const markerRow = card.createDiv({ cls: 'discourse-marker-summary' });
        if (entry.openingMarkers[0]) {
            markerRow.createSpan({ cls: 'discourse-marker-chip opening', text: entry.openingMarkers[0].surface });
        }
        if (entry.closingMarkers[0]) {
            markerRow.createSpan({ cls: 'discourse-marker-chip closing', text: entry.closingMarkers[0].surface });
        }

        // Action row
        const actionRow = card.createDiv({ cls: 'discourse-card-actions' });
        const inspectBtn = actionRow.createEl('button', { cls: 'discourse-btn', text: '詳細' });
        inspectBtn.addEventListener('click', () => {
            this.inspectorEntry = entry;
            this.currentTab = 'inspector';
            this.render();
        });

        const jumpBtn = actionRow.createEl('button', { cls: 'discourse-btn', text: 'ジャンプ' });
        jumpBtn.addEventListener('click', () => {
            this.jumpToSource(entry);
        });
    }

    // ─── Overlay Preview ──────────────────────────────────────────────────────

    private renderOverlayPreview(parent: HTMLElement): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            parent.createEl('p', { cls: 'discourse-empty', text: 'アクティブなエディタが見つかりません。' });
            return;
        }

        const content = view.editor.getValue();
        const analysis = analyzeDiscourseChunk(content);
        const allMarkers = [
            ...analysis.openingMarkers,
            ...analysis.closingMarkers,
            ...analysis.internalMarkers,
            ...analysis.boundaryMarkers,
        ].sort((a, b) => a.startInChunk - b.startInChunk);

        const header = parent.createDiv({ cls: 'discourse-overlay-header' });
        header.createEl('h3', { text: '談話パターン オーバーレイ' });

        const toggleBtn = header.createEl('button', {
            cls: 'discourse-btn',
            text: this.plugin.settings.showDiscourseOverlay ? 'オン ✓' : 'オフ',
        });
        toggleBtn.addEventListener('click', async () => {
            this.plugin.settings.showDiscourseOverlay = !this.plugin.settings.showDiscourseOverlay;
            await this.plugin.saveSettings();
            this.render();
        });

        if (allMarkers.length === 0) {
            parent.createEl('p', { cls: 'discourse-empty', text: '談話マーカーが見つかりませんでした。' });
            return;
        }

        // Legend
        const legend = parent.createDiv({ cls: 'discourse-legend' });
        const categories: Array<{ cls: string; label: string }> = [
            { cls: 'discourse-marker-opening',       label: '発話冒頭 (青)' },
            { cls: 'discourse-marker-closing',       label: '発話末 (緑)' },
            { cls: 'discourse-marker-connective',    label: '接続 (橙)' },
            { cls: 'discourse-marker-boundary',      label: '境界 (赤)' },
            { cls: 'discourse-marker-interactional', label: '相互 (紫)' },
        ];
        for (const cat of categories) {
            const item = legend.createDiv({ cls: 'discourse-legend-item' });
            item.createSpan({ cls: `discourse-legend-dot ${cat.cls}` });
            item.createSpan({ text: cat.label });
        }

        // Annotated text preview (first 500 chars)
        const previewText = content.slice(0, 500);
        const previewSection = parent.createDiv({ cls: 'discourse-overlay-preview' });
        previewSection.createEl('h4', { text: 'プレビュー (先頭500文字)' });
        this.renderAnnotatedText(previewSection, previewText, allMarkers);

        // Full marker list
        const listSection = parent.createDiv({ cls: 'discourse-overlay-list' });
        listSection.createEl('h4', { text: `全マーカー (${allMarkers.length})` });
        for (const m of allMarkers.slice(0, 50)) {
            const row = listSection.createDiv({ cls: `discourse-marker-row ${getMarkerColorClass(m.category)}` });
            row.createSpan({ cls: 'discourse-marker-surface', text: m.surface });
            row.createSpan({ cls: 'discourse-marker-type', text: getPatternLabel(m.patternType) });
        }
    }

    // ─── Shared helpers ────────────────────────────────────────────────────────

    private renderAnnotatedText(
        parent: HTMLElement,
        text: string,
        markers: DiscourseMarker[],
    ): void {
        const container = parent.createDiv({ cls: 'discourse-annotated-text' });
        if (markers.length === 0) {
            container.createSpan({ text });
            return;
        }

        const sorted = [...markers].sort((a, b) => a.startInChunk - b.startInChunk);
        let pos = 0;

        for (const m of sorted) {
            if (m.startInChunk > pos) {
                container.createSpan({ text: text.slice(pos, m.startInChunk) });
            }
            if (m.endInChunk > m.startInChunk) {
                const span = container.createEl('span', {
                    cls: `discourse-annotated-marker ${getMarkerColorClass(m.category)}`,
                    text: text.slice(m.startInChunk, m.endInChunk),
                    attr: { title: getPatternLabel(m.patternType) },
                });
            }
            pos = Math.max(pos, m.endInChunk);
        }

        if (pos < text.length) {
            container.createSpan({ text: text.slice(pos) });
        }
    }

    private renderMarkerList(
        parent: HTMLElement,
        title: string,
        markers: DiscourseMarker[],
        categoryClass: string,
    ): void {
        if (markers.length === 0) return;
        const section = parent.createDiv({ cls: 'discourse-inspector-section' });
        section.createEl('h3', { text: title });
        const list = section.createEl('ul', { cls: 'discourse-marker-list' });
        for (const m of markers) {
            const li = list.createEl('li');
            li.createSpan({
                cls: `discourse-annotated-marker discourse-marker-${categoryClass}`,
                text: m.surface,
            });
            li.createSpan({ cls: 'discourse-marker-type-label', text: ` — ${getPatternLabel(m.patternType)}` });
        }
    }

    private jumpToSource(entry: DiscourseChunkEntry): void {
        const file = this.plugin.app.vault.getAbstractFileByPath(entry.sourceFile);
        if (!file) {
            new Notice(`ファイルが見つかりません: ${entry.sourceFile}`);
            return;
        }
        this.plugin.app.workspace.openLinkText(entry.sourceFile, '', false).then(() => {
            const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
                view.editor.setCursor(view.editor.offsetToPos(entry.sourceOffset.start));
            }
        });
    }
}
