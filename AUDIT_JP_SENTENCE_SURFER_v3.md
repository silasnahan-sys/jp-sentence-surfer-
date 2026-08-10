# Audit v3 — JP Sentence Surfer: Identity + Technical

_"Is it really being the plugin I set it out to be?"_

---

## Part 1: The Identity Question

### What the README says it is

> A mobile-first Japanese **bunsetsu (文節) phrase surfing** plugin for Obsidian.
> Navigate, select, and create cloze cards from phrase-level Japanese text chunks
> using a TinySegmenter-powered morpheme tokenizer and an 8-tier bunsetsu grouper.

The README's architecture table lists 7 files: tiny-segmenter, bunsetsu-grouper,
jp-sentence-parser, actions, ytranscript, constants, types. Clean, focused, beautiful.

### What the codebase actually is

| Layer | Lines | % of total |
|---|---|---|
| SentenceMonkeyScroller.ts | 4,994 | 51% |
| All other UI (Physics, Gesture, Haptics, Toolbar, Highlighter) | 994 | 10% |
| ScopeEngine | 470 | 5% |
| Settings | 370 | 4% |
| Linguistic engine (parser + grouper + segmenter + constants) | 785 | 8% |
| Core plugin logic (main + actions + types + cloze + ytranscript + state) | 590 | 6% |
| styles.css | 1,687 | 17% |
| **Total** | **~9,890** | |

The linguistic engine — the entire reason this plugin exists — is **8% of the codebase**.
SentenceMonkeyScroller alone is **51%**. The UI layer total (SMS + Physics + Gesture +
Haptics + Toolbar + Highlighter + ScopeEngine + Settings + CSS) is **87%**.

### The honest answer

The plugin has two products living inside one repository:

1. **JP Sentence Surfer** — a clean, functioning bunsetsu navigation plugin with 7
   commands, a floating toolbar, and a sentence highlighter. This is 1,375 lines.
   It works. It matches the README. It does what it says on the tin.

2. **Monkey Scroller** — a 6,500-line rhythm-game-inspired trackball touch interface
   with VROOM physics, a combo ring system (osu! × Persona 5 × DMC × Monster Hunter),
   extend-selection with Danmaku-cursor semantics, Maker Mode (Mario Maker × Okami 
   brush strokes), a ContextChunkScroller with Gravity Rush-themed transitions, 4-level
   scope graduation via pinch-to-zoom, inertia with IIDX turntable braking, landing
   hints with Sekiro references, a search panel, gesture cheat sheets in Japanese, and
   28 game design references in the comments.

Product 2 is extraordinary engineering. But it is not bunsetsu surfing. It is a mobile
touch interaction framework that _consumes_ bunsetsu data as input. The linguistic engine
could be replaced with any unit-producing parser and SMS would work identically.

**The plugin you set out to build is alive and working inside `actions.ts` + 
`bunsetsu-grouper.ts` + `jp-sentence-parser.ts`. The other 87% is a different project.**

---

## Part 2: Critical Bugs

### C-1: `getCmView()` is infinite recursion — ENTIRE SCROLLER IS BROKEN

```typescript
// Line 2604-2606
private getCmView(editor: Editor): any {
    return this.getCmView(editor) ?? null;  // ← calls ITSELF
}
```

This was introduced during audit v2's "centralized getCmView helper" fix (S-4). The
method was supposed to replace `(editor as any).cm` but was written to call itself.

**Every** SMS operation that touches CodeMirror (drag, release, extend, maker, combo,
teleport, highlight overlay, inertia scroll) calls this method. On any invocation it will
hit `Maximum call stack size exceeded` and crash.

There are **14 call sites** throughout SMS that depend on this method.

**Impact**: The Monkey Scroller cannot function at all. Every touch interaction that
needs to read/write the editor will throw an unrecoverable stack overflow.

**Fix**: `return (editor as any).cm ?? null;`

### C-2: SentenceHighlighter discards parsed bounds (carried from v2 H-2)

SentenceHighlighter parses sentences via `parseSentences()` + `findSentenceAt()` to get
a `ParsedSentence` with `.start` and `.end`, then does nothing with those offsets for
actual highlighting. The cursor-tracking highlight uses `this.lastOffset` comparison only.
The `editorEl` variable on line 70 is assigned but the file ends before any highlight
DOM work happens.

