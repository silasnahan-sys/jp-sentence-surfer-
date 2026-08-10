import { JpSentenceSurferSettings } from './types';
import {
    JP_SENTENCE_REGEX,
    BOLD_REGEX,
    YTRANSCRIPT_INLINE_REGEX,
} from './constants';
import { ParsedSentence, BoldSegment, BunsetsuChunk, SurfUnit } from './types';
import { TinySegmenter } from './tiny-segmenter';
import { groupBunsetsu } from './bunsetsu-grouper';

// Reuse a single TinySegmenter instance across all calls (it has no mutable state)
const sharedSegmenter = new TinySegmenter();

/**
 * Parse Japanese text into bunsetsu (文節) phrase chunks using TinySegmenter.
 * This is the primary parser used by all surf commands.
 */
export function parseBunsetsu(text: string): BunsetsuChunk[] {
    const tokens = sharedSegmenter.segment(text);
    return groupBunsetsu(tokens);
}

/**
 * Find the bunsetsu chunk containing the given cursor offset.
 */
export function findChunkAt(
    chunks: BunsetsuChunk[],
    offset: number
): BunsetsuChunk | null {
    for (const c of chunks) {
        if (offset >= c.start && offset < c.end) {
            return c;
        }
    }
    return null;
}

/**
 * Find the next bunsetsu chunk whose start is strictly after `offset`.
 */
export function findNextChunk(
    chunks: BunsetsuChunk[],
    offset: number
): BunsetsuChunk | null {
    for (const c of chunks) {
        if (c.start > offset) {
            return c;
        }
    }
    return null;
}

/**
 * Find the last bunsetsu chunk whose start is strictly before `offset`.
 * If cursor is mid-chunk, returns the start of that chunk (go back to beginning).
 * If cursor is at start of a chunk, returns the previous chunk.
 */
export function findPrevChunk(
    chunks: BunsetsuChunk[],
    offset: number
): BunsetsuChunk | null {
    let prev: BunsetsuChunk | null = null;
    for (const c of chunks) {
        if (c.start < offset) {
            prev = c;
        }
    }
    return prev;
}

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
        // Bug fix: YTRANSCRIPT_INLINE_REGEX has a /g flag; calling .test() on a shared /g
        // regex advances lastIndex each call, making it alternate true/false in loops.
        // Use a fresh non-global regex to guarantee correct detection every call.
        const hasTimestamps = new RegExp(YTRANSCRIPT_INLINE_REGEX.source).test(raw);

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
    const lines = text.split(/\r?\n+/);
    let offset = 0;
    for (const line of lines) {
        // Fix S-8: find the actual start of this line at `offset` using cumulative tracking
        // instead of indexOf which can match the wrong duplicate line
        const start = text.indexOf(line, offset);
        const trimmed = line.trim();
        if (trimmed) {
            const end = start + line.length;
            const boldSegments = extractBoldSegments(line);
            sentences.push({
                raw: line,
                clean: stripTimestamps(line),
                start,
                end,
                hasBold: boldSegments.length > 0,
                boldSegments,
                hasTimestamps: new RegExp(YTRANSCRIPT_INLINE_REGEX.source).test(line),
            });
        }
        // Advance offset past this line + the separator that was consumed by split
        // Use indexOf to find actual position, then advance past it
        offset = start + line.length;
        // Skip past the newline(s) that split consumed
        while (offset < text.length && (text[offset] === '\r' || text[offset] === '\n')) offset++;
    }
    return sentences;
}

// ═══ Surf Unit Parser (Collocation-level, noise-immune) ══════════════════════

/**
 * Build a "clean" version of text with noise removed:
 * - YTranscript timestamps:  [HH:MM:SS](url)
 * - Annotations:             [笑い] [音楽] [拍手]
 * - Markdown images:         ![alt](url)
 * - Bare URLs:               https://...
 * - Markdown links:          [text](url) → keeps "text"
 *
 * Returns the clean text and a position map (clean index → original index).
 */
