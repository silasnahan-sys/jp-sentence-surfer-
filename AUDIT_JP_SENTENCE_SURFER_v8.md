# AUDIT — JP Sentence Surfer v8

> Continuation of v7 audit. Full 6360-line SMS re-read + all source files.  
> Focus: real bugs found via systematic analysis, novel JP game mechanics from
> Crypt of the NecroDancer, Hi-Fi Rush, Thumper, and Sayonara Wild Hearts.

---

## Previously Addressed (v7)

| ID | Issue | Status |
|----|-------|--------|
| S-5 | Combo memory/auto-repeat code block misplacement | ✅ Fixed (moved outside chain branch) |
| S-6 | contentFingerprint stride misses single-char edits | ✅ Fixed (XOR head/tail/mid windows) |
| S-7 | Chunk boundary re-rendering on every scroll frame | ✅ Fixed (rAF-gated element pooling) |
| S-8 | parseFallback indexOf wrong duplicate line | ✅ Fixed (accumulate line lengths) |
| S-9 | cheatSheetSeenCount resets on reload | ✅ Fixed (persist to localStorage) |
| S-10| buildCleanText callout regex misses foldable formats | ✅ Fixed (expanded regex) |
| S-11| Opening brackets not treated as bunsetsu boundaries | ✅ Fixed (flush before opening bracket) |
| I-1 | CLAUSE_CLOSERS ambiguous single-char entries | ✅ Mitigated (min-size guard) |
| I-2 | displayTextCache oscillates between 0-500 | ✅ Fixed (half-eviction) |
| I-3 | Extend edge auto-scroll ignores pad height | ✅ Fixed (pad-aware bottom threshold) |

---

## Bug Fixes — v8

---

### B-7  Auto-Repeat Injection Nested Inside Undo Guard  ★★★ BUG

**File:** `SentenceMonkeyScroller.ts` ~L4278-4296  
**Severity:** Medium — PaRappa auto-repeat never offered when `comboLastReversibleAction` is null

The PaRappa auto-repeat injection `if` block was physically nested INSIDE the undo-last injection `if (this.comboLastReversibleAction && chainSegs.length < 6)` block. This meant:
- After using undo (which nullifies `comboLastReversibleAction`), auto-repeat was never injected
- After non-reversible chain actions, auto-repeat was never offered
- The features were logically independent but syntactically coupled

**Fix:** Extracted the auto-repeat block as a sibling of the undo block, each guarded independently. Auto-repeat now works regardless of undo availability.

---

### B-9  Chunk Boundary Scroll Listener Detaches From Wrong View  ★★ LEAK

**File:** `SentenceMonkeyScroller.ts` — `clearChunkBoundaries()`  
**Severity:** Medium — event listener leak when user switches files during chunk mode

`clearChunkBoundaries()` called `getActiveViewOfType(MarkdownView)` to get the scrollDOM for `removeEventListener`. If the user had switched to a different file since the listener was attached, this returned a different view's scrollDOM — leaving the original listener orphaned.

**Fix:** Added `chunkBoundaryScrollDom` field to store the exact scrollDOM at attach time. Detach always uses this stored reference.

---

### B-11  Maker Scroll Listener Detaches From Wrong View  ★★ LEAK

**File:** `SentenceMonkeyScroller.ts` — `exitMakerMode()`  
**Severity:** Medium — identical pattern to B-9 for maker mode stamps

Same issue: `exitMakerMode()` used `getActiveViewOfType(MarkdownView)` to find the scrollDOM, which could differ from the one the listener was attached to.

**Fix:** Added `makerScrollDom` field. Stores the scrollDOM at `enterMakerMode()`, detaches from it in `exitMakerMode()`.

---

## New Features — v8

---

### F-1  Thumper Boundary Brace — Structural Resistance  ★★★

**Inspiration:** Thumper (2016) — "rhythm violence" where the beetle must brace against walls at track turns. The physical resistance communicates structure.

**Concept:** When VROOM navigation crosses a chunk (paragraph/heading) boundary, the next 2 steps require 40% more drag force. This creates a tactile "wall" sensation at document structure boundaries. You feel where sections change through your thumb.

**Why this isn't a gimmick:** The core problem it solves is spatial disorientation during fast scrolling. Users lose track of where they are in a document when VROOM moves too fluidly. The boundary brace gives structural landmarks through the haptic/physics channel without adding visual noise.

