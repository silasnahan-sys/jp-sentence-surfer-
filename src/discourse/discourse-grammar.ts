/**
 * 談話文法 (Discourse Grammar) Pattern Detection Engine
 *
 * Detects discourse grammar patterns in Japanese spoken language text,
 * specifically optimized for YT transcript content.
 *
 * Pattern detection is performed against morpheme token sequences produced
 * by TinySegmenter, not raw string matching, to avoid false positives.
 */

import { TinySegmenter } from '../tiny-segmenter';
import {
    DiscourseMarker,
    DiscourseMarkerCategory,
    DiscoursePatternType,
    DiscourseAnalysis,
} from '../types';

// ─── Pattern Definitions ──────────────────────────────────────────────────────

interface PatternDef {
    /** Morpheme token sequence to match (in order) */
    tokens: string[];
    category: DiscourseMarkerCategory;
    patternType: DiscoursePatternType;
}

/**
 * Opening markers — typically appear at the start of an utterance.
 * Category: 'opening'
 */
const OPENING_PATTERNS: PatternDef[] = [
    // Topic-setters / discourse connectives
    { tokens: ['結局'],       category: 'opening', patternType: 'summary' },
    { tokens: ['要するに'],   category: 'opening', patternType: 'summary' },
    { tokens: ['つまり'],     category: 'opening', patternType: 'summary' },
    { tokens: ['要は'],       category: 'opening', patternType: 'summary' },
    { tokens: ['まとめると'], category: 'opening', patternType: 'summary' },
    { tokens: ['というのは'], category: 'opening', patternType: 'topic-setter' },
    { tokens: ['と', 'いう', 'の', 'は'], category: 'opening', patternType: 'topic-setter' },
    { tokens: ['実は'],       category: 'opening', patternType: 'topic-setter' },
    { tokens: ['正直'],       category: 'opening', patternType: 'topic-setter' },
    { tokens: ['逆に'],       category: 'opening', patternType: 'contrast' },
    { tokens: ['むしろ'],     category: 'opening', patternType: 'contrast' },
    { tokens: ['ちなみに'],   category: 'opening', patternType: 'topic-shift' },
    { tokens: ['そもそも'],   category: 'opening', patternType: 'topic-setter' },
    { tokens: ['基本的に'],   category: 'opening', patternType: 'topic-setter' },
    { tokens: ['ところが'],   category: 'opening', patternType: 'contrast' },
    { tokens: ['だから'],     category: 'opening', patternType: 'cause-result' },
    { tokens: ['じゃあ'],     category: 'opening', patternType: 'cause-result' },
    { tokens: ['それで'],     category: 'opening', patternType: 'topic-shift' },
    { tokens: ['そしたら'],   category: 'opening', patternType: 'cause-result' },
    { tokens: ['でね'],       category: 'opening', patternType: 'elaboration' },
    { tokens: ['あのね'],     category: 'opening', patternType: 'hedge' },
    { tokens: ['ほら'],       category: 'opening', patternType: 'topic-setter' },
    // Hedges / fillers
    { tokens: ['えーと'],     category: 'opening', patternType: 'hedge' },
    { tokens: ['あのー'],     category: 'opening', patternType: 'hedge' },
    { tokens: ['まあ'],       category: 'opening', patternType: 'hedge' },
    { tokens: ['なんか'],     category: 'opening', patternType: 'hedge' },
    { tokens: ['ちょっと'],   category: 'opening', patternType: 'hedge' },
    { tokens: ['一応'],       category: 'opening', patternType: 'hedge' },
    { tokens: ['やっぱり'],   category: 'opening', patternType: 'topic-setter' },
    { tokens: ['やっぱ'],     category: 'opening', patternType: 'topic-setter' },
    { tokens: ['ていうか'],   category: 'opening', patternType: 'topic-setter' },
    { tokens: ['て', 'いう', 'か'], category: 'opening', patternType: 'topic-setter' },
    { tokens: ['っていうか'], category: 'opening', patternType: 'topic-setter' },
    { tokens: ['って', 'いう', 'か'], category: 'opening', patternType: 'topic-setter' },
];

