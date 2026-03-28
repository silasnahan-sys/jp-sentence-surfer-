/**
 * Discourse grammar pattern detection engine.
 *
 * Detects discourse markers in Japanese text using TinySegmenter morpheme
 * token matching. Each PATTERN_RULE stores one or more alternative token
 * sequences (OR semantics); the longest matching alternative wins at each
 * position.
 *
 * Pattern categories:
 *   UTTERANCE_OPENING  — 発話冒頭表現 (fillers, hedges, topic introducers …)
 *   UTTERANCE_CLOSING  — 発話末表現  (わけ/はず chains, confirmation-seeking …)
 *   DISCOURSE_CONNECTIVE — 論理展開  (causal / concessive connectives)
 *   DISCOURSE_BOUNDARY — 談話境界   (topic-shift, return, wrap-up markers)
 *   INTERACTIONAL      — 会話的     (backchannels, tag questions, stacking)
 */

import { TinySegmenter } from '../tiny-segmenter';

// ─── Public types ─────────────────────────────────────────────────────────────

export type DiscoursePatternCategory =
    | 'UTTERANCE_OPENING'
    | 'UTTERANCE_CLOSING'
    | 'DISCOURSE_CONNECTIVE'
    | 'DISCOURSE_BOUNDARY'
    | 'INTERACTIONAL';

/**
 * A discourse marker definition.
 * `tokens` is an array of alternative token sequences (OR semantics).
 * Each inner array is the exact TinySegmenter token sequence to match.
 */
export interface DiscourseMarker {
    category: DiscoursePatternCategory;
    label: string;
    tokens: string[][];
}

/**
 * A single detected pattern instance in the token stream.
 * `startToken` / `endToken` are indices into the original tokens array
 * (including whitespace tokens).  `startChar` / `endChar` are character
 * offsets into the source text, populated only by `detectDiscoursePatterns`.
 */
export interface DetectedPattern {
    category: DiscoursePatternCategory;
    surfaceForm: string;
    tokens: string[];
    startToken: number;
    endToken: number;
    startChar?: number;
    endChar?: number;
    label: string;
}

// ─── Pattern rule table ───────────────────────────────────────────────────────

/**
 * Token sequences are derived from TinySegmenter's character-type-driven
 * segmentation rules (H=Hiragana morpheme, I=Kanji run, K=Katakana run …).
 *
 * Within each rule, alternatives are ordered longest-first so the matcher
 * automatically prefers the most specific form.
 *
 * NOTE — cross-category duplication is intentional.  Many Japanese discourse
 * markers are genuinely multi-functional: 'だから' opens an utterance with a
 * reasoning frame (UTTERANCE_OPENING) *and* functions as an internal causal
 * connective (DISCOURSE_CONNECTIVE).  Callers receive all matching categories
 * so that higher-level context can disambiguate.  Patterns that only appear
 * in one plausible context are listed in a single category.
 */
