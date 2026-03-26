import { JpSentenceSurferSettings } from './types';
import {
    JP_SENTENCE_REGEX,
    BOLD_REGEX,
    YTRANSCRIPT_INLINE_REGEX,
} from './constants';
import { ParsedSentence, BoldSegment } from './types';

/**
 * Parse all sentences from a block of text.
 * Respects bold-boundary mode and YTranscript stripping.
 */
export function parseSentences(
    text: string,
    settings: Pick<JpSentenceSurferSettings, 'sentenceRegex' | 'useBoldBoundaries'>
): ParsedSentence[] {
    const sentences: ParsedSentence[] = [];
    const regex = new RegExp(settings.sentenceRegex, 'gm');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const raw = match[0];
        if (!raw.trim()) continue;

        const start = match.index;
        const end = start + raw.length;
        const boldSegments = extractBoldSegments(raw);
        const clean = stripTimestamps(raw);
        const hasTimestamps = YTRANSCRIPT_INLINE_REGEX.test(raw);

        sentences.push({
            raw,
            clean,
            start,
            end,
            hasBold: boldSegments.length > 0,
            boldSegments,
            hasTimestamps,
        });
    }

    // If no sentences found with the JP regex, fall back to paragraph breaks
    if (sentences.length === 0) {
        return parseFallback(text);
    }

    return sentences;
}

/**
 * Find the sentence containing the given cursor offset.
 */
export function findSentenceAt(
    sentences: ParsedSentence[],
    offset: number
): ParsedSentence | null {
    for (const s of sentences) {
        if (offset >= s.start && offset <= s.end) {
            return s;
        }
    }
    return null;
}

/**
 * Find the next sentence after the given offset.
 */
export function findNextSentence(
    sentences: ParsedSentence[],
    offset: number
): ParsedSentence | null {
    for (const s of sentences) {
        if (s.start > offset) {
            return s;
        }
    }
    return null;
}

/**
 * Find the previous sentence before the given offset.
 */
export function findPrevSentence(
    sentences: ParsedSentence[],
    offset: number
): ParsedSentence | null {
    let prev: ParsedSentence | null = null;
    for (const s of sentences) {
        if (s.end < offset) {
            prev = s;
        }
    }
    return prev;
}

/**
 * Extract bold segments (**text**) from a string.
 */
export function extractBoldSegments(text: string): BoldSegment[] {
    const segments: BoldSegment[] = [];
    const regex = new RegExp(BOLD_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        segments.push({
            text: match[1],
            startInSentence: match.index,
            endInSentence: match.index + match[0].length,
        });
    }
    return segments;
}

/**
 * Strip YTranscript timestamps from a string.
 */
export function stripTimestamps(text: string): string {
    return text.replace(new RegExp(YTRANSCRIPT_INLINE_REGEX.source, 'g'), '');
}

/**
 * Fallback parser: split on newlines/paragraph breaks.
 */
function parseFallback(text: string): ParsedSentence[] {
    const sentences: ParsedSentence[] = [];
    const lines = text.split(/\n+/);
    let offset = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            const start = text.indexOf(line, offset);
            const end = start + line.length;
            const boldSegments = extractBoldSegments(line);
            sentences.push({
                raw: line,
                clean: stripTimestamps(line),
                start,
                end,
                hasBold: boldSegments.length > 0,
                boldSegments,
                hasTimestamps: YTRANSCRIPT_INLINE_REGEX.test(line),
            });
        }
        offset += line.length + 1; // +1 for newline
    }
    return sentences;
}