This isn't a crash, but it means the "highlight current sentence" feature is effectively
a no-op — it runs the parser on every cursor move (wasting cycles) but produces no
visible output.

---

## Part 3: Structural Issues

### S-1: 5,000-line monolith

SentenceMonkeyScroller contains:
- VROOM trackball physics integration
- Touch gesture routing
- Combo ring (radial action menu) with chain/graduation system
- Extend-selection (Danmaku cursor) with mikiri snap
- Maker Mode (Mario Maker brush) with angle-based gesture detection
- ContextChunkScroller with overview/focus modes
- Scope graduation with pinch-to-zoom
- Editor inertia with IIDX brake curve
- Landing hints and cheat sheet system
- Search panel with iOS keyboard repositioning
- Zoom lane (osu! note highway) with parallax
- Ball free-roam physics (gravity + wall bounce)
- Highlight overlay management
- Unit rebuild + content hashing

Each of these is a distinct system. They interact through shared mutable state
(~100 instance fields). The file cannot be unit tested, profiled section-by-section,
or reasoned about by anyone (including you in 3 months).

### S-2: The README is a lie

The architecture table doesn't mention:
- SentenceMonkeyScroller (51% of the code)
- PhysicsEngine, GestureHandler, HapticEngine
- FloatingToolbar, SentenceHighlighter
- ScopeEngine (the 4-level scope system)
- styles.css (1,687 lines)

A new contributor (or your future self) reading the README would think this is a
785-line parser with some command bindings. The actual plugin is 10x larger and
architecturally different from what's described.

### S-3: `state.ts` is dead weight

`state.ts` is 18 lines. It builds a `PluginState` with `activeRegex`, `useBoldBoundaries`,
and `stripTimestamps`. But `main.ts` doesn't call `buildState()`. SMS doesn't reference it.
Actions.ts uses `this.plugin.settings` directly. The file serves no purpose.

### S-4: Duplicate action definitions

`DEFAULT_ACTIONS` (line 70) defines an ActionSlot[] for the legacy action panel.
`PRESET_ACTIONS` (line 24) defines ComboSegment[] for the combo ring.
`CHAIN_AFTER_SELECT/EDIT/COPY/NEXT` define chain rings.

These are 4 separate representations of partially overlapping action sets with no shared
source of truth. Adding a new action requires editing all of them.

### S-5: Settings sprawl

`JpSentenceSurferSettings` in types.ts mixes core plugin settings with SMS-specific UI
tuning. The settings tab exposes ~22 options. For a plugin that the README describes as
"7 commands + a floating toolbar", that's a 3:1 settings-to-command ratio.

---

## Part 4: Technical Issues

### T-1: Multiple concurrent RAF loops

At peak activity, SMS can have 5+ simultaneous `requestAnimationFrame` loops:
- `startIdleAnim()` — 30fps idle visuals
- `springBallToCenter()` — ball free-roam physics
- `startZoomBounce()` — zoom lane bounce decay
- `startEditorInertia()` — editor scroll inertia
- `PhysicsEngine.tick()` — 250Hz sub-stepped spring-damper

On mobile (where battery is precious), these compound. The idle animation alone runs
continuously while the scroller is visible, even when the user is reading and not
touching anything.

### T-2: Maker Mode stamps don't survive scroll

`renderMakerStamps()` positions stamp overlays using absolute screen coordinates
from `coordsAtPos()`. If the user scrolls the editor (including via the maker's
own precise-scroll feature), stamps drift out of alignment. There's no scroll listener
to reposition them.

### T-3: Content hash is collision-prone for mid-document edits

```typescript
const mid = content.length > 192 ? content.slice(content.length >> 1, (content.length >> 1) + 64) : '';
this.lastContentHash = String(content.length) + ':' + content.slice(0, 64) + mid + content.slice(-64);
```

This samples 192 characters total. A document edit that leaves head/mid/tail unchanged
(e.g., adding a sentence at the 25% or 75% mark of a long document) won't trigger
`rebuildUnits()`. The units will be stale until a scrolling operation happens to
call `getFreshUnit()` with its own (even weaker) hash:

```typescript
const hash = String(content.length) + ':' + content.slice(0, 64) + content.slice(-64);
```

