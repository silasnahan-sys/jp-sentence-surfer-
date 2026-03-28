import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DiscourseCategory, DetectedMarker, detectPatterns, DISCOURSE_PATTERNS } from '../discourse/discourse-grammar';
import { DiscourseChunkEntry } from '../discourse/discourse-index';

export const DISCOURSE_VIEW_TYPE = 'jp-surfer-discourse-view';

type TabName = 'inspector' | 'index' | 'overlay';

const TAB_LABELS: Record<TabName, string> = {
    inspector: 'Inspector',
    index: 'Index',
    overlay: 'Overlay',
};

const CATEGORY_DESCRIPTIONS: Record<DiscourseCategory, string> = {
    [DiscourseCategory.A]: 'Utterance-Initial Markers',
    [DiscourseCategory.B]: 'Contrastive & Concessive Markers',
    [DiscourseCategory.C]: 'Causal & Resultative Markers',
    [DiscourseCategory.D]: 'Additive & Enumerative Markers',
    [DiscourseCategory.E]: 'Topic & Focus Markers',
    [DiscourseCategory.F]: 'Evidential & Modal Markers',
    [DiscourseCategory.G]: 'Interactional & Backchannel Markers',
    [DiscourseCategory.H]: 'Utterance-Final Markers',
};

export class DiscourseView extends ItemView {
    private plugin: JpSentenceSurferPlugin;
    private activeTab: TabName = 'inspector';

    constructor(leaf: WorkspaceLeaf, plugin: JpSentenceSurferPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return DISCOURSE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Discourse Analyzer';
    }

    getIcon(): string {
        return 'languages';
    }

    async onOpen(): Promise<void> {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('jp-surfer-discourse-view');

        const tabsEl = root.createEl('div', { cls: 'jp-surfer-discourse-tabs' });
        const contentEl = root.createEl('div', { cls: 'jp-surfer-discourse-content' });

        const tabs: TabName[] = ['inspector', 'index', 'overlay'];
        const tabButtons = new Map<TabName, HTMLElement>();
        const panels = new Map<TabName, HTMLElement>();

        for (const tab of tabs) {
            const btn = tabsEl.createEl('button', {
                cls: 'jp-surfer-discourse-tab' + (tab === this.activeTab ? ' active' : ''),
                text: TAB_LABELS[tab],
                attr: { 'data-tab': tab },
            });
            tabButtons.set(tab, btn);

            const panel = contentEl.createEl('div', {
                cls: 'jp-surfer-discourse-panel',
                attr: { 'data-panel': tab },
            });
            if (tab !== this.activeTab) {
                panel.style.display = 'none';
            }
            panels.set(tab, panel);

            btn.addEventListener('click', () => {
                this.activeTab = tab;
                tabButtons.forEach((b, t) => b.toggleClass('active', t === tab));
                panels.forEach((p, t) => { p.style.display = t === tab ? '' : 'none'; });
            });
        }

        this.renderInspector(panels.get('inspector')!);
        this.renderIndex(panels.get('index')!);
        this.renderOverlay(panels.get('overlay')!);
    }

    private renderInspector(container: HTMLElement): void {
        const textarea = container.createEl('textarea', {
            cls: 'jp-surfer-inspector-textarea',
            attr: { placeholder: 'Paste or enter Japanese text here...' },
        });

        const resultsEl = container.createEl('div', { cls: 'jp-surfer-inspector-results' });

        const btnRow = container.createEl('div', { cls: 'jp-surfer-inspector-controls' });

        const analyzeBtn = btnRow.createEl('button', {
            cls: 'jp-surfer-btn',
            text: 'Analyze',
        });

        const captureBtn = btnRow.createEl('button', {
            cls: 'jp-surfer-btn',
            text: 'Capture',
        });

        analyzeBtn.addEventListener('click', () => {
            resultsEl.empty();
            const text = (textarea as HTMLTextAreaElement).value.trim();
            if (!text) return;

            const markers: DetectedMarker[] = detectPatterns(text);
            if (markers.length === 0) {
                resultsEl.createEl('p', { text: 'No discourse markers detected.' });
                return;
            }

            for (const marker of markers) {
                const patternEntry = DISCOURSE_PATTERNS.find(p => p.id === marker.patternId);
                const row = resultsEl.createEl('div', { cls: 'jp-surfer-marker-row' });
                const badge = row.createEl('span', {
                    cls: 'jp-surfer-marker-badge',
                    text: marker.matchedText,
                    attr: { 'data-category': marker.category },
                });
                if (patternEntry) {
                    badge.setAttribute('title', patternEntry.pragmaticFunction);
                    row.createEl('span', {
                        cls: 'jp-surfer-marker-tooltip',
                        text: patternEntry.pragmaticFunction,
                    });
                }
            }
        });

        captureBtn.addEventListener('click', () => {
            const text = (textarea as HTMLTextAreaElement).value.trim();
            if (!text) return;
            const sourcePath = this.app.workspace.getActiveFile()?.path ?? 'unknown';
            this.plugin.discourseIndex.captureChunk(text, sourcePath, 0, text.length);
            new Notice('Captured!');
        });
    }

