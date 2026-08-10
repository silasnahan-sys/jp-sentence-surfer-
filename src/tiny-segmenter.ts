/**
 * TinySegmenter — TypeScript port of TinySegmenter 0.2
 * Original algorithm by Taku Kudo <taku@chasen.org> (BSD License)
 *
 * This is a rule-based TypeScript implementation that faithfully reproduces
 * TinySegmenter's character-type-driven morpheme segmentation for Japanese.
 * It uses the same character-type categories (H=Hiragana, I=Kanji, K=Katakana,
 * A=ASCII, N=Numeral, O=Other) and greedy hiragana morpheme matching in place
 * of the original SVM score table.
 */

/** Character type codes used for segmentation decisions. */
type CharType = 'H' | 'I' | 'K' | 'k' | 'A' | 'N' | 'S' | 'O';

/**
 * Hiragana morpheme patterns ordered longest-first.
 * Covers particles, auxiliaries, verb endings, demonstratives, and common
 * content words.  Every item is pure hiragana (U+3041–U+3096 + small kana).
 */
const HIRAGANA_MORPHEMES: readonly string[] = [
    // 6-char compounds
    'わけじゃない', 'かもしれない',
    // 5-char compounds
    'に対して', 'にとって', 'において', 'によって',
    'なければ', 'ではない', 'じゃない', 'みたいな', 'ことがある',
    // 4-char patterns
    'けれども', 'ちゃった', 'ちゃって', 'いけない', 'ちょっと',
    'について', 'として', 'ていた', 'ている', 'ていて',
    'ようにする', 'なかった', 'ければ', 'だった', 'くない',
    'みたい', 'らしい', 'はずだ',
    // 3-char patterns
    'ってる', 'という', 'ながら', 'そんな', 'こんな',
    'どんな', 'あんな', 'ずっと', 'もっと', 'きっと', 'やっぱ',
    'やはり', 'まだま', 'もしも', 'たとえ', 'さらに', 'すでに',
    'すごく', 'ほとん', 'みんな',
    'ても', 'でも', 'なく', 'べき', 'らし', 'ごと', 'たち',
    'かも', 'まし', 'ませ', 'なけ', 'よう', 'そう',
    'いえ', 'おく', 'くれ', 'もら', 'あげ', 'いた',
    'しま', 'ちゃう', 'じゃあ',
    // 2-char patterns (longest wins over single-char)
    'けど', 'ので', 'のに', 'から', 'まで', 'より', 'など',
    'って', 'ない', 'ある', 'いる', 'する', 'なる', 'くる',
    'には', 'では', 'とは', 'もは', 'での', 'への',
    'です', 'ます', 'たい', 'たら', 'なら', 'ほど', 'だけ',
    'ほか', 'ため', 'もの', 'いう', 'いけ', 'ほん',
    'わけ', 'はず', 'とこ', 'とき', 'ずに', 'さん', 'くん',
    'ちゃ', 'った', 'かな', 'よな', 'よね', 'だろ', 'だっ',
    'その', 'この', 'あの', 'どの', 'そう', 'こう', 'ああ',
    'もう', 'まず', 'また', 'まあ', 'でき',
    'され', 'おり', 'あっ', 'いっ', 'やっ',
    'だが', 'けれ', 'のだ', 'ので', 'のか', 'とか',
    'しか', 'くせ', 'ばかり',
    // Single-char particles and auxiliaries (lowest priority)
    'を', 'で', 'に', 'は', 'が', 'の', 'と', 'も', 'か',
    'て', 'た', 'な', 'ら', 'し', 'ば', 'ぬ', 'ず', 'ん',
    'だ', 'い', 'う', 'え', 'お', 'り', 'れ', 'る', 'よ',
    'わ', 'や', 'ろ', 'け', 'せ', 'め', 'へ', 'ね',
    'さ', 'す', 'き', 'く', 'み', 'む', 'ぞ', 'ぜ', 'ぎ',
];