/**
 * Closing markers — appear at the end of utterances, signaling speaker stance.
 * Category: 'closing'
 */
const CLOSING_PATTERNS: PatternDef[] = [
    // わけ constructions (explanatory)
    { tokens: ['わけ', 'だ', 'から'],        category: 'closing', patternType: 'cause-result' },
    { tokens: ['わけ', 'です', 'よ'],        category: 'closing', patternType: 'emphasis' },
    { tokens: ['わけ', 'な', 'ん', 'です', 'よ'], category: 'closing', patternType: 'emphasis' },
    { tokens: ['わけ', 'で'],               category: 'closing', patternType: 'elaboration' },
    { tokens: ['わけ', 'です', 'けど'],     category: 'closing', patternType: 'softening' },
    { tokens: ['わけ', 'じゃ', 'ない'],     category: 'closing', patternType: 'contrast' },
    // はず constructions (evidential/expectation)
    { tokens: ['はず', 'な', 'ん', 'です', 'よ', 'ね'], category: 'closing', patternType: 'evidential' },
    { tokens: ['はず', 'な', 'ん', 'です', 'よ'],       category: 'closing', patternType: 'evidential' },
    { tokens: ['はず', 'だ', 'から'],                   category: 'closing', patternType: 'evidential' },
    { tokens: ['はず', 'です', 'けど'],                 category: 'closing', patternType: 'evidential' },
    { tokens: ['はず', 'な', 'の', 'に'],               category: 'closing', patternType: 'evidential' },
    // もの/もん constructions
    { tokens: ['もの', 'です', 'から'],  category: 'closing', patternType: 'cause-result' },
    { tokens: ['もん', 'だ', 'から'],   category: 'closing', patternType: 'cause-result' },
    { tokens: ['もの', 'な', 'ん', 'です', 'けど'], category: 'closing', patternType: 'softening' },
    // Hearsay
    { tokens: ['そう', 'です'],          category: 'closing', patternType: 'hearsay' },
    { tokens: ['という', 'こと', 'です'], category: 'closing', patternType: 'hearsay' },
    { tokens: ['と', 'いう', 'こと', 'です'], category: 'closing', patternType: 'hearsay' },
    { tokens: ['らしい', 'です'],        category: 'closing', patternType: 'hearsay' },
    { tokens: ['みたい', 'です'],        category: 'closing', patternType: 'hearsay' },
    { tokens: ['って', '言っ', 'て', 'た'], category: 'closing', patternType: 'hearsay' },
    { tokens: ['だ', 'そう', 'です'],   category: 'closing', patternType: 'hearsay' },
    // Confirmation-seeking
    { tokens: ['じゃ', 'ない', 'です', 'か'], category: 'closing', patternType: 'confirmation-seeking' },
    { tokens: ['じゃ', 'ない', 'か'],    category: 'closing', patternType: 'confirmation-seeking' },
    { tokens: ['でしょう'],              category: 'closing', patternType: 'confirmation-seeking' },
    { tokens: ['だろう'],               category: 'closing', patternType: 'confirmation-seeking' },
    { tokens: ['よ', 'ね'],            category: 'closing', patternType: 'confirmation-seeking' },
    { tokens: ['です', 'よ', 'ね'],    category: 'closing', patternType: 'confirmation-seeking' },
    { tokens: ['ん', 'です', 'よ', 'ね'], category: 'closing', patternType: 'confirmation-seeking' },
    { tokens: ['じゃん'],              category: 'closing', patternType: 'confirmation-seeking' },
    // Emphasis / assertion
    { tokens: ['ん', 'です', 'よ'],    category: 'closing', patternType: 'emphasis' },
    { tokens: ['の', 'です', 'よ'],    category: 'closing', patternType: 'emphasis' },
    { tokens: ['ん', 'だ', 'よ', 'ね'], category: 'closing', patternType: 'emphasis' },
    // Softening
    { tokens: ['ん', 'です', 'けど'],       category: 'closing', patternType: 'softening' },
    { tokens: ['ん', 'です', 'けれども'],   category: 'closing', patternType: 'softening' },
    { tokens: ['ん', 'だ', 'けど'],        category: 'closing', patternType: 'softening' },
    { tokens: ['か', 'な', 'と', '思っ', 'て'], category: 'closing', patternType: 'softening' },
    { tokens: ['という', '感じ', 'で'],    category: 'closing', patternType: 'softening' },
    { tokens: ['と', 'いう', '感じ', 'で'], category: 'closing', patternType: 'softening' },
];

