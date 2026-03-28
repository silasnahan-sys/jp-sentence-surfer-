/**
 * discourse-parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-level granularity parser (7 levels):
 *   morpheme → bunsetsu → clause → utterance → turn → exchange → episode
 *
 * Each level exposes:
 *   - parse()    → array of discourse units
 *   - next/prev  → navigation helpers
 *   - select()   → character range for the current unit
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BunsetsuChunk } from '../types';
import { DiscourseUnit, DiscourseGranularity, DiscourseMarker } from '../types';
import { parseBunsetsu } from '../jp-sentence-parser';
import { tokenise, detectPatternsInText } from './discourse-grammar';

// ─── Utterance / clause splitting helpers ────────────────────────────────────

/** Regex that identifies clause boundaries (conjunctive endings). */
const CLAUSE_BOUNDARY_RE =
    /[。！？!?]|[、，,](?=\s*(?:そして|それで|だから|でも|けど|けれども|が|と|ので|のに|ながら|ところが|しかし|でも|でも|ただ|ただし|それに|また|なお|ちなみに))/;

/** Regex for utterance boundaries: terminal punctuation or newline. */
const UTTERANCE_BOUNDARY_RE = /[。！？!?\n]+/g;

/** Regex for turn boundaries: double newline or speaker label pattern. */
const TURN_BOUNDARY_RE = /\n\s*\n|^\s*[A-Z\u30A0-\u30FF\u3040-\u309F]+[:：]/gm;

/** YTranscript timestamp — each timestamp starts a new turn segment. */
const YTRANSCRIPT_TS_RE = /\[[\d:]+\]\(https?:\/\/[^)]+\)/g;

// ─── Level parsers ────────────────────────────────────────────────────────────

/** Level 0: Morpheme */
export function parseMorphemes(text: string): DiscourseUnit[] {
    const tokens = tokenise(text);
    const units: DiscourseUnit[] = [];
    let offset = 0;
    for (const tok of tokens) {
        if (tok.trim()) {
            units.push({
                level: 'morpheme',
                text: tok,
                start: offset,
                end: offset + tok.length,
                markers: [],
                children: [],
            });
        }
        offset += tok.length;
    }
    return units;
}

/** Level 1: Bunsetsu (uses existing bunsetsu grouper) */
export function parseBunsetsuUnits(text: string): DiscourseUnit[] {
    const chunks: BunsetsuChunk[] = parseBunsetsu(text);
    return chunks.map(c => ({
        level: 'bunsetsu' as DiscourseGranularity,
        text: c.text,
        start: c.start,
        end: c.end,
        markers: detectPatternsInText(c.text, c.start),
        children: [],
    }));
}

/** Level 2: Clause (split on clause boundary markers) */
export function parseClauses(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    let last = 0;
    const re = new RegExp(
        `[。！？!?]|(?<=[^\\s])(?:、|,)(?=\\s*(?:${CLAUSE_CONNECTORS.join('|')}))`,
        'gu',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const end = m.index + m[0].length;
        const seg = text.slice(last, end).trim();
        if (seg) {
            units.push({
                level: 'clause',
                text: seg,
                start: last,
                end,
                markers: detectPatternsInText(seg, last),
                children: [],
            });
        }
        last = end;
    }
    if (last < text.length) {
        const seg = text.slice(last).trim();
        if (seg) {
            units.push({
                level: 'clause',
                text: seg,
                start: last,
                end: text.length,
                markers: detectPatternsInText(seg, last),
                children: [],
            });
        }
    }
    return units;
}

const CLAUSE_CONNECTORS = [
    'そして', 'それで', 'だから', 'でも', 'けど', 'けれども', 'が', 'と',
    'ので', 'のに', 'ながら', 'ところが', 'しかし', 'ただ', 'ただし',
    'それに', 'また', 'なお', 'ちなみに',
];

/** Level 3: Utterance (split on terminal punctuation or newlines) */
export function parseUtterances(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    const boundaries: number[] = [0];
    let m: RegExpExecArray | null;
    // Create a fresh regex each call to avoid shared lastIndex state
    const re = /[。！？!?\n]+/g;
    while ((m = re.exec(text)) !== null) {
        const pos = m.index + m[0].length;
        boundaries.push(pos);
        // Safety: advance past a zero-length match (shouldn't happen here but be safe)
        if (m[0].length === 0) re.lastIndex++;
    }
    if (boundaries[boundaries.length - 1] !== text.length) {
        boundaries.push(text.length);
    }
    for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i];
        const end = boundaries[i + 1];
        const seg = text.slice(start, end).trim();
        if (seg) {
            units.push({
                level: 'utterance',
                text: seg,
                start,
                end,
                markers: detectPatternsInText(seg, start),
                children: parseClauses(seg),
            });
        }
    }
    return units;
}