(`getFreshUnit` doesn't include the mid sample at all.)

### T-4: `buildCleanText()` is O(n) per regex match

The `buildCleanText()` function in jp-sentence-parser.ts uses multiple `rawText.substring(i).match()`
calls inside a character-by-character loop. Each `.match()` creates a substring and runs
the regex from position 0. For a 10,000-char document, this is potentially thousands of
substring allocations. Not a correctness bug but notable on mobile.

### T-5: Search is unbounded linear scan

`executeSearch()` scans all units with `.toLowerCase().includes(query)`. For a document
with 500+ units at bunsetsu scope, this is fine. But combined with the 80ms debounce and
`toDisplayText()` regex processing per unit, it can produce stutter on low-end phones.

### T-6: extendCachedContent timing window (carried from v2)

`startExtendSelection()` caches `editor.getValue()` once. If the user has a
background sync plugin (Obsidian Sync, Git) that modifies the file during extend,
the cached offsets become stale. Extend will silently select wrong text.

---

## Part 5: What's Actually Good

The linguistic stack is **excellent**:

- **bunsetsu-grouper.ts** — The 8-tier boundary system is linguistically sound. The tier
  ordering (hard stops → whitespace → particles → verb endings → てる → に → compound は/も → たいな)
  reflects real Japanese phrase structure. The に-compound continuation check
  (について, にたいして, etc.) is a nice touch.

- **scope-engine.ts** — The 4-level hierarchy (bunsetsu → ren-bunsetsu → clause → sentence)
  with grammatical dependency merging for level 1 and conjunctive-particle clause detection
  for level 2 is well-designed. Binary search for unit lookup. Clean separation.

- **buildCleanText()** — Comprehensive noise stripping (timestamps, annotations, markdown
  images, bare URLs, blockquote prefixes, Obsidian callout markers) with a position map
  that preserves offset fidelity back to the raw document. This is genuinely hard to do
  right and it's done right.

- **YTranscript pipeline** — The transcript detection + sentence stitching + timestamp
  stripping chain handles real-world YouTube transcript markup gracefully.

The **game design vision** in SMS is also genuinely creative:
- The VROOM trackball physics feel great in concept
- The combo ring chain system (osu! approach circles → Persona 5 radial → DMC chains)
  is a novel interaction model
- The extend-selection "information not control" principle (boundaries are haptic bumps,
  not magnets) is thoughtful interaction design
- The scope graduation via pinch is a natural gesture mapping

The problem isn't quality — it's scope.

---

## Part 6: Recommendations

### If the goal is "a bunsetsu surfing plugin"

1. Extract SMS into a separate plugin (`jp-monkey-scroller` or `jp-rhythm-navigator`)
2. Keep the core plugin as-is: 7 commands, floating toolbar, sentence highlighter
3. Both plugins share the linguistic engine via a shared npm package or git submodule
4. Update the README to match reality

### If the goal is "the rhythm game touch interface"

1. Rename the plugin to match what it is (not "sentence surfer")
2. Rewrite the README to describe the actual product
3. Extract SMS subsystems into separate files:
   - `ExtendMode.ts` (~300 lines)
   - `MakerMode.ts` (~400 lines)
   - `ComboRingSystem.ts` (~500 lines)
   - `ChunkScroller.ts` (~300 lines)
   - `VroomTrackball.ts` (the drag/release/inertia core, ~400 lines)
   - `ZoomLane.ts` (~200 lines)
4. Fix the getCmView crash (immediate)
5. Fix or remove SentenceHighlighter (it currently wastes cycles doing nothing)
6. Delete state.ts

### Regardless of direction

Fix **C-1** (`getCmView` infinite recursion) immediately — the scroller literally
cannot work right now.

---

## Summary

| Category | Count | Items |
|---|---|---|
| **Critical** | 2 | getCmView infinite recursion, SentenceHighlighter is a no-op |
| **Structural** | 5 | Monolith (S-1), README drift (S-2), dead state.ts (S-3), duplicate actions (S-4), settings sprawl (S-5) |
| **Technical** | 6 | RAF accumulation (T-1), stamp drift (T-2), hash collisions (T-3), O(n²) parsing (T-4), unbounded search (T-5), cached content (T-6) |
| **Identity** | 1 | Two products in one repo with a single README that describes only one of them |

The plugin works as a bunsetsu navigation tool (via the 7 commands). The Monkey Scroller
is currently broken due to C-1 and would need that one-line fix to function. The deeper
question — whether 87% of the code should be a rhythm game UI for a text navigation
task — is a design decision only you can make.
