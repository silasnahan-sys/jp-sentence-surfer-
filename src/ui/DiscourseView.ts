import { ItemView, WorkspaceLeaf } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DiscourseIndex, DiscourseChunkEntry } from '../discourse/discourse-index';
import type { DiscourseGranularity } from '../discourse/discourse-parser';
import type { DiscoursePatternCategory } from '../discourse/discourse-grammar';

// DiscourseGranularity and DiscoursePatternCategory are imported for downstream consumers
// who import this module alongside the discourse subsystem.
export type { DiscourseGranularity, DiscoursePatternCategory };

export const DISCOURSE_VIEW_TYPE = 'jp-surfer-discourse-view';

export class DiscourseView extends ItemView {
    static VIEW_TYPE = DISCOURSE_VIEW_TYPE;

    private plugin: JpSentenceSurferPlugin;

    // Inspector state
    private inspectorContainer: HTMLElement | null = null;
    private contextEl: HTMLElement | null = null;
    private chunkTextEl: HTMLElement | null = null;
    private patternTagsEl: HTMLElement | null = null;
    private currentEntry: DiscourseChunkEntry | null = null;

    // Index browser state
    private indexSearchEl: HTMLInputElement | null = null;
    private indexListEl: HTMLElement | null = null;
    private indexSearchTimer: ReturnType<typeof setTimeout> | null = null;
    private indexEntries: DiscourseChunkEntry[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: JpSentenceSurferPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DiscourseView.VIEW_TYPE;
    }

    getDisplayText(): string {
        return '談話文法';
    }

    getIcon(): string {
        return 'book-open';
    }

    async onOpen(): Promise<void> {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();

        const container = root.createDiv({ cls: 'jp-discourse-view' });

        // ── Tab bar ──────────────────────────────────────────────────────────
        const tabBar = container.createDiv({ cls: 'jp-discourse-tab-bar' });
        const tabContent = container.createDiv({ cls: 'jp-discourse-tab-content' });

        const tabs: { label: string; key: string }[] = [
            { label: '検索', key: 'inspector' },
            { label: '索引', key: 'index' },
            { label: 'オーバーレイ', key: 'overlay' },
        ];

        const panels: Record<string, HTMLElement> = {};
        const buttons: HTMLButtonElement[] = [];

        for (const tab of tabs) {
            const btn = tabBar.createEl('button', {
                text: tab.label,
                cls: 'jp-discourse-tab-btn',
            });
            buttons.push(btn);

            const panel = tabContent.createDiv({ cls: 'jp-discourse-panel' });
            panel.style.display = 'none';
            panels[tab.key] = panel;

            btn.addEventListener('click', () => {
                for (const b of buttons) b.classList.remove('jp-discourse-tab-btn--active');
                for (const p of Object.values(panels)) p.style.display = 'none';
                btn.classList.add('jp-discourse-tab-btn--active');
                panel.style.display = '';
            });
        }

        // Show first tab by default
        buttons[0].classList.add('jp-discourse-tab-btn--active');
        panels['inspector'].style.display = '';

        // ── Tab 1: Inspector ─────────────────────────────────────────────────
        this.buildInspectorPanel(panels['inspector']);

        // ── Tab 2: Index Browser ─────────────────────────────────────────────
        this.buildIndexPanel(panels['index']);

        // ── Tab 3: Overlay Preview ───────────────────────────────────────────
        this.buildOverlayPanel(panels['overlay']);
    }

    async onClose(): Promise<void> {
        if (this.indexSearchTimer !== null) {
            clearTimeout(this.indexSearchTimer);
            this.indexSearchTimer = null;
        }
    }

    // ── Inspector panel ───────────────────────────────────────────────────────

