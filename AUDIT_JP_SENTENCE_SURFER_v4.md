# AUDIT v4 — JP Sentence Surfer: The Gap Between Vision and Feel

**Date**: 2026-04-07  
**Scope**: Full codebase audit — every subsystem, every interaction path, every frame.  
**Method**: Line-by-line read of SMS (5700+ lines), PhysicsEngine, GestureHandler, HapticEngine, ScopeEngine, styles.css. Analysis from the perspectives of: rhythm game design, touch physics, cognitive load, code architecture, mobile performance, and the user's stated vision of "FEELING OF CONTROL."

---

## I. THE CORE TENSION

The plugin has a split personality. The *language* is JP rhythm-action game — osu!, NieR, DMC, Touhou. The *structure* is a deeply nested, 5700-line state machine where every interaction path branches 4-8 ways based on mode flags. The vision says "ONE ball, ONE thumb, pure control." The reality is: the thumb's meaning changes based on 7+ boolean flags (`holdNavigateMode`, `extendMode`, `makerMode`, `chunkMode`, `comboState`, `isActionPanelOpen`, `isSearchOpen`), and the user has to *remember* which mode they're in because the ball's visual feedback doesn't differentiate clearly enough.

**The feel it SHOULD have**: You're a DJ spinning a vinyl. Your hand IS the music. The turntable responds to your pressure, your speed, your intention — seamlessly. You never think about what mode you're in. The turntable knows.

**The feel it actually has**: You're operating a complex instrument panel with 7 mode switches, where each switch changes what the same knob does. You have to look at the badge to know the current mode.

---

## II. CRITICAL PROBLEMS

### P-1: The PhysicsEngine is a Dead Weight

The PhysicsEngine has its own rAF loop (`this.tick`), separate from the unified animation loop in SMS. It runs a 250Hz sub-stepped spring-damper simulation with boundary elasticity, snap-to-nearest, and momentum decay. Here's the problem: **SMS doesn't use any of it during the primary interaction path.**

During drag:
- `physics.dragMove('y', navDelta)` is called — but the result is never read back. SMS maintains `currentIndex` and `dragNavAccumulatorY` independently.
- `physics.setPosition('y', this.currentIndex * UNIT_STEP)` is called AFTER stepping — this overwrites the spring position, defeating the spring sim entirely.
- Velocity from `dragMove` is accumulated but never used; SMS calculates its own `inertiaVy` from GestureHandler's velocity.

During release:
- `physics.stop()` is called immediately.
- `startEditorInertia` runs its own decay curve in the unified animation loop.
- The spring-snap feature (`snapToNearest`) is never called during normal VROOM navigation.

**Diagnosis**: The PhysicsEngine was designed for a card-swipe model. SMS evolved past it into a direct-manipulation trackball. Now it's a ~300-line module consuming a rAF slot and updating ghost state that nothing reads. The `onPhysicsUpdate` callback runs but only affects ball visuals during `!isDragging && !inertiaIsCoasting` — i.e., only during the brief spring-settle phase that barely matters.

**Fix**: Either kill PhysicsEngine and inline the 20 lines of spring-settle math that actually run, or restructure SMS to truly delegate momentum/snap to the engine (currently impossible because SMS's adaptive stepping contradicts the engine's continuous model).

### P-2: Extend Mode Has a Hidden 32ms Throttle

In `onDrag`, when `extendMode === 'extending'` and vertical scroll is happening, the overlay reposition is throttled at 32ms:

```typescript
if (nowExtend - this.lastOverlayAt > 32) {
```

The main drag path was fixed to 16ms, but the extend path wasn't caught. During extend+scroll (left thumb scrolls, right thumb extends), the highlight overlay lags behind at ~31fps while the editor scrolls at 60fps. This creates visible disconnect between where the selection IS and where the overlay SHOWS.

### P-3: Seven Mode Flags Create a Combinatorial Explosion