export function buildCleanText(rawText: string): { cleanText: string; map: number[] } {
    const chars: string[] = [];
    const map: number[] = [];
    let i = 0;

    // Detect YTranscript: if ≥2 lines start with [digits:digits](http...),
    // we normalize newlines → spaces so bunsetsu spans across transcript line breaks.
    const isTranscript = (rawText.match(/^\[[\d:.,]+\]\(https?:\/\//gm) || []).length >= 2;

    while (i < rawText.length) {
        // ── Blockquote / callout prefix stripping ──
        // At start of line, skip `> ` prefixes (including nested `>> `)
        // and Obsidian callout markers `> [!type]` (strip entire marker)
        if (i === 0 || (i > 0 && rawText[i - 1] === '\n')) {
            // Skip leading `> ` prefixes (any nesting depth)
            while (i < rawText.length && rawText[i] === '>') {
                i++; // skip >
                if (i < rawText.length && rawText[i] === ' ') i++; // skip trailing space
            }
            // Check for callout marker: [!type] at start of callout line — skip the entire marker
            // Fix S-10: Handle foldable (+/-) and title text: [!type]+ Title or [!type]- Title
            if (i + 1 < rawText.length && rawText[i] === '[' && rawText[i + 1] === '!') {
                const calloutMatch = rawText.substring(i).match(/^\[![^\]]*\][+-]?\s*[^\n]*/);
                if (calloutMatch) {
                    i += calloutMatch[0].length;
                    continue;
                }
            }
            // After stripping `>` prefix, if we're at the same position, fall through to normal processing
            // (no `>` was found, or we're just past the prefix)
        }

        if (rawText[i] === '[') {
            const slice = rawText.substring(i);

            // YTranscript timestamp link: [00:00:01](https://...)
            const ytMatch = slice.match(/^\[[\d:.,]+\]\(https?:\/\/[^)]*\)\s*/);
            if (ytMatch) { i += ytMatch[0].length; continue; }

            // JP annotation: [笑い] [音楽] — short bracket with CJK, NOT followed by (
            // Guard: skip wikilinks [[page]] — check second char isn't also [
            if (i + 1 < rawText.length && rawText[i + 1] !== '[') {
                const annoMatch = slice.match(/^\[[^\]\n]{1,20}\](?!\()/);
                if (annoMatch) {
                    const inner = annoMatch[0].slice(1, -1);
                    if (/[\u3000-\u9fff\u4e00-\u9faf]/.test(inner)) {
                        i += annoMatch[0].length;
                        while (i < rawText.length && rawText[i] === ' ') i++;
                        continue;
                    }
                }
            }

            // Markdown link: [text](url) — keep the link text
            const linkMatch = slice.match(/^\[([^\]\n]*)\]\(([^)\n]+)\)/);
            if (linkMatch) {
                const textStart = i + 1; // after [
                for (let j = 0; j < linkMatch[1].length; j++) {
                    chars.push(linkMatch[1][j]);
                    map.push(textStart + j);
                }
                i += linkMatch[0].length;
                continue;
            }
        }

        // Markdown image: ![alt](url) — skip entirely
        if (rawText[i] === '!' && i + 1 < rawText.length && rawText[i + 1] === '[') {
            const imgMatch = rawText.substring(i).match(/^!\[[^\]\n]*\]\([^)\n]+\)/);
            if (imgMatch) { i += imgMatch[0].length; continue; }
        }

        // Bare URL (not inside link markup)
        if (i + 4 < rawText.length && rawText.substring(i, i + 4) === 'http') {
            const urlMatch = rawText.substring(i).match(/^https?:\/\/\S+/);
            if (urlMatch) { i += urlMatch[0].length; continue; }
        }

        // YTranscript: convert newline → space so bunsetsu can span across line breaks.
        // This lets the parser see continuous Japanese text instead of chopped lines.
        if (isTranscript && rawText[i] === '\n') {
            // Collapse consecutive newlines and trailing/leading whitespace
            const prevChar = chars.length > 0 ? chars[chars.length - 1] : '';
            if (prevChar !== ' ' && prevChar !== '') {
                chars.push(' ');
                map.push(i);
            }
            i++;
            // Skip any whitespace after the newline
            while (i < rawText.length && (rawText[i] === ' ' || rawText[i] === '\t')) i++;
            continue;
        }

        // Regular character
        chars.push(rawText[i]);
        map.push(i);
        i++;
    }

    return { cleanText: chars.join(''), map };
}

/**
 * Parse text into surfable collocation units (bunsetsu chunks).
 * Strips timestamps, URLs, markdown links, and annotations before parsing.
 * Maps offsets back to the original document positions.
 */
export function parseSurfUnits(rawText: string): SurfUnit[] {
    const { cleanText, map } = buildCleanText(rawText);
    if (cleanText.trim().length === 0) return [];

    const chunks = parseBunsetsu(cleanText);

    return chunks
        .filter(c => c.text.trim().length > 0)
        .map(c => {
            const start = map[c.start] ?? 0;
            const lastIdx = Math.min(c.end - 1, map.length - 1);
            const end = lastIdx >= 0 ? (map[lastIdx] ?? 0) + 1 : start;
            return { text: c.text.trim(), start, end };
        })
        .filter(u => u.end > u.start && u.text.length > 0);
}