    private buildInspectorPanel(panel: HTMLElement): void {
        this.inspectorContainer = panel.createDiv({ cls: 'jp-discourse-inspector' });

        this.contextEl = this.inspectorContainer.createDiv({ cls: 'jp-context-text' });
        this.contextEl.textContent = '—';

        this.chunkTextEl = this.inspectorContainer.createDiv({ cls: 'jp-chunk-text' });
        this.chunkTextEl.textContent = 'チャンクを選択してください';

        this.patternTagsEl = this.inspectorContainer.createDiv({ cls: 'jp-pattern-tags' });

        const captureBtn = this.inspectorContainer.createEl('button', {
            text: 'Capture',
            cls: 'jp-capture-btn',
        });
        captureBtn.addEventListener('click', () => {
            if (!this.currentEntry) return;
            const index = (this.plugin as unknown as { discourseIndex?: DiscourseIndex }).discourseIndex;
            if (index) {
                index.addEntry(this.currentEntry);
                this.refreshIndex(index);
            }
        });
    }

    /** Update the Inspector tab with a new chunk entry. */
    setCurrentChunk(entry: DiscourseChunkEntry): void {
        this.currentEntry = entry;

        if (!this.contextEl || !this.chunkTextEl || !this.patternTagsEl) return;

        // Context
        this.contextEl.textContent = entry.context.before
            ? `…${entry.context.before}`
            : '（文脈なし）';

        // Colored marker spans
        this.chunkTextEl.empty();
        this.renderChunkText(this.chunkTextEl, entry);

        // Pattern tag pills
        this.patternTagsEl.empty();
        for (const tag of entry.patternTags) {
            const pill = this.patternTagsEl.createEl('span', {
                text: tag,
                cls: 'jp-pattern-tag',
            });
            // Assign color class based on marker presence
            const allMarkers = [
                ...entry.openingMarkers,
                ...entry.closingMarkers,
                ...entry.internalMarkers,
            ];
            const matched = allMarkers.find(m => m.label === tag);
            if (matched) {
                const cat = matched.category;
                if (cat === 'UTTERANCE_OPENING') pill.classList.add('jp-pattern-tag--opening');
                else if (cat === 'UTTERANCE_CLOSING') pill.classList.add('jp-pattern-tag--closing');
                else if (cat === 'DISCOURSE_CONNECTIVE') pill.classList.add('jp-pattern-tag--internal');
            }
        }
    }

    private renderChunkText(container: HTMLElement, entry: DiscourseChunkEntry): void {
        const text = entry.text;

        // Build a sorted list of marker ranges to colorize
        type MarkerRange = { start: number; end: number; cls: string };
        const ranges: MarkerRange[] = [];

        for (const m of entry.openingMarkers) {
            if (m.startChar !== undefined && m.endChar !== undefined) {
                ranges.push({ start: m.startChar, end: m.endChar, cls: 'jp-marker-opening' });
            }
        }
        for (const m of entry.closingMarkers) {
            if (m.startChar !== undefined && m.endChar !== undefined) {
                ranges.push({ start: m.startChar, end: m.endChar, cls: 'jp-marker-closing' });
            }
        }
        for (const m of entry.internalMarkers) {
            if (m.startChar !== undefined && m.endChar !== undefined) {
                ranges.push({ start: m.startChar, end: m.endChar, cls: 'jp-marker-internal' });
            }
        }

        ranges.sort((a, b) => a.start - b.start);

        let cursor = 0;
        for (const range of ranges) {
            if (range.start > cursor) {
                container.appendText(text.slice(cursor, range.start));
            }
            if (range.start >= cursor) {
                container.createEl('span', {
                    text: text.slice(range.start, range.end),
                    cls: range.cls,
                });
                cursor = range.end;
            }
        }
        if (cursor < text.length) {
            container.appendText(text.slice(cursor));
        }
    }

    // ── Index Browser panel ───────────────────────────────────────────────────

    private buildIndexPanel(panel: HTMLElement): void {
        this.indexSearchEl = panel.createEl('input', {
            type: 'text',
            placeholder: '検索…',
            cls: 'jp-index-search',
        });

        this.indexListEl = panel.createDiv({ cls: 'jp-index-list' });

        this.indexSearchEl.addEventListener('input', () => {
            if (this.indexSearchTimer !== null) clearTimeout(this.indexSearchTimer);
            this.indexSearchTimer = setTimeout(() => {
                this.renderIndexList(this.indexSearchEl?.value ?? '');
            }, 300);
        });
    }

