# JP Sentence Surfer — Obsidian Plugin

A mobile-first Japanese **bunsetsu (文節) phrase surfing** plugin for Obsidian.
Navigate, select, and create cloze cards from phrase-level Japanese text chunks
using a TinySegmenter-powered morpheme tokenizer and an 8-tier bunsetsu grouper.

---

## What is Bunsetsu Surfing?

Instead of jumping between full sentences, JP Sentence Surfer moves your cursor
between **bunsetsu** — minimal Japanese phrase units.  A bunsetsu is roughly
"a content word plus its trailing function words":

```
Raw text → TinySegmenter → ['そんな', 'とこ', 'で', 'ミス', 'し', 'ちゃ', 'いけない', '作業', 'を']
                                    ↓ Bunsetsu grouper
                           Chunk 1: そんなとこで
                           Chunk 2: ミスしちゃいけない作業を
                           Chunk 3: ずっとやってる
                           Chunk 4: わけだから。
```

---

## Commands

| Command | Description |
|---|---|
| **Surf: Next** | Move cursor to the start of the next bunsetsu chunk |
| **Surf: Previous** | Move cursor to the start of the previous bunsetsu chunk |
| **Surf: Select** | Select the bunsetsu chunk under the cursor |
| **Surf: Select Bold** | Select the `**bold**` portion within the current chunk |
| **Surf: Jump Next Bold** | Jump to the next `**bold**` marker |
| **Surf: Save Cloze** | Copy the current chunk (or selection) as a cloze card |
| **Surf: Segment YTranscript** | Strip timestamps/annotations from a YTranscript note |

Assign hotkeys in **Settings → Hotkeys** (search "Surf").

---

## Mobile Toolbar

A floating toolbar (◀ Prev | Select | Cloze | Next ▶) appears automatically.
Position (top/bottom) is configurable in settings.

---

## YTranscript Pipeline

Paste a YTranscript note (lines starting with `[MM:SS](url)`) and run
**Surf: Segment YTranscript** to:

1. Strip all `[MM:SS](url)` timestamp links
2. Strip annotation brackets `[笑い]` `[音楽]` `[拍手]`
3. Concatenate cleaned lines (newline-separated, preserving phrase boundaries)

The cleaned text is then ready for bunsetsu surfing.

---

## Architecture

| File | Purpose |
|---|---|
| `src/tiny-segmenter.ts` | TinySegmenter TypeScript port — splits Japanese text into morphemes |
| `src/bunsetsu-grouper.ts` | Groups morphemes into bunsetsu chunks using 8-tier boundary rules |
| `src/jp-sentence-parser.ts` | `parseBunsetsu()` entry point; also retains legacy regex helpers |
| `src/actions.ts` | All editor commands use `parseBunsetsu()` |
| `src/ytranscript.ts` | YTranscript cleanup pipeline |
| `src/constants.ts` | Boundary token sets (HARD_STOP_TOKENS, ALWAYS_CLOSE_PARTICLES, etc.) |
| `src/types.ts` | TypeScript interfaces including `BunsetsuChunk` |

### Bunsetsu Boundary Tiers

| Tier | Trigger | Rule |
|---|---|---|
| 1 | `。！？!?` | Hard stop; absorb trailing `」』）)` |
| 2 | space / newline | Natural speech boundary (whitespace not included in chunk) |
| 3 | `を` `で` `から` `って` `けど` `けれども` `ので` `のに` `ながら` + compound particles | Always close; defer if followed by `。` |
| 4 | `た` `て` `たら` `ちゃった` `った` | Same deference rule; `て` defers to Tier 5 when followed by `る` |
| 5 | `てる` `ている` (and `ってる` etc.) | Close UNLESS next token is `ん` (nominaliser) |
| 6 | `に` | Close only before whitespace or forming `には`/`にも` |
| 7 | `は` / `も` after `に` / `で` / `と` etc. | Compound particle boundary |
| 8 | `な` after `たい` | Closes the `たいな` wishful form |

---

## Installation

### From Source

```bash
git clone https://github.com/silasnahan-sys/jp-sentence-surfer-.git
cd jp-sentence-surfer-
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` into:
```
YOUR_VAULT/.obsidian/plugins/jp-sentence-surfer/
```

Then enable in **Obsidian → Settings → Community plugins**.

### iOS / Mobile (no computer)

1. Merge the PR on GitHub
2. Open a GitHub Codespace → run `npm install && npm run build`
3. Download `main.js` from the file tree
4. In the iOS Files app, navigate to your vault → `.obsidian/plugins/jp-sentence-surfer/`
5. Drop in `main.js`, `manifest.json`, `styles.css`
6. Enable in Obsidian Settings

---

## License

MIT © silasnahan-sys

---

## 談話文法 (Discourse Grammar) Mode

An additional discourse-level analysis layer that works alongside the existing bunsetsu surfing. Provides multi-granularity discourse pattern detection, visualization, and indexing of captured chunks.

### Discourse Granularity Levels

| Level | Name | Description |
|-------|------|-------------|
| 1 | 形態素 (`morpheme`) | Individual morpheme tokens |
| 2 | 文節 (`bunsetsu`) | Bunsetsu phrase chunks (existing system) |
| 3 | 節 (`clause`) | Clauses bounded by conjunctive particles |
| 4 | 発話 (`utterance`) | Full utterances / sentences |
| 5 | ターン (`turn`) | Speaker turns |
| 6 | 交換 (`exchange`) | Adjacent turn pairs |
| 7 | エピソード (`episode`) | Topic-bounded discourse episodes |

