# AUDIT — JP Sentence Surfer v7

> Continuation of v6 audit. Full codebase re-read with zero-compilation-error baseline.  
> Focus: real bugs, structural wins, and improvements that serve the plugin's core design.

---

## Previously Addressed (v6)

| ID | Issue | Status |
|----|-------|--------|
| S-1 | lateralOffset race in onRelease | ✅ Fixed — captured displayIdxAtRelease before zeroing |
| S-4 | scopeSwipeAccum leak on extend entry | ✅ Fixed — cleared in startExtendSelection |
| M-4 | Anchor pivot (double-tap in extend) | ✅ Added |
| M-5 | PaRappa auto-repeat | ✅ Added |
| M-6 | Combo memory (Project Diva) | ✅ Added |

---

## S-5  Combo Memory / Auto-Repeat Code Block Misplacement  ★★★ BUG

**File:** `SentenceMonkeyScroller.ts` ~L4560-4620  
**Severity:** Medium — combo memory never records, auto-repeat never resets for non-chain paths

The combo memory recording block and the auto-repeat reset block are **physically misplaced inside the `if (chainSegs && chainSegs.length > 0)` branch**. When an action is NOT chainable (or has no chain follow-up), the code flows to `this.endCombo()` without ever:
1. Recording the combo sequence to memory
2. Resetting `autoRepeatCount` / `autoRepeatAction`
3. Clearing `comboCurrentSequence`

Additionally, `comboCurrentSequence = []` appears **twice** inside the same `if` block (once after recording, once after reset), which is redundant.

**Fix:** Move combo memory recording + auto-repeat/sequence reset to just before `this.endCombo()`, outside the `if (seg.chainable)` gate.

---

## S-6  contentFingerprint Stride Can Miss Single-Char Edits  ★★

**File:** `SentenceMonkeyScroller.ts` ~L460  
**Severity:** Low-Medium — stale parse data after undetected edit

The DJB2 hash uses stride `Math.max(1, s.length >> 8)` (~256 samples regardless of doc size). For a 50KB document (50,000 chars), stride = 195. A single-char edit between sample points won't change the hash. The docstring claims "catches single-char edits anywhere" but this is only true for documents under ~256 chars.

**Fix:** Add a secondary check: XOR the first 64, last 64, and a middle 64-char window into the hash. This catches edits at document boundaries and mid-document with negligible cost.

---

## S-7  Chunk Boundary + Maker Stamp Re-Rendering on Every Scroll Frame  ★★★ PERF

**File:** `SentenceMonkeyScroller.ts` — `showChunkBoundaries()` ~L6525, `renderMakerStamps()` ~L6050

Both functions destroy all DOM elements and re-create them on every scroll event. During chunk overview, `showChunkBoundaries` is the scroll listener callback itself — causing O(n) DOM creates per scroll frame.

`renderMakerStamps` has the same pattern: `clearMakerStamps()` then rebuild all stamp overlays.

**Fix:** 
- Pool boundary marker elements (create once, reposition on scroll)
- Throttle with rAF + dirty flag (max once per frame)
- Same for maker stamps

---

## S-8  parseFallback indexOf Can Match Wrong Duplicate Line  ★

**File:** `jp-sentence-parser.ts` ~L195  
**Severity:** Low — only fires on fallback path (no JP sentence punctuation)

```ts
const start = text.indexOf(line, offset);
```

If two lines have identical content, `indexOf` may match the correct one due to the `offset` parameter, but if `offset` has drifted due to `\r\n` vs `\n` differences in the split, it could skip past the intended line.

**Fix:** Track offset by accumulating line lengths instead of searching.

---

## S-9  cheatSheetSeenCount Resets on Plugin Reload  ★

**File:** `SentenceMonkeyScroller.ts` — `showGestureCheatSheet()`  
**Severity:** Cosmetic — cheat sheet shows every plugin reload instead of only 8 times across sessions

`cheatSheetSeenCount` is a class property that starts at 0 each mount. The gate `if (this.cheatSheetSeenCount >= 8) return` never fires across reloads.

