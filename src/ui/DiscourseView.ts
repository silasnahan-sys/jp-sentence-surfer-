/**
 * DiscourseView.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Obsidian ItemView panel for 談話文法 (Discourse Grammar) visualization.
 *
 * Registered as view type: 'jp-surfer-discourse-view'
 * CSS classes: jp-surfer-discourse-*
 *
 * Mobile-first: works on iPhone 17 / iPad Mini 7.
 * Safe area insets, 44pt touch targets, momentum scrolling.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ItemView, MarkdownView, WorkspaceLeaf, setIcon } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DiscourseUnit, DiscourseMarker, DiscourseGranularity } from '../types';
import {
    parseAtLevel,
    GRANULARITY_LEVELS,
    cycleGranularity,
    findUnitAt,
} from '../discourse/discourse-parser';
import { DiscourseIndex, DiscourseIndexEntry } from '../discourse/discourse-index';
import { detectPatternsInText } from '../discourse/discourse-grammar';

export const DISCOURSE_VIEW_TYPE = 'jp-surfer-discourse-view';

type PanelMode = 'surf' | 'index' | 'patterns';

export class DiscourseView extends ItemView {
    private plugin: JpSentenceSurferPlugin;
    private discourseIndex: DiscourseIndex;

    private currentMode: PanelMode = 'surf';
    private currentGranularity: DiscourseGranularity = 'utterance';
    private units: DiscourseUnit[] = [];
    private selectedIdx: number = 0;
    private searchQuery: string = '';

    // DOM references
    private modeBarEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private granSelectorEl!: HTMLElement;
    private unitListEl!: HTMLElement;
    private detailEl!: HTMLElement;
    private searchInputEl!: HTMLInputElement;
    private indexListEl!: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: JpSentenceSurferPlugin, index: DiscourseIndex) {
        super(leaf);
        this.plugin = plugin;
        this.discourseIndex = index;
    }

    getViewType(): string { return DISCOURSE_VIEW_TYPE; }
    getDisplayText(): string { return '談話文法'; }
    getIcon(): string { return 'speech'; }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('jp-surfer-discourse-view');

        this.buildModeBar(contentEl);
        this.bodyEl = contentEl.createDiv({ cls: 'jp-surfer-discourse-body' });
        this.renderCurrentMode();

        // Listen for active leaf changes to re-parse
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.onEditorChange())
        );
        this.registerEvent(
            this.app.workspace.on('editor-change', () => this.onEditorChange())
        );
    }

    async onClose(): Promise<void> { /* nothing */ }

    // ─── Mode bar ─────────────────────────────────────────────────────────────

    private buildModeBar(parent: HTMLElement): void {
        this.modeBarEl = parent.createDiv({ cls: 'jp-surfer-discourse-modebar' });
        const modes: { id: PanelMode; icon: string; label: string }[] = [
            { id: 'surf', icon: 'wave', label: 'サーフ' },
            { id: 'patterns', icon: 'list', label: 'パターン' },
            { id: 'index', icon: 'database', label: 'インデックス' },
        ];
        for (const m of modes) {
            const btn = this.modeBarEl.createEl('button', {
                cls: 'jp-surfer-discourse-mode-btn' + (this.currentMode === m.id ? ' is-active' : ''),
                attr: { 'aria-label': m.label, 'data-mode': m.id },
            });
            try { setIcon(btn, m.icon); } catch (_) { btn.textContent = m.label; }
            btn.createSpan({ text: m.label, cls: 'jp-surfer-discourse-mode-label' });
            btn.addEventListener('click', () => {
                this.currentMode = m.id;
                this.modeBarEl.querySelectorAll('.jp-surfer-discourse-mode-btn').forEach(b => {
                    b.toggleClass('is-active', b.getAttribute('data-mode') === m.id);
                });
                this.renderCurrentMode();
            });
        }
    }

    // ─── Mode rendering ───────────────────────────────────────────────────────

    private renderCurrentMode(): void {
        this.bodyEl.empty();
        switch (this.currentMode) {
            case 'surf':    this.renderSurfMode(); break;
            case 'patterns': this.renderPatternsMode(); break;
            case 'index':   this.renderIndexMode(); break;
        }
    }

    // ── Surf mode ─────────────────────────────────────────────────────────────

    private renderSurfMode(): void {
        // Granularity selector
        this.granSelectorEl = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-gran-bar' });
        for (const lvl of GRANULARITY_LEVELS) {
            const btn = this.granSelectorEl.createEl('button', {
                cls: 'jp-surfer-discourse-gran-btn' + (lvl === this.currentGranularity ? ' is-active' : ''),
                text: this.granLabel(lvl),
                attr: { 'aria-label': lvl, 'data-level': lvl },
            });
            btn.addEventListener('click', () => {
                this.currentGranularity = lvl;
                this.granSelectorEl.querySelectorAll('.jp-surfer-discourse-gran-btn').forEach(b => {
                    b.toggleClass('is-active', b.getAttribute('data-level') === lvl);
                });
                this.refreshUnits();
            });
        }

        // Navigation row
        const navRow = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-nav-row' });
        const prevBtn = navRow.createEl('button', { cls: 'jp-surfer-discourse-nav-btn', text: '◀' });
        prevBtn.setAttribute('aria-label', '前の単位');
        prevBtn.addEventListener('click', () => this.navigate(-1));

        const selBtn = navRow.createEl('button', { cls: 'jp-surfer-discourse-nav-btn', text: '選択' });
        selBtn.setAttribute('aria-label', '現在の単位を選択');
        selBtn.addEventListener('click', () => this.selectCurrentUnit());

        const captureBtn = navRow.createEl('button', { cls: 'jp-surfer-discourse-nav-btn', text: '📌' });
        captureBtn.setAttribute('aria-label', 'チャンクをキャプチャ');
        captureBtn.addEventListener('click', () => this.captureCurrentChunk());

        const nextBtn = navRow.createEl('button', { cls: 'jp-surfer-discourse-nav-btn', text: '▶' });
        nextBtn.setAttribute('aria-label', '次の単位');
        nextBtn.addEventListener('click', () => this.navigate(1));

        // Unit list
        this.unitListEl = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-unit-list' });
        // Detail panel
        this.detailEl = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-detail' });

        this.refreshUnits();
    }

    private refreshUnits(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            this.unitListEl.empty();
            this.unitListEl.createEl('p', { text: 'アクティブなエディタがありません', cls: 'jp-surfer-discourse-empty' });
            return;
        }
        const text = view.editor.getValue();
        this.units = parseAtLevel(text, this.currentGranularity);
        this.renderUnitList();
        this.renderDetail();
    }

    private renderUnitList(): void {
        this.unitListEl.empty();
        const MAX_DISPLAY = 100;
        const shown = this.units.slice(0, MAX_DISPLAY);
        for (let i = 0; i < shown.length; i++) {
            const u = shown[i];
            const el = this.unitListEl.createDiv({
                cls: 'jp-surfer-discourse-unit-item' + (i === this.selectedIdx ? ' is-selected' : ''),
            });
            // Markers chips row
            if (u.markers.length > 0) {
                const chipsRow = el.createDiv({ cls: 'jp-surfer-discourse-chips' });
                for (const m of u.markers.slice(0, 4)) {
                    const chip = chipsRow.createSpan({ cls: 'jp-surfer-discourse-chip' });
                    chip.style.backgroundColor = m.color + '33';
                    chip.style.borderColor = m.color;
                    chip.style.color = m.color;
                    chip.textContent = m.label;
                }
                if (u.markers.length > 4) {
                    chipsRow.createSpan({ cls: 'jp-surfer-discourse-chip jp-surfer-discourse-chip--more', text: `+${u.markers.length - 4}` });
                }
            }
            // Text preview
            const preview = u.text.slice(0, 80) + (u.text.length > 80 ? '…' : '');
            el.createDiv({ cls: 'jp-surfer-discourse-unit-text', text: preview });
            el.addEventListener('click', () => {
                this.selectedIdx = i;
                this.renderUnitList();
                this.renderDetail();
                this.jumpToUnit(u);
            });
        }
        if (this.units.length > MAX_DISPLAY) {
            this.unitListEl.createEl('p', {
                text: `${this.units.length - MAX_DISPLAY}件以上省略`,
                cls: 'jp-surfer-discourse-empty',
            });
        }
    }

    private renderDetail(): void {
        this.detailEl.empty();
        const unit = this.units[this.selectedIdx];
        if (!unit) return;

        this.detailEl.createEl('h3', { text: `${this.granLabel(unit.level)} 詳細`, cls: 'jp-surfer-discourse-detail-title' });
        this.detailEl.createDiv({ cls: 'jp-surfer-discourse-detail-text', text: unit.text });

        if (unit.markers.length > 0) {
            this.detailEl.createEl('h4', { text: '談話マーカー', cls: 'jp-surfer-discourse-detail-subtitle' });
            const table = this.detailEl.createEl('table', { cls: 'jp-surfer-discourse-marker-table' });
            const thead = table.createEl('thead');
            const hr = thead.createEl('tr');
            ['カテゴリ', 'サブ', '表層', '確信度'].forEach(h => hr.createEl('th', { text: h }));
            const tbody = table.createEl('tbody');
            for (const m of unit.markers) {
                const tr = tbody.createEl('tr');
                const badge = tr.createEl('td').createSpan({ cls: 'jp-surfer-discourse-chip', text: m.label });
                badge.style.backgroundColor = m.color + '33';
                badge.style.borderColor = m.color;
                badge.style.color = m.color;
                tr.createEl('td', { text: m.subcategory });
                tr.createEl('td', { text: m.text });
                tr.createEl('td', { text: Math.round(m.confidence * 100) + '%' });
            }
        }

        if (unit.children.length > 0) {
            this.detailEl.createEl('h4', { text: '子ユニット', cls: 'jp-surfer-discourse-detail-subtitle' });
            const ul = this.detailEl.createEl('ul', { cls: 'jp-surfer-discourse-children' });
            for (const child of unit.children.slice(0, 10)) {
                const li = ul.createEl('li');
                li.createSpan({ cls: 'jp-surfer-discourse-child-level', text: this.granLabel(child.level) });
                li.createSpan({ text: ' ' + child.text.slice(0, 60) });
            }
        }
    }

    // ── Patterns mode ─────────────────────────────────────────────────────────

    private renderPatternsMode(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const text = view ? view.editor.getValue() : '';

        this.bodyEl.createEl('h3', { text: '検出パターン', cls: 'jp-surfer-discourse-section-title' });

        if (!text) {
            this.bodyEl.createEl('p', { text: 'テキストがありません', cls: 'jp-surfer-discourse-empty' });
            return;
        }

        const markers: DiscourseMarker[] = detectPatternsInText(text);

        if (markers.length === 0) {
            this.bodyEl.createEl('p', { text: 'パターンが見つかりませんでした', cls: 'jp-surfer-discourse-empty' });
            return;
        }

        // Group by category
        const byCategory = new Map<string, DiscourseMarker[]>();
        for (const m of markers) {
            if (!byCategory.has(m.type)) byCategory.set(m.type, []);
            byCategory.get(m.type)!.push(m);
        }

        for (const [cat, ms] of byCategory) {
            const section = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-pattern-section' });
            section.createEl('h4', { text: cat, cls: 'jp-surfer-discourse-pattern-cat' });
            const chipsWrap = section.createDiv({ cls: 'jp-surfer-discourse-chips jp-surfer-discourse-chips--wrap' });
            for (const m of ms) {
                const chip = chipsWrap.createSpan({ cls: 'jp-surfer-discourse-chip jp-surfer-discourse-chip--lg' });
                chip.style.backgroundColor = m.color + '33';
                chip.style.borderColor = m.color;
                chip.style.color = m.color;
                chip.textContent = m.text + ' (' + m.label + ')';
                chip.addEventListener('click', () => this.jumpToOffset(m.charStart));
            }
        }
    }

    // ── Index mode ────────────────────────────────────────────────────────────

    private renderIndexMode(): void {
        this.bodyEl.createEl('h3', { text: '談話インデックス', cls: 'jp-surfer-discourse-section-title' });

        // Search bar
        const searchBar = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-search-bar' });
        this.searchInputEl = searchBar.createEl('input', {
            cls: 'jp-surfer-discourse-search-input',
            attr: { type: 'text', placeholder: 'キーワード検索…', 'aria-label': '検索' },
        }) as HTMLInputElement;
        this.searchInputEl.value = this.searchQuery;
        this.searchInputEl.addEventListener('input', () => {
            this.searchQuery = this.searchInputEl.value;
            this.renderIndexList();
        });

        const clearBtn = searchBar.createEl('button', { cls: 'jp-surfer-discourse-search-clear', text: '✕' });
        clearBtn.addEventListener('click', () => {
            this.searchQuery = '';
            this.searchInputEl.value = '';
            this.renderIndexList();
        });

        // Stats
        const stats = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-index-stats' });
        stats.textContent = `${this.discourseIndex.size()}件のチャンク`;

        // List
        this.indexListEl = this.bodyEl.createDiv({ cls: 'jp-surfer-discourse-index-list' });
        this.renderIndexList();
    }

    private renderIndexList(): void {
        this.indexListEl.empty();
        const entries = this.searchQuery
            ? this.discourseIndex.search(this.searchQuery)
            : this.discourseIndex.getAll();

        if (entries.length === 0) {
            this.indexListEl.createEl('p', {
                text: 'チャンクがありません。サーフ画面で 📌 をタップして追加してください。',
                cls: 'jp-surfer-discourse-empty',
            });
            return;
        }

        for (const entry of entries.slice(0, 50)) {
            this.renderIndexEntry(entry);
        }
    }

    private renderIndexEntry(entry: DiscourseIndexEntry): void {
        const el = this.indexListEl.createDiv({ cls: 'jp-surfer-discourse-index-entry' });

        // Header
        const header = el.createDiv({ cls: 'jp-surfer-discourse-index-header' });
        header.createSpan({ cls: 'jp-surfer-discourse-index-source', text: entry.sourcePath.split('/').pop() ?? '' });
        header.createSpan({ cls: 'jp-surfer-discourse-index-date', text: entry.capturedAt.slice(0, 10) });
        const delBtn = header.createEl('button', { cls: 'jp-surfer-discourse-index-del', text: '🗑' });
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.discourseIndex.removeEntry(entry.id);
            this.discourseIndex.persist();
            this.renderIndexList();
        });

        // Chips
        if (entry.markerIds.length > 0) {
            const chips = el.createDiv({ cls: 'jp-surfer-discourse-chips' });
            for (const mid of entry.markerIds.slice(0, 5)) {
                chips.createSpan({ cls: 'jp-surfer-discourse-chip', text: mid });
            }
        }

        // Text preview
        el.createDiv({ cls: 'jp-surfer-discourse-index-text', text: entry.chunk.text.slice(0, 120) });

        // Logical flows
        if (entry.chunk.logicalFlows.length > 0) {
            const flows = el.createDiv({ cls: 'jp-surfer-discourse-logical-flows' });
            for (const lf of entry.chunk.logicalFlows.slice(0, 2)) {
                flows.createSpan({ cls: 'jp-surfer-discourse-flow-badge', text: lf.name });
            }
        }
    }

    // ─── Actions ─────────────────────────────────────────────────────────────

    private navigate(dir: -1 | 1): void {
        const newIdx = Math.max(0, Math.min(this.units.length - 1, this.selectedIdx + dir));
        if (newIdx === this.selectedIdx) return;
        this.selectedIdx = newIdx;
        this.renderUnitList();
        this.renderDetail();
        this.jumpToUnit(this.units[this.selectedIdx]);
    }

    private jumpToUnit(unit: DiscourseUnit): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const pos = view.editor.offsetToPos(unit.start);
        view.editor.setCursor(pos);
        view.editor.scrollIntoView({ from: pos, to: pos }, true);
    }

    private jumpToOffset(offset: number): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const pos = view.editor.offsetToPos(offset);
        view.editor.setCursor(pos);
    }

    private selectCurrentUnit(): void {
        const unit = this.units[this.selectedIdx];
        if (!unit) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        view.editor.setSelection(
            view.editor.offsetToPos(unit.start),
            view.editor.offsetToPos(unit.end),
        );
    }

    private async captureCurrentChunk(): Promise<void> {
        const unit = this.units[this.selectedIdx];
        if (!unit) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const file = view.file;
        if (!file) return;

        try {
            await this.discourseIndex.captureChunk(
                unit.text,
                unit.start,
                unit.end,
                file.path,
                this.plugin.settings.discourse.contextExpansionMode === 'smart',
            );
            // Switch to index mode and refresh
            this.currentMode = 'index';
            this.modeBarEl.querySelectorAll('.jp-surfer-discourse-mode-btn').forEach(b => {
                b.toggleClass('is-active', b.getAttribute('data-mode') === 'index');
            });
            this.renderCurrentMode();
        } catch (e) {
            console.error('[DiscourseView] captureChunk failed:', e);
        }
    }

    private onEditorChange(): void {
        if (this.currentMode === 'surf') {
            this.refreshUnits();
        } else if (this.currentMode === 'patterns') {
            this.renderCurrentMode();
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private granLabel(level: DiscourseGranularity): string {
        const labels: Record<DiscourseGranularity, string> = {
            morpheme: '形態素',
            bunsetsu: '文節',
            clause: '節',
            utterance: '発話',
            turn: 'ターン',
            exchange: '交換',
            episode: 'エピソード',
        };
        return labels[level] ?? level;
    }

    // ─── Public API (called from main.ts commands) ────────────────────────────

    surfNext(): void { this.navigate(1); }
    surfPrev(): void { this.navigate(-1); }
    selectUnit(): void { this.selectCurrentUnit(); }
    captureChunk(): void { this.captureCurrentChunk(); }
    cycleGran(): void {
        this.currentGranularity = cycleGranularity(this.currentGranularity);
        this.granSelectorEl?.querySelectorAll('.jp-surfer-discourse-gran-btn').forEach(b => {
            b.toggleClass('is-active', b.getAttribute('data-level') === this.currentGranularity);
        });
        this.refreshUnits();
    }
    showIndex(): void {
        this.currentMode = 'index';
        this.renderCurrentMode();
    }
}
