# JP Rhythm Ninja — Kinetic Integrity Audit
**Plugin**: JP Sentence Surfer (`jp-sentence-surfer-`)  
**Audited by**: GitHub Copilot (Claude Sonnet 4.6)  
**Target Device**: iPhone 17, 120Hz ProMotion  
**Design DNA**: Elecom HUGE Trackball · osu! · Persona 5 · DMC/Bayonetta · Monster Hunter Rise  
**Architecture**: Obsidian TypeScript plugin, spring-damper physics, global touch capture

---

## What Changed Since Last Version

| File | Version | Size | Status |
|------|---------|------|--------|
| `src/ui/SentenceMonkeyScroller.ts` | v3 → v5 | 843 → 3922 lines | Complete rewrite |
| `src/ui/PhysicsEngine.ts` | v1 → v2 | ~200 → 295 lines | Substantial rewrite |
| `src/ui/GestureHandler.ts` | v4 | 310 lines | **Unchanged** |
| `src/ui/FloatingToolbar.ts` | v2 | 250 lines | **Unchanged** |

**SentenceMonkeyScroller v3→v5 major additions:**
- **VROOM trackball system** — momentum-driven navigation with circular motion detection
- **Combo ring** — osu!×Persona 5 radial pie-menu with 6 segments, chain combos, graduation
- **Extend-selection system** — 磁石 magnetic character movement with mikiri snap
- **ScopeEngine integration** — 4-level linguistic scope (bunsetsu→ren→clause→sentence), pinch+swipe to change
- **HapticEngine** — full integration with roll, tick, snap, zoom, impact, select, success
- **Zoom lane** — 5-item rhythm highway with parallax swipe, long-press, tap-to-combo
- **Live selection overlay** — DOM highlight always visible on iOS (CodeMirror selection can disappear during rapid touch)
- **Safety timeout** — 5s (normal) / 15s (extend) auto-reset if `isDragging` gets stuck

**PhysicsEngine v1→v2 key changes:**
- `dragMove()`: 60Hz hardcode removed → framerate-aware `effectiveFps` (60–144Hz detected dynamically)
- `binaryNearestSnap()`: O(n) linear scan replaced with O(log n) binary search
- Inner physics loop sub-stepped at 4ms (250Hz internal sim) for 120Hz+ fidelity

---

## Issues Fixed Since Last Audit

### ✅ FIXED: PhysicsEngine 60Hz Assumption
**Was**: `s.velocity = s.velocity * 0.3 + delta * 60 * 0.7` (hardcoded 60fps)  
**Now** (`src/ui/PhysicsEngine.ts`):
```typescript
const effectiveFps = (dtMs > 1 && dtMs < 500) ? Math.max(60, Math.min(144, 1000 / dtMs)) : 60;
s.velocity = s.velocity * 0.3 + delta * effectiveFps * 0.7;
```
Post-drag ball physics now correct at 120Hz.

### ✅ FIXED: Tap-During-Extend State Corruption
**Was**: `onTap()` had no extend-mode guard; microtap collapsed extended selection while leaving `extendMode='extending'` for stale next drag  
**Now** (`src/ui/SentenceMonkeyScroller.ts` `onTap()`):
```typescript
if (this.extendMode === 'extending') {
    this.mikiriSnap(); // Snap head to nearest scope boundary, STAY in extend
    return;
}
```
Tap during extend is now a precision "mikiri counter" (Sekiro reference) — snaps to boundary without exiting extend mode.

