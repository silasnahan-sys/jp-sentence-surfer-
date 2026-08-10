/**
 * HapticEngine v2 — Rich haptic pattern system for iOS Taptic Engine.
 *
 * Patterns:
 * - tick: light tap crossing a sentence boundary
 * - snap: medium impact snapping into a lane
 * - impact: heavy thud for hard stops / selections
 * - select: double-tap pattern for selection confirm
 * - roll: continuous subtle rolling feel (rapid micro-taps)
 * - success: triple pulse for action completion
 * - swipe: directional slide feel
 * - zoom: expanding pulse
 */

export type HapticPattern = 'tick' | 'snap' | 'impact' | 'select' | 'light' | 'roll' | 'success' | 'swipe' | 'zoom';

const PATTERNS: Record<HapticPattern, number | number[]> = {
    light: 1,
    tick: 3,
    snap: [6, 20, 4],
    impact: [12, 10, 8],
    select: [4, 25, 4],
    roll: [1, 8, 1, 8, 1],
    success: [4, 30, 6, 30, 4],
    swipe: [2, 10, 3],
    zoom: [3, 15, 6, 15, 3],
};

export class HapticEngine {
    private enabled = true;
    private lastFire = 0;
    private debounceMs = 12;   // 12ms = tight enough for 120Hz rhythm feel
    /** Track rolling state for continuous haptic */
    private rollInterval: ReturnType<typeof setInterval> | null = null;
    private rollIntervalMs = 0;
    private boundVisChange: (() => void) | null = null;
    /** Web Audio fallback for iOS (WKWebView has no navigator.vibrate) */
    private audioCtx: AudioContext | null = null;
    private useAudioFallback = false;

    constructor() {
        // Detect iOS/WKWebView: if vibrate is missing, prepare audio fallback
        if (!this.canVibrate()) {
            this.useAudioFallback = true;
        }
    }

    /** Lazily init AudioContext on first user gesture (browser policy) */
    private ensureAudioCtx(): AudioContext | null {
        if (this.audioCtx) return this.audioCtx;
        try {
            this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            return this.audioCtx;
        } catch { return null; }
    }

    /** Synthesize a short click/tap tone as haptic substitute */
    private fireAudioTap(durationMs: number, freq: number, gain: number): void {
        const ctx = this.ensureAudioCtx();
        if (!ctx) return;
        // Resume if suspended (iOS requires user gesture)
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + durationMs / 1000);
    }

    /** Audio pattern definitions: [durationMs, freq, gain]
     * Frequencies chosen in the 150–400 Hz range — audible as soft percussive clicks
     * on phone speakers without the ear-piercing quality of 2–4.5 kHz tones.
     */
    private static readonly AUDIO_PATTERNS: Record<string, [number, number, number]> = {
        light:   [2,  350, 0.03],
        tick:    [3,  280, 0.04],
        snap:    [6,  220, 0.06],
        impact:  [12, 150, 0.08],
        select:  [8,  300, 0.05],
        roll:    [1,  400, 0.02],
        success: [10, 260, 0.06],
        swipe:   [5,  320, 0.04],
        zoom:    [8,  200, 0.05],
    };

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) this.stopRoll();
    }

    fire(pattern: HapticPattern): void {
        if (!this.enabled) return;
        const now = performance.now();
        if (now - this.lastFire < this.debounceMs) return;
        this.lastFire = now;
        if (this.canVibrate()) {
            try { navigator.vibrate(PATTERNS[pattern]); } catch { /* noop */ }
        } else if (this.useAudioFallback) {
            const p = HapticEngine.AUDIO_PATTERNS[pattern];
            if (p) this.fireAudioTap(p[0], p[1], p[2]);
        }
    }

    fireImmediate(pattern: HapticPattern): void {
        if (!this.enabled) return;
        this.lastFire = performance.now();
        if (this.canVibrate()) {
            try { navigator.vibrate(PATTERNS[pattern]); } catch { /* noop */ }
        } else if (this.useAudioFallback) {
            const p = HapticEngine.AUDIO_PATTERNS[pattern];
            if (p) this.fireAudioTap(p[0], p[1], p[2]);
        }
    }

    /** Start continuous rolling haptic — fires micro-taps at interval */
    startRoll(intervalMs = 60): void {
        if (!this.enabled) return;
        if (!this.canVibrate() && !this.useAudioFallback) return;
        this.stopRoll();
        this.rollIntervalMs = intervalMs;
        this.rollInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            if (this.canVibrate()) {
                try { navigator.vibrate(1); } catch { /* noop */ }
            } else if (this.useAudioFallback) {
                this.fireAudioTap(1, 400, 0.02);
            }
        }, intervalMs);
    }

    /** Adjust roll speed based on velocity (faster = tighter intervals) */
    adjustRoll(speed: number): void {
        if (speed <= 0.05) { this.stopRoll(); return; }
        // Speed 0-1, map to 120ms-30ms interval
        const interval = Math.max(30, 120 - speed * 90);
        // Hysteresis: skip teardown if interval barely changed (< 5ms delta)
        if (this.rollInterval && Math.abs(this.rollIntervalMs - interval) < 5) return;
        this.stopRoll();
        this.startRoll(interval);
    }

    stopRoll(): void {
        if (this.rollInterval) { clearInterval(this.rollInterval); this.rollInterval = null; this.rollIntervalMs = 0; }
    }

    /** Fire a scaled haptic based on intensity (0-1) */
    fireScaled(intensity: number): void {
        if (!this.enabled) return;
        const now = performance.now();
        if (now - this.lastFire < this.debounceMs) return;
        this.lastFire = now;
        const duration = Math.max(1, Math.round(intensity * 15));
        if (this.canVibrate()) {
            try { navigator.vibrate(duration); } catch { /* noop */ }
        } else if (this.useAudioFallback) {
            this.fireAudioTap(duration, 280, Math.min(0.08, intensity * 0.1));
        }
    }

    private canVibrate(): boolean {
        // Test if vibration actually works — some iOS WKWebView contexts expose navigator.vibrate
        // as a no-op that returns false rather than throwing. A zero-duration call is safe and
        // does not trigger any perceptible vibration, but correctly returns false on those devices.
        try {
            return typeof navigator !== 'undefined' &&
                typeof navigator.vibrate === 'function' &&
                navigator.vibrate(0) !== false;
        } catch {
            return false;
        }
    }

    destroy(): void {
        this.stopRoll();
        if (this.audioCtx) {
            try { this.audioCtx.close(); } catch { /* noop */ }
            this.audioCtx = null;
        }
    }
}
