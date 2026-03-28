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
import { DiscourseIndex } from './discourse/discourse-index';
import { DictEngine } from './dictionary/dict-engine';

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    discourseIndex: DiscourseIndex;
    dictEngine: DictEngine;
    private toolbar: FloatingToolbar;
    private highlighter: SentenceHighlighter;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.discourseIndex = new DiscourseIndex(this);
        await this.discourseIndex.load();

        this.dictEngine = new DictEngine();

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);

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
        });
    }

    onunload(): void {
        this.toolbar.unmount();
        this.highlighter.stop();
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
}
