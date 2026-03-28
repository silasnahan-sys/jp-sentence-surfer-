/**
 * discourse-grammar.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pattern detection engine for 談話文法 (Discourse Grammar).
 *
 * All detection runs against TinySegmenter morpheme token sequences.
 * Each detected pattern yields a DiscourseMarker annotation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DiscourseMarker, DiscourseMarkerCategory, DiscourseMarkerSubcategory } from '../types';
import {
    ALL_PATTERN_SETS,
    LOGICAL_FLOW_PATTERNS,
    LogicalFlowPattern,
} from './discourse-patterns';

// ─── TinySegmenter shim ──────────────────────────────────────────────────────
// We import the existing tiny-segmenter which uses CommonJS export pattern.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TinySegmenter = require('../tiny-segmenter').default ?? require('../tiny-segmenter');

let _segmenter: { segment: (text: string) => string[] } | null = null;

function getSegmenter(): { segment: (text: string) => string[] } {
    if (!_segmenter) {
        _segmenter = new TinySegmenter();
    }
    return _segmenter!;
}

/** Tokenise a string into morpheme tokens. */
export function tokenise(text: string): string[] {
    return getSegmenter().segment(text);
}

// ─── Pattern index (built once) ──────────────────────────────────────────────

interface IndexedPattern {
    patternSetId: string;
    category: string;
    subcategory: string;
    label: string;
    color: string;
    tokens: string[];
    /** Joined surface form (for fast Set lookup on single-token patterns) */
    surface: string;
}

let _patternIndex: IndexedPattern[] | null = null;

function getPatternIndex(): IndexedPattern[] {
    if (_patternIndex) return _patternIndex;
    _patternIndex = [];
    for (const ps of ALL_PATTERN_SETS) {
        for (const tokenList of ps.patterns) {
            _patternIndex.push({
                patternSetId: ps.id,
                category: ps.category,
                subcategory: ps.subcategory,
                label: ps.label,
                color: ps.color,
                tokens: tokenList,
                surface: tokenList.join(''),
            });
        }
    }
    // Sort by length descending so longer patterns match first
    _patternIndex.sort((a, b) => b.tokens.length - a.tokens.length);
    return _patternIndex;
}

// ─── Core detection ──────────────────────────────────────────────────────────

/**
 * Scan a morpheme token array for all discourse patterns.
 * Returns a list of DiscourseMarker objects with token positions.
 */
export function detectPatterns(tokens: string[], textOffset: number = 0): DiscourseMarker[] {
    const index = getPatternIndex();
    const results: DiscourseMarker[] = [];

    // Pre-build char offsets for each token
    const charOffsets: number[] = new Array(tokens.length + 1).fill(0);
    for (let i = 0; i < tokens.length; i++) {
        charOffsets[i + 1] = charOffsets[i] + tokens[i].length;
    }

    const dominated = new Set<number>(); // token indices already part of a longer match

    for (let i = 0; i < tokens.length; i++) {
        for (const pat of index) {
            const pl = pat.tokens.length;
            if (i + pl > tokens.length) continue;

            // Check if all pattern tokens match
            let match = true;
            for (let j = 0; j < pl; j++) {
                if (tokens[i + j] !== pat.tokens[j]) { match = false; break; }
            }
            if (!match) continue;

            // Skip if any token in this span is dominated by a longer match
            let dominated_flag = false;
            for (let j = 0; j < pl; j++) {
                if (dominated.has(i + j)) { dominated_flag = true; break; }
            }
            if (dominated_flag) continue;

            // Mark tokens as dominated
            for (let j = 0; j < pl; j++) dominated.add(i + j);

            const startChar = textOffset + charOffsets[i];
            const endChar = textOffset + charOffsets[i + pl];

            // Determine position class
            const totalTokens = tokens.length;
            const isOpening = i <= 3; // within first 3 morphemes
            const isClosing = i >= totalTokens - 6; // within last 5 morphemes

            results.push({
                id: `${pat.patternSetId}-${startChar}`,
                type: pat.category as DiscourseMarkerCategory,
                subcategory: pat.subcategory as DiscourseMarkerSubcategory,
                label: pat.label,
                text: pat.surface,
                tokenStart: i,
                tokenEnd: i + pl,
                charStart: startChar,
                charEnd: endChar,
                color: pat.color,
                isOpening,
                isClosing,
                confidence: pl > 2 ? 0.9 : pl === 2 ? 0.8 : 0.7,
            });
        }
    }

    return results.sort((a, b) => a.charStart - b.charStart);
}

/**
 * Detect discourse patterns in raw text.
 * Tokenises the text first, then runs detectPatterns.
 */
export function detectPatternsInText(text: string, textOffset: number = 0): DiscourseMarker[] {
    const tokens = tokenise(text);
    return detectPatterns(tokens, textOffset);
}

/**
 * Detect opening markers: patterns within first 3 morphemes (excluding leading fillers).
 */
export function detectOpeningMarkers(tokens: string[], textOffset: number = 0): DiscourseMarker[] {
    return detectPatterns(tokens, textOffset).filter(m => m.isOpening);
}

/**
 * Detect closing markers: patterns within last 5 morphemes.
 */
export function detectClosingMarkers(tokens: string[], textOffset: number = 0): DiscourseMarker[] {
    return detectPatterns(tokens, textOffset).filter(m => m.isClosing);
}

// ─── Logical flow pattern detection across chunks ────────────────────────────

export interface LogicalFlowMatch {
    pattern: LogicalFlowPattern;
    /** Indices into the chunk array where each step was found */
    matchedAt: number[];
    confidence: number;
}

/**
 * Detect logical flow patterns across an array of text chunks (e.g. utterances).
 * Each pattern step is matched against the markers present in each chunk.
 */
export function detectLogicalFlow(
    chunkMarkers: DiscourseMarker[][],
): LogicalFlowMatch[] {
    const results: LogicalFlowMatch[] = [];

    for (const pattern of LOGICAL_FLOW_PATTERNS) {
        const matches = findFlowPattern(pattern, chunkMarkers);
        if (matches.length > 0) {
            for (const m of matches) {
                results.push(m);
            }
        }
    }

    return results;
}

function findFlowPattern(
    pattern: LogicalFlowPattern,
    chunkMarkers: DiscourseMarker[][],
): LogicalFlowMatch[] {
    const results: LogicalFlowMatch[] = [];
    const steps = pattern.steps;

    /** Recursive search: stepIdx = current step, fromChunk = start searching from here */
    function search(stepIdx: number, fromChunk: number, matched: number[]): void {
        if (stepIdx >= steps.length) {
            results.push({
                pattern,
                matchedAt: [...matched],
                confidence: 0.7 + (matched.length / steps.length) * 0.3,
            });
            return;
        }
        const alternatives = steps[stepIdx];
        for (let ci = fromChunk; ci < chunkMarkers.length; ci++) {
            const markers = chunkMarkers[ci];
            const found = markers.some(m =>
                alternatives.some(alt => m.text === alt || m.text.includes(alt))
            );
            if (found) {
                matched.push(ci);
                search(stepIdx + 1, ci + 1, matched);
                matched.pop();
                // Only try first match per step to avoid combinatorial explosion
                break;
            }
        }
    }

    search(0, 0, []);
    return results;
}

// ─── Register classification ─────────────────────────────────────────────────

/** Quick classification of a single surface string (for UI labels). */
export function classifyText(text: string): DiscourseMarker[] {
    const tokens = tokenise(text);
    return detectPatterns(tokens);
}
