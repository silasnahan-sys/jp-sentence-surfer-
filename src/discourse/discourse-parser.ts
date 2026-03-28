/**
 * Multi-level discourse granularity parser.
 *
 * Provides a unified `parseAtGranularity` entry-point and three navigation
 * helpers (`findUnitAt`, `findNextUnit`, `findPrevUnit`) that work across all
 * seven granularity levels:
 *
 *   morpheme  — TinySegmenter tokens
 *   bunsetsu  — phrase chunks (groupBunsetsu)
 *   clause    — bunsetsu runs ending at conjunctive/terminal markers
 *   utterance — sentences ending at 。！？ (jp-sentence-parser)
 *   turn      — paragraphs separated by blank lines
 *   exchange  — consecutive turn pairs
 *   episode   — large topic segments separated by 3+ newlines or headings
 */

import { TinySegmenter } from '../tiny-segmenter';
import { groupBunsetsu } from '../bunsetsu-grouper';
import { parseSentences } from '../jp-sentence-parser';
import { JP_SENTENCE_REGEX } from '../constants';

// ─── Public types ─────────────────────────────────────────────────────────────

export type DiscourseGranularity =
    | 'morpheme'
    | 'bunsetsu'
    | 'clause'
    | 'utterance'
    | 'turn'
    | 'exchange'
    | 'episode';

export interface DiscourseUnit {
    granularity: DiscourseGranularity;
    text: string;
    start: number;
    end: number;
    index: number;
}

// ─── Level parsers ────────────────────────────────────────────────────────────

function parseMorphemes(text: string): DiscourseUnit[] {
    const seg    = new TinySegmenter();
    const tokens = seg.segment(text);
    const units: DiscourseUnit[] = [];
    let pos = 0;
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        units.push({ granularity: 'morpheme', text: tok, start: pos, end: pos + tok.length, index: i });
        pos += tok.length;
    }
    return units;
}

function parseBunsetsuUnits(text: string): DiscourseUnit[] {
    const seg    = new TinySegmenter();
    const tokens = seg.segment(text);
    const chunks = groupBunsetsu(tokens);
    return chunks.map((c, i) => ({
        granularity: 'bunsetsu' as DiscourseGranularity,
        text:  c.text,
        start: c.start,
        end:   c.end,
        index: i,
    }));
}

/**
 * Clause-boundary markers: a bunsetsu chunk that ends with any of these
 * strings signals the close of a clause.
 *
 * Hard-stop punctuation (。！？!?) is already handled as a separate bunsetsu
 * chunk by the grouper, so we only need to test the chunk text directly.
 */
const CLAUSE_FINAL_RE = /[。！？!?]$|(?:て|たら|ば|から|ので|のに|けど|けれども)$/;

function parseClauses(text: string): DiscourseUnit[] {
    const seg    = new TinySegmenter();
    const tokens = seg.segment(text);
    const chunks = groupBunsetsu(tokens);

    const clauses: DiscourseUnit[] = [];
    let clauseStart = 0;
    let open = false;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!open) {
            clauseStart = chunk.start;
            open = true;
        }
        if (CLAUSE_FINAL_RE.test(chunk.text) || i === chunks.length - 1) {
            clauses.push({
                granularity: 'clause',
                text:  text.slice(clauseStart, chunk.end),
                start: clauseStart,
                end:   chunk.end,
                index: clauses.length,
            });
            open = false;
        }
    }

    return clauses;
}

/**
 * Default settings object for `parseSentences`.
 * Uses the same regex as the plugin default.
 */
const UTTERANCE_SETTINGS = {
    sentenceRegex:    JP_SENTENCE_REGEX.source,
    useBoldBoundaries: false,
};

function parseUtterances(text: string): DiscourseUnit[] {
    const sentences = parseSentences(text, UTTERANCE_SETTINGS);
    return sentences.map((s, i) => ({
        granularity: 'utterance' as DiscourseGranularity,
        text:  s.raw,
        start: s.start,
        end:   s.end,
        index: i,
    }));
}

/**
 * Split `text` on `sep`, collecting non-blank segments with their exact
 * character offsets.
 */