const PATTERN_RULES: DiscourseMarker[] = [

    // ── UTTERANCE_OPENING — Summary / conclusion ──────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: '結局',
        tokens: [['結局']],
    },
    {
        category: 'UTTERANCE_OPENING', label: '要するに',
        tokens: [['要', 'する', 'に']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'つまり',
        // 'つまり' → accumulate 'つま' (ま has no 2-char match on 'まり'), then 'り'
        tokens: [['つま', 'り']],
    },
    {
        category: 'UTTERANCE_OPENING', label: '結論から言うと',
        tokens: [['結論', 'から', '言', 'う', 'と']],
    },

    // ── UTTERANCE_OPENING — Topic introduction ────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: '実は',
        tokens: [['実', 'は']],
    },
    {
        category: 'UTTERANCE_OPENING', label: '正直',
        tokens: [['正直']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'ちなみに',
        // 'ちなみに' → 'ち'(no morpheme) + 'な'(single) + 'み'(single) + 'に'(single)
        tokens: [['ち', 'な', 'み', 'に']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'そもそも',
        // 'そ'(accum) + 'も'(single) + 'そ'(accum) + 'も'(single)
        tokens: [['そ', 'も', 'そ', 'も']],
    },
    {
        category: 'UTTERANCE_OPENING', label: '基本的に',
        tokens: [['基本的', 'に']],
    },

    // ── UTTERANCE_OPENING — Reformulation ────────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: 'ていうか系',
        tokens: [
            // Longest alternative first
            ['って', 'いう', 'か'],   // っていうか
            ['て', 'いう', 'か'],     // ていうか
            ['という', 'か'],         // というか
        ],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'むしろ',
        tokens: [['む', 'し', 'ろ']],
    },
    {
        category: 'UTTERANCE_OPENING', label: '逆に',
        tokens: [['逆', 'に']],
    },

    // ── UTTERANCE_OPENING — Continuation ─────────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: 'それで',
        tokens: [['そ', 'れ', 'で']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'そしたら',
        tokens: [['そ', 'し', 'たら']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'じゃあ',
        // 'じゃあ' accumulates as one token (じゃ is not a morpheme boundary)
        tokens: [['じゃあ']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'でね',
        tokens: [['で', 'ね']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'で',
        tokens: [['で']],
    },

    // ── UTTERANCE_OPENING — Contrast ─────────────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: 'ところが',
        // 'とこ'(2-char morpheme) + 'ろ' + 'が'
        tokens: [['とこ', 'ろ', 'が']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'だけど',
        tokens: [['だ', 'けど']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'でも',
        tokens: [['で', 'も']],
    },

    // ── UTTERANCE_OPENING — Reasoning ────────────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: 'だから',
        tokens: [['だ', 'から']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'というのは',
        tokens: [['という', 'の', 'は']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'なんでかって言ったら',
        tokens: [['な', 'ん', 'で', 'か', 'って', '言', 'った', 'ら']],
    },

    // ── UTTERANCE_OPENING — Attention getters ────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: 'ほら',
        // 'ほ' accumulates (ほど/ほか don't match 'ほら'), then 'ら'
        tokens: [['ほ', 'ら']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'あのね',
        tokens: [['あの', 'ね']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'ねえ',
        tokens: [['ね', 'え']],
    },

    // ── UTTERANCE_OPENING — Casual hedges ────────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: 'まあ',
        tokens: [['まあ']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'なんか',
        tokens: [['な', 'ん', 'か']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'やっぱり',
        // Longest first: 'やっぱ'+'り' before bare 'やっぱ'
        tokens: [['やっぱ', 'り'], ['やっぱ']],
    },
    {
        category: 'UTTERANCE_OPENING', label: '一応',
        tokens: [['一応']],
    },

    // ── UTTERANCE_OPENING — Fillers ───────────────────────────────────────────
    {
        category: 'UTTERANCE_OPENING', label: 'えーと',
        // 'え'(single) + 'ー'(katakana) + 'と'(single)
        // vs 'えっと': 'え' + 'っ'(accum to boundary) + 'と'
        tokens: [['え', 'ー', 'と'], ['え', 'っ', 'と']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'あのー',
        tokens: [['あの', 'ー']],
    },
    {
        category: 'UTTERANCE_OPENING', label: 'ちょっと',
        // 'ちょっと' is a 4-char morpheme in HIRAGANA_MORPHEMES
        tokens: [['ちょっと']],
    },

    // ── UTTERANCE_CLOSING — わけ-chains ──────────────────────────────────────
    {
        category: 'UTTERANCE_CLOSING', label: 'わけなんですよ',
        // Longer variants first
        tokens: [
            ['わけ', 'な', 'ん', 'です', 'よね'],  // わけなんですよね
            ['わけ', 'な', 'ん', 'です', 'よ'],    // わけなんですよ
        ],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'わけですよ',
        tokens: [
            ['わけ', 'です', 'けど'],    // わけですけど
            ['わけ', 'です', 'よ'],      // わけですよ
        ],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'わけだから',
        tokens: [['わけ', 'だ', 'から']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'わけじゃん',
        // 'じゃ' is accumulated as a single token (じゃん → ['じゃ','ん'])
        tokens: [['わけ', 'じゃ', 'ん']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'わけなのよ',
        tokens: [['わけ', 'な', 'の', 'よ']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'わけで',
        tokens: [['わけ', 'で']],
    },

    // ── UTTERANCE_CLOSING — はず-chains ──────────────────────────────────────
    {
        category: 'UTTERANCE_CLOSING', label: 'はずなんですよ',
        tokens: [
            ['はず', 'な', 'ん', 'です', 'よね'],  // はずなんですよね
            ['はず', 'な', 'ん', 'です', 'よ'],    // はずなんですよ
        ],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'はずだから',
        tokens: [['はず', 'だ', 'から']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'はずですけど',
        tokens: [['はず', 'です', 'けど']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'はずなのに',
        tokens: [['はず', 'な', 'の', 'に']],
    },

    // ── UTTERANCE_CLOSING — Hearsay ───────────────────────────────────────────
    {
        category: 'UTTERANCE_CLOSING', label: 'ということです',
        // 'という'+'こ'+'と'+'です' ('こと' → 'こ'(accum)+'と'(single))
        tokens: [['という', 'こ', 'と', 'です']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'らしいです',
        tokens: [['ら', 'し', 'い', 'です']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'みたいです',
        tokens: [['み', 'たい', 'です']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'って言ってた',
        tokens: [['って', '言', 'って', 'た']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'だそうです',
        tokens: [['だ', 'そう', 'です']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'そうです',
        tokens: [['そう', 'です']],
    },

    // ── UTTERANCE_CLOSING — Confirmation-seeking ──────────────────────────────
    {
        category: 'UTTERANCE_CLOSING', label: 'じゃないですか',
        tokens: [['じゃ', 'ない', 'です', 'か']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'んですよね',
        tokens: [['ん', 'です', 'よね']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'ですよね',
        tokens: [['です', 'よね']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'でしょう',
        // 'でしょう' → ['で','し','ょ','う'] (ょ accumulates alone, not a morpheme)
        // 'でしょ'  → ['で','し','ょ']
        tokens: [['で', 'し', 'ょ', 'う'], ['で', 'し', 'ょ']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'だろう',
        // 'だろ' is a 2-char morpheme
        tokens: [['だろ', 'う']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'よね',
        tokens: [['よね']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'じゃん',
        tokens: [['じゃ', 'ん']],
    },

    // ── UTTERANCE_CLOSING — New-info emphasis ────────────────────────────────
    {
        category: 'UTTERANCE_CLOSING', label: 'なんですよ',
        tokens: [['な', 'ん', 'です', 'よ']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'んですよ',
        // 'のですよ' as secondary alternative
        tokens: [['ん', 'です', 'よ'], ['の', 'です', 'よ']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'んだよね',
        tokens: [['ん', 'だ', 'よね']],
    },

    // ── UTTERANCE_CLOSING — Softening ────────────────────────────────────────
    {
        category: 'UTTERANCE_CLOSING', label: 'んですけど',
        // Longer variant first: けれども before けど
        tokens: [['ん', 'です', 'けれども'], ['ん', 'です', 'けど']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'んだけど',
        tokens: [['ん', 'だ', 'けど']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'かなと思って',
        tokens: [['か', 'な', 'と', '思', 'って']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'みたいな感じで',
        // Longer variant first
        tokens: [
            ['み', 'たい', 'な', '感', 'じ', 'で'],  // みたいな感じで
            ['という', '感', 'じ', 'で'],              // という感じで
        ],
    },

    // ── UTTERANCE_CLOSING — Agreement / emphatic stacking ────────────────────
    {
        category: 'UTTERANCE_CLOSING', label: 'そうそうそう',
        tokens: [['そう', 'そう', 'そう']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'はいはいはい',
        tokens: [['は', 'い', 'は', 'い', 'は', 'い']],
    },
    {
        category: 'UTTERANCE_CLOSING', label: 'うんうんうん',
        tokens: [['う', 'ん', 'う', 'ん', 'う', 'ん']],
    },

    // ── DISCOURSE_CONNECTIVE — Causal / concessive chains ────────────────────
    {
        category: 'DISCOURSE_CONNECTIVE', label: 'だから',
        tokens: [['だ', 'から']],
    },
    {
        category: 'DISCOURSE_CONNECTIVE', label: 'から',
        tokens: [['から']],
    },
    {
        category: 'DISCOURSE_CONNECTIVE', label: 'わけで',
        tokens: [['わけ', 'で']],
    },
    {
        category: 'DISCOURSE_CONNECTIVE', label: '確かに',
        // '確'(kanji) + 'か'(single) + 'に'(single)
        tokens: [['確', 'か', 'に']],
    },
    {
        category: 'DISCOURSE_CONNECTIVE', label: 'でも',
        tokens: [['で', 'も']],
    },
    {
        category: 'DISCOURSE_CONNECTIVE', label: 'けど',
        tokens: [['けど']],
    },
    {
        category: 'DISCOURSE_CONNECTIVE', label: 'んですよ',
        tokens: [['ん', 'です', 'よ']],
    },
    // Evidence-chain markers
    {
        category: 'DISCOURSE_CONNECTIVE', label: '1つはさ',
        tokens: [['1', 'つ', 'は', 'さ']],
    },
    {
        category: 'DISCOURSE_CONNECTIVE', label: 'あともう1個',
        // 'あ'(accum) + 'と'(single) + 'もう'(morpheme) + '1'(ASCII) + '個'(kanji)
        tokens: [['あ', 'と', 'もう', '1', '個']],
    },

    // ── DISCOURSE_BOUNDARY — Topic shift ─────────────────────────────────────
    {
        category: 'DISCOURSE_BOUNDARY', label: '話変わるけど',
        // '話変'(kanji run) + 'わ'(single) + 'る'(single) + 'けど'(morpheme)
        tokens: [['話変', 'わ', 'る', 'けど']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'そういえば',
        tokens: [['そう', 'い', 'え', 'ば']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'ところで',
        // 'とこ'(2-char morpheme) + 'ろ' + 'で'
        tokens: [['とこ', 'ろ', 'で']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'それで',
        tokens: [['そ', 'れ', 'で']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'で',
        tokens: [['で']],
    },

    // ── DISCOURSE_BOUNDARY — Return to prior topic ────────────────────────────
    {
        category: 'DISCOURSE_BOUNDARY', label: 'さっきの',
        // 'さ'(single) + 'っ'(accum, bok) + 'き'(single) + 'の'(single)
        tokens: [['さ', 'っ', 'き', 'の']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: '話戻すと',
        // '話戻'(kanji run) + 'す'(single) + 'と'(single)
        tokens: [['話戻', 'す', 'と']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: '元に戻ると',
        tokens: [['元', 'に', '戻', 'る', 'と']],
    },

    // ── DISCOURSE_BOUNDARY — Summary / wrap-up ───────────────────────────────
    {
        category: 'DISCOURSE_BOUNDARY', label: '結局',
        tokens: [['結局']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: '要は',
        tokens: [['要', 'は']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'まとめると',
        // 'ま'(accum, boundary before 'と') + 'と'(single) + 'め'(single) + 'る'(single) + 'と'(single)
        tokens: [['ま', 'と', 'め', 'る', 'と']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'ということで',
        tokens: [['という', 'こ', 'と', 'で']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'という感じですね',
        tokens: [['という', '感', 'じ', 'です', 'ね']],
    },

    // ── DISCOURSE_BOUNDARY — New section ─────────────────────────────────────
    {
        category: 'DISCOURSE_BOUNDARY', label: '続いて',
        tokens: [['続', 'い', 'て']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'はい',
        tokens: [['は', 'い']],
    },
    {
        category: 'DISCOURSE_BOUNDARY', label: 'さあ',
        tokens: [['さ', 'あ']],
    },

    // ── INTERACTIONAL — Casual reasoning ─────────────────────────────────────
    {
        category: 'INTERACTIONAL', label: 'だからさ',
        tokens: [['だ', 'から', 'さ']],
    },

    // ── INTERACTIONAL — Emphatic stacking ────────────────────────────────────
    {
        category: 'INTERACTIONAL', label: 'そうそうそう',
        tokens: [['そう', 'そう', 'そう']],
    },
    {
        category: 'INTERACTIONAL', label: 'はいはいはい',
        tokens: [['は', 'い', 'は', 'い', 'は', 'い']],
    },

    // ── INTERACTIONAL — Backchannels ──────────────────────────────────────────
    {
        category: 'INTERACTIONAL', label: 'うん',
        tokens: [['う', 'ん']],
    },
    {
        category: 'INTERACTIONAL', label: 'ふーん',
        // 'ふ'(accum, stops at katakana ー) + 'ー'(katakana) + 'ん'(single)
        tokens: [['ふ', 'ー', 'ん']],
    },
    {
        category: 'INTERACTIONAL', label: 'へえ',
        tokens: [['へ', 'え']],
    },
    {
        category: 'INTERACTIONAL', label: 'ああ',
        // 'ああ' is a 2-char morpheme in HIRAGANA_MORPHEMES
        tokens: [['ああ']],
    },
    {
        category: 'INTERACTIONAL', label: 'なるほど',
        tokens: [['な', 'る', 'ほど']],
    },

    // ── INTERACTIONAL — Tag questions ─────────────────────────────────────────
    {
        category: 'INTERACTIONAL', label: 'だよね',
        tokens: [['だ', 'よね']],
    },
    {
        category: 'INTERACTIONAL', label: 'じゃない',
        tokens: [['じゃ', 'ない']],
    },
    {
        category: 'INTERACTIONAL', label: 'でしょ',
        tokens: [['で', 'し', 'ょ']],
    },
];

// ─── Matching helpers ─────────────────────────────────────────────────────────

/** Returns true if the token is pure whitespace (space, newline, ideographic space). */
function isWhitespaceToken(token: string): boolean {
    return /^[\s　]+$/.test(token);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect discourse patterns in a pre-tokenised array.
 *
 * The function strips whitespace tokens from consideration but preserves their
 * indices when reporting `startToken` / `endToken`, so results remain
 * consistent with the original token array.
 *
 * Within each rule, alternatives are tried longest-first.  All rules are
 * evaluated at every position, so the same span may produce multiple
 * `DetectedPattern` values if it is annotated by more than one category.
 */
export function detectPatternsInTokens(tokens: string[]): DetectedPattern[] {
    const results: DetectedPattern[] = [];

    // Build a compact view of non-whitespace tokens, each paired with its
    // original index in `tokens`.
    const contentTokens: Array<{ token: string; idx: number }> = [];
    for (let i = 0; i < tokens.length; i++) {
        if (!isWhitespaceToken(tokens[i])) {
            contentTokens.push({ token: tokens[i], idx: i });
        }
    }

    for (const rule of PATTERN_RULES) {
        // Sort alternatives by descending length so the longest form is
        // tested first at each position.
        const sortedAlts = [...rule.tokens].sort((a, b) => b.length - a.length);

        for (let pos = 0; pos < contentTokens.length; pos++) {
            for (const seq of sortedAlts) {
                if (pos + seq.length > contentTokens.length) continue;

                let match = true;
                for (let k = 0; k < seq.length; k++) {
                    if (contentTokens[pos + k].token !== seq[k]) {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    const startToken = contentTokens[pos].idx;
                    const endToken   = contentTokens[pos + seq.length - 1].idx + 1;
                    results.push({
                        category:    rule.category,
                        label:       rule.label,
                        tokens:      seq,
                        surfaceForm: seq.join(''),
                        startToken,
                        endToken,
                    });
                    break; // longest match for this rule at this position
                }
            }
        }
    }

    return results;
}

/**
 * Tokenise `text` with TinySegmenter, detect all discourse patterns, and
 * return `DetectedPattern` values enriched with `startChar` / `endChar`
 * character offsets into the original string.
 */
export function detectDiscoursePatterns(text: string): DetectedPattern[] {
    const seg    = new TinySegmenter();
    const tokens = seg.segment(text);

    // Build a char-offset table: tokenOffsets[i] = start of tokens[i] in text.
    const tokenOffsets: number[] = new Array(tokens.length);
    let pos = 0;
    for (let i = 0; i < tokens.length; i++) {
        tokenOffsets[i] = pos;
        pos += tokens[i].length;
    }

    const patterns = detectPatternsInTokens(tokens);

    return patterns.map(p => ({
        ...p,
        startChar: tokenOffsets[p.startToken],
        endChar:
            p.endToken < tokens.length
                ? tokenOffsets[p.endToken]
                : text.length,
    }));
}