### ✅ FIXED: Combo Ring Scatter-Reform Race
**Was**: `openComboRing()` canceled `comboCloseTimeoutId` but didn't reset segment CSS transforms; re-opening within 250ms caused explosion-implosion glitch at 120Hz combo speeds  
**Now** (`src/ui/SentenceMonkeyScroller.ts` lines 2610–2623, self-documented as "M3 fix"):
```typescript
if (this.comboCloseTimeoutId !== null) {
    clearTimeout(this.comboCloseTimeoutId);
    this.comboCloseTimeoutId = null;
    // Force-reset segment CSS from mid-scatter state to prevent
    // explosion-implosion glitch when re-opening within 250ms
    for (let i = 0; i < this.comboSegEls.length; i++) {
        const el = this.comboSegEls[i];
        el.style.transition = 'none';
        el.style.transform = 'translate(0, 0) scale(0)';
        el.style.opacity = '0';
    }
    this.comboRingEl.classList.remove('ms3-combo-ring--open', 'ms3-combo-ring--chain', ...);
    this.comboOverlayEl.classList.remove('ms3-combo-overlay--open', 'ms3-combo-overlay--chain');
}
```

---

## Remaining Structural Risks

### 🔴 RISK 1 (High) — ProMotion 120Hz Velocity Collapse at Lift-Off
**File**: `src/ui/GestureHandler.ts` → `calculateVelocity()`  
**Status**: File UNCHANGED from v4. Original issue persists.

**Root cause**: 5-sample exponential buffer with `Math.pow(2, i)` weights. At 120Hz, 5 samples span ~41ms. The most recent sample gets 53% of total weight (~8ms window). Human fingers naturally decelerate in the last 8ms before lift on ProMotion glass. That deceleration sample dominates.

**Cascading effect in current v5 `onRelease()`**:
```typescript
const inferredVy = durationMs > 0 ? (totalY / durationMs) * 1000 : vy;
const blendedVy = vy * 0.65 + inferredVy * 0.35;  // vy already ~40% underestimated
const momentumBoost = 1 + Math.min(this.vroomMomentum / 120, 1.0);
const inertiaVy = blendedVy * 0.55 * momentumBoost;  // VROOM_INERTIA_CARRY = 0.55
```
`vy` enters already 30–50% underestimated from GestureHandler. `blendedVy` partially rescues via `inferredVy` at only 35% weight. Final `inertiaVy` at INERTIA_CARRY=0.55 (tightened from 0.85 in v3) further compounds this. Net: iPhone 17 VROOM flings feel significantly damped vs trackball expectation.

**Fix direction**: See Upgrade #2 below (Peak Velocity Rescue). Alternatively, reweight `calculateVelocity()` in GestureHandler to use a flat window or bias toward middle samples.

---

### 🟡 RISK 2 (Medium–New) — extendCachedContent Nulled Mid-Drag
**File**: `src/ui/SentenceMonkeyScroller.ts` → `attachEditorListeners()` editor-change handler  
**Status**: New issue introduced in v5

**Code** (in `editor-change` event listener):
```typescript
if (this.extendMode === 'extending') {
    this.extendCachedContent = null;
}
```
This fires during an **active extend drag**. Intent: invalidate stale content cache. Consequence: the next `getFreshUnit()` call re-analyzes the full document and returns **shifted unit boundaries** — while `extendAnchorOffset` / `extendHeadOffset` still point to the old document's positions. If a formatting action (bold in adjacent unit) triggers an `editor-change` during extend-drag, the selection head silently jumps to wrong text.

**Severity**: Low probability but silent data corruption when it occurs.  
**Fix** (3 lines): Replace the `extendCachedContent = null` block with:
```typescript
if (this.extendMode === 'extending') {
    this.stopExtendSelection(); // offsets are now stale — abort cleanly
    return;
}
```
Same pattern already used in the `active-leaf-change` handler.

---

### 🟡 RISK 3 (Low–New) — Stagger rAF Leak on Sub-Frame Ring Cycle
**File**: `src/ui/SentenceMonkeyScroller.ts` → `openComboRing()` segment animation loop  
**Status**: New issue introduced in v5

