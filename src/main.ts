import { Plugin, Editor, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
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
import { DiscourseView, DISCOURSE_VIEW_TYPE } from './ui/DiscourseView';
import { DictLookupModal } from './ui/DictLookupView';
import { DiscourseIndex, createChunkEntry } from './discourse/discourse-index';
import { parseAtGranularity, findUnitAt, findNextUnit, findPrevUnit } from './discourse/discourse-parser';
import { DictEngine } from './dictionary/dict-engine';
import { JP_COLLOCATIONS_PLUGIN_ID } from './constants';

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    discourseIndex: DiscourseIndex;
    dictEngine: DictEngine;
    private toolbar: FloatingToolbar;
    private highlighter: SentenceHighlighter;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.discourseIndex = new DiscourseIndex();
        this.dictEngine = new DictEngine();

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);

        this.addSettingTab(new JpSentenceSurferSettingTab(this.app, this));

        // Register discourse view
        this.registerView(DISCOURSE_VIEW_TYPE, (leaf: WorkspaceLeaf) => new DiscourseView(leaf, this));

        // ─── Existing Sentence Surfing Commands ───────────────────────────────
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

        // ─── Discourse Grammar Commands ───────────────────────────────────────
        this.addCommand({
            id: 'discourse-surf-next',
            name: 'Discourse: Next unit',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const cursor = editor.getCursor();
                const offset = editor.posToOffset(cursor);
                const unit = findNextUnit(content, offset, this.settings.discourseGranularity);
                if (unit) {
                    editor.setCursor(editor.offsetToPos(unit.start));
                } else {
                    new Notice('No next unit found.');
                }
            },
        });

        this.addCommand({
            id: 'discourse-surf-prev',
            name: 'Discourse: Previous unit',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const cursor = editor.getCursor();
                const offset = editor.posToOffset(cursor);
                const unit = findPrevUnit(content, offset, this.settings.discourseGranularity);
                if (unit) {
                    editor.setCursor(editor.offsetToPos(unit.start));
                } else {
                    new Notice('No previous unit found.');
                }
            },
        });

        this.addCommand({
            id: 'discourse-capture',
            name: 'Discourse: Capture chunk',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const cursor = editor.getCursor();
                const offset = editor.posToOffset(cursor);
                const unit = findUnitAt(content, offset, this.settings.discourseGranularity);
                if (!unit) {
                    new Notice('No discourse unit at cursor.');
                    return;
                }
                const activeFile = this.app.workspace.getActiveFile();
                const sourceFile = activeFile ? activeFile.path : '';
                const entry = createChunkEntry({
                    text: unit.text,
                    granularity: this.settings.discourseGranularity,
                    sourceFile,
                    sourceOffset: { start: unit.start, end: unit.end },
                    fullText: content,
                });
                this.discourseIndex.addEntry(entry);
                new Notice(`Captured: ${unit.text.slice(0, 40)}…`);
                this.refreshDiscourseView();
            },
        });

        this.addCommand({
            id: 'discourse-toggle-overlay',
            name: 'Discourse: Toggle pattern overlay',
            callback: async () => {
                this.settings.showDiscourseOverlay = !this.settings.showDiscourseOverlay;
                await this.saveSettings();
                new Notice(`Discourse overlay: ${this.settings.showDiscourseOverlay ? 'ON' : 'OFF'}`);
            },
        });

        this.addCommand({
            id: 'discourse-open-index',
            name: 'Discourse: Open index browser',
            callback: async () => {
                await this.activateDiscourseView();
            },
        });

        this.addCommand({
            id: 'discourse-cycle-granularity',
            name: 'Discourse: Cycle granularity level',
            callback: async () => {
                const levels: JpSentenceSurferSettings['discourseGranularity'][] = [
                    'morpheme', 'bunsetsu', 'clause', 'utterance', 'turn', 'exchange', 'episode',
                ];
                const idx = levels.indexOf(this.settings.discourseGranularity);
                this.settings.discourseGranularity = levels[(idx + 1) % levels.length];
                await this.saveSettings();
                const labels: Record<string, string> = {
                    morpheme: '形態素', bunsetsu: '文節', clause: '節',
                    utterance: '発話', turn: 'ターン', exchange: '交換', episode: 'エピソード',
                };
                new Notice(`粒度: ${labels[this.settings.discourseGranularity]}`);
                this.toolbar.unmount();
                this.toolbar.mount();
            },
        });

        this.addCommand({
            id: 'discourse-inspect',
            name: 'Discourse: Inspect current chunk',
            editorCallback: async (editor: Editor) => {
                const content = editor.getValue();
                const cursor = editor.getCursor();
                const offset = editor.posToOffset(cursor);
                const unit = findUnitAt(content, offset, this.settings.discourseGranularity);
                if (!unit) {
                    new Notice('No discourse unit at cursor.');
                    return;
                }
                const activeFile = this.app.workspace.getActiveFile();
                const entry = createChunkEntry({
                    text: unit.text,
                    granularity: this.settings.discourseGranularity,
                    sourceFile: activeFile ? activeFile.path : '',
                    sourceOffset: { start: unit.start, end: unit.end },
                    fullText: content,
                });
                await this.activateDiscourseView();
                const leaf = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE)[0];
                if (leaf) {
                    (leaf.view as DiscourseView).setCurrentChunk(entry);
                }
            },
        });

        // ─── Dictionary Commands ──────────────────────────────────────────────
        this.addCommand({
            id: 'dict-lookup',
            name: 'Dictionary: Lookup',
            editorCallback: (editor: Editor) => {
                const selection = editor.getSelection();
                new DictLookupModal(this.app, this.dictEngine, selection || undefined).open();
            },
        });

        this.addCommand({
            id: 'dict-scan-line',
            name: 'Dictionary: Scan current line',
            editorCallback: (editor: Editor) => {
                const cursor = editor.getCursor();
                const lineText = editor.getLine(cursor.line);
                const results = this.dictEngine.scanText(lineText);
                if (results.length === 0) {
                    new Notice('No dictionary matches found on this line.');
                } else {
                    const terms = [...new Set(results.map(r => r.entry.term))].slice(0, 5).join('、');
                    new Notice(`Found: ${terms}${results.length > 5 ? ` (+${results.length - 5} more)` : ''}`);
                    new DictLookupModal(this.app, this.dictEngine, lineText).open();
                }
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
        this.app.workspace.detachLeavesOfType(DISCOURSE_VIEW_TYPE);
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

    /** Open the DiscourseView panel */
    async activateDiscourseView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
        if (existing.length === 0) {
            const leaf = this.app.workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: DISCOURSE_VIEW_TYPE, active: true });
            }
        } else {
            this.app.workspace.revealLeaf(existing[0]);
        }
    }

    /** Refresh the discourse view if open */
    refreshDiscourseView(): void {
        const leaves = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
        for (const leaf of leaves) {
            (leaf.view as DiscourseView).refreshIndex(this.discourseIndex);
        }
    }
}
