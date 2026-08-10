# JP Rhythm Ninja — Kinetic Integrity Audit v2
**Plugin**: JP Sentence Surfer (`jp-sentence-surfer-`)  
**Audited by**: GitHub Copilot (Claude Sonnet 4.6)  
**Codebase version**: v5 (SentenceMonkeyScroller 5012 lines)  
**Target device**: iPhone 17, 120Hz ProMotion  
**Files reviewed**: GestureHandler.ts v4 · PhysicsEngine.ts v2 · SentenceMonkeyScroller.ts v5 · HapticEngine.ts v2 · SentenceHighlighter.ts v2 · FloatingToolbar.ts

---

## Status of Previously Reported Risks

All three structural risks from the v1 audit are confirmed resolved:

| Risk | Status | Where fixed |
|------|--------|-------------|
| 120Hz velocity collapse | ✅ Fixed (20% blend rescue) | GestureHandler lines 224–232 |
| `extendCachedContent` null mid-drag | ✅ Fixed (null guard) | `updateExtendFromDrag` line ~4205 |
| Combo scatter-reform rAF race | ✅ Fixed (`comboOpenGeneration` guard) | `openComboRing` + `closeComboRing` |
| Physics 60Hz hardcode | ✅ Fixed (`effectiveFps` clamped 60–144Hz) | PhysicsEngine v2 |
| Tap-during-extend state corruption | ✅ Fixed (editor-change handler) | `attachEditorListeners` |

---

## 🔴 CRITICAL

### C-1: HapticEngine is silent on iPhone 17

`HapticEngine.fire()` calls `navigator.vibrate()`. This API is **not supported in WebKit/WKWebView on iOS**. The `canVibrate()` guard correctly returns `false` on iPhone, so every single `this.haptics.fire(...)` call in the codebase — tick, snap, impact, zoom, roll, success — is a **silent no-op on the primary target device**.

The design DNA of this plugin is built around haptic texture. "Tatami grid haptics", "shamisen pluck twang", "each boundary has physical weight", "decisive catch haptic" — all phantoms on iPhone.

**Evidence:**
```ts
// HapticEngine.ts line 46
private canVibrate(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    // navigator.vibrate is undefined in WKWebView → always returns false
}
```

**Impact**: Entire haptic architecture is non-functional on iOS. The rhythm-game "feel" described in every system is absent.

**Options**:
1. Check if Obsidian Mobile injects a native haptic bridge (e.g. `window.__obsidian_haptic__` or similar). If so, route through it.
2. Add a Web Audio API sound synthesis fallback — generate 1-3ms click tones for tick/snap, short tones for impact. Gives audio "feel" of the rhythm game when vibration is unavailable. Browsers allow silent AudioContext on user gesture, which touch events qualify as.
3. Accept the limitation and document it. Android users get haptics; iPhone users get visual-only feedback.

**Recommended action**: Investigate Obsidian's native bridge first (one-line check at plugin init). If no bridge exists, implement Audio fallback for the core patterns (tick, snap, impact) — these three cover 90% of the tactile moments.

---

## 🟠 HIGH

### H-1: 20% peak rescue threshold misses the main failure case

The lift-off velocity rescue in `GestureHandler.onGlobalTouchEnd`:

```ts
// GestureHandler.ts lines 224–232
if (Math.abs(vy) < Math.abs(this.peakVy) * 0.5 && Math.abs(this.peakVy) > 150
    && Math.sign(vy) === Math.sign(this.peakVy)) {
    vy = vy * 0.80 + this.peakVy * 0.20;    // 20% rescue
}
```

The trigger condition `vy < peakVy * 0.5` only fires when the final-frame velocity has collapsed to **below 50% of peak**. At 120Hz, typical finger-lift deceleration captures the **last 8ms frame** where the finger is slowing before lifting. This produces readings of 60–80% of peak velocity — which the 50% threshold does **not catch**. The rescue never fires for the most common 120Hz collapse pattern.

The v1 audit recommended 45% peak blend. The implementation chose 20% blend, which is also conservative. Even if the threshold fired, 20% weight barely moves the needle.