**Implementation:**
- `vroomBraceSteps` (int): decrements from 2 → 0 after each step
- `vroomBraceMultiplier` (float): 1.4 during brace, 1.0 otherwise
- Activated in `checkChunkBoundaryCrossing()` when crossing between chunks
- Applied in the adaptive step threshold calculation in `onDrag()`
- Pairs naturally with the existing chunk boundary haptic (`snap`)

**Fields:** `vroomBraceSteps`, `vroomBraceMultiplier`

---

### F-2  Mode Flash Labels — Instant Orientation  ★★★

**Inspiration:** Sayonara Wild Hearts × WarioWare — one-word labels flash during genre/mode switches for instant comprehension without breaking flow.

**Concept:** When mode auto-transitions happen (extend entry, auto-glide engage, maker mode entry, chunk overview/focus), a brief JP kanji label flashes above the ball: 「拡張」「航行」「筆」「区」「集」. Fades after 500ms.

**Why this isn't a gimmick:** The plugin has 6+ distinct interaction modes (VROOM, precision, extend, maker, chunk overview, chunk focus). New users (and even power users after a break) need instant feedback on which mode they're in. A single kanji read in 100ms communicates what would otherwise require a mental model.

**Implementation:**
- `showModeFlash(label: string)` — creates a positioned `div.ms3-mode-flash` in the container
- CSS transitions: scale 0.7→1.0 on entry, scale→1.15 + fade on exit
- Called from: `startExtendSelection()`, auto-glide trigger, `enterMakerMode()`, `enterChunkOverview()`, `enterChunkFocus()`
- Self-cleaning: removes DOM element after animation completes
- Properly cleared in `unmount()` and `hide()`

**Fields:** `modeFlashEl`, `modeFlashTimeoutId`

---

### F-3  NecroDancer Streak Momentum — Navigation Flow Reward  ★★

**Inspiration:** Crypt of the NecroDancer — unbroken movement streaks on the beat give coin multipliers. Maintaining the streak is rewarding; breaking it is noticeable but not punishing.

**Concept:** Continuous VROOM navigation through 5+ units without pausing (>600ms gap) builds a streak that reduces the step threshold by up to 15%. A subtle badge shows the streak count. Breaking the streak (pausing) resets friction to baseline.

**Why this isn't a gimmick:** When reviewing/scanning text (especially YT transcripts), users develop a rhythm of scanning unit by unit. The streak reward makes this flow state more fluid — the longer you maintain rhythm, the less physical effort per step. This directly serves the scan-and-format workflow.

**Implementation:**
- `vroomStreakCount` tracks consecutive steps (reset when gap > 600ms)
- Streak bonus: `stepThreshold *= (1 - Math.min(0.15, (count - 5) * 0.025))`
- `updateStreakBadge()` shows/hides a positioned badge with ⚡ indicators (1-3 bolts)
- Streak resets checked in `onDragStart()` gate
- Badge cleaned up in `unmount()`

**Fields:** `vroomStreakCount`, `vroomLastStepAt`, `vroomStreakBadgeEl`

---

### F-4  Hi-Fi Rush Format Invite — Call-and-Response  ★★

**Inspiration:** Hi-Fi Rush — environment and enemies move to the beat; actions auto-sync but timing-aligned actions get enhanced feedback. The world responds to you.

**Concept:** After a combo format action (bold/highlight/spoiler/cloze) auto-advances to the next unit, the zoom lane's next item briefly pulses with a purple glow. This is a visual "call-and-response" — the plugin formatted one unit, now it's inviting you to format the next. Creates a natural rhythm for batch formatting.

**Why this isn't a gimmick:** The core batch-formatting workflow is: combo ring → format → auto-advance → format again. The format invite bridges the cognitive gap between "I formatted that one" and "should I do the next one?" A subtle glow answers "yes, this one's ready" without any text or menu.

**Implementation:**
- `showFormatInvite()` — adds `ms3-zoom-invite` class to `zoomNextEl`
- CSS `@keyframes ms3-invite-pulse`: box-shadow glow 0→peak→0 over 800ms
- Called in the `FORMAT_ADVANCE_SET` auto-advance block of `executeComboSegment()`
- Timeout-cleaned: removes class after 800ms
- `formatInviteTimeoutId` cleared in `unmount()`

---

## Architectural Notes

### Timeout Audit

All 12 tracked timeout IDs have verified cleanup paths:

