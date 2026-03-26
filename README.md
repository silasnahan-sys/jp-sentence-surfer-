# JP Sentence Surfer 🏄‍♂️

**Mobile-first Japanese sentence navigator for Obsidian.**  
A sister plugin to [jp-collocations](https://github.com/silasnahan-sys/jp-collocations), inspired by [Sentence Navigator](https://github.com/timhor/obsidian-sentence-navigator) — reimagined for Japanese text, mobile Obsidian, cloze card creation, and YTranscript YouTube transcript cleanup.

---

## Features

### 🏄 JP Sentence Surfing
Navigate sentences using Japanese punctuation boundaries (`。！？` etc.).  
Commands: **Next Sentence**, **Previous Sentence**, **Select Current Sentence**

### 🔤 Bold-as-Boundary Mode
When your notes use `**bold text**` to mark important words, the plugin treats them as sentence landmarks:
- `Surf: Select Bold Target` — selects just the `**bold**` portion in the current sentence
- `Surf: Jump to Next Bold` — jumps to the next bold marker

### 📺 YTranscript Cleanup
YTranscript-generated JP transcripts look like this:
```
[00:00:01](https://youtube.com/watch?v=xxx&t=1) こんにちは皆さん
[00:00:05](https://youtube.com/watch?v=xxx&t=5) 今日は日本語の
[00:00:08](https://youtube.com/watch?v=xxx&t=8) 文法について話します。
```

**JP Sentence Surfer**:
- **Auto-detects** YTranscript format
- **Stitches sentence fragments** across timestamp lines
- **Strips timestamps on selection** → `こんにちは皆さん今日は日本語の文法について話します。`
- **`Surf: Segment YTranscript`** command processes an entire transcript note

### 🃏 Cloze Export (Anki-ready)
Given: `日本語の**文法**について話します。`  
→ Cloze: `日本語の{{c1::文法}}について話します。`

Multiple bold segments auto-increment: `{{c1::...}}`, `{{c2::...}}`, etc.  
No bold? The entire sentence is wrapped: `{{c1::日本語の文法について話します。}}`

### 📱 Mobile Toolbar
A floating bottom bar with large (44px+) touch targets:  
`◀ Prev` | `✂ Select` | `🃏 Cloze` | `▶ Next`

Swipe left/right on the toolbar to navigate sentences.

---

## Commands

| Command | Description |
|---|---|
| `Surf: Next Sentence` | Move cursor to start of next JP sentence |
| `Surf: Previous Sentence` | Move cursor to start of previous JP sentence |
| `Surf: Select Current Sentence` | Select the sentence at cursor (strips timestamps if YTranscript) |
| `Surf: Select Bold Target` | Select the `**bold**` text in current sentence |
| `Surf: Jump to Next Bold` | Jump cursor to next `**bold**` marker |
| `Surf: Save as Cloze Card` | Copy current sentence as Anki cloze (clipboard) |
| `Surf: Segment YTranscript` | Process entire note: stitch transcript fragments, clean timestamps |
| `Surf: Lookup in jp-collocations` | Send selected text to jp-collocations plugin (if installed) |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Sentence regex | JP regex | Custom sentence boundary regex |
| Use bold boundaries | `true` | Treat `**bold**` as boundary markers |
| Strip timestamps on select | `true` | Auto-strip `[timestamp](url)` on selection |
| Cloze format | `{{c1::$BOLD}}` | Template for cloze output |
| Show floating toolbar | `true` | Mobile bottom/top toolbar |
| Toolbar position | `bottom` | `top` or `bottom` |
| Highlight current sentence | `true` | Subtle background highlight on active sentence |
| Highlight color | `rgba(255,208,0,0.15)` | CSS color for highlight |

---

## Examples

### 1. Normal JP Text Surfing
```
東京は大都市です。毎日多くの人が電車を利用します。
```
Cursor in `東京は大都市です。` → `Surf: Next Sentence` moves to `毎日...`.

### 2. Bold-Boundary Surfing
```
この映画の**監督**はとても有名です。彼の作品は**世界中**で評価されています。
```
`Surf: Select Bold Target` selects `**監督**` (or `**世界中**` depending on cursor position).  
`Surf: Save as Cloze` → `この映画の{{c1::監督}}はとても有名です。`

### 3. YTranscript Cleanup
**Before:**
```
[00:00:01](https://youtu.be/xxx?t=1) 今日は日本語の
[00:00:04](https://youtu.be/xxx?t=4) 勉強をします。
[00:00:07](https://youtu.be/xxx?t=7) まず文法から
[00:00:10](https://youtu.be/xxx?t=10) 始めましょう。
```
**After `Surf: Segment YTranscript`:**
```
今日は日本語の勉強をします。
まず文法から始めましょう。
```

### 4. Cloze Output
Input sentence: `日本語の**文法**と**語彙**を学びます。`  
Cloze output: `日本語の{{c1::文法}}と{{c2::語彙}}を学びます。`

---

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Place them in `.obsidian/plugins/jp-sentence-surfer/` in your vault.
3. Enable the plugin in Obsidian Settings → Community Plugins.

### Development

```bash
npm install
npm run dev   # watch mode
npm run build # production build
```

---

## License

MIT © silasnahan-sys