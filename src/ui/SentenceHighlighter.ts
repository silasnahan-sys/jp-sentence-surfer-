import { Editor, MarkdownView } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { parseSentences, findSentenceAt } from '../jp-sentence-parser';
import { SURF_WAVE_RADIUS } from '../constants';

/**
 * SentenceHighlighter — animated chunk highlighting with NHL-style wave effect.
 *
 * - Arriving chunk fades in (CSS @keyframes jp-surfer-chunk-arrive)
 * - Departing chunk fades out (jp-surfer-chunk-depart)
 * - Neighbouring chunks get staggered echo highlights (.jp-surfer-chunk-wave-N)
 *   using decreasing opacity driven by SURF_FRICTION
 * - All animations use transform + opacity only (GPU-composited)
 */
export class SentenceHighlighter {
    private plugin: JpSentenceSurferPlugin;
    private lastOffset = -1;
    private boundUpdate: () => void;

    // Wave overlay elements — one per wave radius ring
    private waveEls: HTMLElement[] = [];

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
        this.boundUpdate = this.updateHighlight.bind(this);
    }

    start(): void {
        if (!this.plugin.settings.highlightCurrentSentence) return;
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', this.boundUpdate)
        );
        this.plugin.registerEvent(
            (this.plugin.app.workspace as any).on('editor-change', this.boundUpdate)
        );
        this.plugin.registerDomEvent(document, 'keyup', this.boundUpdate);
        this.plugin.registerDomEvent(document, 'mouseup', this.boundUpdate);
    }

    stop(): void {
        this.clearHighlight();
    }

    /**
     * Called by SurfAnimator on every animation frame with wave weights.
     * focusChunkIndex: index of the chunk being surfed to
     * direction: 1 = forward, -1 = backward
     * weights: [1.0, friction^1, friction^2, ...] for distance 0,1,2,...
     */
    applyWave(focusChunkIndex: number, direction: 1 | -1, weights: number[]): void {
        if (!this.plugin.settings.highlightWaveEnabled) return;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;
        const content = editor.getValue();
        const chunks = this.plugin.boundaryEngine.getChunks(content, this.plugin.currentMode);

        this._clearWaveEls();

        for (let i = 1; i < weights.length && i <= SURF_WAVE_RADIUS; i++) {
            const waveIdx = focusChunkIndex + direction * i;
            if (waveIdx < 0 || waveIdx >= chunks.length) continue;

            const chunk = chunks[waveIdx];
            const waveEl = this._createWaveOverlay(editor, chunk.start, chunk.end, weights[i], i);
            if (waveEl) this.waveEls.push(waveEl);
        }
    }

    private updateHighlight(): void {
        if (!this.plugin.settings.highlightCurrentSentence) return;

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            this.clearHighlight();
            return;
        }

        const editor: Editor = view.editor;
        const offset = editor.posToOffset(editor.getCursor());

        if (offset === this.lastOffset) return;
        this.lastOffset = offset;

        const content = editor.getValue();
        const sentences = parseSentences(content, this.plugin.settings);
        const sentence = findSentenceAt(sentences, offset);

        this.clearHighlight();

        if (!sentence) return;

        this.applyHighlight(editor);
    }

    private applyHighlight(editor: Editor): void {
        const editorEl = (editor as any).containerEl as HTMLElement | undefined;
        if (!editorEl) return;

        // Pick the highlight color for the current mode
        const modeColor = this.plugin.settings.highlightColors?.[this.plugin.currentMode]
            ?? this.plugin.settings.highlightColor;

        editorEl.style.setProperty('--jp-surfer-highlight-color', modeColor);
        editorEl.classList.add('jp-surfer-highlight-active');
    }

    clearHighlight(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editorEl = (view.editor as any).containerEl as HTMLElement | undefined;
        if (editorEl) {
            editorEl.style.removeProperty('--jp-surfer-highlight-color');
            editorEl.classList.remove('jp-surfer-highlight-active');
        }
        this._clearWaveEls();
    }

    // ─── Wave overlay helpers ─────────────────────────────────────────────────

    private _createWaveOverlay(
        editor: Editor,
        startOffset: number,
        endOffset: number,
        weight: number,
        waveLevel: number
    ): HTMLElement | null {
        const cm = (editor as any).cm;
        if (!cm) return null;

        try {
            const startCoords = cm.coordsAtPos(startOffset);
            const endCoords   = cm.coordsAtPos(endOffset);
            if (!startCoords || !endCoords) return null;

            const editorEl = (editor as any).containerEl as HTMLElement;
            if (!editorEl) return null;

            const overlay = document.createElement('div');
            overlay.classList.add('jp-surfer-wave-overlay', `jp-surfer-chunk-wave-${waveLevel}`);
            overlay.style.opacity = String(weight);
            overlay.style.position = 'absolute';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.top = `${startCoords.top + cm.scrollDOM.scrollTop}px`;
            overlay.style.height = `${Math.max(endCoords.bottom - startCoords.top, 2)}px`;
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '1';

            editorEl.style.position = 'relative';
            editorEl.appendChild(overlay);
            return overlay;
        } catch {
            return null;
        }
    }

    private _clearWaveEls(): void {
        for (const el of this.waveEls) {
            el.remove();
        }
        this.waveEls = [];
    }
}

