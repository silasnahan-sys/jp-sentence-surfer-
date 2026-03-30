/**
 * TouchController — game-like iOS touch gesture system.
 *
 * Interaction model:
 *   Horizontal swipe  → select / expand text selection within current chunk
 *   Vertical swipe    → scroll through document (feeds velocity to SurfAnimator)
 *   Single tap        → handled by toolbar buttons (Next / Prev)
 *   Double-tap        → select current chunk (replaces Surf: Select)
 *   Long-press        → show surf-mode picker
 *   Swipe velocity    → feeds into SurfAnimator momentum system
 *
 * Physics:
 *   Horizontal vs vertical classified by angle relative to dead zone.
 *   Touch velocity tracked as px/ms over the last segment.
 *
 * iOS notes:
 *   - All touch listeners use { passive: true } where possible.
 *   - touch-action: pan-y on the gesture zone prevents iOS bounce conflicts.
 *   - Works inside Obsidian's WKWebView on iOS.
 */

import { Editor, MarkdownView } from 'obsidian';
import {
    GESTURE_DEAD_ZONE_DEGREES,
    GESTURE_MIN_SWIPE_PX,
    GESTURE_LONG_PRESS_MS,
    GESTURE_DOUBLE_TAP_MS,
} from './constants';
import { SurfAnimator } from './surf-animator';
import { BoundaryEngine } from './boundary-engine';
import { SurfMode } from './types';

type GetEditor = () => Editor | null;
type OnModeChange = (mode: SurfMode) => void;
type OnSelectChunk = (editor: Editor) => void;
type OnShowModePicker = () => void;

/** Computed velocity from touch events. */
interface TouchVelocity {
    vx: number; // px/ms
    vy: number;
}

const SURF_MODES_ORDER: SurfMode[] = [
    SurfMode.Bunsetsu,
    SurfMode.Sentence,
    SurfMode.Clause,
    SurfMode.Particle,
    SurfMode.ContentWord,
    SurfMode.Collocation,
    SurfMode.Bold,
];

export class TouchController {
    private el: HTMLElement;
    private getEditor: GetEditor;
    private animator: SurfAnimator;
    private boundaryEngine: BoundaryEngine;
    private currentMode: SurfMode;
    private onModeChange: OnModeChange;
    private onSelectChunk: OnSelectChunk;
    private onShowModePicker: OnShowModePicker;

    // Touch tracking state
    private touchStartX = 0;
    private touchStartY = 0;
    private touchStartTime = 0;
    private lastTouchX = 0;
    private lastTouchY = 0;
    private lastTouchTime = 0;
    private longPressTimer: ReturnType<typeof setTimeout> | null = null;
    private lastTapTime = 0;
    private gestureType: 'none' | 'horizontal' | 'vertical' = 'none';
    private selectionAnchorOffset = -1;

    // Bound event handlers (for cleanup)
    private _onStart: (e: TouchEvent) => void;
    private _onMove: (e: TouchEvent) => void;
    private _onEnd: (e: TouchEvent) => void;
    private _onCancel: (e: TouchEvent) => void;

    constructor(
        el: HTMLElement,
        getEditor: GetEditor,
        animator: SurfAnimator,
        boundaryEngine: BoundaryEngine,
        initialMode: SurfMode,
        onModeChange: OnModeChange,
        onSelectChunk: OnSelectChunk,
        onShowModePicker: OnShowModePicker
    ) {
        this.el = el;
        this.getEditor = getEditor;
        this.animator = animator;
        this.boundaryEngine = boundaryEngine;
        this.currentMode = initialMode;
        this.onModeChange = onModeChange;
        this.onSelectChunk = onSelectChunk;
        this.onShowModePicker = onShowModePicker;

        this._onStart  = this._handleStart.bind(this);
        this._onMove   = this._handleMove.bind(this);
        this._onEnd    = this._handleEnd.bind(this);
        this._onCancel = this._handleCancel.bind(this);
    }

    /** Attach event listeners to the target element. */
    attach(): void {
        this.el.addEventListener('touchstart',  this._onStart,  { passive: true });
        this.el.addEventListener('touchmove',   this._onMove,   { passive: false });
        this.el.addEventListener('touchend',    this._onEnd,    { passive: true });
        this.el.addEventListener('touchcancel', this._onCancel, { passive: true });
    }

    /** Remove all event listeners. */
    detach(): void {
        this.el.removeEventListener('touchstart',  this._onStart);
        this.el.removeEventListener('touchmove',   this._onMove);
        this.el.removeEventListener('touchend',    this._onEnd);
        this.el.removeEventListener('touchcancel', this._onCancel);
        this._clearLongPress();
    }

    /** Update the active surf mode (e.g. from toolbar badge tap). */
    setMode(mode: SurfMode): void {
        this.currentMode = mode;
    }

    /** Cycle to the next surf mode. */
    cycleMode(): void {
        const idx = SURF_MODES_ORDER.indexOf(this.currentMode);
        const next = SURF_MODES_ORDER[(idx + 1) % SURF_MODES_ORDER.length];
        this.currentMode = next;
        this.onModeChange(next);
    }

    // ─── Touch event handlers ─────────────────────────────────────────────────

