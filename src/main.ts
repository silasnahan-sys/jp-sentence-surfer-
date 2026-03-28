import { Plugin, Editor, MarkdownView, Notice } from 'obsidian';
import { JpSentenceSurferSettings, DISCOURSE_GRANULARITY_LEVELS } from './types';
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
import { DiscourseIndex } from './discourse/discourse-index';
import { DictEngine } from './dictionary/dict-engine';
import { parseAtGranularity, findUnitAt } from './discourse/discourse-parser';
import { JP_COLLOCATIONS_PLUGIN_ID } from './constants';

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    private toolbar: FloatingToolbar;
    private highlighter: SentenceHighlighter;
    discourseIndex: DiscourseIndex | null = null;
    dictEngine: DictEngine | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);

        // Initialize discourse index
        this.discourseIndex = new DiscourseIndex(this.app, this.settings.discourseIndexPath);

        // Initialize dictionary engine
        this.dictEngine = new DictEngine(this.app);

        this.addSettingTab(new JpSentenceSurferSettingTab(this.app, this));

        // Register Discourse View
        this.registerView(DISCOURSE_VIEW_TYPE, (leaf) => new DiscourseView(leaf, this));

        // ── Core surf commands ─────────────────────────────────────────────────
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

        // ── Discourse grammar commands ─────────────────────────────────────────

        this.addCommand({
            id: 'discourse-surf-next',
            name: '談話: 次の単位へ',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const offset = editor.posToOffset(editor.getCursor());
                const units = parseAtGranularity(content, this.settings.discourseGranularity);
                const next = units.find(u => u.start > offset);
                if (next) {
                    editor.setCursor(editor.offsetToPos(next.start));
                } else {
                    new Notice('次の談話単位が見つかりません。');
                }
            },
        });

        this.addCommand({
            id: 'discourse-surf-prev',
            name: '談話: 前の単位へ',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const offset = editor.posToOffset(editor.getCursor());
                const units = parseAtGranularity(content, this.settings.discourseGranularity);
                let prev: import('./types').DiscourseUnit | null = null;
                for (const u of units) {
                    if (u.end <= offset) prev = u;
                }
                if (prev) {
                    editor.setCursor(editor.offsetToPos(prev.start));
                } else {
                    new Notice('前の談話単位が見つかりません。');
                }
            },
        });

        this.addCommand({
            id: 'discourse-select-unit',
            name: '談話: 現在の単位を選択',
            editorCallback: (editor: Editor) => {
                const content = editor.getValue();
                const offset = editor.posToOffset(editor.getCursor());
                const units = parseAtGranularity(content, this.settings.discourseGranularity);
                const unit = findUnitAt(units, offset);
                if (!unit) {
                    new Notice('談話単位が見つかりません。');
                    return;
                }
                editor.setSelection(
                    editor.offsetToPos(unit.start),
                    editor.offsetToPos(unit.end),
                );
            },
        });

        this.addCommand({
            id: 'discourse-capture-chunk',
            name: '談話: チャンクを保存',
            editorCallback: async (editor: Editor) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return;

                const content = editor.getValue();
                const offset = editor.posToOffset(editor.getCursor());

                // Try to get selected text first
                const selection = editor.getSelection();
                let unit;
                if (selection && selection.trim()) {
                    const selFrom = editor.posToOffset(editor.getCursor('from'));
                    const selTo = editor.posToOffset(editor.getCursor('to'));
                    unit = {
                        text: selection,
                        start: selFrom,
                        end: selTo,
                        granularity: this.settings.discourseGranularity,
                    };
                } else {
                    const units = parseAtGranularity(content, this.settings.discourseGranularity);
                    unit = findUnitAt(units, offset);
                }

                if (!unit) {
                    new Notice('談話単位が見つかりません。');
                    return;
                }

                // Try to get collocations from jp-collocations plugin
                const plugins = (this.app as any).plugins as any;
                const collPlugin = plugins?.plugins?.[JP_COLLOCATIONS_PLUGIN_ID];
                const knownColls: string[] = [];
                if (collPlugin && typeof collPlugin.getCollocations === 'function') {
                    try {
                        const colls = await collPlugin.getCollocations();
                        if (Array.isArray(colls)) knownColls.push(...colls);
                    } catch { /* ignore */ }
                }

                // Extract YT timestamp if present
                const lineText = editor.getLine(editor.getCursor().line);
                const tsMatch = lineText.match(/\[([\d:]+)\]/);
                const timestamp = tsMatch ? tsMatch[1] : undefined;

                const sourceFile = view.file?.path ?? 'unknown';
                const { findCollocationsInText } = await import('./discourse/discourse-index');
                const foundColls = findCollocationsInText(unit.text, knownColls);

                const entry = await this.discourseIndex!.captureChunk(
                    unit,
                    sourceFile,
                    content,
                    this.settings.contextExpansionMode,
                    this.settings.fixedContextChars,
                    foundColls,
                    timestamp,
                );

                // Refresh discourse view if open
                const leaves = this.app.workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
                for (const leaf of leaves) {
                    (leaf.view as DiscourseView).refresh(entry);
                }

                new Notice(`チャンクを保存しました: ${unit.text.slice(0, 30)}…`);
            },
        });

        this.addCommand({
            id: 'discourse-show-index',
            name: '談話: 索引を開く',
            callback: async () => {
                await this.activateDiscourseView();
            },
        });

        this.addCommand({
            id: 'discourse-cycle-granularity',
            name: '談話: 粒度を切り替え',
            callback: async () => {
                const levels = DISCOURSE_GRANULARITY_LEVELS;
                const current = this.settings.discourseGranularity;
                const idx = levels.indexOf(current);
                const next = levels[(idx + 1) % levels.length];
                this.settings.discourseGranularity = next;
                await this.saveSettings();
                this.toolbar.updateGranularityLabel();
                new Notice(`談話粒度: ${next}`);
            },
        });

        this.addCommand({
            id: 'discourse-toggle-overlay',
            name: '談話: オーバーレイ切替',
            callback: async () => {
                this.settings.showDiscourseOverlay = !this.settings.showDiscourseOverlay;
                await this.saveSettings();
                const state = this.settings.showDiscourseOverlay ? 'オン' : 'オフ';
                new Notice(`談話オーバーレイ: ${state}`);
            },
        });

        // ── Dictionary commands ────────────────────────────────────────────────

        this.addCommand({
            id: 'dict-lookup',
            name: '辞書: 検索',
            editorCallback: async (editor: Editor) => {
                if (!this.settings.enableDictLookup) {
                    new Notice('辞書機能が無効です。設定から有効にしてください。');
                    return;
                }
                const selection = editor.getSelection();
                const query = selection?.trim() ?? '';
                const modal = new DictLookupModal(this, query);
                modal.open();
            },
        });

        this.addCommand({
            id: 'dict-load',
            name: '辞書: 辞書を読み込む',
            callback: async () => {
                await this.loadDictionaries();
            },
        });

        // Mount toolbar and start highlighter after workspace is ready
        this.app.workspace.onLayoutReady(async () => {
            this.toolbar.mount();
            this.highlighter.start();

            // Load discourse index
            if (this.discourseIndex) {
                await this.discourseIndex.load();
            }

            // Auto-load dictionaries if enabled
            if (this.settings.enableDictLookup && this.settings.dictionaryFolder) {
                this.loadDictionaries().catch(console.warn);
            }
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

    /** Load dictionaries from the configured vault folder */
    async loadDictionaries(): Promise<void> {
        if (!this.dictEngine) return;
        const folder = this.settings.dictionaryFolder;
        if (!folder) return;
        new Notice('辞書を読み込み中...');
        await this.dictEngine.loadFromVault(folder);
        if (this.dictEngine.error) {
            new Notice(`辞書エラー: ${this.dictEngine.error}`);
        } else {
            new Notice(`辞書読み込み完了: ${this.dictEngine.entryCount.toLocaleString()} エントリ`);
        }
    }

    /** Activate (or reveal) the discourse view */
    private async activateDiscourseView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(DISCOURSE_VIEW_TYPE);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: DISCOURSE_VIEW_TYPE, active: true });
            workspace.revealLeaf(leaf);
        }
    }
}