**Code** (inside segment i loop in `openComboRing()`):
```typescript
el.style.transition = 'none';
el.style.transform = `translate(${x}px, ${y}px) scale(0)`;
// ... then:
requestAnimationFrame(() => {
    el.style.transition = `transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms, ...`;
    el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
    el.style.opacity = '1';
});
```
The synchronous reset happens before these rAFs. However, if `closeComboRing()` is called before the rAF renders (~8ms window at 120Hz), close sets `transition: 0.22s ease-in` and scatter transforms synchronously — then the stale open-rAFs fire and override everything with the fly-in cubic-bezier. Segments open instead of scatter.

**Window**: ~8ms at 120Hz. Triggered by instant double-tap on combo ring.  
**Fix** (8 lines): Add `private comboOpenGeneration = 0;`. Increment on each `openComboRing()`. rAF closures read the generation at creation time and bail if it changed:
```typescript
const gen = ++this.comboOpenGeneration;
requestAnimationFrame(() => {
    if (this.comboOpenGeneration !== gen) return; // superseded
    el.style.transition = `...`;
    // ...
});
```

---

## Crunchiness Upgrades (Both Unimplemented)

### 🎯 UPGRADE 1 — Pre-Step Haptic Anticipation (osu! Approach Circle)
**File**: `src/ui/SentenceMonkeyScroller.ts` → `onDrag()`, before the step while-loop

**Current**: Haptic fires AFTER `dragNavAccumulatorY` crosses `stepThreshold`. User gets click with no warning.

**Implementation** — add before the `while (Math.abs(...) >= stepThreshold)` loop:
```typescript
// Approach circle: fire anticipation haptic at 72% of next step
const absAccum = Math.abs(this.dragNavAccumulatorY);
const prevAbsAccum = Math.abs(this.dragNavAccumulatorY - navDelta);
const threshold72 = stepThreshold * 0.72;
if (prevAbsAccum < threshold72 && absAccum >= threshold72) {
    const now = performance.now();
    if (now - this.lastStepHapticAt >= 15) { // don't double-fire with the step itself
        this.haptics.fire('light');
    }
}
```
User feels the click *arriving* 28% before it lands. Transforms reactive gear-clicks into anticipatory countdown. Highest feel-improvement per line-of-code ratio in the codebase.

---

### 🎯 UPGRADE 2 — Peak Velocity Fling Rescue (Trackball Spin-Momentum)
**Files**: `src/ui/SentenceMonkeyScroller.ts` → `onDragStart()`, `onDrag()`, `onRelease()`

Directly addresses Risk 1 symptom. Works regardless of whether GestureHandler is patched.

**Step 1** — Add to state declarations:
```typescript
private peakDragAbsVy = 0;  // highest instantaneous drag velocity seen this drag session
```

**Step 2** — Reset in `onDragStart()`:
```typescript
this.peakDragAbsVy = 0;
```

**Step 3** — Track in `onDrag()`, near speed calculation (convert frame-delta to velocity units):
```typescript
const frameVy = Math.abs(dy) * 60; // approximate px/s from frame delta
if (frameVy > this.peakDragAbsVy) this.peakDragAbsVy = frameVy;
```

**Step 4** — Rescue in `onRelease()`, replace the `blendedVy` line:
```typescript
const baseBlended = vy * 0.65 + inferredVy * 0.35;
// Lift-off rescue: if measured velocity dropped >40% below session peak,
// blend in the peak — ball "keeps spinning" like a real Elecom trackball
const blendedVy = (Math.abs(vy) < this.peakDragAbsVy * 0.6)
    ? baseBlended * 0.55 + Math.sign(vy) * this.peakDragAbsVy * 0.45
    : baseBlended;
this.peakDragAbsVy = 0;
```

---

## Architecture Reference