| Timeout ID | Cleared in unmount() | Cleared in hide() | Via |
|------------|---------------------|--------------------|-----|
| `cheatSheetTimeoutId` | ✅ | ✅ | `hideGestureCheatSheet()` |
| `landingHintTimeoutId` | ✅ (direct) | ✅ | `cancelLandingHint()` |
| `zoomLongPressId` | ✅ | ✅ | `clearZoomLongPress()` |
| `comboDecayId` | ✅ | ✅ | `cancelComboDecay()` |
| `comboCloseTimeoutId` | ✅ (direct) | ✅ (direct) | — |
| `pulseRingTimeoutId` | ✅ (direct) | — | — |
| `extendHintTimeoutId` | ✅ | ✅ | `hideExtendHint()` |
| `searchDebounceId` | ✅ | ✅ | `closeSearch()` |
| `zoomComboDelayId` | ✅ (direct) | — | — |
| `comboLabelHideId` | ✅ (direct) | — | — |
| `layoutChangeDebounceId` | ✅ (direct) | — | — |
| `isDraggingSafetyId` | ✅ (direct) | ✅ (direct) | — |
| `formatInviteTimeoutId` | ✅ (direct) | — | NEW |
| `modeFlashTimeoutId` | ✅ (direct) | — | NEW |

~30 fire-and-forget `setTimeout` calls exist for cosmetic animations (CSS class removal, haptic delays). These are safe: they use optional chaining on DOM refs and have no side effects if the element is already removed.

### Scroll Listener Ref Integrity (B-9/B-11)

Both `chunkBoundaryScrollListener` and `makerScrollListener` now store their target `scrollDOM` at attach time. This prevents the stale-view bug where `getActiveViewOfType()` returns a different editor after file switches.

### Open Items (Low Priority, Carried from v7)

| ID | Issue | Priority |
|----|-------|----------|
| A-1 | God object refactor (SMS is 6400+ lines) | Low |
| A-2 | Combo memory → ring integration (suggest memorized patterns) | Medium |
| A-3 | Selection persistence across chunk transitions | Low |
| A-4 | Maker brush paragraph boundary handling | Low |

---

## Game Mechanics Research — New Games Analyzed

### Crypt of the NecroDancer
- **Beat-gated movement**: player moves/attacks on music beat. Off-beat actions fail.
- **Coin multiplier from unbroken streaks**: maintaining rhythm builds multiplier.
- **Applied:** F-3 (Streak Momentum) — sustained navigation builds friction reduction.

### Hi-Fi Rush
- **Environment rhythm sync**: enemies, protagonist, and environment all move to the beat.
- **Auto-sync with precision reward**: attacks always work but timing-aligned hits deal more damage.
- **Call-and-response minigames**: player reacts to audio/visual cues in sequence.
- **Applied:** F-4 (Format Invite) — post-format glow invites continuing the rhythm.

### Thumper
- **Single-track "rhythm violence"**: beetle races on a track, braces against walls, turns at corners.
- **Escalating time signatures**: each level uses a time signature matching the level number.
- **Physical resistance at track features**: walls/turns require specific inputs to survive.
- **Applied:** F-1 (Boundary Brace) — structural resistance at chunk boundaries.

### Sayonara Wild Hearts
- **"Pop album video game"**: genre-switching between rail shooter, motorcycle chase, swordfight.
- **Minimal controls**: movement + single action button, context determines meaning.
- **Aesthetic escalation**: visual intensity grows through the album's arc.
- **Applied:** F-2 (Mode Flash Labels) — instant one-word orientation on mode transitions.

---

## Summary of Implemented Changes

| ID | Type | Description |
|----|------|-------------|
| B-7 | Bug fix | Extract auto-repeat injection out of undo guard (independent sibling) |
| B-9 | Bug fix | Store scrollDOM ref for chunk boundary listener (prevent stale-view leak) |
| B-11| Bug fix | Store scrollDOM ref for maker scroll listener (prevent stale-view leak) |
| F-1 | Feature | Thumper Boundary Brace — 40% step resistance at chunk boundaries |
| F-2 | Feature | Mode Flash Labels — brief JP kanji on mode transitions |
| F-3 | Feature | NecroDancer Streak Momentum — up to 15% friction reduction during sustained VROOM |
| F-4 | Feature | Hi-Fi Rush Format Invite — zoom lane glow after combo format auto-advance |
