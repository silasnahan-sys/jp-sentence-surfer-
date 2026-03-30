/**
 * SurfAnimator — NHL-inspired lerp/requestAnimationFrame scroll engine.
 *
 * Adapted from the NHL smooth-scrolling demo (ebhoren/nhl-smooth-scrolling):
 *   - Per-state lerp with `ease` and `targetEase`
 *   - Staggered friction decay for wave effects (SURF_FRICTION = 0.92)
 *   - Momentum accumulation from rapid taps
 *   - Chunk-boundary snap when velocity settles
 *
 * Physics model:
 *   scrollY += (targetScrollY - scrollY) * ease   (every frame)
 *   ease += (targetEase - ease) * SURF_DELTA_EASE  (every frame)
 *   velocity *= SURF_MOMENTUM_DECAY                (every frame after last tap)
 */

import { Editor } from 'obsidian';
import { SurfAnimationState } from './types';
import {
    SURF_EASE,
    SURF_FRICTION,
    SURF_MOMENTUM_DECAY,
    SURF_DELTA_EASE,
    SURF_SETTLE_THRESHOLD,
    SURF_WAVE_RADIUS,
} from './constants';
import { BunsetsuChunk } from './types';

/** Linear interpolation helper. */
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Minimal interface for the CodeMirror 6 EditorView API surface used for
 * scroll animation. We avoid importing CM6 directly to stay dependency-free.
 */
interface CM6View {
    coordsAtPos(pos: number): { top: number; bottom: number; left: number; right: number } | null;
    scrollDOM: HTMLElement;
    dispatch(tr: object): void;
}

/**
 * Wave-highlight callback: called each frame with an array of wave weights
 * (index 0 = current focus chunk, 1–N = neighboring chunks) in the
 * direction of travel. Wave weights range 0–1 (1 = full intensity).
 */
export type WaveCallback = (
    focusChunkIndex: number,
    direction: 1 | -1,
    waveWeights: number[]
) => void;

/**
 * Snap callback: called once when the animation settles on a chunk boundary.
 * Receives the chunk index that was snapped to.
 */
export type SnapCallback = (chunkIndex: number) => void;

export class SurfAnimator {
    private state: SurfAnimationState = {
        scrollY: 0,
        targetScrollY: 0,
        ease: SURF_EASE,
        targetEase: SURF_EASE,
        velocity: 0,
        direction: 1,
        isAnimating: false,
    };

    private rafId: number | null = null;
    private chunks: BunsetsuChunk[] = [];
    private currentChunkIndex = 0;
    private targetChunkIndex = 0;
    private lastTapTime = 0;
    private waveCallback: WaveCallback | null = null;
    private snapCallback: SnapCallback | null = null;
    private surfEase: number;
    private surfFriction: number;
    private surfMomentumDecay: number;

    constructor(
        surfEase = SURF_EASE,
        surfFriction = SURF_FRICTION,
        surfMomentumDecay = SURF_MOMENTUM_DECAY
    ) {
        this.surfEase = surfEase;
        this.surfFriction = surfFriction;
        this.surfMomentumDecay = surfMomentumDecay;
    }

    /** Register wave and snap callbacks. */
    onWave(cb: WaveCallback): this {
        this.waveCallback = cb;
        return this;
    }

    onSnap(cb: SnapCallback): this {
        this.snapCallback = cb;
        return this;
    }

    /** Update the current chunk list (call when content changes). */
    setChunks(chunks: BunsetsuChunk[]): void {
        this.chunks = chunks;
    }

    /** Update physics settings (called from settings changes). */
    updateSettings(surfEase: number, surfFriction: number, surfMomentumDecay: number): void {
        this.surfEase = surfEase;
        this.surfFriction = surfFriction;
        this.surfMomentumDecay = surfMomentumDecay;
    }

    /**
     * Navigate to the next chunk with animated scroll.
     * Momentum accumulates on rapid successive calls.
     */
    surfNext(editor: Editor): void {
        this._surf(editor, 1);
    }

    /**
     * Navigate to the previous chunk with animated scroll.
     * Momentum accumulates on rapid successive calls.
     */
    surfPrev(editor: Editor): void {
        this._surf(editor, -1);
    }

    /**
     * Immediately snap to a chunk index (no animation — for programmatic jumps).
     */
    snapToChunk(editor: Editor, chunkIndex: number): void {
        if (chunkIndex < 0 || chunkIndex >= this.chunks.length) return;
        this.targetChunkIndex = chunkIndex;
        this.currentChunkIndex = chunkIndex;
        const chunk = this.chunks[chunkIndex];
        this._setCursorWithoutScroll(editor, chunk.start);
        this._scrollInstant(editor, chunk.start);
        this.snapCallback?.(chunkIndex);
    }

