import { parseBunsetsu } from '../jp-sentence-parser';
import { TinySegmenter } from '../tiny-segmenter';
import { DetectedMarker, detectPatterns } from './discourse-grammar';

export enum DiscourseGranularity {
    morpheme = 1,
    bunsetsu = 2,
    clause = 3,
    utterance = 4,
    turn = 5,
    exchange = 6,
    topicSegment = 7,
}

export interface DiscourseUnit {
    text: string;
    start: number;
    end: number;
    level: DiscourseGranularity;
    speakerTag?: string;
    markers?: DetectedMarker[];
}

// Regex to detect clause-ending patterns at the end of a bunsetsu's text
const CLAUSE_END_RE = /(?:。|！|？|，|、|と思います|んですけど|ので|から|て|では|には)$/;

// Regex to detect topic-shift markers anywhere in a text
const TOPIC_SHIFT_RE = /ところで|さて|それはそうと|話変わるけど/;

// Regex to detect sentence-ending punctuation for utterance splitting
const UTTERANCE_SPLIT_RE = /[。！？]/;

// Regex to detect speaker-turn line prefixes
const TURN_PREFIX_RE = /^(?:〔([^〕]+)〕|##\s+(.+?)(?:\s|$)|>>\s+(.+?)(?:\s|$))/;

function buildUnit(
    text: string,
    start: number,
    end: number,
    level: DiscourseGranularity,
    speakerTag?: string
): DiscourseUnit {
    return {
        text,
        start,
        end,
        level,
        speakerTag,
        markers: detectPatterns(text),
    };
}

function parseMorphemes(text: string): DiscourseUnit[] {
    const segmenter = new TinySegmenter();
    const tokens = segmenter.segment(text);
    const units: DiscourseUnit[] = [];
    let offset = 0;
    for (const token of tokens) {
        const idx = text.indexOf(token, offset);
        if (idx === -1) {
            // Token not found from current offset — advance past current position to
            // avoid stalling if the segmenter produces tokens that don't align with
            // the raw text at this point (e.g. whitespace normalization edge cases).
            offset += token.length;
            continue;
        }
        units.push(buildUnit(token, idx, idx + token.length, DiscourseGranularity.morpheme));
        offset = idx + token.length;
    }
    return units;
}

function parseBunsetsuUnits(text: string): DiscourseUnit[] {
    const chunks = parseBunsetsu(text);
    return chunks.map(c =>
        buildUnit(c.text, c.start, c.end, DiscourseGranularity.bunsetsu)
    );
}

function parseClauses(text: string): DiscourseUnit[] {
    const chunks = parseBunsetsu(text);
    const units: DiscourseUnit[] = [];

    let groupStart = -1;
    let groupEnd = -1;
    let groupText = '';

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (groupStart === -1) {
            groupStart = chunk.start;
        }
        groupEnd = chunk.end;
        groupText += chunk.text;

        if (CLAUSE_END_RE.test(chunk.text) || i === chunks.length - 1) {
            units.push(buildUnit(groupText, groupStart, groupEnd, DiscourseGranularity.clause));
            groupStart = -1;
            groupEnd = -1;
            groupText = '';
        }
    }

    return units;
}

function parseUtterances(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    const lines = text.split('\n');
    let globalOffset = 0;

    for (const line of lines) {
        const lineStart = globalOffset;
        globalOffset += line.length + 1; // +1 for the '\n'

        if (!line.trim()) continue;

        // Split the line on sentence-ending punctuation, keeping the delimiter
        const sentenceRe = /[^。！？]*[。！？]?/g;
        let m: RegExpExecArray | null;
        while ((m = sentenceRe.exec(line)) !== null) {
            const seg = m[0];
            if (!seg || !seg.trim()) continue;
            const start = lineStart + m.index;
            const end = start + seg.length;
            units.push(buildUnit(seg, start, end, DiscourseGranularity.utterance));
        }
    }

    return units;
}

