import { Plugin, Editor, MarkdownView, Notice } from 'obsidian';
import { JpSentenceSurferSettings } from './types';
import { DEFAULT_SETTINGS, JpSentenceSurferSettingTab } from './settings';
import {
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
import { JP_COLLOCATIONS_PLUGIN_ID } from './constants';
import { DiscourseView, DISCOURSE_VIEW_TYPE } from './ui/DiscourseView';
import { DictLookupModal } from './ui/DictLookupView';
import { DiscourseIndex } from './discourse/discourse-index';
import { DictEngine } from './dictionary/dict-engine';
import { GranularityLevel, GRANULARITY_LABELS } from './discourse/discourse-parser';

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    private toolbar: FloatingToolbar;
    private highlighter: SentenceHighlighter;
    discourseIndex: DiscourseIndex;
    dictEngine: DictEngine;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.discourseIndex = new DiscourseIndex();
        this.dictEngine = new DictEngine();

        // Load persisted discourse index (data was loaded in loadSettings)
        const saved = await this.loadData();
        if (saved?.discourseIndex) {
            this.discourseIndex.fromJSON(saved.discourseIndex);
        }

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);

        this.registerView(
            DISCOURSE_VIEW_TYPE,
            (leaf) => new DiscourseView(leaf, this, this.discourseIndex)
        );

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

        // ─── Discourse commands ───────────────────────────────────────────────
        this.addCommand({
            id: 'discourse-inspector-toggle',
            name: 'Toggle discourse inspector',
            callback: async () => {
                const existing = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
                if (existing.length > 0) {
                    this.app.workspace.revealLeaf(existing[0]);
                } else {
                    const leaf = this.app.workspace.getRightLeaf(false);
                    if (leaf) {
                        await leaf.setViewState({ type: DISCOURSE_VIEW_TYPE, active: true });
                        this.app.workspace.revealLeaf(leaf);
                    }
                }
            },
        });

        this.addCommand({
            id: 'discourse-capture-chunk',
            name: 'Capture discourse chunk',
            editorCallback: (editor: Editor) => {
                const selected = editor.getSelection();
                const text = selected || editor.getLine(editor.getCursor().line);
                if (!text.trim()) {
                    new Notice('No text to capture.');
                    return;
                }
                const activeFile = this.app.workspace.getActiveFile();
                const level = this.settings.discourse.defaultGranularity as GranularityLevel;
                this.discourseIndex.captureChunk(text.trim(), level, {
                    filePath: activeFile?.path ?? '',
                    offset: 0,
                });
                this.saveSettings();
                new Notice(`Captured: ${text.trim().slice(0, 40)}…`);
            },
        });

        this.addCommand({
            id: 'discourse-index-browser',
            name: 'Open discourse index browser',
            callback: async () => {
                const existing = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
                let leaf = existing[0];
                if (!leaf) {
                    leaf = this.app.workspace.getRightLeaf(false)!;
                    if (leaf) await leaf.setViewState({ type: DISCOURSE_VIEW_TYPE, active: true });
                }
                if (leaf) {
                    this.app.workspace.revealLeaf(leaf);
                    const view = leaf.view as DiscourseView;
                    if (view && typeof (view as any).activeTab !== 'undefined') {
                        (view as any).activeTab = 'index';
                        (view as any).buildUI();
                    }
                }
            },
        });

        this.addCommand({
            id: 'discourse-cycle-level',
            name: 'Cycle discourse granularity level',
            callback: () => {
                const current = this.settings.discourse.defaultGranularity as GranularityLevel;
                const next = ((current % 7) + 1) as GranularityLevel;
                this.settings.discourse.defaultGranularity = next;
                this.saveSettings();
                new Notice(`Discourse level: ${next} – ${GRANULARITY_LABELS[next]}`);
            },
        });

        this.addCommand({
            id: 'dict-lookup',
            name: 'Dictionary lookup',
            editorCallback: (editor: Editor) => {
                const selected = editor.getSelection();
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const contextLine = view ? editor.getLine(editor.getCursor().line) : '';
                new DictLookupModal(this.app, this, this.dictEngine, selected, contextLine).open();
            },
        });

        // Mount toolbar after workspace is ready
        this.app.workspace.onLayoutReady(() => {
            this.toolbar.mount();
            this.highlighter.start();

            // Update discourse inspector when active leaf changes
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', () => {
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view) return;
                    const editor = view.editor;
                    const line = editor.getLine(editor.getCursor().line);
                    const discourseLeaves = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
                    for (const leaf of discourseLeaves) {
                        (leaf.view as DiscourseView).setText(line);
                    }
                })
            );
        });
    }

    onunload(): void {
        this.toolbar.unmount();
        this.highlighter.stop();
    }

    async loadSettings(): Promise<void> {
        const saved = await this.loadData() ?? {};
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...saved,
            discourse: { ...DEFAULT_SETTINGS.discourse, ...(saved.discourse ?? {}) },
            dict: { ...DEFAULT_SETTINGS.dict, ...(saved.dict ?? {}) },
        };
    }

    async saveSettings(): Promise<void> {
        await this.saveData({
            ...this.settings,
            discourseIndex: this.discourseIndex?.toJSON(),
        });
    }

    /** Re-mount toolbar after settings change */
    refreshToolbar(): void {
        this.toolbar.unmount();
        this.toolbar.mount();
    }
}