    /** Re-render the index browser with the current entries from a DiscourseIndex. */
    refreshIndex(index: DiscourseIndex): void {
        this.indexEntries = index.getAllEntries();
        this.renderIndexList(this.indexSearchEl?.value ?? '');
    }

    private renderIndexList(query: string): void {
        if (!this.indexListEl) return;
        this.indexListEl.empty();

        const lower = query.toLowerCase();
        const filtered = query
            ? this.indexEntries.filter(
                  e =>
                      e.text.toLowerCase().includes(lower) ||
                      e.patternTags.some(t => t.toLowerCase().includes(lower))
              )
            : this.indexEntries;

        if (filtered.length === 0) {
            this.indexListEl.createDiv({ text: 'エントリーなし', cls: 'jp-index-empty' });
            return;
        }

        for (const entry of filtered) {
            const row = this.indexListEl.createDiv({ cls: 'jp-index-entry' });

            // Text preview
            const preview = row.createDiv({ cls: 'jp-index-preview' });
            preview.textContent = entry.text.slice(0, 60) + (entry.text.length > 60 ? '…' : '');

            // Marker color dots
            const dots = row.createDiv({ cls: 'jp-index-dots' });
            if (entry.openingMarkers.length > 0) {
                dots.createEl('span', { cls: 'jp-dot jp-dot--opening' });
            }
            if (entry.closingMarkers.length > 0) {
                dots.createEl('span', { cls: 'jp-dot jp-dot--closing' });
            }
            if (entry.internalMarkers.length > 0) {
                dots.createEl('span', { cls: 'jp-dot jp-dot--internal' });
            }

            // Timestamp
            if (entry.timestamp) {
                row.createDiv({ text: entry.timestamp, cls: 'jp-index-timestamp' });
            }

            // Click → show in Inspector (switch to first tab)
            row.addEventListener('click', () => {
                this.setCurrentChunk(entry);
                // Switch to inspector tab by clicking its button
                const tabBtns =
                    this.containerEl.querySelectorAll<HTMLButtonElement>('.jp-discourse-tab-btn');
                if (tabBtns.length > 0) tabBtns[0].click();
            });
        }
    }

    // ── Overlay Preview panel ─────────────────────────────────────────────────

    private buildOverlayPanel(panel: HTMLElement): void {
        const settings = (this.plugin.settings as unknown as { showDiscourseOverlay?: boolean });

        const toggleBtn = panel.createEl('button', {
            cls: 'jp-overlay-toggle',
        });

        const updateToggleLabel = (): void => {
            const on = settings.showDiscourseOverlay ?? false;
            toggleBtn.textContent = `オーバーレイ: ${on ? 'ON' : 'OFF'}`;
            toggleBtn.classList.toggle('jp-overlay-toggle--on', on);
        };
        updateToggleLabel();

        toggleBtn.addEventListener('click', () => {
            settings.showDiscourseOverlay = !(settings.showDiscourseOverlay ?? false);
            this.plugin.saveSettings();
            updateToggleLabel();
        });

        // Legend
        const legend = panel.createDiv({ cls: 'jp-overlay-legend' });
        const legendItems: { color: string; label: string }[] = [
            { color: '#4a9eff', label: '発話冒頭（Opening markers）' },
            { color: '#ff8c42', label: '発話末（Closing markers）' },
            { color: '#4caf50', label: '接続語（Connectives）' },
            { color: '#9c27b0', label: '境界（Boundaries）' },
            { color: '#9e9e9e', label: '応答（Interactional）' },
        ];
        for (const item of legendItems) {
            const row = legend.createDiv({ cls: 'jp-legend-row' });
            const swatch = row.createEl('span', { cls: 'jp-legend-swatch' });
            swatch.style.backgroundColor = item.color;
            row.appendText(item.label);
        }

        panel.createDiv({
            text: 'Live pattern detection is active when overlay is ON',
            cls: 'jp-overlay-note',
        });
    }
}
