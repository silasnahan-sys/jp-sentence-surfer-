/**
 * GestureHandler v4 — Elecom Huge Trackball-grade gesture system.
 *
 * GLOBAL TOUCH CAPTURE: once drag starts on pad, move/end listeners
 * attach to document so thumb can roam anywhere without losing tracking.
 * This is the single biggest fix for "thumb slides off pad → stops scrolling".
 *
 * - Free-axis drag with both dx/dy every frame
 * - Variable press duration detection (tap / short-hold / long-hold)
 * - Fling velocity in both axes simultaneously  
 * - Two-finger pinch
 * - Touch force/pressure when available (3D Touch)
 * - All velocity from rolling 5-sample window for accuracy
 */

export interface GestureCallbacks {
    /** Fires every touchmove with BOTH axis deltas + total displacement + force */
    onDrag: (dx: number, dy: number, totalX: number, totalY: number, force: number) => void;
    /** Fires on touchend with velocity vector + total displacement + hold duration */
    onRelease: (vx: number, vy: number, totalX: number, totalY: number, durationMs: number) => void;
    /** Quick tap (<180ms, <8px movement) — minimal: settle/dismiss/mikiri only */
    onTap: (x: number, y: number) => void;
    /** Drag started — first move past dead zone */
    onDragStart?: (x: number, y: number) => void;
    /** Two-finger pinch scale + center */
    onPinch?: (scale: number, centerX: number, centerY: number) => void;
    /** Two-finger pinch gesture ended */
    onPinchEnd?: () => void;
}

interface TouchRecord {
    x: number;
    y: number;
    time: number;
    force: number;
}

export class GestureHandler {
    private element: HTMLElement;
    private callbacks: GestureCallbacks;
    private startTouch: TouchRecord | null = null;
    private lastTouch: TouchRecord | null = null;
    private velocityBuffer: TouchRecord[] = [];
    private isActive = false;
    private isDragging = false;
    private activeTouchId: number | null = null;

    // Peak velocity tracking — compensates 120Hz deceleration at lift-off
    private peakVx = 0;
    private peakVy = 0;

    // Pinch
    private isPinching = false;
    private initialPinchDist = 0;

    // Thresholds — scaled by devicePixelRatio for tablet/phone consistency
    private deadZone = Math.max(2, 2 * (window.devicePixelRatio > 2 ? 1.5 : 1));
    private tapMaxDuration = 180;
    private tapMaxDistance = Math.max(8, 8 * (window.devicePixelRatio > 2 ? 1.3 : 1));

    private boundStart: (e: TouchEvent) => void;
    private boundGlobalMove: (e: TouchEvent) => void;
    private boundGlobalEnd: (e: TouchEvent) => void;
    private boundGlobalCancel: (e: TouchEvent) => void;

    constructor(element: HTMLElement, callbacks: GestureCallbacks) {
        this.element = element;
        this.callbacks = callbacks;

        this.boundStart = this.onTouchStart.bind(this);
        this.boundGlobalMove = this.onGlobalTouchMove.bind(this);
        this.boundGlobalEnd = this.onGlobalTouchEnd.bind(this);
        this.boundGlobalCancel = this.onGlobalTouchCancel.bind(this);

        // Only start listens on the pad element
        element.addEventListener('touchstart', this.boundStart, { passive: false });
    }

    destroy(): void {
        this.removeGlobalListeners();
        this.element.removeEventListener('touchstart', this.boundStart);
    }

    private addGlobalListeners(): void {
        document.addEventListener('touchmove', this.boundGlobalMove, { passive: false });
        document.addEventListener('touchend', this.boundGlobalEnd, { passive: true });
        document.addEventListener('touchcancel', this.boundGlobalCancel, { passive: true });
    }

    private removeGlobalListeners(): void {
        document.removeEventListener('touchmove', this.boundGlobalMove);
        document.removeEventListener('touchend', this.boundGlobalEnd);
        document.removeEventListener('touchcancel', this.boundGlobalCancel);
    }

    private onTouchStart(e: TouchEvent): void {
        // Two-finger pinch
        if (e.touches.length === 2) {
            this.isPinching = true;
            this.isActive = false;
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            this.initialPinchDist = Math.sqrt(dx * dx + dy * dy);
            e.preventDefault();
            this.addGlobalListeners();
            return;
        }

        if (e.touches.length !== 1) return;
        e.preventDefault();
        const t = e.touches[0];
        this.activeTouchId = t.identifier;
        const force = (t as any).force || 0;
        const record: TouchRecord = { x: t.clientX, y: t.clientY, time: performance.now(), force };
        this.startTouch = record;
        this.lastTouch = record;
        this.velocityBuffer = [record];
        this.peakVx = 0;
        this.peakVy = 0;
        this.isActive = true;
        this.isDragging = false;

        // Attach global listeners so thumb can roam anywhere
        this.addGlobalListeners();
    }

