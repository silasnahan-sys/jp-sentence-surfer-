import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DiscourseIndex, CapturedChunk } from '../discourse/discourse-index';
import { detectDiscourseMarkers, DetectedMarker, DiscourseCategory, DISCOURSE_PATTERNS } from '../discourse/discourse-grammar';
import { GRANULARITY_LABELS, GranularityLevel } from '../discourse/discourse-parser';

export const DISCOURSE_VIEW_TYPE = 'jp-surfer-discourse-view';

const CATEGORY_COLORS: Record<DiscourseCategory, string> = {
    '話題開始': '#4A90D9',
    '理由・説明': '#7B68EE',
    '文末モダリティ': '#50C878',
    '接続・展開': '#FF8C00',
    '確認・同意要求': '#FF6B6B',
    '言い換え・修正': '#FFD700',
    'フィラー・ヘッジ': '#20B2AA',
    '引用・伝聞': '#DA70D6',
};

const ALL_CATEGORIES: DiscourseCategory[] = [
    '話題開始', '理由・説明', '文末モダリティ', '接続・展開',
    '確認・同意要求', '言い換え・修正', 'フィラー・ヘッジ', '引用・伝聞',
];

export class DiscourseView extends ItemView {
    private plugin: JpSentenceSurferPlugin;
    private index: DiscourseIndex;
    private currentLevel: GranularityLevel = 4;
    private activeTab: 'inspector' | 'index' | 'overlay' = 'inspector';
    private currentText: string = '';
    private filterCategory: DiscourseCategory | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: JpSentenceSurferPlugin, index: DiscourseIndex) {
        super(leaf);
        this.plugin = plugin;
        this.index = index;
    }

    getViewType(): string {
        return DISCOURSE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return '談話文法 Inspector';
    }

    getIcon(): string {
        return 'search';
    }

    async onOpen(): Promise<void> {
        this.buildUI();
    }

    async onClose(): Promise<void> {}

    setText(text: string): void {
        this.currentText = text;
        if (this.activeTab === 'inspector') this.renderInspector();
    }

    private buildUI(): void {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('jp-discourse-view');

        // Tab bar
        const tabBar = root.createEl('div', { cls: 'jp-discourse-tabs' });
        const tabs: Array<{ key: 'inspector' | 'index' | 'overlay'; label: string }> = [
            { key: 'inspector', label: 'Inspector' },
            { key: 'index', label: 'Index' },
            { key: 'overlay', label: 'Overlay' },
        ];

        for (const tab of tabs) {
            const btn = tabBar.createEl('button', {
                cls: 'jp-discourse-tab' + (this.activeTab === tab.key ? ' jp-discourse-tab--active' : ''),
                text: tab.label,
            });
            btn.addEventListener('click', () => {
                this.activeTab = tab.key;
                this.buildUI();
            });
        }

        // Content area
        const content = root.createEl('div', { cls: 'jp-discourse-content' });
        this.renderTabContent(content);
    }

    private renderTabContent(container: HTMLElement): void {
        container.empty();
        switch (this.activeTab) {
            case 'inspector': this.renderInspector(container); break;
            case 'index': this.renderIndex(container); break;
            case 'overlay': this.renderOverlay(container); break;
        }
    }

    private getContentEl(): HTMLElement | null {
        const root = this.containerEl.children[1] as HTMLElement;
        return root.querySelector('.jp-discourse-content');
    }

    private renderInspector(container?: HTMLElement): void {
        const el = container ?? this.getContentEl();
        if (!el) return;
        el.empty();

        // Level selector bar
        const levelBar = el.createEl('div', { cls: 'jp-discourse-level-bar' });
        levelBar.createEl('span', { cls: 'jp-discourse-level-label', text: 'Level:' });
        const select = levelBar.createEl('select', { cls: 'jp-discourse-level-select' });
        const levels: GranularityLevel[] = [1, 2, 3, 4, 5, 6, 7];
        for (const lv of levels) {
            const opt = select.createEl('option', {
                value: String(lv),
                text: `${lv} – ${GRANULARITY_LABELS[lv]}`,
            });
            if (lv === this.currentLevel) opt.selected = true;
        }
        select.addEventListener('change', () => {
            this.currentLevel = parseInt(select.value, 10) as GranularityLevel;
        });

        // Text display with highlighted markers
        const display = el.createEl('div', { cls: 'jp-discourse-text-display' });
        if (!this.currentText) {
            display.createEl('span', {
                text: 'No text selected. Navigate to a note and select a sentence.',
                cls: 'jp-discourse-empty',
            });
        } else {
            this.renderHighlightedText(display, this.currentText);
        }

        // Capture button
        const captureBtn = el.createEl('button', {
            cls: 'jp-discourse-capture-btn',
            text: '📸 Capture',
        });
        captureBtn.addEventListener('click', () => {
            if (!this.currentText) {
                new Notice('No text to capture.');
                return;
            }
            const activeFile = this.plugin.app.workspace.getActiveFile();
            this.index.captureChunk(this.currentText, this.currentLevel, {
                filePath: activeFile?.path ?? '',
                offset: 0,
            });
            this.plugin.saveSettings();
            new Notice(`Captured at level ${this.currentLevel}: ${this.currentText.slice(0, 30)}…`);
        });
    }

    private renderHighlightedText(container: HTMLElement, text: string): void {
        const markers = detectDiscourseMarkers(text);
        if (markers.length === 0) {
            container.createSpan({ text });
            return;
        }

        let cursor = 0;
        for (const marker of markers) {
            if (marker.startIndex > cursor) {
                container.createSpan({ text: text.slice(cursor, marker.startIndex) });
            }
            const color = CATEGORY_COLORS[marker.pattern.category] ?? '#888';
            const span = container.createEl('span', {
                cls: 'jp-discourse-marker-span',
                text: marker.matchedText,
            });
            span.style.backgroundColor = color;
            span.title = `${marker.pattern.category} – ${marker.pattern.description}`;
            cursor = marker.endIndex;
        }
        if (cursor < text.length) {
            container.createSpan({ text: text.slice(cursor) });
        }
    }

    private renderIndex(container?: HTMLElement): void {
        const el = container ?? this.getContentEl();
        if (!el) return;
        el.empty();

        // Filter bar
        const filterBar = el.createEl('div', { cls: 'jp-discourse-filter-bar' });
        const catSelect = filterBar.createEl('select', { cls: 'jp-discourse-filter-select' });
        catSelect.createEl('option', { value: '', text: 'All categories' });
        for (const cat of ALL_CATEGORIES) {
            const opt = catSelect.createEl('option', { value: cat, text: cat });
            if (this.filterCategory === cat) opt.selected = true;
        }
        catSelect.addEventListener('change', () => {
            this.filterCategory = (catSelect.value as DiscourseCategory) || null;
            this.renderIndex(el);
        });

        let chunks = this.index.getAllCapturedChunks();
        if (this.filterCategory) {
            chunks = chunks.filter(c => c.categories.includes(this.filterCategory!));
        }
        chunks.sort((a, b) => b.capturedAt - a.capturedAt);

        if (chunks.length === 0) {
            el.createEl('div', { cls: 'jp-discourse-empty', text: 'No captured chunks yet.' });
            return;
        }

        for (const chunk of chunks) {
            const item = el.createEl('div', { cls: 'jp-discourse-chunk-item' });
            item.createEl('div', {
                cls: 'jp-discourse-chunk-text',
                text: chunk.text.slice(0, 60) + (chunk.text.length > 60 ? '…' : ''),
            });
            const meta = item.createEl('div', { cls: 'jp-discourse-chunk-meta' });

            // Level badge
            meta.createEl('span', {
                cls: 'jp-discourse-marker-badge',
                text: `L${chunk.level}`,
            });

            // Category badges
            for (const cat of chunk.categories) {
                const badge = meta.createEl('span', {
                    cls: 'jp-discourse-marker-badge',
                    text: cat,
                });
                badge.style.backgroundColor = CATEGORY_COLORS[cat] ?? '#888';
            }

            // Delete button
            const delBtn = meta.createEl('button', {
                cls: 'jp-discourse-chunk-delete',
                text: '✕',
            });
            delBtn.setAttribute('aria-label', 'Delete chunk');
            delBtn.addEventListener('click', () => {
                this.index.removeChunk(chunk.id);
                this.plugin.saveSettings();
                this.renderIndex(el);
            });
        }
    }

    private renderOverlay(container?: HTMLElement): void {
        const el = container ?? this.getContentEl();
        if (!el) return;
        el.empty();

        const freqs = this.index.getMarkerFrequency();
        if (freqs.length === 0) {
            el.createEl('div', { cls: 'jp-discourse-empty', text: 'No data yet. Capture some chunks first.' });
            return;
        }

        const maxCount = freqs[0]?.count ?? 1;

        for (const f of freqs) {
            const dp = DISCOURSE_PATTERNS.find(p => p.id === f.patternId);
            const color = dp ? (CATEGORY_COLORS[dp.category] ?? '#888') : '#888';
            const label = dp ? (typeof dp.pattern === 'string' ? dp.pattern : dp.id) : f.patternId;

            const row = el.createEl('div', { cls: 'jp-discourse-overlay-item' });
            row.createEl('span', { cls: 'jp-discourse-overlay-label', text: label });

            const barWrap = row.createEl('div', { cls: 'jp-discourse-overlay-bar-wrap' });
            const bar = barWrap.createEl('div', { cls: 'jp-discourse-overlay-bar' });
            bar.style.width = `${(f.count / maxCount) * 100}%`;
            bar.style.backgroundColor = color;

            row.createEl('span', { cls: 'jp-discourse-overlay-count', text: String(f.count) });
        }
    }
}
