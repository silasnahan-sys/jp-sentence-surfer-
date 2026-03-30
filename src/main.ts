import { Plugin, Editor, MarkdownView, Notice } from 'obsidian';
import { JpSentenceSurferSettings, SurfMode } from './types';
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
import { SurfAnimator } from './surf-animator';
import { BoundaryEngine } from './boundary-engine';
import { TouchController } from './touch-controller';

export default class JpSentenceSurferPlugin extends Plugin {
    settings: JpSentenceSurferSettings;
    private toolbar: FloatingToolbar;
    private highlighter: SentenceHighlighter;
    public animator: SurfAnimator;
    public boundaryEngine: BoundaryEngine;
    private touchController: TouchController | null = null;
    public currentMode: SurfMode = SurfMode.Bunsetsu;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.currentMode = this.settings.defaultSurfMode;

        // Initialise animation engine
        this.animator = new SurfAnimator(
            this.settings.surfEase,
            this.settings.surfFriction,
            this.settings.surfMomentumDecay
        );

        // Initialise boundary engine
        this.boundaryEngine = new BoundaryEngine();

        // Wire animator snap callback to update chunk index in toolbar
        this.animator.onSnap((_idx) => {
            // Toolbar can react to mode changes via refreshToolbar
        });

        // Wire wave callback to highlighter
        this.animator.onWave((focusIdx, direction, weights) => {
            this.highlighter.applyWave(focusIdx, direction, weights);
        });

        this.toolbar = new FloatingToolbar(this);
        this.highlighter = new SentenceHighlighter(this);

        this.addSettingTab(new JpSentenceSurferSettingTab(this.app, this));

        // ── Core navigation commands ──────────────────────────────────────────
        this.addCommand({
            id: 'surf-next-sentence',
            name: 'Next sentence',
            editorCallback: (editor: Editor) => {
                surfNextSentence(editor, this.settings, this.animator, this.boundaryEngine, this.currentMode);
            },
        });

        this.addCommand({
            id: 'surf-prev-sentence',
            name: 'Previous sentence',
            editorCallback: (editor: Editor) => {
                surfPrevSentence(editor, this.settings, this.animator, this.boundaryEngine, this.currentMode);
            },
        });

        this.addCommand({
            id: 'surf-select-sentence',
            name: 'Select current sentence',
            editorCallback: (editor: Editor) => {
                surfSelectSentence(editor, this.settings, this.boundaryEngine, this.currentMode);
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

        // ── Mode cycling command ──────────────────────────────────────────────
        this.addCommand({
            id: 'surf-cycle-mode',
            name: 'Cycle surf mode',
            editorCallback: (_editor: Editor) => {
                this.cycleSurfMode();
            },
        });

        // ── Per-mode explicit commands ────────────────────────────────────────
        const modes: Array<[SurfMode, string]> = [
            [SurfMode.Bunsetsu,    'bunsetsu'],
            [SurfMode.Sentence,    'sentence'],
            [SurfMode.Clause,      'clause'],
            [SurfMode.Particle,    'particle'],
            [SurfMode.ContentWord, 'content-word'],
            [SurfMode.Collocation, 'collocation'],
            [SurfMode.Bold,        'bold'],
        ];
        for (const [mode, id] of modes) {
            this.addCommand({
                id: `surf-set-mode-${id}`,
                name: `Set surf mode: ${id}`,
                callback: () => {
                    this.currentMode = mode;
                    this.toolbar.updateModeBadge(mode);
                    new Notice(`Surf mode: ${id}`);
                },
            });
        }

        // ── jp-collocations integration ───────────────────────────────────────
        this.addCommand({
            id: 'surf-lookup-collocations',
            name: 'Lookup in jp-collocations',
            editorCallback: (editor: Editor) => {
                const plugins = (this.app as any).plugins as
                    | { plugins: Record<string, { searchTerm?: (term: string) => void; getCollocationSpans?: (text: string) => any[] }> }
                    | undefined;
                const collPlugin = plugins?.plugins?.[JP_COLLOCATIONS_PLUGIN_ID];
                if (!collPlugin) {
                    new Notice('jp-collocations plugin is not installed or enabled.');
                    return;
                }
                // Inject collocation plugin into boundary engine for Collocation mode
                this.boundaryEngine.setCollocationPlugin(collPlugin);
                surfLookupCollocations(editor, (term: string) => {
                    if (typeof collPlugin.searchTerm === 'function') {
                        collPlugin.searchTerm(term);
                    } else {
                        new Notice(`Looked up: ${term} (open jp-collocations manually)`);
                    }
                });
            },
        });

        // ── Invalidate boundary cache on document edits ───────────────────────
        this.registerEvent(
            (this.app.workspace as any).on('editor-change', () => {
                this.boundaryEngine.invalidate();
            })
        );

        // Mount toolbar after workspace is ready
        this.app.workspace.onLayoutReady(() => {
            this.toolbar.mount();
            this.highlighter.start();
            this._initTouchController();

            // Inject collocation plugin if already loaded
            const plugins = (this.app as any).plugins?.plugins;
            const collPlugin = plugins?.[JP_COLLOCATIONS_PLUGIN_ID];
            if (collPlugin) {
                this.boundaryEngine.setCollocationPlugin(collPlugin);
            }
        });
    }

    onunload(): void {
        this.animator.destroy();
        this.touchController?.detach();
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
        this._initTouchController();
    }

    /** Update animator physics from current settings. */
    refreshAnimator(): void {
        this.animator.updateSettings(
            this.settings.surfEase,
            this.settings.surfFriction,
            this.settings.surfMomentumDecay
        );
    }

    /** Cycle to the next surf mode and update UI. */
    cycleSurfMode(): void {
        const order = [
            SurfMode.Bunsetsu, SurfMode.Sentence, SurfMode.Clause,
            SurfMode.Particle, SurfMode.ContentWord, SurfMode.Collocation, SurfMode.Bold,
        ];
        const idx = order.indexOf(this.currentMode);
        this.currentMode = order[(idx + 1) % order.length];
        this.toolbar.updateModeBadge(this.currentMode);
        new Notice(`Surf mode: ${this.currentMode}`);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private _initTouchController(): void {
        if (this.touchController) {
            this.touchController.detach();
            this.touchController = null;
        }
        if (!this.settings.enableTouchGestures) return;

        // Attach to the editor container; fall back to workspace-level selector
        // as a best-effort fallback if no active view is open yet.
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const containerEl = view?.contentEl ?? document.querySelector('.workspace-leaf-content') as HTMLElement | null;
        if (!containerEl) return;

        this.touchController = new TouchController(
            containerEl,
            () => {
                const v = this.app.workspace.getActiveViewOfType(MarkdownView);
                return v?.editor ?? null;
            },
            this.animator,
            this.boundaryEngine,
            this.currentMode,
            (mode) => {
                this.currentMode = mode;
                this.toolbar.updateModeBadge(mode);
            },
            (editor) => {
                surfSelectSentence(editor, this.settings, this.boundaryEngine, this.currentMode);
            },
            () => {
                // Show mode picker — cycle for now; a full modal can be added later
                this.cycleSurfMode();
            }
        );
        this.touchController.attach();
    }
}
