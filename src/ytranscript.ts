import { YTranscriptLine } from './types';
import { YTRANSCRIPT_TIMESTAMP_REGEX, YTRANSCRIPT_INLINE_REGEX, JP_TERMINAL_CHARS } from './constants';

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
 * Stitch YTranscript lines into complete sentences.
 * Returns an array of clean JP sentences (timestamps stripped).
 * Fragments are joined until a JP sentence-ending punctuation is found.
 */
export function stitchYTranscriptSentences(text: string): string[] {
    const lines = parseYTranscriptLines(text);
    const sentences: string[] = [];
    let current = '';

    for (const line of lines) {
        current += line.text;
        // Check if current accumulation ends with JP terminal punctuation
        if (endsWithJpTerminal(current)) {
            sentences.push(current.trim());
            current = '';
        }
    }

    // Flush remaining text
    if (current.trim()) {
        sentences.push(current.trim());
    }

    return sentences;
}

/**
 * Process a full YTranscript note:
 * - Stitch sentence fragments across timestamp lines
 * - Return the cleaned text with proper sentence boundaries
 */
export function segmentYTranscript(text: string): string {
    if (!isYTranscriptText(text)) return text;
    const sentences = stitchYTranscriptSentences(text);
    return sentences.join('\n');
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
    // Allow closing brackets after terminal punctuation
    const closingBrackets = '」』）)';
    if (closingBrackets.includes(last)) {
        const beforeBracket = trimmed.slice(0, -1).trimEnd();
        if (!beforeBracket) return false;
        return JP_TERMINAL_CHARS.includes(beforeBracket[beforeBracket.length - 1]);
    }
    return JP_TERMINAL_CHARS.includes(last);
}
