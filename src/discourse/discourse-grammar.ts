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

// ═══════════════════════════════════════════════════════════════════════════════
// PR9 Supplemental: Rich Pattern Catalog (118 patterns with full metadata)
// This catalog provides category (A-H), register, pragmaticFunction, and
// coOccurrence metadata for use in advanced discourse analysis features.
// ═══════════════════════════════════════════════════════════════════════════════
export enum DiscourseCategory {
    A = 'A',
    B = 'B',
    C = 'C',
    D = 'D',
    E = 'E',
    F = 'F',
    G = 'G',
    H = 'H',
}

export interface DetectedMarker {
    patternId: string;
    category: DiscourseCategory;
    matchedText: string;
    startOffset: number;
    endOffset: number;
    position: 'initial' | 'medial' | 'final' | 'any';
}

export interface DiscoursePatternEntry {
    id: string;
    category: DiscourseCategory;
    pattern: string | RegExp;
    position: 'initial' | 'medial' | 'final' | 'any';
    register: 'casual' | 'neutral' | 'formal' | 'any';
    pragmaticFunction: string;
    coOccurrence: string[];
}

export const DISCOURSE_PATTERNS: DiscoursePatternEntry[] = [
    // ─── A: Utterance-Initial Markers ─────────────────────────────────────────
    {
        id: 'A-001',
        category: DiscourseCategory.A,
        pattern: '結局',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Signals a conclusive restatement or summary of prior discourse',
        coOccurrence: ['やっぱり', 'つまり'],
    },
    {
        id: 'A-002',
        category: DiscourseCategory.A,
        pattern: 'やっぱり',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Confirms expectation or reinstates a previously held view',
        coOccurrence: ['結局', 'やっぱ'],
    },
    {
        id: 'A-003',
        category: DiscourseCategory.A,
        pattern: 'やっぱ',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Casual variant of やっぱり; confirms expectation',
        coOccurrence: ['やっぱり', '結局'],
    },
    {
        id: 'A-004',
        category: DiscourseCategory.A,
        pattern: '要するに',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Introduces a paraphrase or simplification of the preceding content',
        coOccurrence: ['つまり', '結局'],
    },
    {
        id: 'A-005',
        category: DiscourseCategory.A,
        pattern: 'つまり',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Reformulates or clarifies the preceding proposition',
        coOccurrence: ['要するに', 'ということは'],
    },
    {
        id: 'A-006',
        category: DiscourseCategory.A,
        pattern: '基本的に',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Frames the following claim as a general or baseline principle',
        coOccurrence: ['基本的には', '原則として'],
    },
    {
        id: 'A-007',
        category: DiscourseCategory.A,
        pattern: '正直',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Signals candid or frank disclosure of speaker attitude',
        coOccurrence: ['実は', '本当は'],
    },
    {
        id: 'A-008',
        category: DiscourseCategory.A,
        pattern: 'そもそも',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Returns to the fundamental premise or challenges an assumption',
        coOccurrence: ['だいたい', '要するに'],
    },
    {
        id: 'A-009',
        category: DiscourseCategory.A,
        pattern: 'まあ',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Softens or hedges the forthcoming utterance',
        coOccurrence: ['なんか', 'ちょっと'],
    },
    {
        id: 'A-010',
        category: DiscourseCategory.A,
        pattern: 'なんか',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Vague filler that signals search for words or hesitation',
        coOccurrence: ['まあ', 'ちょっと'],
    },
    {
        id: 'A-011',
        category: DiscourseCategory.A,
        pattern: 'ほら',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Draws listener attention or cues shared knowledge',
        coOccurrence: ['ね', 'ねえ'],
    },
    {
        id: 'A-012',
        category: DiscourseCategory.A,
        pattern: 'ねえ',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Attention-getter or appeal to shared knowledge at turn start',
        coOccurrence: ['ほら', 'あのね'],
    },
    {
        id: 'A-013',
        category: DiscourseCategory.A,
        pattern: 'あのね',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Signals that the speaker is about to disclose something significant',
        coOccurrence: ['ねえ', '実は'],
    },
    {
        id: 'A-014',
        category: DiscourseCategory.A,
        pattern: 'じゃあ',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Marks a consequential or transitional move in discourse',
        coOccurrence: ['では', 'だから'],
    },
    {
        id: 'A-015',
        category: DiscourseCategory.A,
        pattern: 'だから',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Foregrounds a causal or resultative relation to prior content',
        coOccurrence: ['だって', 'なので'],
    },
    {
        id: 'A-016',
        category: DiscourseCategory.A,
        pattern: 'でも',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Introduces a contrastive or counterargument stance',
        coOccurrence: ['ただ', 'けど'],
    },
    {
        id: 'A-017',
        category: DiscourseCategory.A,
        pattern: 'ただ',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Adds a qualification or reservation to the preceding claim',
        coOccurrence: ['でも', 'ただし'],
    },
    {
        id: 'A-018',
        category: DiscourseCategory.A,
        pattern: '実は',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Prefaces a revelation or correction of an assumed state',
        coOccurrence: ['正直', 'あのね'],
    },
    {
        id: 'A-019',
        category: DiscourseCategory.A,
        pattern: '確かに',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Grants concession before presenting contrasting view',
        coOccurrence: ['なるほど', 'ただ'],
    },
    {
        id: 'A-020',
        category: DiscourseCategory.A,
        pattern: '逆に',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Introduces an opposing or reverse perspective',
        coOccurrence: ['一方で', 'むしろ'],
    },
    {
        id: 'A-021',
        category: DiscourseCategory.A,
        pattern: '別に',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Downplays the significance of the following proposition',
        coOccurrence: ['まあ', 'そんなに'],
    },
    {
        id: 'A-022',
        category: DiscourseCategory.A,
        pattern: '一応',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Signals a tentative or provisional framing of what follows',
        coOccurrence: ['まあ', 'ちょっと'],
    },

    // ─── B: Utterance-Final Markers ───────────────────────────────────────────
    {
        id: 'B-001',
        category: DiscourseCategory.B,
        pattern: /わけだから[。、！？\s]*/,
        position: 'final',
        register: 'any',
        pragmaticFunction: 'Marks causal grounding of conclusion; invites inference',
        coOccurrence: ['だから', 'ので'],
    },
    {
        id: 'B-002',
        category: DiscourseCategory.B,
        pattern: /はずなんですよね[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Hedged expectation-based assertion seeking confirmation',
        coOccurrence: ['はずです', 'んですよね'],
    },
    {
        id: 'B-003',
        category: DiscourseCategory.B,
        pattern: /んじゃないかな[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Soft conjecture inviting implicit agreement',
        coOccurrence: ['かもしれない', 'と思う'],
    },
    {
        id: 'B-004',
        category: DiscourseCategory.B,
        pattern: /と思うんですけど[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Polite hedged opinion marker leaving room for disagreement',
        coOccurrence: ['と思います', 'んですけど'],
    },
    {
        id: 'B-005',
        category: DiscourseCategory.B,
        pattern: /っていう話[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Frames utterance as reported or cited discourse',
        coOccurrence: ['ということで', 'っていうか'],
    },
    {
        id: 'B-006',
        category: DiscourseCategory.B,
        pattern: /みたいな感じ[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Vague approximation marker; hedges the described state',
        coOccurrence: ['みたいな', '的な感じ'],
    },
    {
        id: 'B-007',
        category: DiscourseCategory.B,
        pattern: /ということで[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Summarises and closes a topic or transaction',
        coOccurrence: ['結局', 'つまり'],
    },
    {
        id: 'B-008',
        category: DiscourseCategory.B,
        pattern: /わけですよ[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Asserts reasoning or conclusion with mild emphasis',
        coOccurrence: ['わけだ', 'わけで'],
    },
    {
        id: 'B-009',
        category: DiscourseCategory.B,
        pattern: /んですよね[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Seeks ratification of an explanatory assertion',
        coOccurrence: ['ですよね', 'んですよ'],
    },
    {
        id: 'B-010',
        category: DiscourseCategory.B,
        pattern: /じゃないですか[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Appeals to shared knowledge or invites agreement',
        coOccurrence: ['ですよね', 'でしょ'],
    },
    {
        id: 'B-011',
        category: DiscourseCategory.B,
        pattern: /かもしれない[。、！？\s]*/,
        position: 'final',
        register: 'any',
        pragmaticFunction: 'Epistemic hedge marking uncertainty',
        coOccurrence: ['かもしれません', 'たぶん'],
    },
    {
        id: 'B-012',
        category: DiscourseCategory.B,
        pattern: /と思います[。、！？\s]*/,
        position: 'final',
        register: 'formal',
        pragmaticFunction: 'Polite first-person opinion expression',
        coOccurrence: ['と思う', 'と感じます'],
    },
    {
        id: 'B-013',
        category: DiscourseCategory.B,
        pattern: /ってことは[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Draws an inference from just-stated content',
        coOccurrence: ['ということは', 'つまり'],
    },
    {
        id: 'B-014',
        category: DiscourseCategory.B,
        pattern: /んだけど[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Trailing hedge that leaves utterance open-ended',
        coOccurrence: ['けど', 'んですけど'],
    },
    {
        id: 'B-015',
        category: DiscourseCategory.B,
        pattern: /なんですけどね[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Softened explanatory closure seeking light sympathy',
        coOccurrence: ['なんですけど', 'んですけどね'],
    },

    // ─── C: Connective Patterns ───────────────────────────────────────────────
    {
        id: 'C-001',
        category: DiscourseCategory.C,
        pattern: 'それで',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Marks temporal or causal continuation from prior clause',
        coOccurrence: ['そうしたら', 'そして'],
    },
    {
        id: 'C-002',
        category: DiscourseCategory.C,
        pattern: 'そうすると',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Marks logical or conditional consequence',
        coOccurrence: ['すると', 'そうしたら'],
    },
    {
        id: 'C-003',
        category: DiscourseCategory.C,
        pattern: 'ということは',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Derives an explicit inference from prior discourse',
        coOccurrence: ['つまり', 'ってことは'],
    },
    {
        id: 'C-004',
        category: DiscourseCategory.C,
        pattern: 'そういう意味では',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Scopes the current claim within the prior semantic frame',
        coOccurrence: ['その点では', 'その意味で'],
    },
    {
        id: 'C-005',
        category: DiscourseCategory.C,
        pattern: /^で[、,\s]/m,
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Casual sentence-initial connective marking continuation',
        coOccurrence: ['それで', 'んで'],
    },
    {
        id: 'C-006',
        category: DiscourseCategory.C,
        pattern: 'んで',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Casual contracted connective; continues narrative thread',
        coOccurrence: ['で', 'それで'],
    },
    {
        id: 'C-007',
        category: DiscourseCategory.C,
        pattern: 'だけど',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Contrastive connective at clause or sentence boundary',
        coOccurrence: ['でも', 'けど'],
    },
    {
        id: 'C-008',
        category: DiscourseCategory.C,
        pattern: 'けれども',
        position: 'initial',
        register: 'formal',
        pragmaticFunction: 'Formal contrastive connective',
        coOccurrence: ['しかし', 'だが'],
    },
    {
        id: 'C-009',
        category: DiscourseCategory.C,
        pattern: 'ただし',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Introduces a conditional exception or proviso',
        coOccurrence: ['ただ', 'ただ一方'],
    },
    {
        id: 'C-010',
        category: DiscourseCategory.C,
        pattern: '一方で',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Marks contrastive parallel perspective',
        coOccurrence: ['逆に', '他方で'],
    },
    {
        id: 'C-011',
        category: DiscourseCategory.C,
        pattern: 'むしろ',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Reframes proposition with a preferable or stronger alternative',
        coOccurrence: ['逆に', 'というより'],
    },
    {
        id: 'C-012',
        category: DiscourseCategory.C,
        pattern: 'しかも',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Adds a reinforcing or surprising additional point',
        coOccurrence: ['さらに', 'その上'],
    },
    {
        id: 'C-013',
        category: DiscourseCategory.C,
        pattern: 'さらに',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Adds an escalating additional point',
        coOccurrence: ['しかも', 'その上'],
    },
    {
        id: 'C-014',
        category: DiscourseCategory.C,
        pattern: 'そのうえ',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Cumulative addition of a further supporting point',
        coOccurrence: ['さらに', 'しかも'],
    },
    {
        id: 'C-015',
        category: DiscourseCategory.C,
        pattern: 'そして',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Sequential or additive connective linking events or claims',
        coOccurrence: ['それから', 'また'],
    },
    {
        id: 'C-016',
        category: DiscourseCategory.C,
        pattern: 'それから',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Temporal or enumerative sequel marker',
        coOccurrence: ['そして', 'また'],
    },
    {
        id: 'C-017',
        category: DiscourseCategory.C,
        pattern: 'また',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Additive or reiterative connective',
        coOccurrence: ['そして', 'さらに'],
    },

    // ─── D: Hedging / Softening ───────────────────────────────────────────────
    {
        id: 'D-001',
        category: DiscourseCategory.D,
        pattern: 'みたいな',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Approximative hedge likening the referent to a category',
        coOccurrence: ['ような', '的な'],
    },
    {
        id: 'D-002',
        category: DiscourseCategory.D,
        pattern: 'っぽい',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Adjectival hedge suggesting resemblance or inclination',
        coOccurrence: ['みたいな', '的な'],
    },
    {
        id: 'D-003',
        category: DiscourseCategory.D,
        pattern: '的な',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Nominalising hedge marking loose category membership',
        coOccurrence: ['みたいな', 'っぽい'],
    },
    {
        id: 'D-004',
        category: DiscourseCategory.D,
        pattern: '感じ',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Vague approximation; softens propositional commitment',
        coOccurrence: ['みたいな感じ', 'そんな感じ'],
    },
    {
        id: 'D-005',
        category: DiscourseCategory.D,
        pattern: 'ような',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Simile or approximative marker reducing assertion strength',
        coOccurrence: ['みたいな', 'っぽい'],
    },
    {
        id: 'D-006',
        category: DiscourseCategory.D,
        pattern: 'かな',
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Softens assertion; expresses wondering or self-directed query',
        coOccurrence: ['かなあ', 'かも'],
    },
    {
        id: 'D-007',
        category: DiscourseCategory.D,
        pattern: 'たぶん',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Epistemic hedge indicating moderate probability',
        coOccurrence: ['おそらく', 'かもしれない'],
    },
    {
        id: 'D-008',
        category: DiscourseCategory.D,
        pattern: 'おそらく',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Formal-leaning epistemic hedge indicating probability',
        coOccurrence: ['たぶん', 'かもしれない'],
    },
    {
        id: 'D-009',
        category: DiscourseCategory.D,
        pattern: 'ちょっと',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Minimiser that softens requests, negatives, or assessments',
        coOccurrence: ['少し', 'まあ'],
    },
    {
        id: 'D-010',
        category: DiscourseCategory.D,
        pattern: '多少',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Quantitative minimiser hedging degree or amount',
        coOccurrence: ['ちょっと', '少々'],
    },
    {
        id: 'D-011',
        category: DiscourseCategory.D,
        pattern: 'ある意味',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Scoping hedge limiting claim to one interpretive dimension',
        coOccurrence: ['ある種', '一種の'],
    },
    {
        id: 'D-012',
        category: DiscourseCategory.D,
        pattern: 'いわゆる',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Marks a term as conventionally or loosely understood',
        coOccurrence: ['ある意味', '一種の'],
    },
    {
        id: 'D-013',
        category: DiscourseCategory.D,
        pattern: 'なんとなく',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Marks vague, unanalysed intuition or motivation',
        coOccurrence: ['なんか', 'ちょっと'],
    },
    {
        id: 'D-014',
        category: DiscourseCategory.D,
        pattern: '一種の',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Hedges categorisation as approximate',
        coOccurrence: ['いわゆる', 'ある意味'],
    },

    // ─── E: Evidence / Reasoning ──────────────────────────────────────────────
    {
        id: 'E-001',
        category: DiscourseCategory.E,
        pattern: 'わけだ',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Marks the proposition as a logical or contextual consequence',
        coOccurrence: ['わけで', 'わけだから'],
    },
    {
        id: 'E-002',
        category: DiscourseCategory.E,
        pattern: 'わけで',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Connective use of わけ establishing explanatory ground',
        coOccurrence: ['わけだ', 'のだから'],
    },
    {
        id: 'E-003',
        category: DiscourseCategory.E,
        pattern: 'わけだから',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Causal form of わけ linking reasoning to conclusion',
        coOccurrence: ['わけで', 'だから'],
    },
    {
        id: 'E-004',
        category: DiscourseCategory.E,
        pattern: 'はずだ',
        position: 'final',
        register: 'any',
        pragmaticFunction: 'Asserts expectation based on knowledge or inference',
        coOccurrence: ['はずです', 'はずなんです'],
    },
    {
        id: 'E-005',
        category: DiscourseCategory.E,
        pattern: 'はずです',
        position: 'final',
        register: 'formal',
        pragmaticFunction: 'Polite form of expectation-based assertion',
        coOccurrence: ['はずだ', 'はずなんです'],
    },
    {
        id: 'E-006',
        category: DiscourseCategory.E,
        pattern: 'はずなんです',
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Explanatory-modal form foregrounding the expected state',
        coOccurrence: ['はずです', 'はずなんですよ'],
    },
    {
        id: 'E-007',
        category: DiscourseCategory.E,
        pattern: 'ので',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Polite causal connector linking reason to consequence',
        coOccurrence: ['から', 'ために'],
    },
    {
        id: 'E-008',
        category: DiscourseCategory.E,
        pattern: 'から',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Direct causal connector; can also mark reason with speaker stance',
        coOccurrence: ['ので', 'だから'],
    },
    {
        id: 'E-009',
        category: DiscourseCategory.E,
        pattern: 'っていうのは',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Topic-framing marker introducing an explanation',
        coOccurrence: ['というのは', 'というのも'],
    },
    {
        id: 'E-010',
        category: DiscourseCategory.E,
        pattern: 'というのも',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Introduces supporting evidence or reason for prior claim',
        coOccurrence: ['というのは', 'なぜなら'],
    },
    {
        id: 'E-011',
        category: DiscourseCategory.E,
        pattern: 'なぜなら',
        position: 'initial',
        register: 'formal',
        pragmaticFunction: 'Formal explicit reason introducer',
        coOccurrence: ['というのも', 'だって'],
    },
    {
        id: 'E-012',
        category: DiscourseCategory.E,
        pattern: 'だって',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Casual causal or rebuttal marker citing a reason',
        coOccurrence: ['なぜなら', 'だから'],
    },
    {
        id: 'E-013',
        category: DiscourseCategory.E,
        pattern: 'そもそも',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Challenges or revisits the fundamental premise',
        coOccurrence: ['そのため', 'したがって'],
    },
    {
        id: 'E-014',
        category: DiscourseCategory.E,
        pattern: 'したがって',
        position: 'initial',
        register: 'formal',
        pragmaticFunction: 'Formal logical consequent marker',
        coOccurrence: ['よって', 'そのため'],
    },
    {
        id: 'E-015',
        category: DiscourseCategory.E,
        pattern: 'よって',
        position: 'initial',
        register: 'formal',
        pragmaticFunction: 'Formal marker of logical or legal consequence',
        coOccurrence: ['したがって', 'ゆえに'],
    },
    {
        id: 'E-016',
        category: DiscourseCategory.E,
        pattern: 'ゆえに',
        position: 'initial',
        register: 'formal',
        pragmaticFunction: 'Classical/written-register consequent marker',
        coOccurrence: ['よって', 'したがって'],
    },

    // ─── F: Emphasis / Assertion ──────────────────────────────────────────────
    {
        id: 'F-001',
        category: DiscourseCategory.F,
        pattern: '絶対',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Asserts categorical certainty or commitment',
        coOccurrence: ['間違いなく', '確実に'],
    },
    {
        id: 'F-002',
        category: DiscourseCategory.F,
        pattern: '完全に',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Asserts total or unconditional state of affairs',
        coOccurrence: ['まさに', '絶対'],
    },
    {
        id: 'F-003',
        category: DiscourseCategory.F,
        pattern: 'まさに',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Highlights exact fit or pinnacle exemplariness',
        coOccurrence: ['完全に', '本当に'],
    },
    {
        id: 'F-004',
        category: DiscourseCategory.F,
        pattern: '本当に',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Intensifier affirming sincerity or degree',
        coOccurrence: ['本当は', 'まじで'],
    },
    {
        id: 'F-005',
        category: DiscourseCategory.F,
        pattern: '間違いなく',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Asserts certainty with no margin for error',
        coOccurrence: ['絶対', '確実に'],
    },
    {
        id: 'F-006',
        category: DiscourseCategory.F,
        pattern: '確実に',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Asserts reliability or inevitability of outcome',
        coOccurrence: ['間違いなく', '絶対'],
    },
    {
        id: 'F-007',
        category: DiscourseCategory.F,
        pattern: '明らかに',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Presents proposition as self-evident or empirically clear',
        coOccurrence: ['明白に', '当然'],
    },
    {
        id: 'F-008',
        category: DiscourseCategory.F,
        pattern: 'やはり',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Formal variant of やっぱり; reinstates expectation',
        coOccurrence: ['やっぱり', '結局'],
    },
    {
        id: 'F-009',
        category: DiscourseCategory.F,
        pattern: 'どう考えても',
        position: 'any',
        register: 'casual',
        pragmaticFunction: 'Asserts that no perspective leads to a different conclusion',
        coOccurrence: ['絶対', '明らかに'],
    },
    {
        id: 'F-010',
        category: DiscourseCategory.F,
        pattern: 'どうしても',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Asserts unavoidability or strong insistence',
        coOccurrence: ['絶対', 'どう考えても'],
    },
    {
        id: 'F-011',
        category: DiscourseCategory.F,
        pattern: 'ぜひ',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Emphatic positive volitional marker or strong invitation',
        coOccurrence: ['必ず', '絶対'],
    },
    {
        id: 'F-012',
        category: DiscourseCategory.F,
        pattern: '必ず',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Asserts unconditional obligation or certainty',
        coOccurrence: ['絶対', 'ぜひ'],
    },

    // ─── G: Topic Management ──────────────────────────────────────────────────
    {
        id: 'G-001',
        category: DiscourseCategory.G,
        pattern: 'ところで',
        position: 'initial',
        register: 'any',
        pragmaticFunction: 'Signals deliberate topic shift to an unrelated subject',
        coOccurrence: ['それはそうと', '話が変わるけど'],
    },
    {
        id: 'G-002',
        category: DiscourseCategory.G,
        pattern: 'さて',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Marks transition to a new topic or phase of discourse',
        coOccurrence: ['では', 'ところで'],
    },
    {
        id: 'G-003',
        category: DiscourseCategory.G,
        pattern: 'それはそうと',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Casual topic-shift while acknowledging previous content',
        coOccurrence: ['ところで', '話変わるけど'],
    },
    {
        id: 'G-004',
        category: DiscourseCategory.G,
        pattern: '話変わるけど',
        position: 'initial',
        register: 'casual',
        pragmaticFunction: 'Explicit announcement of topic change',
        coOccurrence: ['ところで', 'それはそうと'],
    },
    {
        id: 'G-005',
        category: DiscourseCategory.G,
        pattern: /の話なんですけど/,
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Frames an upcoming topic for elaboration',
        coOccurrence: ['について言うと', 'に関して'],
    },
    {
        id: 'G-006',
        category: DiscourseCategory.G,
        pattern: 'について言うと',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Explicitly scopes the discourse topic being addressed',
        coOccurrence: ['に関して言えば', 'に関しては'],
    },
    {
        id: 'G-007',
        category: DiscourseCategory.G,
        pattern: 'に関して言えば',
        position: 'any',
        register: 'formal',
        pragmaticFunction: 'Formal topic-scoping marker',
        coOccurrence: ['について言うと', 'においては'],
    },
    {
        id: 'G-008',
        category: DiscourseCategory.G,
        pattern: 'に関しては',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Marks the discourse topic under discussion',
        coOccurrence: ['に関して言えば', 'については'],
    },
    {
        id: 'G-009',
        category: DiscourseCategory.G,
        pattern: 'については',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Introduces or scopes a topic for discussion',
        coOccurrence: ['に関しては', 'に関して'],
    },
    {
        id: 'G-010',
        category: DiscourseCategory.G,
        pattern: 'では',
        position: 'initial',
        register: 'neutral',
        pragmaticFunction: 'Marks transition or consequential move in formal discourse',
        coOccurrence: ['さて', 'じゃあ'],
    },
    {
        id: 'G-011',
        category: DiscourseCategory.G,
        pattern: 'といえば',
        position: 'any',
        register: 'any',
        pragmaticFunction: 'Introduces a loosely associated topic triggered by prior mention',
        coOccurrence: ['といったら', 'と言うと'],
    },

    // ─── H: Listener Engagement ───────────────────────────────────────────────
    {
        id: 'H-001',
        category: DiscourseCategory.H,
        pattern: /ですよね[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Seeks confirmation and alignment from the listener',
        coOccurrence: ['ですよ', 'ですね'],
    },
    {
        id: 'H-002',
        category: DiscourseCategory.H,
        pattern: /でしょ[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Asserts expectation of agreement; rhetorical confirmation bid',
        coOccurrence: ['じゃないですか', 'ですよね'],
    },
    {
        id: 'H-003',
        category: DiscourseCategory.H,
        pattern: /じゃないですか[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Appeals to shared knowledge or common ground',
        coOccurrence: ['ですよね', 'でしょ'],
    },
    {
        id: 'H-004',
        category: DiscourseCategory.H,
        pattern: /と思いません[。か？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Negative-polarity question inviting listener agreement',
        coOccurrence: ['と思いませんか', 'ですよね'],
    },
    {
        id: 'H-005',
        category: DiscourseCategory.H,
        pattern: 'わかります',
        position: 'any',
        register: 'neutral',
        pragmaticFunction: 'Checks or asserts mutual comprehension',
        coOccurrence: ['わかりますか', 'わかりますよね'],
    },
    {
        id: 'H-006',
        category: DiscourseCategory.H,
        pattern: /ね[。、！？\s]/,
        position: 'final',
        register: 'any',
        pragmaticFunction: 'Softly seeks or asserts shared knowledge; empathic particle',
        coOccurrence: ['よ', 'さ'],
    },
    {
        id: 'H-007',
        category: DiscourseCategory.H,
        pattern: /よ[。、！？\s]/,
        position: 'final',
        register: 'any',
        pragmaticFunction: 'Asserts new or privileged information to the listener',
        coOccurrence: ['ね', 'さ'],
    },
    {
        id: 'H-008',
        category: DiscourseCategory.H,
        pattern: /さ[。、！？\s]/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Casual particle asserting self-evident truth or mild emphasis',
        coOccurrence: ['ね', 'よ'],
    },
    {
        id: 'H-009',
        category: DiscourseCategory.H,
        pattern: /ですね[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Signals empathy, agreement, or acknowledgement',
        coOccurrence: ['ですよ', 'ですよね'],
    },
    {
        id: 'H-010',
        category: DiscourseCategory.H,
        pattern: /ですよ[。、！？\s]*/,
        position: 'final',
        register: 'neutral',
        pragmaticFunction: 'Mild assertion particle conveying informative stance',
        coOccurrence: ['ですね', 'ですよね'],
    },
    {
        id: 'H-011',
        category: DiscourseCategory.H,
        pattern: /よね[。、！？\s]*/,
        position: 'final',
        register: 'casual',
        pragmaticFunction: 'Solicits agreement while asserting speaker stance',
        coOccurrence: ['ね', 'よ'],
    },
];

const MAX_INITIAL_OFFSET = 10;

function resolvePosition(
    matchStart: number,
    matchEnd: number,
    text: string,
): 'initial' | 'medial' | 'final' | 'any' {
    const lineStart = text.lastIndexOf('\n', matchStart - 1) + 1;
    const offsetInLine = matchStart - lineStart;
    if (offsetInLine <= MAX_INITIAL_OFFSET) return 'initial';

    const trailingText = text.slice(matchEnd).trimStart();
    if (
        trailingText.length === 0 ||
        /^[。！？\n]/.test(trailingText)
    ) {
        return 'final';
    }
    return 'medial';
}

export function detectPatterns(text: string): DetectedMarker[] {
    const results: DetectedMarker[] = [];

    for (const entry of DISCOURSE_PATTERNS) {
        if (entry.pattern instanceof RegExp) {
            const flags = entry.pattern.flags.includes('g')
                ? entry.pattern.flags
                : entry.pattern.flags + 'g';
            const re = new RegExp(entry.pattern.source, flags);
            let match: RegExpExecArray | null;
            while ((match = re.exec(text)) !== null) {
                const startOffset = match.index;
                const endOffset = match.index + match[0].length;
                results.push({
                    patternId: entry.id,
                    category: entry.category,
                    matchedText: match[0],
                    startOffset,
                    endOffset,
                    position: resolvePosition(startOffset, endOffset, text),
                });
                // Avoid infinite loop on zero-length matches
                if (match[0].length === 0) re.lastIndex++;
            }
        } else {
            const needle = entry.pattern as string;
            let searchFrom = 0;
            while (true) {
                const idx = text.indexOf(needle, searchFrom);
                if (idx === -1) break;
                const startOffset = idx;
                const endOffset = idx + needle.length;
                results.push({
                    patternId: entry.id,
                    category: entry.category,
                    matchedText: needle,
                    startOffset,
                    endOffset,
                    position: resolvePosition(startOffset, endOffset, text),
                });
                searchFrom = idx + needle.length;
            }
        }
    }

    return results;
}