function splitOnSeparator(
    text: string,
    sep: RegExp,
    gran: DiscourseGranularity,
): DiscourseUnit[] {
    const re = new RegExp(sep.source, 'g');
    const units: DiscourseUnit[] = [];
    let lastEnd = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
        const segText = text.slice(lastEnd, m.index);
        if (segText.trim().length > 0) {
            units.push({
                granularity: gran,
                text:  segText,
                start: lastEnd,
                end:   m.index,
                index: units.length,
            });
        }
        lastEnd = m.index + m[0].length;
    }

    const tail = text.slice(lastEnd);
    if (tail.trim().length > 0) {
        units.push({
            granularity: gran,
            text:  tail,
            start: lastEnd,
            end:   text.length,
            index: units.length,
        });
    }

    return units;
}

/** Paragraph = speaker turn; blank lines separate turns. */
function parseTurns(text: string): DiscourseUnit[] {
    return splitOnSeparator(text, /\n{2,}/, 'turn');
}

/**
 * Group consecutive turns into exchanges (pairs of turns).
 * If there is an odd number of turns the final group contains one turn.
 */
function parseExchanges(text: string): DiscourseUnit[] {
    const turns = parseTurns(text);
    const PAIR  = 2;
    const exchanges: DiscourseUnit[] = [];

    for (let i = 0; i < turns.length; i += PAIR) {
        const group = turns.slice(i, i + PAIR);
        const first = group[0];
        const last  = group[group.length - 1];
        exchanges.push({
            granularity: 'exchange',
            text:  text.slice(first.start, last.end),
            start: first.start,
            end:   last.end,
            index: exchanges.length,
        });
    }

    return exchanges;
}

/**
 * Episodes are large topic segments separated by three or more consecutive
 * newlines or by a heading marker (Markdown # at the start of a line).
 */
function parseEpisodes(text: string): DiscourseUnit[] {
    return splitOnSeparator(text, /\n{3,}|(?:^|\n)#{1,6}\s/, 'episode');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse `text` into an ordered array of `DiscourseUnit` values at the
 * requested granularity level.
 */
export function parseAtGranularity(
    text: string,
    granularity: DiscourseGranularity,
): DiscourseUnit[] {
    switch (granularity) {
        case 'morpheme':  return parseMorphemes(text);
        case 'bunsetsu':  return parseBunsetsuUnits(text);
        case 'clause':    return parseClauses(text);
        case 'utterance': return parseUtterances(text);
        case 'turn':      return parseTurns(text);
        case 'exchange':  return parseExchanges(text);
        case 'episode':   return parseEpisodes(text);
    }
}

/**
 * Return the `DiscourseUnit` at `granularity` that contains `offset`, or
 * `null` if no unit covers that position.
 *
 * Performance note: this function calls `parseAtGranularity` on every
 * invocation.  In tight loops, call `parseAtGranularity` once and use the
 * returned array directly.
 */
export function findUnitAt(
    text: string,
    offset: number,
    granularity: DiscourseGranularity,
): DiscourseUnit | null {
    for (const u of parseAtGranularity(text, granularity)) {
        if (u.start > offset) break;         // units are sorted; no need to continue
        if (offset >= u.start && offset < u.end) return u;
    }
    return null;
}

/**
 * Return the first `DiscourseUnit` whose `start` is strictly after `offset`,
 * or `null` if there is none.
 *
 * Performance note: this function calls `parseAtGranularity` on every
 * invocation.  In tight loops, call `parseAtGranularity` once and use the
 * returned array directly.
 */
export function findNextUnit(
    text: string,
    offset: number,
    granularity: DiscourseGranularity,
): DiscourseUnit | null {
    for (const u of parseAtGranularity(text, granularity)) {
        if (u.start > offset) return u;
    }
    return null;
}

/**
 * Return the last `DiscourseUnit` whose `end` is at or before `offset`,
 * or `null` if there is none.
 *
 * Performance note: this function calls `parseAtGranularity` on every
 * invocation.  In tight loops, call `parseAtGranularity` once and use the
 * returned array directly.
 */
export function findPrevUnit(
    text: string,
    offset: number,
    granularity: DiscourseGranularity,
): DiscourseUnit | null {
    let prev: DiscourseUnit | null = null;
    for (const u of parseAtGranularity(text, granularity)) {
        if (u.end <= offset) prev = u;
        else break;                          // units are sorted; nothing further qualifies
    }
    return prev;
}
