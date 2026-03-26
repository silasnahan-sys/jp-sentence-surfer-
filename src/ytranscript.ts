import { YTranscriptLine } from './types';
import {
    YTRANSCRIPT_TIMESTAMP_REGEX,
    YTRANSCRIPT_INLINE_REGEX,
    YTRANSCRIPT_ANNOTATION_REGEX,
    JP_TERMINAL_CHARS,
} from './constants';

/**
 * Detect whether the given text looks like a YTranscript output.
 * YTranscript lines start with [HH:MM:SS](url) or [MM:SS](url).
 */
export function isYTranscriptText(text: string): boolean {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return false;
    // At least half the non-empty lines should look like transcript lines
    const matches = lines.filter(l => YTRANSCRIPT_TIMESTAMP_REGEX.test(l));
    return matches.length >= Math.ceil(lines.length / 2);
}

/**
 * Parse a YTranscript text into an array of { timestamp, url, text, lineIndex }.
 */
export function parseYTranscriptLines(text: string): YTranscriptLine[] {
    const lines = text.split('\n');
    const result: YTranscriptLine[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\[(\d+:\d+(?::\d+)?)\]\((https?:\/\/[^)]+)\)\s*(.*)/);
        if (match) {
            result.push({
                timestamp: match[1],
                url: match[2],
                text: match[3],
                lineIndex: i,
            });
        }
    }
    return result;
}

/**
 * Strip all [MM:SS](url) timestamps and [笑い]-style annotations from a line.
 */
export function stripLineMarkup(line: string): string {
    return line
        .replace(new RegExp(YTRANSCRIPT_INLINE_REGEX.source, 'g'), '')
        .replace(new RegExp(YTRANSCRIPT_ANNOTATION_REGEX.source, 'g'), '')
        .trim();
}

/**
 * Process a full YTranscript note for bunsetsu surfing:
 * 1. Strip ALL [MM:SS](url) timestamps
 * 2. Strip annotations [笑い] [音楽] [拍手]
 * 3. Concatenate cleaned text lines with newline separators so whitespace
 *    boundaries are preserved for the bunsetsu grouper
 */
export function segmentYTranscript(text: string): string {
    if (!isYTranscriptText(text)) return text;
    const lines = text.split('\n');
    const cleaned = lines
        .map(l => stripLineMarkup(l))
        .filter(l => l.length > 0);
    return cleaned.join('\n');
}

/**
 * Strip all timestamp markers from a string of text.
 */
export function cleanYTranscriptText(text: string): string {
    return text.replace(new RegExp(YTRANSCRIPT_INLINE_REGEX.source, 'g'), '').trim();
}

function endsWithJpTerminal(text: string): boolean {
    const trimmed = text.trimEnd();
    if (!trimmed) return false;
    const last = trimmed[trimmed.length - 1];
    const closingBrackets = '」』）)';
    if (closingBrackets.includes(last)) {
        const beforeBracket = trimmed.slice(0, -1).trimEnd();
        if (!beforeBracket) return false;
        return JP_TERMINAL_CHARS.includes(beforeBracket[beforeBracket.length - 1]);
    }
    return JP_TERMINAL_CHARS.includes(last);
}

/**
 * Stitch YTranscript lines into complete sentences (legacy helper, kept for
 * compatibility with callers that expect this function).
 */
export function stitchYTranscriptSentences(text: string): string[] {
    const lines = parseYTranscriptLines(text);
    const sentences: string[] = [];
    let current = '';

    for (const line of lines) {
        current += line.text;
        if (endsWithJpTerminal(current)) {
            sentences.push(current.trim());
            current = '';
        }
    }

    if (current.trim()) {
        sentences.push(current.trim());
    }

    return sentences;
}