**Recommendation**: Raise threshold to 0.75 (fires when instant < 75% of peak) and blend weight to 0.38–0.45:
```ts
if (Math.abs(vy) < Math.abs(this.peakVy) * 0.75
    && Math.abs(this.peakVy) > 150
    && Math.sign(vy) === Math.sign(this.peakVy)) {
    vy = vy * 0.60 + this.peakVy * 0.40;
}
```
This would activate on the typical 65–70% drop that 120Hz causes, and give a 40% correction instead of 20%.

---

### H-2: `SentenceHighlighter.updateHighlight` ignores parsed sentence bounds

`SentenceHighlighter` parses sentences and finds the one at cursor — but **never uses the result** to draw a visual range:

```ts
// SentenceHighlighter.ts lines 56–65
const sentences = parseSentences(content, this.plugin.settings);
const sentence = findSentenceAt(sentences, localOffset);

this.clearHighlight();
if (!sentence) return;

const editorEl = (editor as any).containerEl as HTMLElement | undefined;
if (editorEl) {
    editorEl.style.setProperty('--jp-surfer-highlight-color', this.plugin.settings.highlightColor);
}
// sentence.start and sentence.end are NEVER used
```

The CSS variable only changes the color, not the span. If there is a CSS rule using `:focus-within` or CM-selection to draw this, it highlights the current line/selection, not the sentence boundary. The parsed sentence range (`sentence.start`, `sentence.end`) is discarded.

**Impact**: `highlightCurrentSentence` setting implies sentence-scoped highlight. What users get is something cursor-position-dependent determined by CSS, not the actual parsed sentence extent.

**Recommendation**: Use CM dispatch to set selection to sentence range when highlighting is active, or inject a CM6 StateField/Decoration that marks the sentence span. The parsed `sentence` object already has the coordinates.

---

### H-3: Combo ring dead zone incorrectly scaled on iPhone

In `comboRelease` and `updateComboHover`:

```ts
const dprScale = window.devicePixelRatio > 2 ? 0.7 : 1;
const deadZone = COMBO_SEG_RADIUS * 0.35 * dprScale;
```

On iPhone 17 (3x DPR): `deadZone = 62 * 0.35 * 0.7 = 15.2 CSS px`  
On Android/desktop: `deadZone = 62 * 0.35 * 1.0 = 21.7 CSS px`

`clientX/Y` from touch events are in **CSS pixels**, not device pixels. DPR does not affect them. The dead zone is physically **30% smaller on iPhone than on other devices** — making it harder to dismiss the combo ring by releasing at center, and increasing accidental segment selection risk.

The reasoning appears to be "high DPR = more precise finger" but this doesn't apply to CSS coordinate space.

**Recommendation**: Remove the DPR scaling entirely:
```ts
const deadZone = COMBO_SEG_RADIUS * 0.35;
```

---

## 🟡 MEDIUM

### M-1: `COMBO_CHAIN_DECAY_MS` constant is defined but not used

`COMBO_CHAIN_DECAY_MS = 1800` is declared at file top but `startComboDecay()` re-derives the chain timeout inline:

```ts
// SMS.ts
const timeout = this.comboState === 'chain'
    ? Math.max(baseTimeout - 400, 600)    // inline re-derivation: 2200 - 400 = 1800
    : baseTimeout;
```

If `COMBO_DECAY_MS` changes, chain decay updates automatically (correct), but `COMBO_CHAIN_DECAY_MS` becomes stale/misleading. Someone reading the constant would expect it to be the authoritative value.

**Recommendation**: Either use the constant in `startComboDecay` or remove it:
```ts
const timeout = this.comboState === 'chain' ? COMBO_CHAIN_DECAY_MS : baseTimeout;
```

---

### M-2: Surrogate pair check in extend is one-sided

In `updateExtendFromDrag`, only the **low surrogate** is guarded:

```ts
const code = content.charCodeAt(newHead);
if (code >= 0xDC00 && code <= 0xDFFF) newHead--;  // low surrogate → step back
```

But if `advance` lands on a **high surrogate** (0xD800–0xDBFF), the pair split is not caught. This can occur when `Math.round(extendHeadF)` lands on the first code unit of a surrogate pair. Rare in Japanese text (emoji, some rare kanji), but results in a malformed selection.