    /** Cancel any running animation and stop the rAF loop. */
    destroy(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.state.isAnimating = false;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private _surf(editor: Editor, direction: 1 | -1): void {
        if (this.chunks.length === 0) return;

        const now = performance.now();
        const timeSinceLast = now - this.lastTapTime;
        this.lastTapTime = now;

        // Accumulate momentum on rapid successive taps (< 400 ms apart)
        const isFast = timeSinceLast < 400;
        const velocityBoost = isFast ? Math.min(this.state.velocity + 1, 6) : 1;
        this.state.velocity = velocityBoost;
        this.state.direction = direction;

        // Advance target chunk by velocity steps
        const steps = Math.round(velocityBoost);
        const newTarget = Math.max(
            0,
            Math.min(this.chunks.length - 1, this.targetChunkIndex + direction * steps)
        );

        if (newTarget === this.targetChunkIndex && !isFast) return;
        this.targetChunkIndex = newTarget;

        const targetChunk = this.chunks[this.targetChunkIndex];

        // Compute target scroll position
        const targetScrollY = this._computeScrollTarget(editor, targetChunk.start);
        if (targetScrollY === null) {
            // Fallback: instant jump
            this._setCursorWithoutScroll(editor, targetChunk.start);
            this._scrollInstant(editor, targetChunk.start);
            this.currentChunkIndex = this.targetChunkIndex;
            this.snapCallback?.(this.currentChunkIndex);
            return;
        }

        // Update animation state: boost ease on fast taps, apply friction to neighbours
        this.state.targetScrollY = targetScrollY;
        this.state.targetEase = isFast
            ? Math.min(this.surfEase * (1 + velocityBoost * 0.1), 0.5)
            : this.surfEase;

        // Move cursor immediately (no visual scroll yet — we animate that)
        this._setCursorWithoutScroll(editor, targetChunk.start);

        this._startLoop(editor);
    }

    private _startLoop(editor: Editor): void {
        if (this.state.isAnimating) return; // already running
        this.state.isAnimating = true;

        const scroller = this._getScroller(editor);
        if (!scroller) {
            // No scroller access — fallback to instant
            this._scrollInstant(editor, this.chunks[this.targetChunkIndex]?.start ?? 0);
            this.state.isAnimating = false;
            return;
        }

        this.state.scrollY = scroller.scrollTop;

        const tick = () => {
            if (!this.state.isAnimating) return;

            // Lerp ease toward target ease (NHL stagger pattern)
            this.state.ease = lerp(this.state.ease, this.state.targetEase, SURF_DELTA_EASE);

            // Lerp scroll position toward target
            const delta = this.state.targetScrollY - this.state.scrollY;
            this.state.scrollY = lerp(this.state.scrollY, this.state.targetScrollY, this.state.ease);

            // Apply to DOM
            scroller.scrollTop = this.state.scrollY;

            // Decay velocity
            this.state.velocity *= this.surfMomentumDecay;

            // Emit wave highlight weights
            this._emitWave();

            // Check if settled
            const settled = Math.abs(delta) < SURF_SETTLE_THRESHOLD && this.state.velocity < 0.1;
            if (settled) {
                scroller.scrollTop = this.state.targetScrollY;
                this.state.scrollY = this.state.targetScrollY;
                this.state.ease = this.surfEase;
                this.state.targetEase = this.surfEase;
                this.state.velocity = 0;
                this.state.isAnimating = false;
                this.currentChunkIndex = this.targetChunkIndex;
                this.snapCallback?.(this.currentChunkIndex);
                this.rafId = null;
                return;
            }

            this.rafId = requestAnimationFrame(tick);
        };

        this.rafId = requestAnimationFrame(tick);
    }

    private _emitWave(): void {
        if (!this.waveCallback) return;
        const radius = SURF_WAVE_RADIUS;
        const weights: number[] = [1]; // focus chunk = full weight

        let w = 1;
        for (let i = 1; i <= radius; i++) {
            w *= this.surfFriction;
            weights.push(w);
        }
        this.waveCallback(this.targetChunkIndex, this.state.direction, weights);
    }

    /**
     * Compute the scrollTop value that would place the target offset
     * approximately 1/3 from the top of the editor viewport.
     * Returns null if CM6 API is unavailable.
     */
    private _computeScrollTarget(editor: Editor, offset: number): number | null {
        const cm = this._getCm(editor);
        if (!cm) return null;

        try {
            const coords = cm.coordsAtPos(offset);
            if (!coords) return null;

            const scroller = cm.scrollDOM;
            const viewportHeight = scroller.clientHeight;
            // coords.top is relative to the scroller's top edge (already in scroll-space)
            // We want the chunk to appear at 1/3 from top
            const desiredViewportY = viewportHeight * 0.33;
            const targetScrollTop = scroller.scrollTop + coords.top - desiredViewportY;
            return Math.max(0, targetScrollTop);
        } catch {
            return null;
        }
    }

    private _getScroller(editor: Editor): HTMLElement | null {
        const cm = this._getCm(editor);
        return cm?.scrollDOM ?? null;
    }

    private _getCm(editor: Editor): CM6View | null {
        const cm = (editor as any).cm;
        return cm != null ? (cm as CM6View) : null;
    }

    /**
     * Set cursor position without triggering CM6's built-in scrollIntoView.
     * We do this by dispatching directly on the CM6 view.
     */
    private _setCursorWithoutScroll(editor: Editor, offset: number): void {
        const cm = this._getCm(editor);
        if (cm) {
            try {
                cm.dispatch({
                    selection: { anchor: offset, head: offset },
                    // Deliberately omit scrollIntoView effect
                });
                return;
            } catch {
                // fall through
            }
        }
        // Fallback: use Obsidian API (may cause instant scroll)
        editor.setCursor(editor.offsetToPos(offset));
    }

    private _scrollInstant(editor: Editor, offset: number): void {
        try {
            editor.scrollIntoView(
                { from: editor.offsetToPos(offset), to: editor.offsetToPos(offset) },
                true
            );
        } catch {
            // ignore
        }
    }
}