The onDrag handler has this branching structure:
1. Check `isActionPanelOpen || comboState !== 'idle'` → bail
2. Check sticky extend entry threshold → enter extendMode
3. If `extendMode === 'extending'` → extend path (return)
4. If `makerMode` → maker path (return)
5. If `holdNavigateMode` → glide path (return)
6. Default VROOM navigation

And onRelease:
1. If `extendMode` → finalize extend
2. If `makerMode` → interpret gesture/stamp
3. If `holdNavigateMode` → sync and exit
4. Quick flick detection → action/extend entry
5. Default inertia fling

If the user is in extend mode during a chunk focus inside maker mode... which path wins? The guards at the top prevent this, but the mental model is fragile. Each new feature adds another early-return branch, and the interaction graph becomes untraceable.

**The real cost**: Every conditional is a frame of latency for the common path. The happy path (normal VROOM drag) runs AFTER checking 4 other modes. On a 120Hz device, that's measurable.

### P-4: The Ball Communicates Position But Not Mode

The ball has exactly 3 visual states: default (gold), glide (cyan), extending (purple via `.ms3-ball--extending`), and maker (green via `.ms3-ball--maker`). These are toggled by `classList.add/remove`. Problems:

1. **No transition animation between modes** — the ball just snaps color. A rhythm game would morph: the ball should stretch, flash, or pulse differently as you ENTER a mode, not just sit there in a different color.
2. **Chunk mode has no ball color** — when you enter chunk overview or chunk focus, the ball stays gold. There's no physical feedback that you're in a different universe of navigation.
3. **Combo ring open but ball is still gold** — when the radial menu is up, the ball should dim or pulse to indicate "I'm waiting for your choice."

### P-5: Haptic Feedback is Fire-and-Forget

The HapticEngine has a global 12ms debounce that collapses rapid haptic sequences. During fast VROOM scrolling, the `roll` and `tick` haptics get merged into mush. During extend, boundary crossings fire `tick` with a 40ms throttle — but compound boundaries (bunsetsu+clause at the same offset) fire only the highest scope's haptic, losing the "layered texture" that makes Touhou grazes feel rich.

