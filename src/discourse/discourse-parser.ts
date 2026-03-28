/**
 * 談話文法 Multi-Level Discourse Parser
 *
 * Parses Japanese text into discourse units at 7 granularity levels:
 *   1. morpheme  — individual TinySegmenter tokens
 *   2. bunsetsu  — existing 8-tier bunsetsu chunks
 *   3. clause    — clauses bounded by conjunctive particles
 *   4. utterance — full sentences / utterances
 *   5. turn      — speaker turns (separated by blank lines or speaker markers)
 *   6. exchange  — adjacent turn pairs
 *   7. episode   — topic-bounded discourse episodes
 */

import { TinySegmenter } from '../tiny-segmenter';
import { groupBunsetsu } from '../bunsetsu-grouper';
import {
    DiscourseGranularity,
    DiscourseUnit,
    BunsetsuChunk,
} from '../types';
import { analyzeDiscourseChunk } from './discourse-grammar';
import { JP_SENTENCE_REGEX } from '../constants';

// ─── Clause boundary tokens ────────────────────────────────────────────────────

/** Conjunctive particles that bound a clause */
const CLAUSE_BOUNDARY_TOKENS = new Set([
    'が', 'けど', 'けれど', 'けれども', 'ので', 'のに', 'から', 'たら', 'なら',
    'と', 'ても', 'ながら', 'し', 'て',
]);

/** Topic-shift markers that signal a new episode */
const EPISODE_BOUNDARY_MARKERS = [
    'それで', 'ところで', 'そういえば', '話変わるけど', 'ちなみに', 'ところが', '次に',
    'では', 'じゃあ', '続いて', 'さて', '改めて',
];

// ─── Level 1: Morpheme ────────────────────────────────────────────────────────

function parseMorphemes(text: string): DiscourseUnit[] {
    const seg = new TinySegmenter();
    const tokens = seg.segment(text);
    const units: DiscourseUnit[] = [];
    let pos = 0;
    for (const token of tokens) {
        const idx = text.indexOf(token, pos);
        const start = idx === -1 ? pos : idx;
        const end = start + token.length;
        if (token.trim()) {
            units.push({ text: token, start, end, granularity: 'morpheme' });
        }
        pos = end;
    }
    return units;
}

// ─── Level 2: Bunsetsu ────────────────────────────────────────────────────────

function parseBunsetsuLevel(text: string): DiscourseUnit[] {
    const seg = new TinySegmenter();
    const tokens = seg.segment(text);
    const chunks: BunsetsuChunk[] = groupBunsetsu(tokens);
    return chunks.map(c => ({
        text: c.text,
        start: c.start,
        end: c.end,
        granularity: 'bunsetsu' as DiscourseGranularity,
    }));
}

// ─── Level 3: Clause ─────────────────────────────────────────────────────────

function parseClauses(text: string): DiscourseUnit[] {
    const seg = new TinySegmenter();
    const tokens = seg.segment(text);

    const units: DiscourseUnit[] = [];
    let clauseText = '';
    let clauseStart = 0;
    let pos = 0;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const tokenStart = text.indexOf(token, pos);
        const actualStart = tokenStart === -1 ? pos : tokenStart;
        pos = actualStart + token.length;

        // Skip whitespace
        if (/^[\s　]+$/.test(token)) {
            if (clauseText.trim()) {
                units.push({
                    text: clauseText,
                    start: clauseStart,
                    end: pos - token.length,
                    granularity: 'clause',
                });
                clauseText = '';
            }
            clauseStart = pos;
            continue;
        }

        clauseText += token;

        // Close on hard stop punctuation
        if (/[。！？!?]/.test(token)) {
            // Absorb closing brackets
            while (i + 1 < tokens.length && /[」』）)]/.test(tokens[i + 1])) {
                i++;
                const nextStart = text.indexOf(tokens[i], pos);
                pos = (nextStart === -1 ? pos : nextStart) + tokens[i].length;
                clauseText += tokens[i];
            }
            units.push({ text: clauseText, start: clauseStart, end: pos, granularity: 'clause' });
            clauseText = '';
            clauseStart = pos;
            continue;
        }

        // Close on clause-boundary conjunctive particles
        if (CLAUSE_BOUNDARY_TOKENS.has(token)) {
            units.push({ text: clauseText, start: clauseStart, end: pos, granularity: 'clause' });
            clauseText = '';
            clauseStart = pos;
        }
    }

    if (clauseText.trim()) {
        units.push({ text: clauseText, start: clauseStart, end: pos, granularity: 'clause' });
    }

    return units;
}

// ─── Level 4: Utterance ───────────────────────────────────────────────────────

function parseUtterances(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    const regex = new RegExp(JP_SENTENCE_REGEX.source, 'gm');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const raw = match[0];
        if (!raw.trim()) continue;
        units.push({
            text: raw,
            start: match.index,
            end: match.index + raw.length,
            granularity: 'utterance',
        });
    }

    return units;
}

// ─── Level 5: Turn ────────────────────────────────────────────────────────────

/**
 * A "turn" in YT transcripts is typically a paragraph (double-newline separated block)
 * or a block between speaker labels like 「A:」「Speaker:」.
 */