**Fix:** Persist to localStorage (same pattern as `ms3-scope-level`).

---

## S-10  buildCleanText Callout Regex Misses Foldable/Collapsed Formats  ★

**File:** `jp-sentence-parser.ts` ~L248  
**Severity:** Minor — foldable callout markers leak into parsed text

The regex `^\[![^\]]*\]\s*` doesn't match Obsidian's `> [!type]+ title` or `> [!type]- title` formats. The `+`/`-` and trailing title text remain in the clean output, causing noise in bunsetsu chunks.

**Fix:** Expand the callout regex to `^\[![^\]]*\][+-]?\s*[^\n]*`.

---

## S-11  Opening Quote Brackets Not Treated as Bunsetsu Boundaries  ★★

**File:** `bunsetsu-grouper.ts`  
**Severity:** Medium — bunsetsu chunks can span across 「」 boundaries in dialogue text

Closing brackets (」』)) are handled in Tier 1 absorption and standalone flush. But opening brackets (「『（() are not boundary triggers. In dialogue-heavy text like:

> 彼は「ありがとう」と言った

The grouper may produce `は「ありがとう」` as one chunk instead of splitting at `「`.

**Fix:** Add opening bracket detection: flush current chunk before starting a new one when an opening bracket is encountered.

---

## I-1  Scope Engine: CLAUSE_CLOSERS Contains Ambiguous Single-Char Entries  ★★

**File:** `scope-engine.ts` ~L60-75

`CLAUSE_CLOSERS` includes `'が'`, `'と'`, `'し'` which are extremely common particles that don't always mark clause boundaries. `が` as a subject marker (猫が) should NOT trigger a clause break, but `が` as a contrastive conjunction (行ったが) should.

The grouper can't distinguish these without morphological analysis. TinySegmenter's output doesn't provide POS tags.

**Mitigation:** Add a minimum-chunk-size guard: don't break at `が`/`と`/`し` if the clause-so-far is < 3 bunsetsu. This heuristic catches most false positives (single-bunsetsu "clauses" are almost always mis-triggered).

---

## I-2  displayTextCache Growth Pattern  ★

**File:** `SentenceMonkeyScroller.ts` ~L3200

The cache uses a hard cutoff: `if (size > 500) this.displayTextCache.clear()`. This causes periodic full invalidation. Under rapid navigation through a large document, the cache oscillates between 0 and 500 entries.

**Fix:** Evict half the entries instead of clearing all (or use a simple generation counter to keep the most recent half).

---

## I-3  Extend Edge Auto-Scroll Doesn't Account for Pad Overlay Height  ★

**File:** `SentenceMonkeyScroller.ts` `autoScrollExtendEdge()` ~L5530

The bottom edge calculation uses `vh * 0.18` but doesn't account for the scroller pad/zoom lane at the bottom. On small screens, the pad can cover 15-20% of the viewport. Extend-mode selection reaching the bottom can be invisible behind the pad.

**Fix:** Use `vh - padHeight - margin` for the bottom threshold.

---

## Summary of Implemented Changes

| ID | Type | Description |
|----|------|-------------|
| S-5 | Bug fix | Move combo memory + auto-repeat reset outside chainable branch |
| S-6 | Improvement | Strengthen contentFingerprint to catch mid-document edits |
| S-7 | Performance | Throttle chunk boundary re-rendering with rAF pooling |
| S-7b| Performance | Throttle maker stamp re-rendering with rAF pooling |
| S-8 | Bug fix | Fix parseFallback offset tracking |
| S-9 | Improvement | Persist cheatSheetSeenCount to localStorage |
| S-10| Bug fix | Expand callout regex to handle foldable/collapsed formats |
| S-11| Improvement | Add opening bracket bunsetsu boundary handling |
| I-1 | Improvement | Clause closer minimum-size guard for ambiguous particles |
| I-2 | Improvement | Evict half displayTextCache instead of full clear |
| I-3 | Improvement | Account for pad height in extend edge auto-scroll |