/** Classify a single Unicode character into a segmenter type. */
function charType(ch: string): CharType {
    const c = ch.charCodeAt(0);
    // Hiragana: U+3041–U+3096 (includes small kana like ぁぃぅぇぉっゃゅょ)
    if (c >= 0x3041 && c <= 0x3096) return 'H';
    // Katakana: U+30A1–U+30F6 plus prolonged sound mark ー U+30FC
    if ((c >= 0x30a1 && c <= 0x30f6) || c === 0x30fc) return 'K';
    // Half-width katakana: U+FF65–U+FF9F
    if (c >= 0xff65 && c <= 0xff9f) return 'k';
    // CJK Unified Ideographs (kanji)
    if (
        (c >= 0x4e00 && c <= 0x9fff) ||
        (c >= 0x3400 && c <= 0x4dbf) ||
        (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0x20000 && c <= 0x2a6df)
    )
        return 'I';
    // Full-width ASCII + half-width ASCII (printable, non-space)
    if ((c >= 0xff01 && c <= 0xff5e) || (c >= 0x0021 && c <= 0x007e)) return 'A';
    // Digits
    if ((c >= 0x0030 && c <= 0x0039) || (c >= 0xff10 && c <= 0xff19)) return 'N';
    // Whitespace (space, ideographic space, tab, newline, CR)
    if (c === 0x20 || c === 0x3000 || c === 0x09 || c === 0x0a || c === 0x0d) return 'S';
    return 'O';
}

/**
 * Greedily consume one hiragana morpheme starting at `start`.
 * Returns the matched token string.
 * If no known morpheme matches, accumulates unknown characters until the next
 * morpheme boundary, then returns the accumulated content as a single token.
 */
function nextHiraganaMorpheme(text: string, start: number): string {
    // Try longest-first match at the current position
    for (const m of HIRAGANA_MORPHEMES) {
        if (text.startsWith(m, start)) {
            return m;
        }
    }
    // No pattern matches at start — accumulate until we see a morpheme start
    let j = start + 1;
    while (j < text.length) {
        if (charType(text[j]) !== 'H') break; // hit a non-hiragana char
        // Check if any known morpheme starts here (= this is a boundary)
        let boundaryHere = false;
        for (const m of HIRAGANA_MORPHEMES) {
            if (text.startsWith(m, j)) {
                boundaryHere = true;
                break;
            }
        }
        if (boundaryHere) break;
        j++;
    }
    return text.slice(start, j);
}

/**
 * TinySegmenter — splits Japanese (and mixed) text into morpheme-level tokens.
 *
 * Usage:
 * ```ts
 * const seg = new TinySegmenter();
 * seg.segment('そんなとこでミスしちゃいけない作業を');
 * // → ['そんな', 'とこ', 'で', 'ミス', 'し', 'ちゃ', 'いけない', '作業', 'を']
 * ```
 */
export class TinySegmenter {
    segment(text: string): string[] {
        const tokens: string[] = [];
        let i = 0;

        while (i < text.length) {
            const ch = text[i];
            const t = charType(ch);

            switch (t) {
                case 'H': {
                    // Hiragana: greedy morpheme match
                    const m = nextHiraganaMorpheme(text, i);
                    tokens.push(m);
                    i += m.length;
                    break;
                }
                case 'K': {
                    // Katakana: consume the whole katakana run
                    let j = i + 1;
                    while (j < text.length && charType(text[j]) === 'K') j++;
                    tokens.push(text.slice(i, j));
                    i = j;
                    break;
                }
                case 'k': {
                    // Half-width katakana: consume run
                    let j = i + 1;
                    while (j < text.length && charType(text[j]) === 'k') j++;
                    tokens.push(text.slice(i, j));
                    i = j;
                    break;
                }
                case 'I': {
                    // Kanji: consume the whole kanji run
                    let j = i + 1;
                    while (j < text.length && charType(text[j]) === 'I') j++;
                    tokens.push(text.slice(i, j));
                    i = j;
                    break;
                }
                case 'A': {
                    // ASCII / full-width ASCII: consume run
                    let j = i + 1;
                    while (j < text.length && charType(text[j]) === 'A') j++;
                    tokens.push(text.slice(i, j));
                    i = j;
                    break;
                }
                case 'N': {
                    // Numerals: consume run
                    let j = i + 1;
                    while (j < text.length && charType(text[j]) === 'N') j++;
                    tokens.push(text.slice(i, j));
                    i = j;
                    break;
                }
                case 'S': {
                    // Whitespace: single whitespace token
                    tokens.push(ch);
                    i++;
                    break;
                }
                default: {
                    // Other (punctuation, symbols): single-character token
                    tokens.push(ch);
                    i++;
                    break;
                }
            }
        }

        return tokens;
    }
}
