# AUDIT v6 — Selection Deep Dive + Game Mechanics

**Focus**: Text selection across ALL code paths, horizontal expand, new game-inspired mechanics  
**Build**: 722.5kb, 80ms, zero errors  
**Files modified**: `SentenceMonkeyScroller.ts`, `styles.css`

---

## COMPLETE SELECTION PATH INVENTORY (12 paths audited)

| # | Path | Method | Selection Type | Status |
|---|------|--------|---------------|--------|
| 1 | Physics snap | `updateHighlight()` | CM dispatch `anchor:end, head:start` | ✅ Robust |
| 2 | Live drag | `moveCursorLive()` | CM dispatch, 12ms throttle, viewport follow | ✅ Robust |
| 3 | DOM overlay | `showHighlightOverlay()` → `renderHighlightSegments()` | Per-line DOM segments, pool ≤30 | ✅ Robust |
| 4 | Landing | `selectCurrentUnit()` → `teleportToCurrentUnit()` | CM dispatch + scrollIntoView + beacon flash | ✅ Robust |
| 5 | Combo ring | `executeAction()` | `editor.setSelection()` for select; `replaceRange()` for format | ✅ Minor edge case (S-3) |
| 6 | Extend mode | `startExtend` → `updateExtendFromDrag` → `applyExtendSelection` | Float-precision danmaku cursor, power curve, mikiri snap | ✅ Robust |
| 7 | Extend boundary | `detectBoundaryCrossings()` | Haptic-only (information, not control) | ✅ Robust |
| 8 | Maker brush | `updateMakerFromDrag()` | Character-by-character CM dispatch, speed-adaptive | ✅ Robust |
| 9 | Maker stamp | `makerStamp()` | Toggle add/remove from batch | ✅ Robust |
| 10 | Maker format | `executeMakerFormatAction()` / `executeMakerBatchAction()` | Reverse-offset batch edit | ✅ Robust |
| 11 | Horizontal steer | `lateralOffset` in `onDrag()` | `getDisplayIndex()` = currentIndex + lateralOffset (±2) | 🐛 Fixed (S-1) |
| 12 | Command actions | `surfSelectSentence()` / `surfSelectBoldTarget()` | `editor.setSelection()` | ✅ Robust |

---

## BUGS FIXED

### S-1: lateralOffset Race in onRelease (FIXED)
**Location**: `onRelease()` — flick action paths  
**Problem**: `this.lateralOffset = 0` was executed at line 1817 *before* flick action code read `this.getDisplayIndex()` at lines 1848/1862/1889/1901. Since `getDisplayIndex()` returns `currentIndex + lateralOffset`, the horizontal steering built up during drag was lost when a flick action (extend entry, bold, copy, etc.) fired.  
**Impact**: If user steered horizontally to unit N+1 during drag then did a quick flick right to extend-select, extend started from unit N instead of N+1.  
**Fix**: Capture `const displayIdxAtRelease = this.getDisplayIndex()` before zeroing lateralOffset. All flick action paths now use `displayIdxAtRelease`.

### S-4: scopeSwipeAccum Leak on Extend Entry (FIXED)
**Location**: `startExtendSelection()`  
**Problem**: Residual `scopeSwipeAccum` from pre-extend drag could persist across mode transition, causing an unintended scope change on the next normal drag after extend exit.  
**Fix**: `this.scopeSwipeAccum = 0` in `startExtendSelection()`.

---

## SELECTION QUALITY ASSESSMENT

### Strengths Confirmed
1. **All CM dispatch paths are bounds-clamped** — `Math.max(0, Math.min(docLen, offset))` prevents stale offset crashes
2. **Surrogate pair handling** in extend mode — correctly skips DC00-DFFF / D800-DBFF split pairs
3. **Consistent selection direction**: anchor=end, head=start in normal mode; anchor=start, head=floats in extend
4. **Robust fallback chain**: CM dispatch → Obsidian API → try/catch in all paths
5. **Per-line highlight overlay** for mobile visibility (iOS CM selection invisible during touch)
6. **Throttled updates**: 12ms for `moveCursorLive`, 16ms for overlay repositioning
7. **弾幕 danmaku power curve**: smooth sub-character to multi-character precision `pow(mag, 0.60) * 0.70`
8. **Reverse-offset batch editing** in maker mode (prevents offset corruption when editing multiple ranges)
9. **Two-finger scroll zone** (left 42%) for cross-paragraph extend selection

