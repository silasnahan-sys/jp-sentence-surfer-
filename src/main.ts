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
    surfDiscourseNext,
    surfDiscoursePrev,
    surfDiscourseSelect,
} from './actions';
import { FloatingToolbar } from './ui/FloatingToolbar';
import { SentenceHighlighter } from './ui/SentenceHighlighter';
import { DiscourseView, DISCOURSE_VIEW_TYPE } from './ui/DiscourseView';
import { DictLookupView } from './ui/DictLookupView';
import { JP_COLLOCATIONS_PLUGIN_ID } from './constants';
import { DiscourseIndex } from './discourse/discourse-index';
import { DictEngine } from './dictionary/dict-engine';

export interface PluginRuntimeState {
    discourseGranularity: number;
    overlayEnabled: boolean;
}

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    discourseIndex: DiscourseIndex;
    dictEngine: DictEngine;
    state: PluginRuntimeState;
    private toolbar: FloatingToolbar;
    private highlighter: SentenceHighlighter;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.state = {
            discourseGranularity: this.settings.discourse.defaultGranularity,
            overlayEnabled: this.settings.discourse.enableOverlayByDefault,
        };

        this.discourseIndex = new DiscourseIndex(this);
        await this.discourseIndex.load();

        this.dictEngine = new DictEngine();

        this.registerView(DISCOURSE_VIEW_TYPE, (leaf) => new DiscourseView(leaf, this));

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);

        this.addSettingTab(new JpSentenceSurferSettingTab(this.app, this));

        // ── Existing sentence-surf commands ──────────────────────────────────
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

        this.addCommand({
            id: 'surf-lookup-collocations',
            name: 'Lookup in jp-collocations',
            editorCallback: (editor: Editor) => {
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

        // ── Discourse commands ────────────────────────────────────────────────
        this.addCommand({
            id: 'discourse-capture-chunk',
            name: 'Discourse: Capture current chunk',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const offset = editor.posToOffset(editor.getCursor());
                const path = this.app.workspace.getActiveFile()?.path ?? 'unknown';
                const start = Math.max(0, offset - 200);
                const end = Math.min(content.length, offset + 200);
                const text = content.slice(start, end);
                this.discourseIndex.captureChunk(text, path, start, end);
                this.discourseIndex.save();
                new Notice('Discourse chunk captured.');
            },
        });

        this.addCommand({
            id: 'discourse-toggle-overlay',
            name: 'Discourse: Toggle marker overlay',
            callback: () => {
                this.state.overlayEnabled = !this.state.overlayEnabled;
                new Notice(`Discourse overlay ${this.state.overlayEnabled ? 'enabled' : 'disabled'}.`);
            },
        });

        this.addCommand({
            id: 'discourse-open-index',
            name: 'Discourse: Open index view',
            callback: async () => {
                const existing = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
                if (existing.length > 0) {
                    this.app.workspace.revealLeaf(existing[0]);
                    return;
                }
                const leaf = this.app.workspace.getRightLeaf(false);
                if (leaf) {
                    await leaf.setViewState({ type: DISCOURSE_VIEW_TYPE, active: true });
                    this.app.workspace.revealLeaf(leaf);
                }
            },
        });

        this.addCommand({
            id: 'discourse-cycle-granularity',
            name: 'Discourse: Cycle granularity level',
            callback: () => {
                const next = this.state.discourseGranularity >= 7
                    ? 1
                    : this.state.discourseGranularity + 1;
                this.state.discourseGranularity = next;
                const labels = ['', 'Morpheme', 'Bunsetsu', 'Clause', 'Utterance', 'Turn', 'Exchange', 'Topic'];
                new Notice(`Granularity: ${labels[next]}`);
                this.toolbar.unmount();
                this.toolbar.mount();
            },
        });

        // ── Dictionary commands ───────────────────────────────────────────────
        this.addCommand({
            id: 'dict-lookup',
            name: 'Dictionary: Lookup selected text',
            editorCallback: (editor: Editor) => {
                const selection = editor.getSelection().trim();
                new DictLookupView(this.app, this, selection || undefined).open();
            },
        });

        this.addCommand({
            id: 'dict-lookup-cursor',
            name: 'Dictionary: Lookup word at cursor',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const offset = editor.posToOffset(editor.getCursor());
                // Extract a short word around cursor (up to 10 chars)
                const start = Math.max(0, offset - 5);
                const end = Math.min(content.length, offset + 5);
                const word = content.slice(start, end).replace(/\s/g, '');
                new DictLookupView(this.app, this, word || undefined).open();
            },
        });

        // ── Discourse surf commands ───────────────────────────────────────────
        this.addCommand({
            id: 'surf-discourse-next',
            name: 'Discourse: Next unit',
            editorCallback: (editor: Editor) => {
                surfDiscourseNext(editor, this.settings, this.state.discourseGranularity);
            },
        });

        this.addCommand({
            id: 'surf-discourse-prev',
            name: 'Discourse: Previous unit',
            editorCallback: (editor: Editor) => {
                surfDiscoursePrev(editor, this.settings, this.state.discourseGranularity);
            },
        });

        this.addCommand({
            id: 'surf-discourse-select',
            name: 'Discourse: Select current unit',
            editorCallback: (editor: Editor) => {
                surfDiscourseSelect(editor, this.settings, this.state.discourseGranularity);
            },
        });

        // Mount toolbar after workspace is ready
        this.app.workspace.onLayoutReady(() => {
            this.toolbar.mount();
            this.highlighter.start();
        });
    }

    onunload(): void {
        this.toolbar.unmount();
        this.highlighter.stop();
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        // Ensure nested objects are initialised
        if (!this.settings.discourse) this.settings.discourse = DEFAULT_SETTINGS.discourse;
        if (!this.settings.dictionary) this.settings.dictionary = DEFAULT_SETTINGS.dictionary;
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /** Re-mount toolbar after settings change */
    refreshToolbar(): void {
        this.toolbar.unmount();
        this.toolbar.mount();
    }
}