### Key Files
| File | Version | Purpose |
|------|---------|---------|
| `src/ui/SentenceMonkeyScroller.ts` | v5, 3922 lines | Main HUD: VROOM, combo ring, extend-select, zoom lane |
| `src/ui/PhysicsEngine.ts` | v2, 295 lines | Spring-damper physics, dual-axis, sub-step 250Hz |
| `src/ui/GestureHandler.ts` | v4, 310 lines | Global touch capture, velocity calc, pinch, tap/hold |
| `src/ui/FloatingToolbar.ts` | v2, 250 lines | Glassmorphic capsule toolbar |
| `src/scope-engine.ts` | — | JP linguistic analysis: bunsetsu/ren/clause/sentence |
| `src/types.ts` | — | `SurfUnit`, `SurfAction`, `ComboPreset` |

### Current VROOM Constants (v5 — significantly tightened from v3)
```
VROOM_DECAY         = 0.82   // momentum retention per tick  (was 0.91)
VROOM_GAIN          = 1.0    // speed → momentum amplification (was 2.8)
VROOM_STEP_LO       = 9      // step threshold px, low speed   (was 5)
VROOM_STEP_HI       = 16     // step threshold px, high speed  (was 20)
VROOM_INERTIA_CARRY = 0.55   // release → inertia carry factor (was 0.85)
VROOM_BASE_MULT     = 1.0    // normal scroll multiplier
VROOM_HOLD_MULT     = 2.0    // hold-glide multiplier
VROOM_MIN_SPEED     = 2.5    // min drag speed to trigger unit stepping
PRECISION_SPEED_CEIL= 6      // below = full precision mode
PRECISION_DAMPING   = 0.35   // accumulator multiplier in precision zone
```

### Physics Config (passed from SentenceMonkeyScroller constructor)
```typescript
{ friction: 0.012, springStiffness: 260, springDamping: 0.42, mass: 0.5, maxVelocity: 18000 }
```
Note: underdamped spring (stiffness 260, damping 0.42) is intentional — produces overshooting rhythm feel.

### Key State Machine
```
idle → [right flick release]         → extending (extend-select mode)
idle → [longHold on pad, no drag]    → extending (if overlay visible)
idle → [tap edge / tap zoom-current] → combo ring open
idle → [shortHold]                   → holdNavigateMode (glide scroll)

extending → [tap]                    → mikiriSnap (stays in extend)
extending → [left flick release]     → stopExtend + selectCurrentUnit
extending → [release, non-flick]     → stopExtend (keeps multi-unit selection)

combo ring → [seg tap, chainable]    → execute + chain ring opens
combo ring → [seg tap, not chainable]→ execute + ring closes
combo ring → [timeout 2200ms]        → ring auto-closes

any → [hide()]                       → all states hard-reset
```

### iOS/iPhone 17 Notes
- All animation via `transform3d` + `opacity` only (GPU composited, no layout thrash)
- Document-level capture listeners in GestureHandler prevent "thumb slides off pad" drops
- Highlight overlay is injected `<div>` — CodeMirror selection is invisible during rapid iOS touch updates
- `navigator.clipboard.writeText()` wrapped with `.catch()` — iOS requires user gesture (covered)
- 120Hz ProMotion: GestureHandler 5-sample buffer spans ~41ms (vs ~83ms at 60Hz)

---

## Priority Order for Opus

| # | Item | File | Lines | Impact | Risk |
|---|------|------|-------|--------|------|
| 1 | **Upgrade #1**: Pre-step haptic anticipation | `SentenceMonkeyScroller.ts` `onDrag()` | ~8 | High feel | Zero |
| 2 | **Upgrade #2**: Peak velocity fling rescue | `SentenceMonkeyScroller.ts` `onDrag/Release` | ~12 | High feel | Low |
| 3 | **Risk 2**: extendCachedContent abort-on-change | `SentenceMonkeyScroller.ts` `attachEditorListeners()` | ~3 | Medium stability | Low |
| 4 | **Risk 3**: rAF generation guard | `SentenceMonkeyScroller.ts` `openComboRing()` | ~8 | Low visual | Low |
| 5 | **Risk 1 deep fix**: GestureHandler velocity reweight | `GestureHandler.ts` `calculateVelocity()` | ~15 | Medium feel | Low |
