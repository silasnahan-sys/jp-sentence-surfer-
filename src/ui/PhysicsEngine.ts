/**
 * PhysicsEngine v2 — Full 2D spring-damper with 3D ball rotation.
 *
 * - Dual-axis momentum (X for horizontal card swipe, Y for sentence rolling)
 * - Spring-snap with overshoot & settle
 * - Ball rotation angle derived from velocity (visual spin)
 * - Elastic rubber-band at boundaries
 * - Sub-frame interpolation for 120fps
 */

export interface PhysicsConfig {
    friction: number;
    springStiffness: number;
    springDamping: number;
    velocityThreshold: number;
    maxVelocity: number;
    mass: number;
    boundaryElasticity: number;
    rotationFactor: number;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
    friction: 0.035,
    springStiffness: 180,
    springDamping: 0.62,
    velocityThreshold: 0.3,
    maxVelocity: 6000,
    mass: 0.8,
    boundaryElasticity: 0.3,
    rotationFactor: 0.22,
};

export type PhysicsAxis = 'x' | 'y';

export interface PhysicsState {
    position: number;
    velocity: number;
    targetPosition: number | null;
    isSettling: boolean;
    rotation: number;
    minBound: number;
    maxBound: number;
}

export interface PhysicsSnapshot {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotX: number;
    rotY: number;
    speedNorm: number;
}

export class PhysicsEngine {
    private config: PhysicsConfig;
    private stateX: PhysicsState;
    private stateY: PhysicsState;
    private animFrameId: number | null = null;
    private lastTime = 0;
    private onUpdate: ((snap: PhysicsSnapshot) => void) | null = null;
    private onSnap: ((axis: PhysicsAxis, index: number) => void) | null = null;
    private onBoundaryCross: ((axis: PhysicsAxis, prevIdx: number, newIdx: number) => void) | null = null;
    private snapPositionsX: number[] = [];
    private snapPositionsY: number[] = [];
    private running = false;
    private lastSnapIdxX = -1;
    private lastSnapIdxY = -1;

    private lastDragTime = 0;

