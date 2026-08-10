import { Plugin, Editor, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import { JpSentenceSurferSettings } from './types';
import { DEFAULT_SETTINGS, JpSentenceSurferSettingTab } from './settings';import {
    surfNextSentence,
    surfPrevSentence,
    surfSelectSentence,
    surfSelectBoldTarget,
    surfJumpNextBold,
    surfSaveCloze,
    surfSegmentYTranscript,
    surfLookupCollocations,
} from './actions';
import { FloatingToolbar } from './ui/FloatingToolbar';
import { SentenceHighlighter } from './ui/SentenceHighlighter';
import { SentenceMonkeyScroller } from './ui/SentenceMonkeyScroller';
import { DiscourseController } from './discourse/DiscourseController';
import { DiscoursePicker } from './discourse/DiscoursePicker';
import { RelationController } from './discourse/RelationController';
import { AnnotationListView, ANNOTATION_LIST_VIEW } from './discourse/AnnotationListView';
import { JP_COLLOCATIONS_PLUGIN_ID } from './constants';

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    private toolbar: FloatingToolbar;
    highlighter: SentenceHighlighter;
    private scroller: SentenceMonkeyScroller;
    /** KCS-style bulk select & edit + discourse engine (used by the scroller too). */
    discourse: DiscourseController;
    /** Direct-on-text, keyboard-free morpheme picking surface for mobile. */
    discoursePicker: DiscoursePicker;
    /** Typed discourse-relation arcs (source → target) + sidecar persistence. */
    relations: RelationController;

    /**
     * Global capture lock: true while scroller is actively dragging.
     * FloatingToolbar checks this to suppress accidental command execution
     * if a touch-up happens to overlap a toolbar button.
     */
    isScrollerCapturing = false;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);
        this.scroller = new SentenceMonkeyScroller(this);
        this.discourse = new DiscourseController(this);
        this.discoursePicker = new DiscoursePicker(this, this.discourse);
        this.relations = new RelationController(this, this.discourse);
        void this.relations.init();

        // Sidebar list of all layer annotations in the active note.
        this.registerView(ANNOTATION_LIST_VIEW, (leaf) => new AnnotationListView(leaf, this));
        this.addRibbonIcon('highlighter', 'Annotations: open layer list', () => this.activateAnnotationList());

        // Wire toolbar's scroller toggle to the scroller
        this.toolbar.setScrollerToggle(() => {
            this.scroller.toggle();
        });

        this.addSettingTab(new JpSentenceSurferSettingTab(this.app, this));

        // Register all commands
        this.addCommand({
            id: 'surf-next-sentence',
            name: 'Next sentence',
            editorCallback: (editor: Editor) => {
                surfNextSentence(editor, this.settings);
            },
        });

        this.addCommand({
            id: 'surf-prev-sentence',
            name: 'Previous sentence',
            editorCallback: (editor: Editor) => {
                surfPrevSentence(editor, this.settings);
            },
        });

        this.addCommand({
            id: 'surf-select-sentence',
            name: 'Select current sentence',
            editorCallback: (editor: Editor) => {
                surfSelectSentence(editor, this.settings);
            },
        });

        this.addCommand({
            id: 'surf-select-bold-target',
            name: 'Select bold target in sentence',
            editorCallback: (editor: Editor) => {
                surfSelectBoldTarget(editor, this.settings);
            },
        });

        this.addCommand({
            id: 'surf-jump-next-bold',
            name: 'Jump to next bold marker',
            editorCallback: (editor: Editor) => {
                surfJumpNextBold(editor);
            },
        });

        this.addCommand({
            id: 'surf-save-cloze',
            name: 'Save as cloze card',
            editorCallback: (editor: Editor) => {
                surfSaveCloze(editor, this.settings);
            },
        });

        this.addCommand({
            id: 'surf-segment-ytranscript',
            name: 'Segment YTranscript',
            editorCallback: (editor: Editor) => {
                surfSegmentYTranscript(editor);
            },
        });

        // jp-collocations integration (optional)
        this.addCommand({
            id: 'surf-lookup-collocations',
            name: 'Lookup in jp-collocations',
            editorCallback: (editor: Editor) => {
                // Access installed plugins — Obsidian exposes these at runtime
                const plugins = (this.app as any).plugins as
                    | { plugins: Record<string, { searchTerm?: (term: string) => void }> }
                    | undefined;
                const collPlugin = plugins?.plugins?.[JP_COLLOCATIONS_PLUGIN_ID];
                if (!collPlugin) {
                    new Notice('jp-collocations plugin is not installed or enabled.');
                    return;
                }
                surfLookupCollocations(editor, (term: string) => {
                    if (typeof collPlugin.searchTerm === 'function') {
                        collPlugin.searchTerm(term);
                    } else {
                        new Notice(`Looked up: ${term} (open jp-collocations manually)`);
                    }
                });
            },
        });

        // Mount toolbar after workspace is ready
        this.app.workspace.onLayoutReady(() => {
            this.toolbar.mount();
            this.highlighter.start();
            if (this.settings.enableMonkeyScroller) {
                this.scroller.mount();
            }
        });

        // Command to toggle the Monkey Scroller
        this.addCommand({
            id: 'toggle-monkey-scroller',
            name: 'Toggle Sentence Monkey Scroller',
            callback: () => {
                this.scroller.toggle();
            },
        });

        // ── Discourse: KCS-style bulk select & edit ──────────────
        this.addCommand({
            id: 'discourse-toggle-mark',
            name: 'Discourse: Toggle mark at cursor',
            editorCallback: () => this.discourse.toggleAtCursor(),
        });
        this.addCommand({
            id: 'discourse-cycle-scope',
            name: 'Discourse: Cycle mark scope (文節→連文節→節→文)',
            editorCallback: () => this.discourse.cycleScope(),
        });
        this.addCommand({
            id: 'discourse-clear-marks',
            name: 'Discourse: Clear all marks',
            editorCallback: () => this.discourse.clear(),
        });
        this.addCommand({
            id: 'discourse-activate-marks',
            name: 'Discourse: Activate marks as multi-selection',
            editorCallback: () => this.discourse.activate(),
        });
        this.addCommand({
            id: 'discourse-bulk-bold',
            name: 'Discourse: Bulk bold marks',
            editorCallback: () => this.discourse.bulkWrap('bold'),
        });
        this.addCommand({
            id: 'discourse-bulk-highlight',
            name: 'Discourse: Bulk highlight marks',
            editorCallback: () => this.discourse.bulkWrap('highlight'),
        });
        this.addCommand({
            id: 'discourse-bulk-cloze',
            name: 'Discourse: Bulk cloze marks (multi-cloze card)',
            editorCallback: () => this.discourse.bulkWrap('cloze'),
        });
        this.addCommand({
            id: 'discourse-bulk-copy',
            name: 'Discourse: Copy all marked text',
            editorCallback: () => this.discourse.bulkCopy(),
        });
        this.addCommand({
            id: 'discourse-pick-mode',
            name: 'Discourse: Pick mode (tap text to mark, no keyboard)',
            callback: () => this.discoursePicker.toggle(),
        });
        this.addCommand({
            id: 'relation-set-source',
            name: 'Relation: Set marked spans as source',
            callback: () => this.relations.setSourceFromMarks(),
        });
        this.addCommand({
            id: 'relation-link',
            name: 'Relation: Link source → marked target (pick type)',
            callback: () => this.relations.linkFromMarks(),
        });
        this.addCommand({
            id: 'discourse-tag-span',
            name: 'Discourse: Tag marked spans as a marker (filler / connective …)',
            callback: () => this.relations.tagFromMarks(),
        });
        this.addCommand({
            id: 'annotation-tag-layer',
            name: 'Annotation: Annotate marked spans as a layer (serifu / collocation …)',
            callback: () => this.relations.annotateFromMarks(),
        });
        this.addCommand({
            id: 'annotation-open-list',
            name: 'Annotation: Open layer list (sidebar)',
            callback: () => this.activateAnnotationList(),
        });
        this.addCommand({
            id: 'relation-delete-selected',
            name: 'Relation: Delete selected arc',
            callback: () => this.relations.deleteSelected(),
        });
        this.addCommand({
            id: 'relation-clear-file',
            name: 'Relation: Clear all relations in this note',
            callback: () => this.relations.clearFile(),
        });
        this.addCommand({
            id: 'relation-toggle-overlay',
            name: 'Relation: Toggle arc overlay',
            callback: async () => {
                this.settings.showRelationOverlay = !this.settings.showRelationOverlay;
                await this.saveSettings();
                this.relations.attachAndRefresh();
                new Notice(`Relation arcs ${this.settings.showRelationOverlay ? 'on' : 'off'}.`);
            },
        });
    }

    onunload(): void {
        try { this.toolbar.unmount(); } catch (_) { /* ensure scroller cleanup proceeds */ }
        try { this.highlighter.stop(); } catch (_) { /* */ }
        try { this.scroller.unmount(); } catch (_) { /* */ }
        try { this.discoursePicker.exit(); } catch (_) { /* */ }
        try { this.relations.unload(); } catch (_) { /* */ }
    }

    /** Reveal the annotation list view in the right sidebar (create if needed). */
    async activateAnnotationList(): Promise<void> {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(ANNOTATION_LIST_VIEW)[0] ?? null;
        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: ANNOTATION_LIST_VIEW, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /** Re-mount toolbar after settings change */
    refreshToolbar(): void {
        this.toolbar.unmount();
        this.toolbar.mount();
    }

    /** Re-mount scroller after settings change */
    refreshScroller(): void {
        this.scroller.unmount();
        if (this.settings.enableMonkeyScroller) {
            this.scroller.mount();
        }
    }
}