    private findActiveTouch(e: TouchEvent): Touch | null {
        if (this.activeTouchId === null) return e.touches[0] || null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === this.activeTouchId) return e.touches[i];
        }
        return null;
    }

    private findChangedTouch(e: TouchEvent): Touch | null {
        if (this.activeTouchId === null) return e.changedTouches[0] || null;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.activeTouchId) return e.changedTouches[i];
        }
        return null;
    }

    private onGlobalTouchMove(e: TouchEvent): void {
        // Pinch
        if (this.isPinching && e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            if (this.initialPinchDist > 0) {
                this.callbacks.onPinch?.(dist / this.initialPinchDist, cx, cy);
            }
            return;
        }

        if (!this.isActive || !this.startTouch || !this.lastTouch) return;
        const t = this.findActiveTouch(e);
        if (!t) return;

        const now = performance.now();
        const force = (t as any).force || 0;
        const current: TouchRecord = { x: t.clientX, y: t.clientY, time: now, force };

        const totalX = current.x - this.startTouch.x;
        const totalY = current.y - this.startTouch.y;
        const totalDist = Math.sqrt(totalX * totalX + totalY * totalY);

        // Dead zone — start dragging
        if (!this.isDragging) {
            if (totalDist > this.deadZone) {
                this.isDragging = true;
                this.callbacks.onDragStart?.(this.startTouch.x, this.startTouch.y);
            } else {
                return;
            }
        }

        e.preventDefault();

        const dx = current.x - this.lastTouch.x;
        const dy = current.y - this.lastTouch.y;

        this.velocityBuffer.push(current);
        if (this.velocityBuffer.length > 5) this.velocityBuffer.shift();

        // Track peak velocity during drag for lift-off deceleration compensation
        const dtMs = current.time - this.lastTouch.time;
        if (dtMs > 0.5) {
            const ivx = dx / (dtMs / 1000);
            const ivy = dy / (dtMs / 1000);
            if (Math.abs(ivx) > Math.abs(this.peakVx)) this.peakVx = ivx;
            if (Math.abs(ivy) > Math.abs(this.peakVy)) this.peakVy = ivy;
        }

        this.lastTouch = current;
        this.callbacks.onDrag(dx, dy, totalX, totalY, force);
    }

    private onGlobalTouchEnd(e: TouchEvent): void {
        if (this.isPinching) {
            this.isPinching = false;
            this.initialPinchDist = 0;
            this.callbacks.onPinchEnd?.();
            // Pinch→drag recovery: if one finger stays on screen, restart as a new single drag
            // so the user doesn't have to lift and re-touch after a scope-change pinch.
            const remaining = e.touches[0];
            if (remaining) {
                const force = (remaining as any).force || 0;
                const now = performance.now();
                const record: TouchRecord = { x: remaining.clientX, y: remaining.clientY, time: now, force };
                this.startTouch = record;
                this.lastTouch = record;
                this.velocityBuffer = [record];
                this.peakVx = 0;
                this.peakVy = 0;
                this.isActive = true;
                this.isDragging = false;
                this.activeTouchId = remaining.identifier;
                // Global listeners already attached; keep them live for the continuing touch
                return;
            }
            this.removeGlobalListeners();
            return;
        }
        if (!this.isActive || !this.startTouch) { this.removeGlobalListeners(); return; }

        const endTouch = this.findChangedTouch(e);
        if (!endTouch) return;

        this.isActive = false;
        this.removeGlobalListeners();

        const now = performance.now();
        const duration = now - this.startTouch.time;
        const dx = endTouch.clientX - this.startTouch.x;
        const dy = endTouch.clientY - this.startTouch.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Tap
        if (duration < this.tapMaxDuration && distance < this.tapMaxDistance) {
            this.callbacks.onTap(endTouch.clientX, endTouch.clientY);
            this.reset();
            return;
        }

        // Release with velocity
        if (this.isDragging && this.velocityBuffer.length >= 2) {
            let { vx, vy } = this.calculateVelocity();
            // 120Hz lift-off compensation: at high refresh rates the final touch frame
            // captures deceleration as finger lifts, collapsing measured velocity.
            // PRECISION FIX: Only apply peak compensation for genuine flings —
            // if the user was decelerating (final samples slower than earlier ones),
            // they INTENDED to stop here. Don't fight their intent.
            const isDeceleratingY = this.isDecelerating('y');
            const isDeceleratingX = this.isDecelerating('x');
            if (!isDeceleratingY
                && Math.abs(vy) < Math.abs(this.peakVy) * 0.75 && Math.abs(this.peakVy) > 150
                && Math.sign(vy) === Math.sign(this.peakVy)) {
                vy = vy * 0.60 + this.peakVy * 0.40;
            }
            if (!isDeceleratingX
                && Math.abs(vx) < Math.abs(this.peakVx) * 0.75 && Math.abs(this.peakVx) > 150
                && Math.sign(vx) === Math.sign(this.peakVx)) {
                vx = vx * 0.60 + this.peakVx * 0.40;
            }
            this.callbacks.onRelease(vx, vy, dx, dy, duration);
        }

        this.reset();
    }

    private onGlobalTouchCancel(): void {
        this.removeGlobalListeners();

        // Fire onPinchEnd if pinching was interrupted (iOS edge swipe etc.)
        if (this.isPinching) {
            this.isPinching = false;
            this.initialPinchDist = 0;
            this.callbacks.onPinchEnd?.();
        }

        // CRITICAL: Fire onRelease with zero velocity so the consumer
        // (SentenceMonkeyScroller) clears isDragging. Without this,
        // an OS-hijacked touch (iOS edge swipe, pull-to-refresh) leaves
        // the ball in a permanent ghost-drag state.
        if (this.isDragging && this.startTouch) {
            const dx = (this.lastTouch?.x ?? this.startTouch.x) - this.startTouch.x;
            const dy = (this.lastTouch?.y ?? this.startTouch.y) - this.startTouch.y;
            const duration = performance.now() - this.startTouch.time;
            this.callbacks.onRelease(0, 0, dx, dy, duration);
        }

        this.reset();
    }

    /** Detect deliberate deceleration in the velocity buffer.
     *  Returns true if the last 2-3 samples show a clear slowdown trend on the given axis.
     *  This prevents peak-velocity compensation from overriding a user's intent to stop. */
    private isDecelerating(axis: 'x' | 'y'): boolean {
        const buf = this.velocityBuffer;
        if (buf.length < 3) return false;
        // Compare speed of last 2 intervals
        const n = buf.length;
        const dt1 = (buf[n - 2].time - buf[n - 3].time) / 1000;
        const dt2 = (buf[n - 1].time - buf[n - 2].time) / 1000;
        if (dt1 < 0.001 || dt2 < 0.001) return false;
        const speed1 = Math.abs(axis === 'y'
            ? (buf[n - 2].y - buf[n - 3].y) / dt1
            : (buf[n - 2].x - buf[n - 3].x) / dt1);
        const speed2 = Math.abs(axis === 'y'
            ? (buf[n - 1].y - buf[n - 2].y) / dt2
            : (buf[n - 1].x - buf[n - 2].x) / dt2);
        // If the latest interval is ≤60% of the previous, user was braking
        return speed2 < speed1 * 0.60;
    }

    private calculateVelocity(): { vx: number; vy: number } {
        const buf = this.velocityBuffer;
        const n = buf.length;
        if (n < 2) return { vx: 0, vy: 0 };
        // Exponential-weighted average: recent samples matter more (silk-smooth flings)
        let sumVx = 0, sumVy = 0, weightSum = 0;
        for (let i = 1; i < n; i++) {
            const dt = (buf[i].time - buf[i - 1].time) / 1000;
            if (dt < 0.001) continue;
            const w = Math.pow(2, i); // exponential weight: later = heavier
            sumVx += ((buf[i].x - buf[i - 1].x) / dt) * w;
            sumVy += ((buf[i].y - buf[i - 1].y) / dt) * w;
            weightSum += w;
        }
        if (weightSum === 0) return { vx: 0, vy: 0 };
        return { vx: sumVx / weightSum, vy: sumVy / weightSum };
    }

    private reset(): void {
        this.startTouch = null; this.lastTouch = null;
        this.velocityBuffer = []; this.isActive = false; this.isDragging = false;
        this.activeTouchId = null;
        this.peakVx = 0; this.peakVy = 0;
    }
}