function parseTurns(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    // Split on double newlines or speaker labels
    const speakerLabelRe = /^(?:[\w\u3041-\u3096\u4E00-\u9FFF]+[:：]\s*)/m;
    const paragraphs = text.split(/\n{2,}/);

    let pos = 0;
    for (const para of paragraphs) {
        const start = text.indexOf(para, pos);
        const end = start + para.length;
        if (para.trim()) {
            units.push({ text: para, start, end, granularity: 'turn' });
        }
        pos = end + 2; // skip the double newline
    }

    // If no paragraph splits found, fall back to utterance-level
    if (units.length <= 1 && text.trim()) {
        const utterances = parseUtterances(text);
        return utterances.map(u => ({ ...u, granularity: 'turn' as DiscourseGranularity }));
    }

    return units;
}

// ─── Level 6: Exchange ────────────────────────────────────────────────────────

function parseExchanges(text: string): DiscourseUnit[] {
    const turns = parseTurns(text);
    if (turns.length === 0) return [];

    const units: DiscourseUnit[] = [];
    // Pair consecutive turns into exchanges
    for (let i = 0; i < turns.length; i += 2) {
        const t1 = turns[i];
        const t2 = turns[i + 1];
        if (t2) {
            units.push({
                text: t1.text + '\n\n' + t2.text,
                start: t1.start,
                end: t2.end,
                granularity: 'exchange',
            });
        } else {
            // Odd turn out — it's its own exchange
            units.push({ ...t1, granularity: 'exchange' });
        }
    }
    return units;
}

// ─── Level 7: Episode ────────────────────────────────────────────────────────

function parseEpisodes(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    const turns = parseTurns(text);
    if (turns.length === 0) return [];

    let episodeStart = turns[0].start;
    let episodeText = '';

    for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const isTopicShift = EPISODE_BOUNDARY_MARKERS.some(m => turn.text.startsWith(m));

        if (isTopicShift && episodeText.trim()) {
            units.push({
                text: episodeText.trim(),
                start: episodeStart,
                end: turns[i - 1]?.end ?? episodeStart + episodeText.length,
                granularity: 'episode',
            });
            episodeText = '';
            episodeStart = turn.start;
        }

        episodeText += (episodeText ? '\n\n' : '') + turn.text;
    }

    if (episodeText.trim()) {
        units.push({
            text: episodeText.trim(),
            start: episodeStart,
            end: turns[turns.length - 1].end,
            granularity: 'episode',
        });
    }

    return units;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse text into discourse units at the given granularity level.
 */
export function parseAtGranularity(
    text: string,
    granularity: DiscourseGranularity,
    includeAnalysis = false,
): DiscourseUnit[] {
    let units: DiscourseUnit[];

    switch (granularity) {
        case 'morpheme':  units = parseMorphemes(text);  break;
        case 'bunsetsu':  units = parseBunsetsuLevel(text); break;
        case 'clause':    units = parseClauses(text);    break;
        case 'utterance': units = parseUtterances(text); break;
        case 'turn':      units = parseTurns(text);      break;
        case 'exchange':  units = parseExchanges(text);  break;
        case 'episode':   units = parseEpisodes(text);   break;
        default:          units = parseBunsetsuLevel(text);
    }

    if (includeAnalysis) {
        return units.map(u => ({
            ...u,
            analysis: analyzeDiscourseChunk(u.text),
        }));
    }

    return units;
}

/**
 * Find the discourse unit at the given cursor offset.
 */
export function findUnitAt(
    units: DiscourseUnit[],
    offset: number,
): DiscourseUnit | null {
    for (const u of units) {
        if (offset >= u.start && offset < u.end) return u;
    }
    return null;
}

/**
 * Find the next discourse unit whose start is strictly after `offset`.
 */
export function findNextUnit(
    units: DiscourseUnit[],
    offset: number,
): DiscourseUnit | null {
    for (const u of units) {
        if (u.start > offset) return u;
    }
    return null;
}

/**
 * Find the previous discourse unit whose end is at or before `offset`.
 */
export function findPrevUnit(
    units: DiscourseUnit[],
    offset: number,
): DiscourseUnit | null {
    let prev: DiscourseUnit | null = null;
    for (const u of units) {
        if (u.end <= offset) prev = u;
    }
    return prev;
}

/**
 * Expand context around a chunk using discourse boundary detection.
 * Returns the logical context text before and after the chunk.
 *
 * In 'smart' mode, expands to the nearest discourse boundary.
 * In 'fixed' mode, uses `fixedChars` characters.
 */
export function expandContext(
    fullText: string,
    chunk: DiscourseUnit,
    mode: 'smart' | 'fixed',
    fixedChars = 200,
): { before: string; after: string } {
    if (mode === 'fixed') {
        return {
            before: fullText.slice(Math.max(0, chunk.start - fixedChars), chunk.start),
            after: fullText.slice(chunk.end, Math.min(fullText.length, chunk.end + fixedChars)),
        };
    }

    // Smart mode: find nearest utterance boundaries
    const utterances = parseUtterances(fullText);
    let beforeStart = chunk.start;
    let afterEnd = chunk.end;

    // Find the utterance that contains or precedes the chunk
    for (const u of utterances) {
        if (u.end <= chunk.start) {
            beforeStart = u.start;
        }
        if (u.start >= chunk.end) {
            afterEnd = u.end;
            break;
        }
    }

    return {
        before: fullText.slice(beforeStart, chunk.start),
        after: fullText.slice(chunk.end, afterEnd),
    };
}
