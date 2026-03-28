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
import { DiscourseView, DISCOURSE_VIEW_TYPE } from './ui/DiscourseView';
import { DiscourseOverlay } from './ui/DiscourseOverlay';
import { DictLookupModal } from './ui/DictLookupModal';
import { DiscourseIndex } from './discourse/discourse-index';
import { DictEngine } from './dictionary/dict-engine';
import { JP_COLLOCATIONS_PLUGIN_ID } from './constants';

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    private toolbar: FloatingToolbar;
    private highlighter: SentenceHighlighter;

    // Discourse grammar
    discourseIndex: DiscourseIndex;
    discourseOverlay: DiscourseOverlay;

    // Dictionary
    dictEngine: DictEngine;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);

        // ── Discourse grammar setup ────────────────────────────────────────
        this.discourseIndex = new DiscourseIndex(this.app, this.settings.discourse.discourseIndexPath);
        this.discourseOverlay = new DiscourseOverlay(this);

        // Register the discourse panel view
        this.registerView(
            DISCOURSE_VIEW_TYPE,
            (leaf) => new DiscourseView(leaf, this, this.discourseIndex),
        );

        // ── Dictionary engine setup ────────────────────────────────────────
        this.dictEngine = new DictEngine(this.app, this.settings.dictionary.dictionaryFolder);

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
            // Load discourse index
            this.discourseIndex.load().catch(e => console.warn('[DiscourseIndex] load error:', e));
            // Load dictionaries in background
            if (this.settings.dictionary.enableDictLookup) {
                this.dictEngine.loadDictionaries().catch(e =>
                    console.warn('[DictEngine] load error:', e)
                );
            }
            // Set overlay state
            this.discourseOverlay.setEnabled(this.settings.discourse.showDiscourseOverlay);
        });

        // ── Discourse Grammar commands ─────────────────────────────────────
        this.addCommand({
            id: 'discourse-surf-next',
            name: '談話: 次の単位へ',
            callback: () => { this.getDiscourseView()?.surfNext(); },
        });

        this.addCommand({
            id: 'discourse-surf-prev',
            name: '談話: 前の単位へ',
            callback: () => { this.getDiscourseView()?.surfPrev(); },
        });

        this.addCommand({
            id: 'discourse-select-unit',
            name: '談話: 現在の単位を選択',
            callback: () => { this.getDiscourseView()?.selectUnit(); },
        });

        this.addCommand({
            id: 'discourse-capture-chunk',
            name: '談話: チャンクをキャプチャ',
            callback: () => { this.getDiscourseView()?.captureChunk(); },
        });

        this.addCommand({
            id: 'discourse-show-index',
            name: '談話: インデックスを表示',
            callback: async () => {
                await this.activateDiscourseView();
                this.getDiscourseView()?.showIndex();
            },
        });

        this.addCommand({
            id: 'discourse-cycle-granularity',
            name: '談話: 粒度を切り替え',
            callback: () => { this.getDiscourseView()?.cycleGran(); },
        });

        this.addCommand({
            id: 'discourse-toggle-overlay',
            name: '談話: オーバーレイ表示切替',
            callback: async () => {
                this.settings.discourse.showDiscourseOverlay = !this.settings.discourse.showDiscourseOverlay;
                await this.saveSettings();
                this.discourseOverlay.setEnabled(this.settings.discourse.showDiscourseOverlay);
            },
        });

        this.addCommand({
            id: 'discourse-open-panel',
            name: '談話文法パネルを開く',
            callback: () => { this.activateDiscourseView(); },
        });

        // ── Dictionary Lookup commands ─────────────────────────────────────
        this.addCommand({
            id: 'dict-lookup',
            name: '辞書検索を開く',
            editorCallback: (editor: Editor) => {
                const selected = editor.getSelection().trim();
                new DictLookupModal(this.app, this, this.dictEngine, selected).open();
            },
        });

        this.addCommand({
            id: 'dict-scan-selection',
            name: '辞書: 選択テキストをスキャン',
            editorCallback: (editor: Editor) => {
                const selected = editor.getSelection().trim();
                new DictLookupModal(this.app, this, this.dictEngine, selected).open();
            },
        });

        // ── Active-leaf listener for overlay refresh ───────────────────────
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                if (this.settings.discourse.showDiscourseOverlay) {
                    this.discourseOverlay.refresh();
                }
            })
        );
    }

    onunload(): void {
        this.toolbar.unmount();
        this.highlighter.stop();
        this.discourseOverlay.destroy();
        this.app.workspace.detachLeavesOfType(DISCOURSE_VIEW_TYPE);
    }

    async loadSettings(): Promise<void> {
        const saved = await this.loadData();
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...saved,
            discourse: { ...DEFAULT_SETTINGS.discourse, ...(saved?.discourse ?? {}) },
            dictionary: { ...DEFAULT_SETTINGS.dictionary, ...(saved?.dictionary ?? {}) },
        };
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /** Re-mount toolbar after settings change */
    refreshToolbar(): void {
        this.toolbar.unmount();
        this.toolbar.mount();
    }

    /** Refresh discourse overlay state */
    refreshDiscourseOverlay(): void {
        this.discourseOverlay.setEnabled(this.settings.discourse.showDiscourseOverlay);
    }

    /** Reload dictionaries after folder change */
    reloadDictionaries(): void {
        this.dictEngine.updateFolder(this.settings.dictionary.dictionaryFolder);
        if (this.settings.dictionary.enableDictLookup) {
            this.dictEngine.loadDictionaries().catch(e =>
                console.warn('[DictEngine] reload error:', e)
            );
        }
    }

    /** Get the currently open DiscourseView (if any). */
    private getDiscourseView(): DiscourseView | null {
        const leaves = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
        return leaves.length > 0 ? (leaves[0].view as DiscourseView) : null;
    }

    /** Activate (or open) the DiscourseView panel. */
    async activateDiscourseView(): Promise<void> {
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
    }
}
