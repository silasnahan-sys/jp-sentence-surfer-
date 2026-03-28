/**
 * Discourse Grammar Visualization Panel (Obsidian ItemView)
 *
 * Provides:
 *  1. Pattern Overlay Mode           — colored annotation of discourse markers
 *  2. Chunk Inspector Panel          — detailed analysis of selected chunk
 *  3. Index Browser                  — searchable / filterable index of captured chunks
 *  4. Granularity Switcher           — switch between 7 discourse levels
 *  5. Variation Tree Browser         — browse stem families and all their variations
 *  6. Constellation Browser          — browse co-occurrence constellations
 *  7. Co-operation Pattern Browser   — browse template matches
 *  8. KWIC Occurrence View           — concordance-style occurrence browser
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
    GrammarBitOccurrence,
    CoOccurrenceConstellation,
    CoOperationMatch,
    CoOperationTemplate,
} from '../types';
import { analyzeDiscourseChunk, getPatternLabel, getMarkerColorClass } from '../discourse/discourse-grammar';
import { parseAtGranularity, findUnitAt, expandContext } from '../discourse/discourse-parser';
import {
    ALL_VARIATION_TREES,
    VARIATION_TREE_BY_STEM,
    variationLabel,
} from '../discourse/variation-trees';
import { COOPERATION_TEMPLATES, groupMatchesByTemplate } from '../discourse/cooperation-templates';
import { filterByStance, filterByMove, allStances, allMoves } from '../discourse/co-occurrence';

export const DISCOURSE_VIEW_TYPE = 'jp-surfer-discourse-view';

/** Extract the basename from a file path */
function basename(filePath: string): string {
    return filePath.split('/').pop() ?? filePath;
}

type DiscourseTab = 'inspector' | 'index' | 'overlay' | 'variation' | 'constellation' | 'coop' | 'kwic';

/** Tab groups for swipe-based navigation */
const TAB_ORDER: DiscourseTab[] = ['inspector', 'index', 'overlay', 'variation', 'constellation', 'coop', 'kwic'];

export class DiscourseView extends ItemView {
    private plugin: JpSentenceSurferPlugin;
    private currentTab: DiscourseTab = 'inspector';
    private inspectorEntry: DiscourseChunkEntry | null = null;
    private indexSearchQuery = '';
    private indexFilterTag: DiscoursePatternType | '' = '';
    private indexFilterGranularity: DiscourseGranularity | '' = '';

    // Variation tree state
    private variationSelectedStem = '';
    private variationSelectedSurface = '';

    // Constellation state
    private constellationFilterStance = '';
    private constellationFilterMove = '';
    private constellationFilterStem = '';

    // Co-op state
    private coopFilterTemplate = '';