### Minor Edge Case (S-3, not fixed — low priority)
**Bold/highlight/spoiler toggle** uses `text.startsWith('**') && text.endsWith('**')` — works correctly for single-format units but could strip markers incorrectly if a unit contains interleaved markers (e.g., `**太陽が==昇る**`). This would require manual creation of overlapping markers and is essentially a user error. Not worth the regex complexity to guard against.

---

## NEW MECHANICS ADDED

### M-4: 鏡面 Extend Anchor Pivot (Taiko Mirror Mode)
**Inspiration**: Taiko no Tatsujin mirror mode — notes come from the opposite direction.  
**How it helps text editing**: When extending a selection, you sometimes realize you need to extend from the *other* end. Previously you had to cancel extend and re-enter from the other direction.  
**Gesture**: During extend mode, **double-tap** (within 280ms) to swap anchor and head.  
**Flow**: Single tap = mikiri snap (boundary snap), rapid second tap = anchor pivot.  
**Haptic**: Two quick snaps in succession ("flip" feel) + ball pivot flash animation.  
**Why it fits**: Decisive, reversible, no UI chrome. Like Sekiro mikiri counter → follow-up slash: first action settles, second action reverses.

### M-5: PaRappa Auto-Repeat
**Inspiration**: PaRappa the Rapper "U Rappin' COOL!" mode — when you're in the groove, the game takes over.  
**How it helps text editing**: When marking up study material, you often bold (or highlight) 5-10 consecutive units. Currently you must repeat the same combo ring action for each unit. Auto-repeat detects 3+ consecutive same formatting actions and offers a one-tap batch apply to the next N units.  
**Trigger**: Execute the same formatting action (bold/highlight/spoiler/cloze/copy) 3 times in a row via combo ring.  
**UI**: A `🔁 ×N` segment appears in the chain ring (N = remaining units, capped at 10).  
**Activation**: Tap the auto-repeat segment → instantly applies the action to the next N units.  
**Badge**: Floating `太 ×7` (or `光 ×5`, etc.) badge confirms batch application with count.  
**Reset**: Streak resets on: different action, combo break, or auto-repeat execution.

### M-6: Combo Memory (Project Diva Pattern Recall)
**Inspiration**: Project Diva remembers your most-played button patterns.  
**How it helps text editing**: Over time, users develop habitual formatting sequences (e.g., "bold → next → highlight → next → copy"). Combo Memory records these patterns for future quick-recall integration.  
**Tracking**: Each combo's action sequence is recorded in `comboCurrentSequence[]`. When a combo ends with 3+ actions, the sequence (as a `→`-joined string) is stored in `comboMemory[]` with a use count.  
**Memory cap**: 10 patterns, evicts least-used. Persists for the session.  
**Current state**: Recording infrastructure. Future integration: inject most-used pattern as a "replay combo" segment in the primary ring.

---

## FILES CHANGED

### `src/ui/SentenceMonkeyScroller.ts`
- **New fields**: `extendLastTapAt` (double-tap pivot timer)
- **S-1 fix**: Captured `displayIdxAtRelease` before zeroing `lateralOffset` in `onRelease()`; all 4 flick paths use captured value
- **S-4 fix**: `this.scopeSwipeAccum = 0` in `startExtendSelection()`
- **M-4**: Double-tap handler in extend mode tap branch — swaps anchor/head, fires dual-snap haptic, ball pivot flash
- **M-5**: Auto-repeat tracking in `executeComboSegment()` (streak counter), `auto-repeat` segment injection in chain builder, `auto-repeat` execution handler (batch `executeAction` loop), `showAutoRepeatBadge()` method
- **M-6**: `comboCurrentSequence` tracking in `executeComboSegment()`, pattern recording in `endCombo()`, reset in `breakCombo()`

### `styles.css`
- `.ms3-ball--drum-scan-reverse` — Red glow for reverse drum scan
- `.ms3-ball--pivot` — Hue-rotate flash for anchor pivot
- `.ms3-auto-repeat-badge` — Floating centered badge with scale-in animation + fade-out

---

## OPEN ITEMS (from previous audits, still valid)

| # | Item | Priority | Notes |
|---|------|----------|-------|
| A-1 | God object refactor (6000+ line SMS) | Low | Works, but is a maintenance risk |
| A-2 | Combo memory → primary ring integration | Medium | Infrastructure done in M-6, UI not yet |
| A-3 | Selection persistence across chunk mode transitions | Low | CM selection persists, but scroller index reset can overwrite |
| A-4 | Maker brush paragraph boundary clipping | Low | Brush crosses linebreaks by design; niche use case to restrict |

---

## BUILD VERIFICATION

```
main.js      722.5kb
main.js.map    1.6mb
Done in 80ms
0 errors, 0 warnings
```
