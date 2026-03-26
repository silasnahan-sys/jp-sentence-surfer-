# JP Sentence Surfer 🏄‍♂️

An Obsidian plugin for surfing through Japanese text at **bunsetsu (文節) phrase-chunk level** — the natural grammatical phrase boundaries in Japanese.

## What is Bunsetsu Surfing?

Instead of jumping between full sentences (delimited by `。`), this plugin breaks Japanese text into **natural phrase chunks** and lets you navigate them one-by-one with a single keypress. This is ideal for:

- **Language learners** studying Japanese transcripts, podcasts, or YouTube subtitles
- **Vocabulary / Anki card creation** — select a phrase chunk, then convert to a cloze card
- **Deep reading** of conversational Japanese

### Example

Given this YTranscript input:
```
[16:19](https://youtu.be/...) そうですね。そんなとこでミスしちゃいけない作業をずっとやってるわけだから。
[16:25](https://youtu.be/...) そう本当に宇宙飛の皆さんには頭が上がらない。
[16:30](https://youtu.be/...) 我々はその安全な宇宙旅行が確立されたら行きたいなという風に思ってるんですけれども。
```

The chunk table below shows the surf units extracted from those three timestamp lines:

| # | Chunk | Notes |
|---|-------|-------|
| 1 | `そうですね。` | `。` hard stop |
| 2 | `そんなとこで` | `で` particle close |
| 3 | `ミスしちゃいけない作業を` | `を` particle close |
| 4 | `ずっとやってる` | `てる` verb-ending close |
| 5 | `わけだから。` | `から` before `。` → absorbed |
| 6 | `そう本当に宇宙飛の皆さんには` | `には` compound close |
| 7 | `頭が上がらない。` | `。` hard stop |
| 8 | `いや、すごいわ。` | `。` hard stop |
| 9 | `本当に` | `に` close before whitespace |
| 10 | `我々はその安全な宇宙旅行が確立されたら` | `たら` verb-ending close |
| 11 | `行きたいな` | `たいな` special close |
| 12 | `という風に思ってるんですけれども。` | `。` hard stop |

## Features

- 🏄 **Bunsetsu surfing** — navigate Japanese text phrase-by-phrase with `Alt+→` / `Alt+←`
- 📝 **Select chunk** — `Alt+S` selects the current phrase chunk for copy/edit
- 🃏 **Cloze export** — `Alt+C` converts selection to `{{c1::…}}` Anki cloze format; bold text (`**word**`) creates numbered cloze deletions
- 📺 **YTranscript support** — automatically strips `[MM:SS](url)` timestamps and `[笑い]`/`[音楽]` annotations before parsing
- 📱 **Floating toolbar** — optional bottom/top toolbar with ◀ Prev | Select | Cloze | Next ▶ buttons (44px touch targets for mobile)
- ⚙️ **Settings** — configure timestamp stripping, cloze template, toolbar position

## Commands

| Command | Default Hotkey | Description |
|---------|---------------|-------------|
| Surf: Next bunsetsu chunk | `Alt+→` | Move cursor to next phrase chunk |
| Surf: Previous bunsetsu chunk | `Alt+←` | Move cursor to previous phrase chunk |
| Surf: Select current bunsetsu chunk | `Alt+S` | Select the current phrase chunk |
| Surf: Cloze current chunk / selection | `Alt+C` | Convert to Anki cloze format |
| Surf: Reset | — | Clear parse cache (re-parse on next command) |

## Cloze Format

**No bold text** — wraps the entire selection:
```
{{c1::ミスしちゃいけない作業を}}
```

**With bold text** — each `**bold**` span becomes a numbered cloze:
```
Input:  ミスしちゃ**いけない**作業を
Output: ミスしちゃ{{c1::いけない}}作業を
```

Multiple bold spans increment automatically (`c1`, `c2`, `c3`…).

## How It Works

### YTranscript Pipeline
1. Strip all `[MM:SS](url)` timestamp prefixes
2. Strip bracket annotations (`[笑い]`, `[音楽]`, `[拍手]` etc.)
3. Concatenate all cleaned text into one continuous string
4. Tokenise with **TinySegmenter** (pure-JS Japanese morpheme tokeniser)
5. Group tokens into bunsetsu chunks using rule-based boundary detection

### Bunsetsu Grouping Algorithm
Chunks close after:
- **Strong particles**: `を` `で` `から` `まで` `って` `けど` `けれども` `ので` `のに` `ながら` etc.
- **Verb endings**: `た` `て` `たら` `ちゃった` + `てる`/`ている` (unless followed by the `ん` nominaliser)
- **Compound particles**: `には` `では` `とは` etc. (close after the full compound)
- **Special**: `たいな` boundary (wishful + emotive: 行きたいな)
- **Punctuation**: `。` `！` `？` — always hard stops; preceding boundary particles absorb the `。` (e.g. `わけだから。` is one chunk, not two)
- **Line breaks** (spaces from timestamp stripping) — natural speech boundaries

## Installation

### From Source
```bash
git clone https://github.com/silasnahan-sys/jp-sentence-surfer-
cd jp-sentence-surfer-
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` (if present) to your Obsidian vault's `.obsidian/plugins/jp-sentence-surfer/` folder.

## Credits

- [TinySegmenter](http://chasen.org/~taku/software/TinySegmenter/) by Taku Kudo (BSD licence) — compact Japanese tokeniser, ~7 KB, zero native dependencies
- Bunsetsu grouping algorithm and Obsidian integration by this plugin

## Licence

MIT