**Recommendation**:
```ts
const code = content.charCodeAt(newHead);
if (code >= 0xDC00 && code <= 0xDFFF) newHead--;      // stepped onto low surrogate
else if (code >= 0xD800 && code <= 0xDBFF) newHead++;  // stepped onto high surrogate
```

---

### M-3: `scrollEditorDirect` always throws in Obsidian's CM6

```ts
private scrollEditorDirect(deltaY: number): void {
    // ...
    try {
        if (editorAny?.getScrollInfo && editorAny?.scrollTo) {  // CM5 API
            editorAny.scrollTo(info.left, clampedTop);
            return;  // never reaches here in CM6
        }
    } catch (_) {}
    // Falls through to scrollTop assignment on every call
}
```

Obsidian uses CodeMirror 6. `getScrollInfo` is a CM5-only API. The try block always fails silently, adding exception overhead to every `scrollEditorDirect` call. This is called during every inertia tick frame.

**Recommendation**: Remove the CM5 branch entirely since Obsidian dropped CM5 support:
```ts
private scrollEditorDirect(deltaY: number): void {
    this.lastManualScrollAt = performance.now();
    const scroller = this.getEditorScrollerEl();
    if (scroller) scroller.scrollTop = Math.max(0, scroller.scrollTop + deltaY);
}
```

---

### M-4: Chunk focus fallback skips scope level 0

In `enterChunkFocus`, when the preferred scope returns no units:

```ts
if (this.chunkFocusedUnits.length === 0) {
    for (let lv = 1; lv < SCOPE_COUNT; lv++) {  // starts at 1, not 0
        this.chunkFocusedUnits = this.scopeEngine.getUnitsInChunk(lv, idx);
        if (this.chunkFocusedUnits.length > 0) break;
    }
}
```

If `chunkFocusScopeLevel === 0` (bunsetsu, the finest level) and getUnitsInChunk(0, idx) returns empty, the fallback starts at lv=1 — **level 0 is never retried**. For the common case where the saved scope is already 0, this could result in falling back to a coarser level when the finest level is actually available but was the requested level.

**Recommendation**: Start fallback loop at `0`:
```ts
for (let lv = 0; lv < SCOPE_COUNT; lv++) {
    if (lv === this.chunkFocusScopeLevel) continue; // already tried
    this.chunkFocusedUnits = this.scopeEngine.getUnitsInChunk(lv, idx);
    if (this.chunkFocusedUnits.length > 0) break;
}
```

---

## 🟢 LOW / INFORMATIONAL

### L-1: Peak rescue blend weight remains conservative (see H-1)

Even if the H-1 threshold fix is applied, the design choice of 20% vs 40% blend is a tuning decision. The lower weight was intentional to avoid over-correcting on deliberate slow-lift (where the user intentionally decelerated). The tradeoff: less accidental overshoot vs. more dead flings on aggressive 120Hz swipes. Worth user-testing both weights before committing.

---

### L-2: `settledPauseUntil` 150ms block could frustrate rapid operators

The MA pause guard in `onTap`:
```ts
if (performance.now() < this.settledPauseUntil) return;
```

Set to 150ms after inertia stop, 200ms after manual pachinko-catch. A user who immediately taps for action after settling will hit this 1–2 times before finding the rhythm. Intentional design ("間" stillness teaches deliberateness), but first-time users may interpret it as an unresponsive UI.

**Recommendation**: Add a small visual indicator (opacity pulse on the pad) during `settledPauseUntil` so the pause feels designed, not broken.

---

### L-3: `effectiveFps` ceiling is 144Hz, not 120Hz

```ts
const effectiveFps = Math.max(60, Math.min(144, 1000 / dtMs));
```

iPhone 17 runs at 120Hz. The ceiling at 144Hz means the velocity smoothing formula `s.velocity = s.velocity * 0.3 + delta * effectiveFps * 0.7` would slightly over-weight velocity on 120Hz frames (144 > 120 extrapolation). In practice the difference is negligible and clamping at 120 would be more accurate:
```ts
const effectiveFps = Math.max(60, Math.min(120, 1000 / dtMs));
```

---

### L-4: `makerLastAction` and `extendLastBoundaryHapticAt` declared mid-file