    // KWIC state
    private kwicQuery = '';

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
            case 'inspector':    this.renderInspector(content); break;
            case 'index':        this.renderIndexBrowser(content); break;
            case 'overlay':      this.renderOverlayPreview(content); break;
            case 'variation':    this.renderVariationBrowser(content); break;
            case 'constellation':this.renderConstellationBrowser(content); break;
            case 'coop':         this.renderCoopBrowser(content); break;
            case 'kwic':         this.renderKwicView(content); break;
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
        const tabs = parent.createDiv({ cls: 'discourse-tabs discourse-tabs-scrollable' });
        const tabDefs: Array<{ id: DiscourseTab; label: string }> = [
            { id: 'inspector',    label: '🔍 検査' },
            { id: 'index',        label: '📚 索引' },
            { id: 'overlay',      label: '🎨 表示' },
            { id: 'variation',    label: '🌿 変形' },
            { id: 'constellation',label: '✨ 共起' },
            { id: 'coop',         label: '🤝 協働' },
            { id: 'kwic',         label: '📖 用例' },
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

    // ─── Variation Tree Browser ────────────────────────────────────────────────

    private renderVariationBrowser(parent: HTMLElement): void {
        const index = this.plugin.discourseIndex;
        const occIndex = index?.occurrenceIndex;

        const layout = parent.createDiv({ cls: 'jp-surfer-discourse-variation-layout' });
        const left  = layout.createDiv({ cls: 'jp-surfer-discourse-variation-left' });
        const right = layout.createDiv({ cls: 'jp-surfer-discourse-variation-right' });

        // Left panel: list of all stem families
        const listTitle = left.createEl('h4', { text: 'バリエーション・ファミリー' });
        listTitle.addClass('jp-surfer-discourse-panel-title');

        for (const tree of ALL_VARIATION_TREES) {
            const totalCount = occIndex?.byStemFamily(tree.stem).length ?? 0;
            const isSelected = this.variationSelectedStem === tree.stem;

            const item = left.createDiv({
                cls: 'jp-surfer-discourse-stem-item' + (isSelected ? ' selected' : ''),
            });
            const stemLabel = item.createDiv({ cls: 'jp-surfer-discourse-stem-label' });
            stemLabel.createSpan({ cls: 'jp-surfer-discourse-stem-surface', text: tree.stem });
            stemLabel.createSpan({ cls: 'jp-surfer-discourse-stem-count', text: ` (${totalCount})` });
            item.createDiv({ cls: 'jp-surfer-discourse-stem-name', text: tree.familyName });

            item.addEventListener('click', () => {
                this.variationSelectedStem = tree.stem;
                this.variationSelectedSurface = '';
                this.render();
            });
        }

        // Right panel: variation list or occurrence list
        if (!this.variationSelectedStem) {
            right.createEl('p', {
                cls: 'jp-surfer-discourse-hint',
                text: '左のファミリーを選択してください。',
            });
            return;
        }

        const tree = VARIATION_TREE_BY_STEM.get(this.variationSelectedStem);
        if (!tree) return;

        const treeHeader = right.createDiv({ cls: 'jp-surfer-discourse-tree-header' });
        treeHeader.createEl('h4', { text: tree.familyName, cls: 'jp-surfer-discourse-panel-title' });
        treeHeader.createEl('p', { text: tree.functionDescription, cls: 'jp-surfer-discourse-tree-desc' });

        // Show all variations with counts
        if (!this.variationSelectedSurface) {
            const varList = right.createDiv({ cls: 'jp-surfer-discourse-var-list' });
            const dist = occIndex?.variationDistribution(tree.stem) ?? new Map<string, number>();

            for (const node of tree.variations) {
                const count = dist.get(node.surface) ?? 0;
                const row = varList.createDiv({ cls: 'jp-surfer-discourse-var-row' });

                const regBadge = row.createSpan({
                    cls: `jp-surfer-discourse-reg-badge jp-surfer-discourse-reg-${node.register}`,
                    text: { formal: '敬', neutral: '普', casual: '語', rough: '荒' }[node.register],
                });
                const freqDots = row.createSpan({
                    cls: 'jp-surfer-discourse-freq',
                    text: { high: '●●●', medium: '●●○', low: '●○○', rare: '○○○' }[node.spokenFrequency],
                });
                row.createSpan({ cls: 'jp-surfer-discourse-var-surface', text: node.surface });
                row.createSpan({ cls: 'jp-surfer-discourse-var-nuance', text: node.nuanceShift });
                row.createSpan({ cls: 'jp-surfer-discourse-var-count', text: `${count}件` });

                row.addClass('jp-surfer-discourse-var-row-clickable');
                row.addEventListener('click', () => {
                    this.variationSelectedSurface = node.surface;
                    this.render();
                });
            }
        } else {
            // Show all occurrences of the selected variation
            const backBtn = right.createEl('button', {
                cls: 'jp-surfer-discourse-back-btn',
                text: `← ${tree.stem}`,
            });
            backBtn.addEventListener('click', () => {
                this.variationSelectedSurface = '';
                this.render();
            });

            right.createEl('h5', {
                text: this.variationSelectedSurface,
                cls: 'jp-surfer-discourse-surface-title',
            });

            const occs = occIndex?.byVariation(this.variationSelectedSurface) ?? [];
            if (occs.length === 0) {
                right.createEl('p', {
                    cls: 'jp-surfer-discourse-hint',
                    text: 'まだ用例がありません。',
                });
            } else {
                right.createEl('p', {
                    cls: 'jp-surfer-discourse-occ-summary',
                    text: `${occs.length}件の用例`,
                });
                const occList = right.createDiv({ cls: 'jp-surfer-discourse-occ-list' });
                for (const occ of occs.slice(0, 50)) {
                    this.renderOccurrenceCard(occList, occ);
                }
            }
        }
    }

    // ─── Constellation Browser ────────────────────────────────────────────────

    private renderConstellationBrowser(parent: HTMLElement): void {
        const index = this.plugin.discourseIndex;
        if (!index) {
            parent.createEl('p', { cls: 'jp-surfer-discourse-hint', text: '索引が読み込まれていません。' });
            return;
        }

        let constellations = index.getAllConstellations();
        const totalConst = constellations.length;

        if (totalConst === 0) {
            parent.createEl('p', {
                cls: 'jp-surfer-discourse-hint',
                text: 'チャンクを保存すると共起パターンが生成されます。',
            });
            return;
        }

        // Filter bar
        const filterRow = parent.createDiv({ cls: 'jp-surfer-discourse-filter-row' });

        // Stance filter
        const stances = allStances(constellations);
        if (stances.length > 0) {
            const sel = filterRow.createEl('select', { cls: 'jp-surfer-discourse-filter-select' }) as HTMLSelectElement;
            sel.createEl('option', { value: '', text: 'スタンス: 全て' });
            for (const s of stances) {
                const opt = sel.createEl('option', { value: s, text: s });
                if (this.constellationFilterStance === s) opt.selected = true;
            }
            sel.addEventListener('change', () => {
                this.constellationFilterStance = sel.value;
                this.render();
            });
        }

        // Move filter
        const moves = allMoves(constellations);
        if (moves.length > 0) {
            const sel2 = filterRow.createEl('select', { cls: 'jp-surfer-discourse-filter-select' }) as HTMLSelectElement;
            sel2.createEl('option', { value: '', text: '談話機能: 全て' });
            for (const m of moves) {
                const opt = sel2.createEl('option', { value: m, text: m });
                if (this.constellationFilterMove === m) opt.selected = true;
            }
            sel2.addEventListener('change', () => {
                this.constellationFilterMove = sel2.value;
                this.render();
            });
        }

        // Apply filters
        if (this.constellationFilterStance) {
            constellations = constellations.filter(c =>
                c.textureProfile.stance.includes(this.constellationFilterStance)
            );
        }
        if (this.constellationFilterMove) {
            constellations = constellations.filter(c =>
                c.textureProfile.move.includes(this.constellationFilterMove)
            );
        }

        parent.createEl('p', {
            cls: 'jp-surfer-discourse-count',
            text: `${constellations.length} / ${totalConst} 共起パターン`,
        });

        const list = parent.createDiv({ cls: 'jp-surfer-discourse-const-list' });
        for (const c of constellations.slice(0, 30)) {
            this.renderConstellationCard(list, c);
        }
    }

    private renderConstellationCard(parent: HTMLElement, c: CoOccurrenceConstellation): void {
        const entry = this.plugin.discourseIndex?.getById(c.chunkId);
        const card = parent.createDiv({ cls: 'jp-surfer-discourse-const-card' });

        // Grammar bits tag cloud
        if (c.bits.length > 0) {
            const bitRow = card.createDiv({ cls: 'jp-surfer-discourse-bit-row' });
            for (const bit of c.bits.slice(0, 8)) {
                const badge = bitRow.createSpan({
                    cls: `jp-surfer-discourse-bit-badge jp-surfer-discourse-bit-${bit.category}`,
                    text: bit.surface,
                    attr: { title: bit.stemFamily },
                });
                badge.addEventListener('click', () => {
                    this.currentTab = 'variation';
                    this.variationSelectedStem = bit.stemFamily;
                    this.variationSelectedSurface = '';
                    this.render();
                });
            }
        }

        // Texture
        const texture = c.textureProfile;
        if (texture.stance.length > 0 || texture.move.length > 0) {
            const textureRow = card.createDiv({ cls: 'jp-surfer-discourse-texture-row' });
            for (const s of texture.stance.slice(0, 3)) {
                textureRow.createSpan({ cls: 'jp-surfer-discourse-stance-badge', text: s });
            }
            for (const m of texture.move.slice(0, 3)) {
                textureRow.createSpan({ cls: 'jp-surfer-discourse-move-badge', text: m });
            }
            textureRow.createSpan({
                cls: `jp-surfer-discourse-register-badge jp-surfer-discourse-reg-${texture.registerLevel}`,
                text: { formal: '敬体', neutral: '普通', casual: '口語', rough: '荒語' }[texture.registerLevel],
            });
        }

        // Chunk text preview
        if (entry) {
            const preview = entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text;
            card.createEl('p', { cls: 'jp-surfer-discourse-const-text', text: preview });
            card.createSpan({ cls: 'jp-surfer-discourse-const-source', text: basename(entry.sourceFile) });
        }
    }

    // ─── Co-operation Pattern Browser ────────────────────────────────────────

    private renderCoopBrowser(parent: HTMLElement): void {
        const index = this.plugin.discourseIndex;
        if (!index) {
            parent.createEl('p', { cls: 'jp-surfer-discourse-hint', text: '索引が読み込まれていません。' });
            return;
        }

        const allMatches = index.getCoopMatches();
        const grouped = groupMatchesByTemplate(allMatches);

        // Template filter
        const filterRow = parent.createDiv({ cls: 'jp-surfer-discourse-filter-row' });
        const sel = filterRow.createEl('select', { cls: 'jp-surfer-discourse-filter-select' }) as HTMLSelectElement;
        sel.createEl('option', { value: '', text: '全テンプレート' });
        for (const tmpl of COOPERATION_TEMPLATES) {
            const count = grouped.get(tmpl.name)?.length ?? 0;
            const opt = sel.createEl('option', { value: tmpl.name, text: `${tmpl.nameJp} (${count})` });
            if (this.coopFilterTemplate === tmpl.name) opt.selected = true;
        }
        sel.addEventListener('change', () => {
            this.coopFilterTemplate = sel.value;
            this.render();
        });

        if (allMatches.length === 0) {
            parent.createEl('p', {
                cls: 'jp-surfer-discourse-hint',
                text: 'チャンクを保存すると協働パターンが検出されます。',
            });
            return;
        }

        const templatesToShow = this.coopFilterTemplate
            ? COOPERATION_TEMPLATES.filter(t => t.name === this.coopFilterTemplate)
            : COOPERATION_TEMPLATES;

        for (const tmpl of templatesToShow) {
            const matches = grouped.get(tmpl.name) ?? [];
            if (matches.length === 0) continue;

            const section = parent.createDiv({ cls: 'jp-surfer-discourse-coop-section' });
            const sectionHeader = section.createDiv({ cls: 'jp-surfer-discourse-coop-header' });
            sectionHeader.createEl('h4', {
                text: `${tmpl.nameJp}`,
                cls: 'jp-surfer-discourse-panel-title',
            });
            sectionHeader.createSpan({ cls: 'jp-surfer-discourse-coop-count', text: `${matches.length}件` });
            section.createEl('p', { text: tmpl.description, cls: 'jp-surfer-discourse-coop-desc' });

            for (const match of matches.slice(0, 10)) {
                this.renderCoopMatchCard(section, match, tmpl);
            }
        }
    }

    private renderCoopMatchCard(
        parent: HTMLElement,
        match: CoOperationMatch,
        tmpl: CoOperationTemplate,
    ): void {
        const card = parent.createDiv({ cls: 'jp-surfer-discourse-coop-card' });

        // Filled slots row
        const slotRow = card.createDiv({ cls: 'jp-surfer-discourse-slot-row' });
        let first = true;
        for (const fs of match.filledSlots) {
            if (!first) slotRow.createSpan({ cls: 'jp-surfer-discourse-slot-arrow', text: '→' });
            slotRow.createSpan({
                cls: `jp-surfer-discourse-slot-badge jp-surfer-discourse-slot-${fs.slot.position}`,
                text: fs.matchedSurface,
                attr: { title: `${fs.slot.position}: ${fs.matchedStem}` },
            });
            first = false;
        }

        // Chunk text
        const preview = match.chunkText.length > 100 ? match.chunkText.slice(0, 100) + '…' : match.chunkText;
        card.createEl('p', { cls: 'jp-surfer-discourse-coop-text', text: preview });
        if (match.scraped) {
            card.createSpan({ cls: 'jp-surfer-discourse-scraped-badge', text: '自動' });
        }
        card.createSpan({ cls: 'jp-surfer-discourse-coop-source', text: basename(match.sourceFile) });
    }

    // ─── KWIC Occurrence View ─────────────────────────────────────────────────

    private renderKwicView(parent: HTMLElement): void {
        const index = this.plugin.discourseIndex;
        const occIndex = index?.occurrenceIndex;

        // Search bar
        const searchRow = parent.createDiv({ cls: 'jp-surfer-discourse-kwic-search' });
        const searchInput = searchRow.createEl('input', {
            cls: 'jp-surfer-discourse-kwic-input',
            attr: {
                type: 'text',
                placeholder: '変形・文法素・テキスト検索...',
                value: this.kwicQuery,
            },
        }) as HTMLInputElement;
        searchInput.addEventListener('input', () => {
            this.kwicQuery = searchInput.value;
            renderResults();
        });

        // Sort options
        const sortSel = searchRow.createEl('select', { cls: 'jp-surfer-discourse-filter-select' }) as HTMLSelectElement;
        let sortMode: 'date' | 'left' | 'right' = 'date';
        sortSel.createEl('option', { value: 'date', text: '日付順' });
        sortSel.createEl('option', { value: 'left', text: '左文脈順' });
        sortSel.createEl('option', { value: 'right', text: '右文脈順' });
        sortSel.addEventListener('change', () => {
            sortMode = sortSel.value as typeof sortMode;
            renderResults();
        });

        const resultsContainer = parent.createDiv({ cls: 'jp-surfer-discourse-kwic-results' });

        const renderResults = () => {
            resultsContainer.empty();
            if (!occIndex) {
                resultsContainer.createEl('p', {
                    cls: 'jp-surfer-discourse-hint',
                    text: '索引が読み込まれていません。',
                });
                return;
            }

            let occs = this.kwicQuery
                ? occIndex.kwic(this.kwicQuery)
                : occIndex.getAll();

            // Sort
            if (sortMode === 'left') {
                occs = [...occs].sort((a, b) => a.leftContext.localeCompare(b.leftContext));
            } else if (sortMode === 'right') {
                occs = [...occs].sort((a, b) => a.rightContext.localeCompare(b.rightContext));
            } else {
                occs = [...occs].sort((a, b) => b.capturedAt - a.capturedAt);
            }

            if (occs.length === 0) {
                resultsContainer.createEl('p', {
                    cls: 'jp-surfer-discourse-hint',
                    text: this.kwicQuery ? '結果なし' : 'チャンクを保存すると用例が表示されます。',
                });
                return;
            }

            resultsContainer.createEl('p', {
                cls: 'jp-surfer-discourse-count',
                text: `${occs.length}件`,
            });

            for (const occ of occs.slice(0, 60)) {
                this.renderKwicRow(resultsContainer, occ);
            }
        };

        renderResults();
    }

    private renderKwicRow(parent: HTMLElement, occ: GrammarBitOccurrence): void {
        const row = parent.createDiv({ cls: 'jp-surfer-discourse-kwic-row' });

        // Left context
        row.createSpan({ cls: 'jp-surfer-discourse-kwic-left', text: occ.leftContext });

        // Keyword (surface form highlighted)
        row.createSpan({ cls: 'jp-surfer-discourse-kwic-keyword', text: occ.surfaceForm });

        // Right context
        row.createSpan({ cls: 'jp-surfer-discourse-kwic-right', text: occ.rightContext });

        // Meta row
        const meta = row.createDiv({ cls: 'jp-surfer-discourse-kwic-meta' });
        meta.createSpan({ cls: 'jp-surfer-discourse-kwic-stem', text: occ.stemFamily });
        meta.createSpan({ cls: 'jp-surfer-discourse-kwic-source', text: occ.sourceTitle });
        if (occ.timestamp) {
            meta.createSpan({ cls: 'jp-surfer-discourse-kwic-time', text: occ.timestamp });
        }
        if (occ.scraped) {
            meta.createSpan({ cls: 'jp-surfer-discourse-scraped-badge', text: '自動' });
        }

        // Co-occurring bits
        if (occ.coOccurringBits.length > 0) {
            const coRow = row.createDiv({ cls: 'jp-surfer-discourse-kwic-cobits' });
            for (const stem of occ.coOccurringBits.slice(0, 4)) {
                const badge = coRow.createSpan({
                    cls: 'jp-surfer-discourse-kwic-cobit',
                    text: stem,
                });
                badge.addEventListener('click', () => {
                    this.currentTab = 'variation';
                    this.variationSelectedStem = stem;
                    this.variationSelectedSurface = '';
                    this.render();
                });
            }
        }
    }

    // ─── Occurrence card ──────────────────────────────────────────────────────

    private renderOccurrenceCard(parent: HTMLElement, occ: GrammarBitOccurrence): void {
        const card = parent.createDiv({ cls: 'jp-surfer-discourse-occ-card' });

        // KWIC-style display
        const kwicRow = card.createDiv({ cls: 'jp-surfer-discourse-kwic-row' });
        kwicRow.createSpan({ cls: 'jp-surfer-discourse-kwic-left',    text: occ.leftContext });
        kwicRow.createSpan({ cls: 'jp-surfer-discourse-kwic-keyword', text: occ.surfaceForm });
        kwicRow.createSpan({ cls: 'jp-surfer-discourse-kwic-right',   text: occ.rightContext });

        // Source and co-occurring bits
        const meta = card.createDiv({ cls: 'jp-surfer-discourse-occ-meta' });
        meta.createSpan({ cls: 'jp-surfer-discourse-occ-source', text: occ.sourceTitle });
        if (occ.timestamp) {
            meta.createSpan({ cls: 'jp-surfer-discourse-occ-time', text: occ.timestamp });
        }
        if (occ.scraped) {
            meta.createSpan({ cls: 'jp-surfer-discourse-scraped-badge', text: '自動' });
        }

        if (occ.coOccurringBits.length > 0) {
            const coRow = card.createDiv({ cls: 'jp-surfer-discourse-occ-cobits' });
            for (const stem of occ.coOccurringBits.slice(0, 4)) {
                coRow.createSpan({ cls: 'jp-surfer-discourse-occ-cobit', text: stem });
            }
        }
    }
}