    private renderIndex(container: HTMLElement): void {
        const filterRow = container.createEl('div', { cls: 'jp-surfer-index-filters' });

        const categorySelect = filterRow.createEl('select', {
            cls: 'jp-surfer-filter-select',
        }) as HTMLSelectElement;
        categorySelect.createEl('option', { text: 'All', attr: { value: '' } });
        for (const cat of Object.values(DiscourseCategory)) {
            categorySelect.createEl('option', { text: cat, attr: { value: cat } });
        }

        const sourceInput = filterRow.createEl('input', {
            cls: 'jp-surfer-filter-input',
            attr: { type: 'text', placeholder: 'Filter by source...' },
        }) as HTMLInputElement;

        const listEl = container.createEl('div', { cls: 'jp-surfer-chunk-list' });

        const renderList = (): void => {
            listEl.empty();
            const catFilter = categorySelect.value as DiscourseCategory | '';
            const srcFilter = sourceInput.value.trim().toLowerCase();

            let entries: DiscourseChunkEntry[] = this.plugin.discourseIndex.getAllEntries();

            if (catFilter) {
                entries = entries.filter(e =>
                    e.markerCategories.includes(catFilter as DiscourseCategory)
                );
            }
            if (srcFilter) {
                entries = entries.filter(e =>
                    e.sourcePath.toLowerCase().includes(srcFilter)
                );
            }

            if (entries.length === 0) {
                listEl.createEl('p', { text: 'No entries found.' });
                return;
            }

            for (const entry of entries) {
                const card = listEl.createEl('div', { cls: 'jp-surfer-chunk-card' });
                card.createEl('div', { cls: 'jp-surfer-chunk-text', text: entry.text });
                card.createEl('div', {
                    cls: 'jp-surfer-chunk-meta',
                    text: `source: ${entry.sourcePath} | categories: ${entry.markerCategories.join(', ')}`,
                });
            }
        };

        categorySelect.addEventListener('change', renderList);
        sourceInput.addEventListener('input', renderList);
        renderList();
    }

    private renderOverlay(container: HTMLElement): void {
        const categories = Object.values(DiscourseCategory);
        const entries = this.plugin.discourseIndex.getAllEntries();

        const freqMap: Partial<Record<DiscourseCategory, number>> = {};
        for (const cat of categories) freqMap[cat] = 0;
        for (const entry of entries) {
            for (const marker of entry.markers) {
                freqMap[marker.category] = (freqMap[marker.category] ?? 0) + 1;
            }
        }

        const togglesEl = container.createEl('div', { cls: 'jp-surfer-overlay-grid' });
        for (const cat of categories) {
            const row = togglesEl.createEl('div', { cls: 'jp-surfer-overlay-grid-row' });
            const checkboxId = `jp-surfer-overlay-${cat}`;
            const checkbox = row.createEl('input', {
                attr: { type: 'checkbox', id: checkboxId },
            }) as HTMLInputElement;
            checkbox.checked = true;
            row.createEl('label', {
                text: `Category ${cat} — ${CATEGORY_DESCRIPTIONS[cat]}`,
                attr: { for: checkboxId },
            });
            row.createEl('span', {
                cls: 'jp-surfer-overlay-count',
                text: String(freqMap[cat] ?? 0),
            });
        }

        const table = container.createEl('table', { cls: 'jp-surfer-stats-table' });
        const headerRow = table.createEl('thead').createEl('tr');
        headerRow.createEl('th', { text: 'Category' });
        headerRow.createEl('th', { text: 'Count' });
        headerRow.createEl('th', { text: 'Description' });

        const tbody = table.createEl('tbody');
        for (const cat of categories) {
            const tr = tbody.createEl('tr');
            tr.createEl('td', { text: cat });
            tr.createEl('td', { text: String(freqMap[cat] ?? 0) });
            tr.createEl('td', { text: CATEGORY_DESCRIPTIONS[cat] });
        }
    }

    async onClose(): Promise<void> {
        (this.containerEl.children[1] as HTMLElement).empty();
    }
}