Both class fields are declared inline in the method region rather than the class fields block:

```ts
private makerLastAction: string | null = null;          // declared inside executeMakerGesture area
private extendLastBoundaryHapticAt = 0;                 // declared inside detectBoundaryCrossings
```

TypeScript accepts this at the class level, but it makes the class contract harder to read — a reviewer scanning the field declarations block won't find them. Move both to the state declarations section (around lines 240–400 where other fields live).

---

### L-5: FloatingToolbar drag uses `e.touches[0]` without ID matching

GestureHandler v4 was updated with `findActiveTouch()` and `findChangedTouch()` for multi-touch safety. `FloatingToolbar.attachDragListeners` still uses:

```ts
this.boundDragMove = (e: TouchEvent) => {
    if (!this.isDragging) return;
    const dy = e.touches[0].clientY - this.dragStartY;  // no ID check
```

If a second touch lands during toolbar drag (e.g. thumb resting nearby), `touches[0]` may jump to the wrong touch point, causing a position jolt. Low severity for a drag handle used sparsely, but inconsistent with the GestureHandler fix.

---

## Confirmed Positive Architecture (for context)

These are well-implemented and should be preserved:

- **Binary snap search** (`binaryNearestSnap` O(log n)) — correct fallback for ≤3 elements
- **250Hz sub-frame simulation** (`SUB_STEP = 0.004`) — correctly handles 120Hz frame budget
- **`comboOpenGeneration` scatter-reform guard** — properly invalidates stale rAFs via generation counter; all three call sites accounted for
- **Reverse-offset batch edit** in `executeMakerBatchAction` — sorted descending ensures prior offsets remain valid after each `replaceRange`
- **`searchVvCleanup` double-open guard** — correctly tears down old `visualViewport` listeners before adding new ones
- **NaN guard in `springBallToCenter`** — correctly catches corrupted physics state and snaps to zero
- **Safety timeout** (`isDraggingSafetyId`) — 5s normal / 15s extend — guards against OS-hijacked touch leaving `isDragging` stuck
- **`onDrag` combo guard** — `if (this.comboState !== 'idle') return;` prevents accidental VROOM during ring interaction
- **Scope swipe mutual exclusion** — `lateralOffset = 0` suppressed while `scopeSwipeAccum` accumulating (prevents scope-change + lateral-step collision)
- **CM dispatch with `scrollIntoView: false`** throughout live navigation — correct pattern; avoids forcing viewport jumps during drag

---

## Summary Table

| ID | Severity | Area | Title |
|----|----------|------|-------|
| C-1 | 🔴 Critical | HapticEngine | `navigator.vibrate` is silent on iOS — all haptic design non-functional on iPhone |
| H-1 | 🟠 High | GestureHandler | 20% rescue at 50% threshold misses the main 120Hz collapse case |
| H-2 | 🟠 High | SentenceHighlighter | `updateHighlight` discards parsed sentence bounds — CSS variable only |
| H-3 | 🟠 High | Combo Ring | Dead zone shrinks 30% on iPhone due to incorrect DPR scaling |
| M-1 | 🟡 Medium | Combo System | `COMBO_CHAIN_DECAY_MS` constant defined but not used |
| M-2 | 🟡 Medium | Extend Selection | High surrogate not checked — only low surrogate pair-split caught |
| M-3 | 🟡 Medium | Inertia | `scrollEditorDirect` always throws on CM5 branch (Obsidian is CM6) |
| M-4 | 🟡 Medium | Chunk Mode | Chunk focus fallback loop starts at lv=1, skips lv=0 |
| L-1 | 🟢 Low | GestureHandler | Peak rescue blend still conservative — worth A/B testing 40% weight |
| L-2 | 🟢 Low | Landing System | `settledPauseUntil` block invisible to users — needs visual indicator |
| L-3 | 🟢 Low | PhysicsEngine | `effectiveFps` ceiling at 144Hz should be 120Hz for iPhone accuracy |
| L-4 | 🟢 Low | Code Quality | `makerLastAction` and `extendLastBoundaryHapticAt` declared mid-file |
| L-5 | 🟢 Low | FloatingToolbar | Drag handler uses `touches[0]` without ID — inconsistent with GestureHandler fix |