Cycle through levels with **Discourse: Cycle Granularity** command or tap the granularity indicator in the toolbar.

### Discourse Patterns Detected

- **発話冒頭表現 (Opening markers):** 結局, 要するに, つまり, まあ, なんか, やっぱり, ていうか, ほら, だから, じゃあ, ...
- **発話末表現 (Closing markers):** わけだから, はずなんですよね, ものですから, じゃないですか, んですよ, んですけど, かなと思って, ...
- **論理展開パターン (Logical connectives):** cause-result, contrast, elaboration, concession
- **談話境界標識 (Boundary markers):** ところで, そういえば, 話変わるけど, 要は
- **相互行為的表現 (Interactional particles):** ね, よ, でしょ, じゃない

All patterns are detected using TinySegmenter morpheme token sequences to avoid false positives.

### Discourse Commands

| Command | Description |
|---------|-------------|
| **談話: 次の単位へ** | Surf to next discourse unit at current granularity |
| **談話: 前の単位へ** | Surf to previous discourse unit |
| **談話: 現在の単位を選択** | Select current discourse unit |
| **談話: チャンクを保存** | Capture current chunk to discourse index |
| **談話: 索引を開く** | Open the discourse index browser panel |
| **談話: 粒度を切り替え** | Cycle through granularity levels |
| **談話: オーバーレイ切替** | Toggle discourse pattern overlay |

### Discourse Index

When you capture a chunk, the system:
1. Runs full discourse grammar analysis (opening/closing/internal markers, boundary markers)
2. Pulls collocations from the jp-collocations plugin if available
3. Creates an indexed entry with full metadata
4. Persists to `discourse-index.json` (configurable)

The index is browsable and filterable by: opening marker, closing marker, pattern tag, granularity, collocation, source file.

### Discourse View Panel

Open the panel with **談話: 索引を開く** or click 📚 in the toolbar.

- **🔍 検査 (Inspector):** Annotated view of a captured chunk with color-coded markers
- **📚 索引 (Index browser):** Searchable list of all captured chunks
- **🎨 表示 (Overlay preview):** Live pattern overlay of the active editor

### Toolbar (Discourse buttons)

| Button | Action |
|--------|--------|
| Granularity label (e.g. 節) | Tap to cycle granularity |
| ← → | Previous / next discourse unit |
| ⊕ | Capture current chunk |
| 🎨 | Toggle overlay |
| 📚 | Open index browser |

---

## 辞書 (Yomitan-Style Dictionary Lookup)

An in-Obsidian dictionary search UI optimized for iOS mobile (iPhone 17 / iPad Mini 7), supporting Yomitan-format dictionaries.

### Setup

1. Extract your Yomitan dictionary zip files into a vault folder (default: `Dictionaries/`). Each dictionary should be in its own sub-folder containing `index.json` and `term_bank_*.json` files.
2. Set the **Dictionary folder** in plugin settings.
3. Use **辞書: 辞書を読み込む** to load the dictionaries.

### Features

- **Auto-search** as you type (debounced)
- **Paste from clipboard** button for quick lookup
- **Scan mode:** Select text in a transcript → tap 📖 → see all possible lookups for that text (longest match first)
- **Deconjugation-aware search:** て-form, た-form, negative, masu-form, i-adj
- **Save as Collocation:** Save the entry term to the jp-collocations plugin or a vault folder
- **Save Example Sentences:** Save individual example sentences from dictionary entries to `Saved Sentences/`

### Dictionary Commands

| Command | Description |
|---------|-------------|
| **辞書: 検索** | Open dictionary lookup (uses selected text if any) |
| **辞書: 辞書を読み込む** | Reload dictionaries from vault folder |

### Mobile Optimizations

- Large touch targets (minimum 44pt, Apple HIG)
- Bottom-sheet style modal (slides up from bottom)
- Swipe to dismiss
- Large 18px search input
- iOS safe area insets respected
- Smooth momentum scrolling
- Clipboard paste button

### Settings (Dictionary)

| Setting | Description | Default |
|---------|-------------|---------|
| Enable dictionary lookup | Toggle the feature | `true` |
| Dictionary folder | Vault folder with extracted Yomitan dicts | `Dictionaries` |
| Saved sentences folder | Where to save example sentences | `Saved Sentences` |
| Saved collocations folder | Where to save collocation entries | `JP Collocations` |
| Scan mode max characters | Max chars scanned in scan mode | `20` |
| Show dictionary button in toolbar | Show 📖 in floating toolbar | `true` |

---

## Settings Reference (New)

### Discourse Grammar

| Setting | Description | Default |
|---------|-------------|---------|
| Discourse granularity | Default level for surfing/visualization | `clause` |
| Show discourse overlay | Colored annotations on text | `true` |
| Discourse index path | JSON file path for index | `discourse-index.json` |
| Auto-detect patterns | Detect on note open | `true` |
| Context expansion mode | `smart` (discourse boundaries) or `fixed` | `smart` |
| Fixed context chars | Chars of context in fixed mode | `200` |