    private _handleStart(e: TouchEvent): void {
        const touch = e.touches[0];
        this.touchStartX    = touch.clientX;
        this.touchStartY    = touch.clientY;
        this.touchStartTime = performance.now();
        this.lastTouchX     = touch.clientX;
        this.lastTouchY     = touch.clientY;
        this.lastTouchTime  = this.touchStartTime;
        this.gestureType    = 'none';
        this.selectionAnchorOffset = -1;

        // Start long-press timer
        this._clearLongPress();
        this.longPressTimer = setTimeout(() => {
            this.longPressTimer = null;
            this.onShowModePicker();
        }, GESTURE_LONG_PRESS_MS);
    }

    private _handleMove(e: TouchEvent): void {
        const touch = e.touches[0];
        const dx = touch.clientX - this.touchStartX;
        const dy = touch.clientY - this.touchStartY;

        // Cancel long-press on move
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            this._clearLongPress();
        }

        // Classify gesture if not yet classified
        if (this.gestureType === 'none' && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
            const angleDeg = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI));
            // angleDeg = 0 → pure horizontal, 90 → pure vertical
            if (angleDeg < GESTURE_DEAD_ZONE_DEGREES) {
                this.gestureType = 'horizontal';
            } else if (angleDeg > (90 - GESTURE_DEAD_ZONE_DEGREES)) {
                this.gestureType = 'vertical';
            }
        }

        // Prevent default scroll only for horizontal gestures (to avoid iOS bounce)
        if (this.gestureType === 'horizontal') {
            e.preventDefault();
            this._handleHorizontalGesture(touch.clientX, dx);
        }

        this.lastTouchX    = touch.clientX;
        this.lastTouchY    = touch.clientY;
        this.lastTouchTime = performance.now();
    }

    private _handleEnd(e: TouchEvent): void {
        this._clearLongPress();

        const touch = e.changedTouches[0];
        const dx = touch.clientX - this.touchStartX;
        const dy = touch.clientY - this.touchStartY;
        const dt = performance.now() - this.touchStartTime;

        const velocity = this._computeVelocity(
            touch.clientX - this.lastTouchX,
            touch.clientY - this.lastTouchY,
            performance.now() - this.lastTouchTime
        );

        const now = performance.now();
        const isDoubleTap = (now - this.lastTapTime) < GESTURE_DOUBLE_TAP_MS
            && Math.abs(dx) < 10 && Math.abs(dy) < 10;
        this.lastTapTime = now;

        if (this.gestureType === 'none' && Math.abs(dx) < GESTURE_MIN_SWIPE_PX && Math.abs(dy) < GESTURE_MIN_SWIPE_PX) {
            // It's a tap or double-tap
            if (isDoubleTap) {
                const editor = this.getEditor();
                if (editor) this.onSelectChunk(editor);
            }
            // Single tap is handled by button click listeners — no action here
            return;
        }

        if (this.gestureType === 'horizontal' && Math.abs(dx) >= GESTURE_MIN_SWIPE_PX) {
            // Horizontal swipe: finalise selection
            // (already handled incrementally in _handleHorizontalGesture)
            return;
        }

        if (this.gestureType === 'vertical' && Math.abs(dy) >= GESTURE_MIN_SWIPE_PX) {
            // Vertical swipe: trigger surf based on velocity
            const editor = this.getEditor();
            if (editor) {
                this._handleVerticalSwipe(editor, dy, velocity);
            }
        }
    }

    private _handleCancel(_e: TouchEvent): void {
        this._clearLongPress();
        this.gestureType = 'none';
    }

    // ─── Gesture handlers ─────────────────────────────────────────────────────

    private _handleHorizontalGesture(currentX: number, totalDx: number): void {
        const editor = this.getEditor();
        if (!editor) return;

        const content = editor.getValue();
        const cursorOffset = editor.posToOffset(editor.getCursor());
        const chunk = this.boundaryEngine.findAt(content, cursorOffset, this.currentMode);
        if (!chunk) return;

        // Swipe right → extend selection forward; swipe left → shrink
        const chunkLength = chunk.end - chunk.start;
        const progress = Math.max(0, Math.min(1, totalDx / 200));

        if (totalDx > 0) {
            // Extend selection from chunk start → chunk end proportionally
            const selEnd = Math.round(chunk.start + chunkLength * progress);
            if (this.selectionAnchorOffset < 0) {
                this.selectionAnchorOffset = chunk.start;
            }
            editor.setSelection(
                editor.offsetToPos(this.selectionAnchorOffset),
                editor.offsetToPos(Math.min(selEnd, chunk.end))
            );
        } else {
            // Swipe left: shrink selection (or go to previous chunk)
            if (this.selectionAnchorOffset >= 0) {
                const selEnd = Math.round(chunk.end + chunkLength * (totalDx / 200));
                editor.setSelection(
                    editor.offsetToPos(this.selectionAnchorOffset),
                    editor.offsetToPos(Math.max(chunk.start, selEnd))
                );
            }
        }
    }

    private _handleVerticalSwipe(editor: Editor, dy: number, velocity: TouchVelocity): void {
        // Map swipe direction: swipe up (dy < 0) = surf next (forward in document)
        const direction: 1 | -1 = dy < 0 ? 1 : -1;
        // The animator accumulates momentum internally; a single call with enough
        // velocity is sufficient. We call once and the internal momentum system handles steps.
        if (direction === 1) {
            this.animator.surfNext(editor);
        } else {
            this.animator.surfPrev(editor);
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    private _computeVelocity(dx: number, dy: number, dt: number): TouchVelocity {
        if (dt === 0) return { vx: 0, vy: 0 };
        return { vx: dx / dt, vy: dy / dt };
    }

    private _clearLongPress(): void {
        if (this.longPressTimer !== null) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }
}