/** Level 4: Turn (split on double newlines or speaker labels) */
export function parseTurns(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    const boundaries: number[] = [0];

    const re = new RegExp(TURN_BOUNDARY_RE.source, 'gm');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        boundaries.push(m.index + m[0].length);
    }
    // Also split on YTranscript timestamps (each timestamp = new turn unit)
    const tsRe = new RegExp(YTRANSCRIPT_TS_RE.source, 'g');
    while ((m = tsRe.exec(text)) !== null) {
        boundaries.push(m.index);
    }

    const sorted = [...new Set(boundaries)].sort((a, b) => a - b);
    if (sorted[sorted.length - 1] !== text.length) sorted.push(text.length);

    for (let i = 0; i < sorted.length - 1; i++) {
        const start = sorted[i];
        const end = sorted[i + 1];
        const seg = text.slice(start, end).trim();
        if (seg) {
            units.push({
                level: 'turn',
                text: seg,
                start,
                end,
                markers: detectPatternsInText(seg, start),
                children: parseUtterances(seg),
            });
        }
    }
    return units;
}

/** Level 5: Exchange (2-4 turns forming a coherent adjacency pair) */
export function parseExchanges(text: string): DiscourseUnit[] {
    const turns = parseTurns(text);
    const units: DiscourseUnit[] = [];
    let i = 0;
    while (i < turns.length) {
        // Group 2-3 turns into an exchange
        const end = Math.min(i + 3, turns.length);
        const group = turns.slice(i, end);
        const start = group[0].start;
        const endPos = group[group.length - 1].end;
        const seg = text.slice(start, endPos);
        units.push({
            level: 'exchange',
            text: seg,
            start,
            end: endPos,
            markers: detectPatternsInText(seg, start),
            children: group,
        });
        i = end;
    }
    return units;
}

/** Level 6: Episode (topic-coherent segment, split on topic-shift markers) */
export function parseEpisodes(text: string): DiscourseUnit[] {
    const TOPIC_SHIFT_RE =
        /(?:^|\n)(?:ところで|そういえば|話変わる|それはそうと|余談|脱線|ふと思ったんだけど)/gm;
    const units: DiscourseUnit[] = [];
    const boundaries: number[] = [0];
    let m: RegExpExecArray | null;
    while ((m = TOPIC_SHIFT_RE.exec(text)) !== null) {
        boundaries.push(m.index);
    }
    if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);

    for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i];
        const end = boundaries[i + 1];
        const seg = text.slice(start, end).trim();
        if (seg) {
            units.push({
                level: 'episode',
                text: seg,
                start,
                end,
                markers: detectPatternsInText(seg, start),
                children: parseTurns(seg),
            });
        }
    }
    return units;
}

// ─── Level dispatch ──────────────────────────────────────────────────────────

/** Parse text at the specified granularity level. */
export function parseAtLevel(text: string, level: DiscourseGranularity): DiscourseUnit[] {
    switch (level) {
        case 'morpheme':   return parseMorphemes(text);
        case 'bunsetsu':   return parseBunsetsuUnits(text);
        case 'clause':     return parseClauses(text);
        case 'utterance':  return parseUtterances(text);
        case 'turn':       return parseTurns(text);
        case 'exchange':   return parseExchanges(text);
        case 'episode':    return parseEpisodes(text);
    }
}

/** Ordered list of granularity levels. */
export const GRANULARITY_LEVELS: DiscourseGranularity[] = [
    'morpheme', 'bunsetsu', 'clause', 'utterance', 'turn', 'exchange', 'episode',
];

/** Cycle to the next granularity level. */
export function cycleGranularity(current: DiscourseGranularity): DiscourseGranularity {
    const idx = GRANULARITY_LEVELS.indexOf(current);
    return GRANULARITY_LEVELS[(idx + 1) % GRANULARITY_LEVELS.length];
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

/** Find the unit at or after the given character offset. */
export function findUnitAt(units: DiscourseUnit[], offset: number): DiscourseUnit | null {
    for (const u of units) {
        if (u.start <= offset && offset < u.end) return u;
    }
    return units[0] ?? null;
}

/** Find the next unit after the given character offset. */
export function findNextUnit(units: DiscourseUnit[], offset: number): DiscourseUnit | null {
    for (const u of units) {
        if (u.start > offset) return u;
    }
    return null;
}

/** Find the previous unit before the given character offset. */
export function findPrevUnit(units: DiscourseUnit[], offset: number): DiscourseUnit | null {
    let prev: DiscourseUnit | null = null;
    for (const u of units) {
        if (u.end <= offset) prev = u;
        else break;
    }
    return prev;
}

// ─── Smart context expansion ─────────────────────────────────────────────────

/**
 * Given a character range in `text`, expand it to the nearest logical
 * discourse boundary (utterance → turn → episode).
 */
export function expandToLogicalBoundary(
    text: string,
    start: number,
    end: number,
): { start: number; end: number } {
    const utterances = parseUtterances(text);
    let expandedStart = start;
    let expandedEnd = end;

    for (const u of utterances) {
        if (u.start <= start && end <= u.end) {
            expandedStart = u.start;
            expandedEnd = u.end;
            break;
        }
    }

    return { start: expandedStart, end: expandedEnd };
}