    constructor(config: Partial<PhysicsConfig> = {}) {
        this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config };
        this.stateX = this.freshState();
        this.stateY = this.freshState();
    }

    private freshState(): PhysicsState {
        return { position: 0, velocity: 0, targetPosition: null, isSettling: false, rotation: 0, minBound: -Infinity, maxBound: Infinity };
    }

    setOnUpdate(cb: (snap: PhysicsSnapshot) => void): void { this.onUpdate = cb; }
    setOnSnap(cb: (axis: PhysicsAxis, index: number) => void): void { this.onSnap = cb; }
    setOnBoundaryCross(cb: (axis: PhysicsAxis, prev: number, next: number) => void): void { this.onBoundaryCross = cb; }

    setSnapPositions(axis: PhysicsAxis, positions: number[]): void {
        if (axis === 'x') this.snapPositionsX = positions; else this.snapPositionsY = positions;
    }

    setBounds(axis: PhysicsAxis, min: number, max: number): void {
        const s = axis === 'x' ? this.stateX : this.stateY;
        s.minBound = min; s.maxBound = max;
    }

    getPosition(axis: PhysicsAxis): number {
        return axis === 'x' ? this.stateX.position : this.stateY.position;
    }

    getVelocity(axis: PhysicsAxis): number {
        return axis === 'x' ? this.stateX.velocity : this.stateY.velocity;
    }

    setPosition(axis: PhysicsAxis, pos: number): void {
        const s = axis === 'x' ? this.stateX : this.stateY;
        s.position = pos; s.velocity = 0; s.targetPosition = null; s.isSettling = false;
    }

    applyVelocity(axis: PhysicsAxis, velocity: number): void {
        const s = axis === 'x' ? this.stateX : this.stateY;
        s.velocity = Math.max(-this.config.maxVelocity, Math.min(this.config.maxVelocity, velocity));
        s.targetPosition = null; s.isSettling = false;
        this.ensureRunning();
    }

    addVelocity(axis: PhysicsAxis, dv: number): void {
        const s = axis === 'x' ? this.stateX : this.stateY;
        s.velocity = Math.max(-this.config.maxVelocity, Math.min(this.config.maxVelocity, s.velocity + dv));
        s.targetPosition = null; s.isSettling = false;
        this.ensureRunning();
    }

    snapToNearest(axis: PhysicsAxis): void {
        const s = axis === 'x' ? this.stateX : this.stateY;
        const positions = axis === 'x' ? this.snapPositionsX : this.snapPositionsY;
        if (positions.length === 0) return;
        const ci = this.binaryNearestSnap(positions, s.position);
        s.targetPosition = positions[ci]; s.isSettling = true;
        this.onSnap?.(axis, ci);
        this.ensureRunning();
    }

    snapToIndex(axis: PhysicsAxis, index: number): void {
        const positions = axis === 'x' ? this.snapPositionsX : this.snapPositionsY;
        if (index < 0 || index >= positions.length) return;
        const s = axis === 'x' ? this.stateX : this.stateY;
        s.targetPosition = positions[index]; s.isSettling = true;
        this.onSnap?.(axis, index);
        this.ensureRunning();
    }

    dragMove(axis: PhysicsAxis, delta: number): void {
        const s = axis === 'x' ? this.stateX : this.stateY;
        // Rubber-band at boundaries
        if (s.position < s.minBound) {
            const ov = s.minBound - s.position;
            delta *= Math.max(0.08, 1 - ov * this.config.boundaryElasticity / 150);
        } else if (s.position > s.maxBound) {
            const ov = s.position - s.maxBound;
            delta *= Math.max(0.08, 1 - ov * this.config.boundaryElasticity / 150);
        }
        s.position += delta;
        // Blend velocity for smooth momentum — framerate-aware (not hardcoded 60Hz)
        const now = performance.now();
        const dtMs = now - this.lastDragTime;
        this.lastDragTime = now;
        // First dragMove call has lastDragTime=0 → dt is huge; treat as 60Hz
        const effectiveFps = (dtMs > 1 && dtMs < 500) ? Math.max(60, Math.min(120, 1000 / dtMs)) : 60;
        s.velocity = s.velocity * 0.3 + delta * effectiveFps * 0.7;
        s.targetPosition = null; s.isSettling = false;
        this.checkBoundaryCross(axis);
    }

    getNearestSnapIndex(axis: PhysicsAxis): number {
        const s = axis === 'x' ? this.stateX : this.stateY;
        const positions = axis === 'x' ? this.snapPositionsX : this.snapPositionsY;
        if (positions.length === 0) return -1;
        return this.binaryNearestSnap(positions, s.position);
    }

    /** Binary search for nearest snap position (O(log n) vs O(n)) */
    private binaryNearestSnap(positions: number[], pos: number): number {
        if (positions.length <= 3) {
            // Linear for tiny arrays (avoid overhead)
            let ci = 0, cd = Math.abs(pos - positions[0]);
            for (let i = 1; i < positions.length; i++) {
                const d = Math.abs(pos - positions[i]);
                if (d < cd) { cd = d; ci = i; }
            }
            return ci;
        }
        let lo = 0, hi = positions.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (positions[mid] < pos) lo = mid + 1;
            else hi = mid;
        }
        // Check lo and lo-1 for nearest
        if (lo > 0 && Math.abs(positions[lo - 1] - pos) <= Math.abs(positions[lo] - pos)) {
            return lo - 1;
        }
        return lo;
    }

    getSnapFraction(axis: PhysicsAxis): number {
        const positions = axis === 'x' ? this.snapPositionsX : this.snapPositionsY;
        if (positions.length < 2) return 0;
        const idx = this.getNearestSnapIndex(axis);
        const s = axis === 'x' ? this.stateX : this.stateY;
        const pos = positions[idx];
        const spacing = idx < positions.length - 1 ? positions[idx + 1] - pos : idx > 0 ? pos - positions[idx - 1] : 1;
        return Math.abs(s.position - pos) / Math.abs(spacing);
    }

    getSnapshot(): PhysicsSnapshot {
        const speed = Math.sqrt(this.stateX.velocity ** 2 + this.stateY.velocity ** 2);
        return {
            x: this.stateX.position, y: this.stateY.position,
            vx: this.stateX.velocity, vy: this.stateY.velocity,
            rotX: this.stateX.rotation, rotY: this.stateY.rotation,
            speedNorm: Math.min(speed / this.config.maxVelocity, 1),
        };
    }

    stop(): void {
        this.running = false;
        if (this.animFrameId !== null) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    }

    isRunning(): boolean { return this.running; }

    destroy(): void { this.stop(); this.onUpdate = null; this.onSnap = null; this.onBoundaryCross = null; }

    private ensureRunning(): void {
        if (this.running) return;
        this.running = true; this.lastTime = performance.now();
        this.animFrameId = requestAnimationFrame(this.tick);
    }

    private tick = (now: number): void => {
        if (!this.running) return;
        // Sub-frame stepping: split large dt into ≤4ms steps for 120Hz+ fidelity
        const rawDt = Math.min((now - this.lastTime) / 1000, 0.032);
        this.lastTime = now;
        const SUB_STEP = 0.004; // 4ms substep → 250Hz internal sim
        let remaining = rawDt;
        let anyActive = false;
        while (remaining > 0.0001) {
            const dt = Math.min(remaining, SUB_STEP);
            remaining -= dt;
            const xA = this.stepAxis(this.stateX, dt);
            const yA = this.stepAxis(this.stateY, dt);
            if (xA || yA) anyActive = true;
        }
        this.checkBoundaryCross('x');
        this.checkBoundaryCross('y');
        this.emitSnapshot();
        if (anyActive) { this.animFrameId = requestAnimationFrame(this.tick); }
        else { this.running = false; this.animFrameId = null; }
    };

    private emitSnapshot(): void { this.onUpdate?.(this.getSnapshot()); }

    private checkBoundaryCross(axis: PhysicsAxis): void {
        const idx = this.getNearestSnapIndex(axis);
        if (axis === 'x') {
            if (idx !== this.lastSnapIdxX && this.lastSnapIdxX >= 0) this.onBoundaryCross?.(axis, this.lastSnapIdxX, idx);
            this.lastSnapIdxX = idx;
        } else {
            if (idx !== this.lastSnapIdxY && this.lastSnapIdxY >= 0) this.onBoundaryCross?.(axis, this.lastSnapIdxY, idx);
            this.lastSnapIdxY = idx;
        }
    }

    private stepAxis(state: PhysicsState, dt: number): boolean {
        state.rotation += state.velocity * this.config.rotationFactor * dt;

        if (state.isSettling && state.targetPosition !== null) {
            const disp = state.position - state.targetPosition;
            const springF = -this.config.springStiffness * disp;
            const dampF = -2 * this.config.springDamping * Math.sqrt(this.config.springStiffness * this.config.mass) * state.velocity;
            state.velocity += (springF + dampF) / this.config.mass * dt;
            state.position += state.velocity * dt;
            if (Math.abs(disp) < 0.15 && Math.abs(state.velocity) < this.config.velocityThreshold * 0.5) {
                state.position = state.targetPosition; state.velocity = 0;
                state.isSettling = false; state.targetPosition = null;
                return false;
            }
            return true;
        }

        if (Math.abs(state.velocity) < this.config.velocityThreshold) { state.velocity = 0; return false; }

        state.velocity *= (1 - this.config.friction);
        state.position += state.velocity * dt;

        // Rubber-band at boundaries
        if (state.position < state.minBound) {
            state.velocity += (state.minBound - state.position) * this.config.springStiffness * 0.3 * dt;
        } else if (state.position > state.maxBound) {
            state.velocity += (state.maxBound - state.position) * this.config.springStiffness * 0.3 * dt;
        }

        return Math.abs(state.velocity) >= this.config.velocityThreshold;
    }
}