/**
 * Discourse boundary markers — signal topic transitions.
 * Category: 'boundary'
 */
const BOUNDARY_PATTERNS: PatternDef[] = [
    { tokens: ['ところで'],          category: 'boundary', patternType: 'topic-shift' },
    { tokens: ['話', '変わる', 'けど'], category: 'boundary', patternType: 'topic-shift' },
    { tokens: ['そういえば'],        category: 'boundary', patternType: 'topic-shift' },
    { tokens: ['で'],               category: 'boundary', patternType: 'elaboration' },
    // Return to topic
    { tokens: ['話', '戻す', 'と'],  category: 'boundary', patternType: 'topic-return' },
    { tokens: ['元に', '戻る', 'と'], category: 'boundary', patternType: 'topic-return' },
    { tokens: ['で', 'さっき', 'の'], category: 'boundary', patternType: 'topic-return' },
    // Summary / wrap-up
    { tokens: ['ということで'],      category: 'boundary', patternType: 'summary' },
    { tokens: ['と', 'いう', 'こと', 'で'], category: 'boundary', patternType: 'summary' },
];

/**
 * Internal connective patterns — logical flow markers inside an utterance.
 * Category: 'connective'
 */
const CONNECTIVE_PATTERNS: PatternDef[] = [
    // Quote / evidential
    { tokens: ['って'],            category: 'connective', patternType: 'hearsay' },
    { tokens: ['という'],          category: 'connective', patternType: 'hearsay' },
    { tokens: ['と', 'いう'],      category: 'connective', patternType: 'hearsay' },
    // Cause-result connectives
    { tokens: ['から'],            category: 'connective', patternType: 'cause-result' },
    { tokens: ['ので'],            category: 'connective', patternType: 'cause-result' },
    // Contrast/concession connectives
    { tokens: ['けど'],            category: 'connective', patternType: 'contrast' },
    { tokens: ['けれども'],        category: 'connective', patternType: 'contrast' },
    { tokens: ['確かに'],          category: 'connective', patternType: 'concession' },
    { tokens: ['でも'],            category: 'connective', patternType: 'contrast' },
];

/**
 * Interactional particle patterns.
 * Category: 'interactional'
 */
const INTERACTIONAL_PATTERNS: PatternDef[] = [
    { tokens: ['ね'],   category: 'interactional', patternType: 'confirmation-seeking' },
    { tokens: ['よ'],   category: 'interactional', patternType: 'emphasis' },
    { tokens: ['さ'],   category: 'interactional', patternType: 'emphasis' },
    { tokens: ['な'],   category: 'interactional', patternType: 'confirmation-seeking' },
    { tokens: ['かな'], category: 'interactional', patternType: 'hedge' },
    { tokens: ['でしょ'], category: 'interactional', patternType: 'confirmation-seeking' },
    { tokens: ['だよね'], category: 'interactional', patternType: 'confirmation-seeking' },
    { tokens: ['じゃない'], category: 'interactional', patternType: 'confirmation-seeking' },
];

// ─── Token Sequence Matcher ───────────────────────────────────────────────────

/**
 * Try to match a pattern's token sequence starting at position `pos` in `tokens`.
 * Returns the end position (exclusive) if matched, or -1.
 */
function matchTokenSequence(tokens: string[], pos: number, pattern: string[]): number {
    if (pos + pattern.length > tokens.length) return -1;
    for (let i = 0; i < pattern.length; i++) {
        if (tokens[pos + i] !== pattern[i]) return -1;
    }
    return pos + pattern.length;
}

