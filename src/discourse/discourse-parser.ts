import { parseBunsetsu } from '../jp-sentence-parser';
import { detectDiscourseMarkers, DetectedMarker, DiscourseCategory } from './discourse-grammar';

export type GranularityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const GRANULARITY_LABELS: Record<GranularityLevel, string> = {
    1: '形態素 (Morpheme)',
    2: '文節 (Bunsetsu)',
    3: '節 (Clause)',
    4: '発話 (Utterance)',
    5: '発話番 (Turn)',
    6: 'やりとり (Exchange)',
    7: '話題 (Topic Segment)',
};

export interface ParsedUnit {
    level: GranularityLevel;
    text: string;
    start: number;
    end: number;
    markers: DetectedMarker[];
    children?: ParsedUnit[];
}

export interface DiscourseParseResult {
    units: ParsedUnit[][];
    text: string;
}

// Clause-ending tokens for level 3
const CLAUSE_ENDINGS = ['て', 'から', 'けど', 'ので', 'が', 'ながら', 'たら', 'ば', 'と'];

// Topic-initiating markers for level 7
const TOPIC_INIT_MARKERS = [
    '結局', 'ところで', 'さて', 'それでは', '話を戻すと', '一方', '一方で',
    'ちなみに', '改めて', 'そもそも', 'ということで', '基本的に',
];

/**
 * Parse text at the given granularity levels (default: all 7).
 */
export function parseDiscourse(
    text: string,
    levels?: GranularityLevel[]
): DiscourseParseResult {
    const requestedLevels: GranularityLevel[] = levels ?? [1, 2, 3, 4, 5, 6, 7];
    const allUnits: ParsedUnit[][] = new Array(7).fill(null).map(() => []);

    for (const level of requestedLevels) {
        allUnits[level - 1] = parseAtLevel(text, level);
    }

    return { units: allUnits, text };
}

function parseAtLevel(text: string, level: GranularityLevel): ParsedUnit[] {
    switch (level) {
        case 1: return parseMorphemes(text);
        case 2: return parseBunsetsuUnits(text);
        case 3: return parseClauses(text);
        case 4: return parseUtterances(text);
        case 5: return parseTurns(text);
        case 6: return parseExchanges(text);
        case 7: return parseTopicSegments(text);
    }
}

/** Level 1 – naive character-boundary split (groups runs of same script) */
function parseMorphemes(text: string): ParsedUnit[] {
    const units: ParsedUnit[] = [];
    if (!text) return units;
    let start = 0;
    let buf = text[0];

    const scriptOf = (ch: string): number => {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp >= 0x3040 && cp <= 0x309f) return 1; // hiragana
        if (cp >= 0x30a0 && cp <= 0x30ff) return 2; // katakana
        if (cp >= 0x4e00 && cp <= 0x9fff) return 3; // CJK
        if (cp >= 0x0020 && cp <= 0x007e) return 4; // ASCII
        return 5; // other
    };

    for (let i = 1; i < text.length; i++) {
        if (scriptOf(text[i]) !== scriptOf(buf[0])) {
            const t = text.slice(start, i);
            units.push(makeUnit(1, t, start, i));
            start = i;
            buf = text[i];
        } else {
            buf += text[i];
        }
    }
    if (start < text.length) {
        units.push(makeUnit(1, text.slice(start), start, text.length));
    }
    return units;
}

/** Level 2 – bunsetsu from jp-sentence-parser */
function parseBunsetsuUnits(text: string): ParsedUnit[] {
    const chunks = parseBunsetsu(text);
    return chunks.map(c => makeUnit(2, c.text, c.start, c.end));
}

/** Level 3 – clause grouping by clause-ending bunsetsu tokens */
function parseClauses(text: string): ParsedUnit[] {
    const bunsetsu = parseBunsetsu(text);
    if (bunsetsu.length === 0) return [];

    const clauses: ParsedUnit[] = [];
    let clauseStart = bunsetsu[0].start;
    let clauseEnd = bunsetsu[0].end;

    const isClauseEnder = (t: string): boolean =>
        CLAUSE_ENDINGS.some(e => t.endsWith(e));

    for (let i = 0; i < bunsetsu.length; i++) {
        const chunk = bunsetsu[i];
        clauseEnd = chunk.end;
        if (isClauseEnder(chunk.text) || i === bunsetsu.length - 1) {
            const t = text.slice(clauseStart, clauseEnd);
            clauses.push(makeUnit(3, t, clauseStart, clauseEnd));
            clauseStart = clauseEnd;
        }
    }
    return clauses;
}

/** Level 4 – utterances split on sentence-ending punctuation */
function parseUtterances(text: string): ParsedUnit[] {
    const re = /[^。！？!?\n]*[。！？!?][」』）)]*|[^。！？!?\n]+/g;
    const units: ParsedUnit[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const t = m[0].trim();
        if (t) units.push(makeUnit(4, t, m.index, m.index + m[0].length));
    }
    return units;
}

/** Level 5 – turns split on paragraph breaks */
function parseTurns(text: string): ParsedUnit[] {
    const paragraphs = text.split(/\n{2,}/);
    const units: ParsedUnit[] = [];
    let offset = 0;
    for (const para of paragraphs) {
        const t = para.trim();
        if (t) {
            const start = text.indexOf(para, offset);
            units.push(makeUnit(5, t, start, start + para.length));
        }
        offset += para.length + 2; // account for the \n\n separator
    }
    return units;
}

/** Level 6 – exchanges: pair adjacent turns */
function parseExchanges(text: string): ParsedUnit[] {
    const turns = parseTurns(text);
    const exchanges: ParsedUnit[] = [];
    for (let i = 0; i < turns.length; i += 2) {
        const a = turns[i];
        const b = turns[i + 1];
        if (b) {
            const t = text.slice(a.start, b.end);
            exchanges.push(makeUnit(6, t, a.start, b.end));
        } else {
            exchanges.push(makeUnit(6, a.text, a.start, a.end));
        }
    }
    return exchanges;
}

/** Level 7 – topic segments split on topic-initiating markers */
function parseTopicSegments(text: string): ParsedUnit[] {
    // Find all positions where a topic marker starts
    const splitPositions: number[] = [0];

    for (const marker of TOPIC_INIT_MARKERS) {
        let idx = 0;
        while (true) {
            const pos = text.indexOf(marker, idx);
            if (pos === -1) break;
            if (pos > 0) splitPositions.push(pos);
            idx = pos + 1;
        }
    }

    splitPositions.sort((a, b) => a - b);
    // Remove duplicates
    const unique = splitPositions.filter((v, i, arr) => i === 0 || arr[i - 1] !== v);

    const units: ParsedUnit[] = [];
    for (let i = 0; i < unique.length; i++) {
        const start = unique[i];
        const end = i + 1 < unique.length ? unique[i + 1] : text.length;
        const t = text.slice(start, end).trim();
        if (t) units.push(makeUnit(7, t, start, end));
    }
    return units;
}

function makeUnit(level: GranularityLevel, text: string, start: number, end: number): ParsedUnit {
    return {
        level,
        text,
        start,
        end,
        markers: detectDiscourseMarkers(text),
    };
}

export function getUnitsAtLevel(result: DiscourseParseResult, level: GranularityLevel): ParsedUnit[] {
    return result.units[level - 1] ?? [];
}