function parseTurns(text: string): DiscourseUnit[] {
    const units: DiscourseUnit[] = [];
    const lines = text.split('\n');
    let globalOffset = 0;

    let currentSpeaker: string | undefined;
    let currentStart = -1;
    let currentLines: string[] = [];

    const flushTurn = (endOffset: number) => {
        if (currentLines.length > 0 && currentStart !== -1) {
            const turnText = currentLines.join('\n');
            units.push(
                buildUnit(turnText, currentStart, endOffset, DiscourseGranularity.turn, currentSpeaker)
            );
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineStart = globalOffset;
        globalOffset += line.length + 1;

        const match = TURN_PREFIX_RE.exec(line);
        if (match) {
            // Flush previous turn before starting a new one
            flushTurn(lineStart);

            const speaker = match[1] ?? match[2] ?? match[3];
            const prefixLen = match[0].length;
            const bodyText = line.slice(prefixLen);

            currentSpeaker = speaker;
            currentStart = lineStart;
            currentLines = [bodyText];
        } else {
            if (currentStart !== -1) {
                // Continuation of current turn
                currentLines.push(line);
            } else {
                // No turn context yet — treat each non-empty line as its own turn
                if (line.trim()) {
                    units.push(
                        buildUnit(line, lineStart, lineStart + line.length, DiscourseGranularity.turn)
                    );
                }
            }
        }
    }

    // Flush the final turn
    flushTurn(globalOffset - 1);

    return units;
}

function parseExchanges(text: string): DiscourseUnit[] {
    const turns = parseTurns(text);
    const units: DiscourseUnit[] = [];

    for (let i = 0; i < turns.length; i += 2) {
        const t1 = turns[i];
        const t2 = turns[i + 1];

        if (t2) {
            const exText = text.slice(t1.start, t2.end);
            units.push(buildUnit(exText, t1.start, t2.end, DiscourseGranularity.exchange));
        } else {
            // Odd turn out — treat as its own exchange
            units.push(buildUnit(t1.text, t1.start, t1.end, DiscourseGranularity.exchange));
        }
    }

    return units;
}

function parseTopicSegments(text: string): DiscourseUnit[] {
    const utterances = parseUtterances(text);
    const units: DiscourseUnit[] = [];

    if (utterances.length === 0) return units;

    let segStart = utterances[0].start;
    let segEnd = utterances[0].end;
    let segTexts: string[] = [utterances[0].text];

    for (let i = 1; i < utterances.length; i++) {
        const utt = utterances[i];

        if (TOPIC_SHIFT_RE.test(utt.text)) {
            // Emit the segment accumulated so far
            const fullText = text.slice(segStart, segEnd);
            units.push(buildUnit(fullText, segStart, segEnd, DiscourseGranularity.topicSegment));
            // Start a new segment
            segStart = utt.start;
            segEnd = utt.end;
            segTexts = [utt.text];
        } else {
            segEnd = utt.end;
            segTexts.push(utt.text);
        }
    }

    // Flush the last segment
    if (segTexts.length > 0) {
        const fullText = text.slice(segStart, segEnd);
        units.push(buildUnit(fullText, segStart, segEnd, DiscourseGranularity.topicSegment));
    }

    return units;
}

export function parseAtGranularity(
    text: string,
    level: DiscourseGranularity
): DiscourseUnit[] {
    switch (level) {
        case DiscourseGranularity.morpheme:
            return parseMorphemes(text);
        case DiscourseGranularity.bunsetsu:
            return parseBunsetsuUnits(text);
        case DiscourseGranularity.clause:
            return parseClauses(text);
        case DiscourseGranularity.utterance:
            return parseUtterances(text);
        case DiscourseGranularity.turn:
            return parseTurns(text);
        case DiscourseGranularity.exchange:
            return parseExchanges(text);
        case DiscourseGranularity.topicSegment:
            return parseTopicSegments(text);
    }
}

export function findUnitAt(
    units: DiscourseUnit[],
    offset: number
): DiscourseUnit | null {
    for (const unit of units) {
        if (offset >= unit.start && offset < unit.end) {
            return unit;
        }
    }
    return null;
}

export function findNextUnit(
    units: DiscourseUnit[],
    offset: number
): DiscourseUnit | null {
    for (const unit of units) {
        if (unit.start > offset) {
            return unit;
        }
    }
    return null;
}

export function findPrevUnit(
    units: DiscourseUnit[],
    offset: number
): DiscourseUnit | null {
    let prev: DiscourseUnit | null = null;
    for (const unit of units) {
        if (unit.end <= offset) {
            prev = unit;
        }
    }
    return prev;
}