The audio fallback (for iOS WKWebView where `navigator.vibrate` doesn't exist) synthesizes sine waves at 2-4.5kHz. These are in the range of smoke alarms and will be annoying on any speaker. The frequencies should be sub-bass (30-80Hz for impact, 100-200Hz for ticks) or muted entirely on speakers.

### P-6: CSS Animations Fight the Unified RAF Loop

The combo tier CSS animations (`ms3-combo-fever-pulse` at 0.8s, `ms3-combo-trance-beam` at 0.5s) use `box-shadow` animation, which triggers paint on every frame. On iOS Safari, `box-shadow` is not hardware-composited; it forces CPU painting. For a feature meant to run during active chaining (when the user is doing rapid touch interactions), this is a paint-jank risk.

The TRANCE animation also references `var(--seg-x, 0)` and `var(--seg-y, 0)` in its transform, but these CSS custom properties are never set. The transform will always be `translate(0, 0)`, making the scale animation fight with the inline JS `transform` that positions the segment at its actual angle. Result: TRANCE segments will either not `scale(1.05)` or will jump to (0,0) during animation peaks.

---

## III. ARCHITECTURAL PROBLEMS

### A-1: The 5700-Line God Object

`SentenceMonkeyScroller` is 5700+ lines with 150+ private fields. It handles:
- DOM construction and lifecycle
- Gesture interpretation
- Physics and momentum
- 4 animation subsystems
- Editor integration (CM6 dispatch)
- Scope engine management
- Combo ring UI and logic
- Extend selection system
- Maker mode system
- Chunk navigation system
- Search panel
- Haptic feedback orchestration
- Zoom lane rendering
- Highlight overlay rendering
- Landing system
- Gesture cheat sheet
- Keyboard avoidance

This is a testability death sentence. No unit test can instantiate this. No refactor can touch one system without risking another. The field count means every method can reach into any other system's state, creating invisible coupling.

**Structural proposal**: Extract into composable interaction layers:
- `MonkeyPad` — ball physics, pad visuals, gesture dispatch
- `NavigationEngine` — VROOM stepping, inertia, scope management
- `ExtendController` — the danmaku cursor system
- `MakerController` — maker mode state machine
- `ComboRing` — radial menu UI and chain logic
- `ChunkNavigator` — chunk overview/focus system
- `ZoomLane` — the 5-item conveyor belt display
- `HighlightOverlay` — per-line segment rendering

### A-2: 30+ Timeout IDs as State

The class tracks `comboDecayId`, `comboCloseTimeoutId`, `isDraggingSafetyId`, `searchDebounceId`, `zoomComboDelayId`, `comboLabelHideId`, `layoutChangeDebounceId`, `landingHintTimeoutId`, `cheatSheetTimeoutId`, `extendHintTimeoutId`, `pulseRingTimeoutId`, `zoomLongPressId` — each a `ReturnType<typeof setTimeout>` that must be manually cleared. Missing a single `clearTimeout` in a race condition = stuck state.

The `unmount()` and `hide()` methods do a heroic job of clearing them, but the `onGlobalTouchCancel` → `onRelease(0,0,...)` recovery path doesn't clear `isDraggingSafetyId`. If iOS swipe-to-navigate fires touchcancel during a drag, the safety timeout still fires 5 seconds later and calls `springBallToCenter()` on an already-hidden scroller.

### A-3: Redundant View/Editor Lookups

`this.plugin.app.workspace.getActiveViewOfType(MarkdownView)` is called in:
- `moveCursorLive` (every drag frame)
- `showHighlightOverlay` (every drag frame)
- `updateExtendFromDrag` (every extend frame)
- `autoScrollExtendEdge` (every extend frame)
- `updateBeamPosition` (every extend frame)
- `scrollEditorDirect` (every glide frame)
- `startEditorInertia` (once per fling)
- `updateZoomLane` (every frame during drag)
- `teleportToCurrentUnit`
- etc.

This is O(n) workspace tab lookup per frame. The result is always the same MarkdownView within a single drag/extend session. Should be cached at `onDragStart` and invalidated at `onRelease`.

---

## IV. FEEL PROBLEMS — THE RHYTHM GAME GAP

### F-1: Auto-Glide Entry is Invisible Until Entered

The auto-glide system (physics-determined `holdNavigateMode`) accumulates speed and triggers when `autoGlideAccum > 40`. But the user gets zero feedback about how close they are to triggering glide. The ball stays gold, the counter stays the same, until suddenly — SNAP — they're in glide mode and the entire behavior changes.

In NieR Automata, mode transitions have anticipation: the character crouches before a dodge, the camera pulls back before a combo finisher. Auto-glide needs a **build-up indicator**: the ball could pulse faster, the ring could tighten, or the `vroomMomentum` meter could have a visual analog. When the threshold is 80% reached, the ball should already be halfway to cyan.

### F-2: Extend→VROOM Transition is Jarring

When extend mode ends (finger lifts), `stopExtendSelection()` is called, then `springBallToCenter()`. The ball snaps from "purple extending" to "gold idle" in one frame. There's no return animation. Compare to Sekiro: after a mikiri counter, the camera holds for 200ms in slow-mo before resuming. The extend exit needs a brief "seal the deal" moment — the beam overlay should fade (not vanish), the ball should morph color over ~150ms, and maybe the selection flash-pulses once to confirm it stuck.

### F-3: The Zoom Lane Doesn't React to Mode

The 5-item zoom lane renders identical HTML whether you're in VROOM, extend, maker, or chunk mode. In a rhythm game, the note highway changes appearance per section — Groove Coaster's rails transform, VOEZ's columns merge and split. The zoom lane should:
- **Extend mode**: Show anchor and head text, with the selection range highlighted in a different color
- **Chunk mode**: Show chunk titles, not sentence text
- **Maker mode**: Show stamped selections count and current brush range
- The `updateExtendZoomPreview` method exists but only fires during active extend drag — not on initial enter

### F-4: Combo Variety Bonus is Mechanically Interesting But Invisible

The new variety bonus (`isVariety ? 2 : 1`) rewards using different actions. But the user has no idea it happened. No visual, no haptic, no counter label. DMC shows "Stylish!" or "Savage!!" as a rank word. At minimum, when variety triggers, the combo counter should do a bigger bounce and maybe show a brief `妙` (myō = brilliant) flash.

### F-5: Inertia Brake Phase Has No Smooth Ramp

The brake curve in `tickInertia` uses two constants: `COAST_DECAY = 1.2` for coasting, `BRAKE_DECAY = 4.5` for braking. The transition is a hard switch at `speed < 120`. This creates a sudden feel change — one frame you're gliding smoothly, the next frame the deceleration quadruples. IIDX turntable braking is a continuous curve. Replace the binary decay with:

```typescript
const brakeFactor = Math.max(0, 1 - speed / BRAKE_THRESHOLD);
const decay = COAST_DECAY + (BRAKE_DECAY - COAST_DECAY) * brakeFactor * brakeFactor;
```

### F-6: Pioneer of Nothing — The ContextChunk Editor Problem

Original issue #8: "ContextChunk editor is just a search bar." The `showChunkListPanelRef` method creates a comprehensive panel with edit/split/merge controls and outline editing, but it's only accessible from the chunk panel button. There's no way to reach it from the combo ring or from natural flow. The chunk edit capabilities exist in code but are practically hidden.

---

## V. PERFORMANCE PROBLEMS

### Perf-1: `toDisplayText()` Runs 5 Regex Replacements Per Frame Per Zoom Item

`updateZoomLane` calls `toDisplayText` for 5 items every frame during drag. Each call runs 7 regex replacements. The 200-char cap helps, but regexes are compiled globally (good — they're cached) but still run `O(7n)` per call, 5 calls per frame = 35 regex operations per drag frame. At 120fps that's 4200 regex ops/second.

Fix: Cache the display text per unit. `SurfUnit` already has `text`. Add a `displayText` field computed once during `rebuildUnits`.

### Perf-2: `getActiveViewOfType(MarkdownView)` on Every Frame

As noted in A-3, this linear scan of workspace leaves happens dozens of times per second. Cache it.

### Perf-3: Highlight Overlay Creates DOM Elements Forever

`getOrCreateHighlightSeg` creates new elements up to the pool size of 30. But `hideExcessHighlightSegs` only sets `display: none`; it never removes elements. Over long sessions with varying selection sizes, the pool keeps growing. Each element is a positioned `<div>` on `document.body`. Not catastrophic, but the pool should be bounded more aggressively (a 5-line selection doesn't need 30 pooled elements).

### Perf-4: `coordsAtPos` Called Once Per Segment Line

In `renderHighlightSegments`, `coordsAtPos` is called twice per line (start and end). For a 20-line selection in extend mode, that's 40 `coordsAtPos` calls per overlay frame. CM6's `coordsAtPos` does a DOM measurement. Combined with the 16ms throttle, this is fine at 60fps but may stutter on low-end devices with large selections.

### Perf-5: No `will-change` on Combo Segments During Animation

The combo ring fly-in animation applies inline `transition` and `transform` to each segment element. But the elements don't have `will-change: transform` in CSS — they only get it during active hover. This means the initial fly-in animation forces the browser to promote 6 elements to composited layers mid-animation, causing jank on the first open.

---

## VI. CORRECTNESS PROBLEMS

### C-1: Scope Swipe `speedFactor` Can Go Below 0.6

The new speed-responsive threshold:
```typescript
const speedFactor = Math.max(0.6, 1.0 - (speed - 8) * 0.03);
```
At `speed = 50`, `speedFactor = 1.0 - 42 * 0.03 = -0.26`, clamped to 0.6. Fine. But at `speed = 21.3`, the factor is `0.6` — meaning the threshold is `28 * dprScale * 0.6 = 16.8px * dprScale`. On a 3x DPR device, that's `16.8 * 1.4 = 23.5px`. That's barely more than a touch jitter band. Users may accidentally trigger scope swipes during fast diagonal navigation.

The floor should be higher (0.7-0.75) or the speed onset should be later (speed > 15 instead of speed > 8).

### C-2: Combo Tier Computed But Not Updated Mid-Chain

`comboTier` is computed in `openComboRing` based on `comboTotalActions` at ring-open time. But during a chain, `comboTotalActions` increments in `executeComboSegment`, and the NEXT `openComboRing` call recalculates the tier. This means the CSS classes and counter styling change one beat LATE — the user hits their 5th action (entering FEVER), but the FEVER visuals only appear when the 6th chain ring opens. The tier should be recomputed after incrementing `comboTotalActions`, before the delay that opens the next chain ring.

### C-3: `comboLastActionType` Never Reset on Ring Open

`comboLastActionType` is only reset in the `!isChain` branch of `openComboRing`. If the user does: combo → bold → next-select → break combo → new combo → bold, the variety bonus triggers because `comboLastActionType` still contains `'next-select'` from the previous broken combo. The field should be reset on non-chain ring open (where `comboTotalActions` resets).

Wait — it IS reset there: `this.comboLastActionType = '';` in the `!isChain` block. Actually this is correct. Disregard.

### C-4: Extend Cached Content Stale After Edits

`extendCachedContent` is set at `startExtendSelection` and refreshed in `updateExtendFromDrag` only if null. If the user enters extend, triggers a combo action (bold/highlight) from extend's mikiri → combo ring → action executes → content changes → extend continues with stale cache → boundary crossings use wrong offsets → haptics fire at wrong positions. Low probability but real path.

### C-5: iOS `navigator.vibrate` Returns False Silently

On iOS Safari, `navigator.vibrate` exists as a no-op in some WebView contexts (returns false, doesn't throw). The `canVibrate()` check only tests for function existence, not for actual hardware support. The audio fallback never activates on these devices, leaving the user with zero haptic feedback and zero audio feedback.

---

## VII. MISSING FEATURES — WHAT THE PLUGIN WAS MEANT TO BE

### M-1: No Momentum Memory Across Sessions

The user's scroll behavior (average speed, preferred scope level, typical chain length) is never recorded. A rhythm game adapts: Groove Coaster adjusts note density, DMC remembers your style rank. The plugin should learn:
- Preferred scope level at file open → start there instead of always bunsetsu
- Average combo chain length → adjust decay timer to match user's rhythm
- Fast vs. slow reader → tune VROOM gains

### M-2: No Visual Representation of Document Structure

The zoom lane is a flat 5-item conveyor. There's no spatial awareness. The user doesn't know if they're 10% or 90% through the document. The `--ms3-doc-progress` CSS variable is set on the container but I see no visual that renders it (no progress bar, no color gradient, no ring fill). The counter shows `14/200 文節` but humans need SPATIAL progress, not numeric.

### M-3: No Gesture Recording or Replay

In action games, combo strings are recorded and can be replayed (training mode). The plugin should record successful chain sequences and offer "repeat last combo" as a one-gesture action. User does bold→next→bold→next for 10 items. Next time, offer a "macro replay" option in the combo ring.

### M-4: No Undo Stack for Multi-Action Combos

The Roman Cancel system (`undo-last`) only undoes the single last reversible action. A 10-chain of bold+highlight+cloze can't be unwound. Ctrl+Z exists, but the combo system should integrate with Obsidian's undo grouping so that an entire combo chain is one undo unit.

### M-5: No Offline/Background Processing of Scope Analysis

`rebuildUnits` calls `scopeEngine.analyze` synchronously on the main thread. For a 10,000-word document, `parseBunsetsu` runs a full regex tokenization of the cleaned text. This blocks the UI thread during `show()`. The analysis should be cached per-document (hash the content) and computed in a Web Worker if the document exceeds a threshold.

### M-6: No Inter-Plugin Communication

The plugin operates in isolation. It should expose an API that other plugins can use:
- "Navigate to unit containing offset X" (for integration with dictionary/Anki plugins)
- "Get current selection as SurfUnit" (for external actions)
- Current events: `onUnitChange`, `onModeChange`, `onComboComplete`

### M-7: No Adaptive Difficulty for the Combo System

The combo ring always shows the same segments at the same positions. A rhythm game scales difficulty: show fewer segments to beginners, add variety to experts. The combo system should:
- Start with 3 segments on first open, expand to 4, then 5, then 6 as the user chains more
- Rotate segment positions to prevent muscle-memory autopilot
- At TRANCE tier, segments could orbit slowly (Groove Coaster rotating notes)

---

## VIII. SMALL FIXES (LOW EFFORT, HIGH FEEL IMPACT)

### S-1: Fix the Extend Scroll Throttle
Change `32` to `16` in the extend+scroll overlay path (line ~1319).

### S-2: Add `will-change: transform` to `.ms3-combo-seg`
```css
.ms3-combo-seg { will-change: transform, opacity; }
```

### S-3: Cache `getActiveViewOfType` at Drag Start
```typescript
private cachedView: MarkdownView | null = null;
// In onDragStart:
this.cachedView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
// In onRelease:
this.cachedView = null;
```

### S-4: Pre-compute Display Text in `rebuildUnits`
```typescript
// In rebuildUnits, after building units:
for (const u of this.units) {
    (u as any)._display = this.toDisplayText(u.text);
}
```
Then use `(unit as any)._display` in `updateZoomLane`.

### S-5: Smooth the Inertia Brake Curve
Replace the binary coast/brake with a continuous exponential blend.

### S-6: Add Auto-Glide Build-Up Visual
Interpolate ball color from gold→cyan based on `autoGlideAccum / 40`.

### S-7: Fix TRANCE CSS Animation Transform Conflict
Remove `transform` from the `@keyframes ms3-combo-trance-beam` or ensure `--seg-x/--seg-y` are set as inline CSS custom properties on each segment during combo ring positioning.

### S-8: Reset `comboTier` Immediately After Incrementing `comboTotalActions`
Move the tier computation from `openComboRing` to `executeComboSegment`, right after `this.comboTotalActions++`.

---

## IX. THE VERDICT

The plugin's **vision** is extraordinary. No one has attempted to build a JP rhythm-action game text editor before. The scope engine's 4-level bunsetsu analysis is genuinely novel for an Obsidian plugin. The extend system's "information, not control" design philosophy is deeply considered. The combo chain system is mechanically rich.

The **execution** is 70% there. The critical missing piece is not more features — it's **coherence**. Every subsystem was built with passionate craft but they don't compose into a unified feel. When you're in VROOM and flick right, you enter extend. When you're in extend and tap, you mikiri. When you're in chunk overview and swipe left, you focus. Each transition works, but they feel like teleporting between rooms rather than flowing through a continuous space.

**The one change that would transform everything**: Replace the 7 boolean mode flags with a single state machine that defines legal transitions and automatically applies ball color, badge, zoom lane content, and gesture interpretation:

```
     VROOM ←→ GLIDE (velocity-driven, seamless)
       ↓↑         
     EXTEND ←→ MIKIRI SNAP (tap toggles precision)
       ↓↑
     COMBO RING → CHAIN → FEVER → TRANCE (natural escalation)
       ↓
     MAKER (entered from combo ring only)
       ↓
     CHUNK OVERVIEW ←→ CHUNK FOCUS (scope swipe)
```

Each state owns: ball color, zoom lane content, gesture semantics, legal exit transitions, enter animation, exit animation. The god object becomes a state machine dispatcher.

This is the difference between a collection of great parts and a great instrument.

---

*"The expert martial artist doesn't think 'now I will use this stance.' The stances flow into each other because the body knows the transitions. Make the software know its transitions."*