/**
 * Compute character offset in `text` corresponding to the start of token at `tokenIdx`.
 * We need this to report start/end character positions within the chunk.
 */
function computeCharOffsets(text: string, tokens: string[]): number[] {
    const offsets: number[] = [];
    let pos = 0;
    for (const token of tokens) {
        // Find the token starting from `pos` (some segmenters may add spaces)
        const idx = text.indexOf(token, pos);
        if (idx === -1) {
            offsets.push(pos);
        } else {
            offsets.push(idx);
            pos = idx + token.length;
        }
    }
    offsets.push(pos); // sentinel: length of last token end
    return offsets;
}

// ─── Core Detection Functions ─────────────────────────────────────────────────

/**
 * Scan token array for matches against a set of patterns.
 * Returns all found markers with character offsets within `chunkText`.
 */
function scanPatterns(
    chunkText: string,
    tokens: string[],
    charOffsets: number[],
    patterns: PatternDef[]
): DiscourseMarker[] {
    const found: DiscourseMarker[] = [];
    const usedRanges: Array<[number, number]> = []; // avoid overlapping matches

    // Sort patterns longest-first to prefer more specific matches
    const sorted = [...patterns].sort((a, b) => b.tokens.length - a.tokens.length);

    for (let i = 0; i < tokens.length; i++) {
        for (const pat of sorted) {
            const endIdx = matchTokenSequence(tokens, i, pat.tokens);
            if (endIdx === -1) continue;

            const startChar = charOffsets[i];
            const endChar = charOffsets[endIdx] ?? chunkText.length;

            // Check no overlap with existing matches
            const overlaps = usedRanges.some(([s, e]) => startChar < e && endChar > s);
            if (overlaps) continue;

            usedRanges.push([startChar, endChar]);
            found.push({
                surface: chunkText.slice(startChar, endChar),
                category: pat.category,
                patternType: pat.patternType,
                startInChunk: startChar,
                endInChunk: endChar,
            });
            break; // longest match consumed
        }
    }

    return found;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const segmenter = new TinySegmenter();

/**
 * Fully analyze a Japanese text chunk for discourse grammar patterns.
 *
 * @param chunkText — the raw text of the chunk (may include timestamps etc.)
 * @param cleanText — text with timestamps stripped (used for tokenization)
 */
export function analyzeDiscourseChunk(chunkText: string, cleanText?: string): DiscourseAnalysis {
    const textToAnalyze = cleanText ?? chunkText;
    const tokens = segmenter.segment(textToAnalyze);
    const charOffsets = computeCharOffsets(textToAnalyze, tokens);

    const opening = scanPatterns(textToAnalyze, tokens, charOffsets, OPENING_PATTERNS);
    const closing = scanPatterns(textToAnalyze, tokens, charOffsets, CLOSING_PATTERNS);
    const boundary = scanPatterns(textToAnalyze, tokens, charOffsets, BOUNDARY_PATTERNS);
    const connective = scanPatterns(textToAnalyze, tokens, charOffsets, CONNECTIVE_PATTERNS);
    const interactional = scanPatterns(textToAnalyze, tokens, charOffsets, INTERACTIONAL_PATTERNS);

    // All connective+interactional patterns that are not opening/closing are "internal"
    const allInternal = [...connective, ...interactional];

    // Separate opening markers: those near the start of the text (first 20% or first 10 chars)
    const threshold = Math.max(10, Math.floor(textToAnalyze.length * 0.2));
    const openingFinal = opening.filter(m => m.startInChunk < threshold);
    // Any opening marker not near the start becomes an internal marker
    const openingLate = opening.filter(m => m.startInChunk >= threshold);

    // Separate closing markers: those near the end of the text (last 30% or last 15 chars)
    const closeThreshold = Math.max(15, Math.floor(textToAnalyze.length * 0.3));
    const closingFinal = closing.filter(m => m.endInChunk > textToAnalyze.length - closeThreshold);
    const closingEarly = closing.filter(m => m.endInChunk <= textToAnalyze.length - closeThreshold);

    const internalFinal = [...allInternal, ...openingLate, ...closingEarly, ...boundary];

    // Collect unique discourse pattern tags
    const tagSet = new Set<DiscoursePatternType>();
    for (const m of [...openingFinal, ...closingFinal, ...internalFinal, ...boundary]) {
        tagSet.add(m.patternType);
    }

    return {
        openingMarkers: openingFinal,
        closingMarkers: closingFinal,
        internalMarkers: internalFinal,
        boundaryMarkers: boundary,
        discoursePatternTags: Array.from(tagSet),
    };
}

/**
 * Detect all discourse patterns in a longer text (for overlay visualization).
 * Returns markers with offsets relative to the full text.
 */
export function detectAllPatterns(fullText: string): DiscourseMarker[] {
    const tokens = segmenter.segment(fullText);
    const charOffsets = computeCharOffsets(fullText, tokens);

    const allPatterns = [
        ...OPENING_PATTERNS,
        ...CLOSING_PATTERNS,
        ...BOUNDARY_PATTERNS,
        ...CONNECTIVE_PATTERNS,
        ...INTERACTIONAL_PATTERNS,
    ];

    return scanPatterns(fullText, tokens, charOffsets, allPatterns);
}

/**
 * Check whether a text chunk starts with a discourse opening marker.
 */
export function hasOpeningMarker(text: string): DiscourseMarker | null {
    const tokens = segmenter.segment(text);
    const charOffsets = computeCharOffsets(text, tokens);
    const sorted = [...OPENING_PATTERNS].sort((a, b) => b.tokens.length - a.tokens.length);
    for (const pat of sorted) {
        const endIdx = matchTokenSequence(tokens, 0, pat.tokens);
        if (endIdx !== -1) {
            const endChar = charOffsets[endIdx] ?? text.length;
            return {
                surface: text.slice(0, endChar),
                category: pat.category,
                patternType: pat.patternType,
                startInChunk: 0,
                endInChunk: endChar,
            };
        }
    }
    return null;
}

/**
 * Check whether a text chunk ends with a discourse closing marker.
 */
export function hasClosingMarker(text: string): DiscourseMarker | null {
    const tokens = segmenter.segment(text);
    const charOffsets = computeCharOffsets(text, tokens);
    const sorted = [...CLOSING_PATTERNS].sort((a, b) => b.tokens.length - a.tokens.length);

    // Try to match closing patterns at the end of token stream
    for (const pat of sorted) {
        const startIdx = tokens.length - pat.tokens.length;
        if (startIdx < 0) continue;
        const endIdx = matchTokenSequence(tokens, startIdx, pat.tokens);
        if (endIdx !== -1) {
            const startChar = charOffsets[startIdx];
            return {
                surface: text.slice(startChar),
                category: pat.category,
                patternType: pat.patternType,
                startInChunk: startChar,
                endInChunk: text.length,
            };
        }
    }
    return null;
}

/**
 * Returns a human-readable label for a discourse pattern type.
 */
export function getPatternLabel(type: DiscoursePatternType): string {
    const labels: Record<DiscoursePatternType, string> = {
        'cause-result':          '原因・結果',
        'contrast':              '対比',
        'elaboration':           '展開',
        'concession':            '譲歩',
        'topic-shift':           '話題転換',
        'topic-return':          '話題復帰',
        'summary':               '要約',
        'confirmation-seeking':  '確認',
        'hearsay':               '伝聞',
        'evidential':            '証拠',
        'emphasis':              '強調',
        'softening':             '緩和',
        'hedge':                 'ヘッジ',
        'topic-setter':          '話題設定',
    };
    return labels[type] ?? type;
}

/**
 * Returns a CSS color class name for a discourse marker category.
 */
export function getMarkerColorClass(category: DiscourseMarkerCategory): string {
    switch (category) {
        case 'opening':       return 'discourse-marker-opening';
        case 'closing':       return 'discourse-marker-closing';
        case 'boundary':      return 'discourse-marker-boundary';
        case 'connective':    return 'discourse-marker-connective';
        case 'interactional': return 'discourse-marker-interactional';
    }
}
