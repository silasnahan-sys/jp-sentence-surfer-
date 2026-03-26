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
