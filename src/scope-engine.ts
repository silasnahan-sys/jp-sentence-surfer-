/**
 * ScopeEngine — Bunsetsu Scope Graduation System
 *
 * Hierarchical Japanese text navigation with 4 scope levels:
 *   Level 0: 文節 (bunsetsu)    — minimal phrase chunks
 *   Level 1: 連文節 (ren-bunsetsu) — paired bunsetsu by grammatical dependency
 *   Level 2: 節 (setsu/clause)  — clauses delimited by conjunctive boundaries
 *   Level 3: 文 (bun/sentence)  — full sentences
 *
 * Driven by pinch-to-zoom: pinch out → bigger scope, pinch in → tighter.
 * Each level produces a SurfUnit[] for the monkey scroller to navigate.
 *
 * JP rhythm game design: scope changes trigger level-up animations,
 * the zoom lane "highway" reforms with new-scope units, and the
 * scope badge pulses with kanji labels (節→連→句→文).
 */

import { SurfUnit, BunsetsuChunk } from './types';
import { buildCleanText, parseBunsetsu, parseSentences } from './jp-sentence-parser';

export const SCOPE_COUNT = 4;
export const SCOPE_LABELS: readonly string[] = ['文節', '連文節', '節', '文'];
export const SCOPE_BADGES: readonly string[] = ['節', '連', '句', '文'];
export const SCOPE_COLORS: readonly string[] = ['#6ec6ff', '#a78bfa', '#f59e0b', '#ef4444'];

export interface ScopeLevel {
    label: string;
    badge: string;
    color: string;
    units: SurfUnit[];
}

/** Particles indicating a bunsetsu depends on the next → merge into ren-bunsetsu.
 *  Includes 1-, 2-, and 3-char forms to catch compound particles in transcripts. */
const DEPENDENCY_TAILS = new Set([
    // 1-char
    'は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ',
    // 2-char
    'より', 'まで', 'から', 'ほど', 'だけ', 'でも', 'とは', 'には', 'でも', 'にも', 'とも',
    // 3-char
    'くらい', 'からも', 'までに', 'ならば',
]);

/** Conjunctive endings that mark clause boundaries.
 *  Covers standard written JP + spoken/transcript sentence-final particles. */
const CLAUSE_CLOSERS = new Set([
    // Standard conjunctive
    'て', 'で', 'ので', 'から', 'けど', 'けれど', 'けれども', 'が', 'ながら',
    'のに', 'ため', 'ば', 'たら', 'なら', 'と', 'し', 'ては', 'では',
    // Extended conjunctive
    'ものの', 'くせに', 'ところで', 'ところが', 'のだが', 'ですが', 'ますが',
    // Spoken/transcript sentence-final particles (critical for YTranscript content)
    'ね', 'よ', 'な', 'わ', 'ぞ', 'ぜ', 'さ', 'よね', 'よな', 'かな', 'だな', 'だよ',
    'ってね', 'ってよ', 'ですよ', 'ますよ', 'ですね', 'ますね',
]);

/** Detect transcript content.
 *  Supports YTranscript format [HH:MM:SS](url) AND plain [MM:SS] / [H:MM:SS] markers. */
function isTranscriptContent(text: string): boolean {
    const urlTs = (text.match(/^\[[\d:.,]+\]\(https?:\/\//gm) || []).length;
    const plainTs = (text.match(/^\[\d{1,2}:\d{2}(?::\d{2})?\]/gm) || []).length;
    return urlTs >= 2 || plainTs >= 2;
}

export class ScopeEngine {
    private levels: ScopeLevel[] = [];
    private chunks: SurfUnit[] = [];   // document-level context chunks (paragraphs/heading sections)
    private rawTextRef = '';           // raw text reference for chunk building

    /**
     * Analyze text and build all 4 scope levels + context chunks.
     */
    analyze(rawText: string, sentenceRegex: string): void {
        this.rawTextRef = rawText;
        const { cleanText, map } = buildCleanText(rawText);

        if (cleanText.trim().length === 0) {
            this.levels = SCOPE_LABELS.map((label, i) => ({
                label,
                badge: SCOPE_BADGES[i],
                color: SCOPE_COLORS[i],
                units: [],
            }));
            this.chunks = [];
            return;
        }

        const chunks = parseBunsetsu(cleanText);

        // Shared offset mapper: clean-text index → raw-text index
        const mapStart = (ci: number): number => map[ci] ?? 0;
        const mapEnd = (ci: number): number => {
            const lastIdx = Math.min(ci - 1, map.length - 1);
            return lastIdx >= 0 ? (map[lastIdx] ?? 0) + 1 : 0;
        };

        // Level 0: individual bunsetsu
        const bunsetsuUnits = chunks
            .filter(c => c.text.trim().length > 0)
            .map(c => ({
                text: c.text.trim(),
                start: mapStart(c.start),
                end: mapEnd(c.end),
            }))
            .filter(u => u.end > u.start);

        // Level 1: ren-bunsetsu (paired groups)
        const renUnits = this.buildRenBunsetsu(chunks, mapStart, mapEnd);

        // Level 2: clauses
        const clauseUnits = this.buildClauses(chunks, mapStart, mapEnd);

        // Level 3: sentences
        // For transcripts, sentence regex would chop at newlines — use cleanText-based
        // sentence detection that ignores timestamp line breaks.
        const transcript = isTranscriptContent(rawText);
        let sentenceUnits: SurfUnit[];
        if (transcript) {
            // Use the cleanText (timestamps stripped, newlines→spaces) for sentence detection,
            // then map offsets back to raw document.
            sentenceUnits = this.buildTranscriptSentences(cleanText, map);
        } else {
            const sentences = parseSentences(rawText, { sentenceRegex, useBoldBoundaries: false });
            sentenceUnits = sentences
                .map(s => ({ text: s.raw.trim(), start: s.start, end: s.end }))
                .filter(u => u.end > u.start && u.text.length > 0);
        }

        this.levels = [
            { label: SCOPE_LABELS[0], badge: SCOPE_BADGES[0], color: SCOPE_COLORS[0], units: bunsetsuUnits },
            { label: SCOPE_LABELS[1], badge: SCOPE_BADGES[1], color: SCOPE_COLORS[1], units: renUnits },
            { label: SCOPE_LABELS[2], badge: SCOPE_BADGES[2], color: SCOPE_COLORS[2], units: clauseUnits },
            { label: SCOPE_LABELS[3], badge: SCOPE_BADGES[3], color: SCOPE_COLORS[3], units: sentenceUnits },
        ];

        // Build context chunks (document-level grouping for ContextChunkScroller)
        this.chunks = transcript
            ? this.buildTranscriptChunks(rawText)
            : this.buildMarkdownChunks(rawText);
    }

    getLevel(idx: number): ScopeLevel | null {
        return this.levels[idx] ?? null;
    }

    getUnits(level: number): SurfUnit[] {
        return this.levels[level]?.units ?? [];
    }

    /**
     * Find the unit index at `level` containing document `offset`.
     * Binary search since units are sorted by start offset.
     */
    findUnitAt(level: number, offset: number): number {
        const units = this.getUnits(level);
        if (units.length === 0) return 0;

        // Binary search for the unit containing offset
        let lo = 0, hi = units.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (offset < units[mid].start) { hi = mid - 1; }
            else if (offset >= units[mid].end) { lo = mid + 1; }
            else { return mid; } // exact hit
        }

        // No exact hit — find nearest by midpoint distance
        let best = 0, bestDist = Infinity;
        // Only check neighbors around the binary search landing point
        const checkStart = Math.max(0, lo - 1);
        const checkEnd = Math.min(units.length - 1, lo + 1);
        for (let i = checkStart; i <= checkEnd; i++) {
            const d = Math.abs((units[i].start + units[i].end) / 2 - offset);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    /** Get document-level context chunks. */
    getChunks(): SurfUnit[] {
        return this.chunks;
    }

    /** Find chunk index containing document offset (binary search). */
    findChunkAt(offset: number): number {
        const units = this.chunks;
        if (units.length === 0) return 0;
        let lo = 0, hi = units.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (offset < units[mid].start) hi = mid - 1;
            else if (offset >= units[mid].end) lo = mid + 1;
            else return mid;
        }
        let best = 0, bestDist = Infinity;
        const cs = Math.max(0, lo - 1);
        const ce = Math.min(units.length - 1, lo + 1);
        for (let i = cs; i <= ce; i++) {
            const d = Math.abs((units[i].start + units[i].end) / 2 - offset);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    /** Get units within a specific chunk at a given scope level. */
    getUnitsInChunk(level: number, chunkIdx: number): SurfUnit[] {
        const chunk = this.chunks[chunkIdx];
        if (!chunk) return [];
        const allUnits = this.getUnits(level);
        // Binary search for first unit that overlaps chunk
        let lo = 0, hi = allUnits.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (allUnits[mid].end <= chunk.start) lo = mid + 1;
            else hi = mid - 1;
        }
        const result: SurfUnit[] = [];
        for (let i = lo; i < allUnits.length; i++) {
            if (allUnits[i].start >= chunk.end) break;
            result.push(allUnits[i]);
        }
        return result;
    }

    /**
     * Build context chunks for YTranscript content.
     * Groups: blank-line-separated blocks of timestamp lines.
     * Each timestamp line [HH:MM:SS](url) text is preserved as-is.
     */
    private buildTranscriptChunks(rawText: string): SurfUnit[] {
        const chunks: SurfUnit[] = [];
        const lines = rawText.split('\n');
        let chunkStart = -1;
        let lastNonEmptyEnd = 0;

        let offset = 0;
        for (let i = 0; i < lines.length; i++) {
            // Track offset by cumulative line lengths (O(n) total, not O(n^2))
            const lineEnd = offset + lines[i].length;
            const trimmed = lines[i].trim();

            if (trimmed.length === 0) {
                // Blank line = potential chunk boundary
                if (chunkStart >= 0) {
                    const text = rawText.slice(chunkStart, lastNonEmptyEnd).trim();
                    if (text.length > 0) {
                        chunks.push({ text, start: chunkStart, end: lastNonEmptyEnd });
                    }
                    chunkStart = -1;
                }
            } else {
                if (chunkStart < 0) chunkStart = offset;
                lastNonEmptyEnd = lineEnd;
            }
            offset = lineEnd + 1; // +1 for newline
        }
        // Final chunk
        if (chunkStart >= 0 && lastNonEmptyEnd > chunkStart) {
            const text = rawText.slice(chunkStart, lastNonEmptyEnd).trim();
            if (text.length > 0) {
                chunks.push({ text, start: chunkStart, end: lastNonEmptyEnd });
            }
        }

        // If no blank-line breaks found, create chunks of ~5 timestamp lines each
        if (chunks.length <= 1 && lines.filter(l => /^\[[\d:.,]+\]\(/.test(l.trim())).length > 5) {
            return this.buildFixedSizeTranscriptChunks(rawText, 5);
        }
        return chunks.length > 0 ? chunks : [{ text: rawText.trim(), start: 0, end: rawText.length }];
    }

    /** Fallback: split transcript into fixed-size groups of N timestamp lines. */
    private buildFixedSizeTranscriptChunks(rawText: string, groupSize: number): SurfUnit[] {
        const chunks: SurfUnit[] = [];
        const lines = rawText.split('\n');
        let tsCount = 0;
        let chunkStart = -1;
        let lastEnd = 0;

        let offset = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineEnd = offset + lines[i].length;
            const trimmed = lines[i].trim();
            const isTimestamp = /^\[[\d:.,]+\]\(/.test(trimmed);

            if (trimmed.length > 0) {
                if (chunkStart < 0) chunkStart = offset;
                lastEnd = lineEnd;
                if (isTimestamp) tsCount++;

                if (tsCount >= groupSize) {
                    const text = rawText.slice(chunkStart, lastEnd).trim();
                    if (text.length > 0) {
                        chunks.push({ text, start: chunkStart, end: lastEnd });
                    }
                    chunkStart = -1;
                    tsCount = 0;
                }
            }
            offset = lineEnd + 1; // +1 for newline
        }
        if (chunkStart >= 0 && lastEnd > chunkStart) {
            const text = rawText.slice(chunkStart, lastEnd).trim();
            if (text.length > 0) {
                chunks.push({ text, start: chunkStart, end: lastEnd });
            }
        }
        return chunks;
    }

    /**
     * Build context chunks for regular Markdown content.
     * Strategy: heading sections (# → next #), then paragraph blocks as fallback.
     * Minimum chunk size: 2 sentences (merge tiny chunks into previous).
     */
    private buildMarkdownChunks(rawText: string): SurfUnit[] {
        // Skip YAML frontmatter (---\n...\n---\n) — avoids field names becoming nav units
        let body = rawText;
        let baseOffset = 0;
        if (rawText.startsWith('---')) {
            const closeIdx = rawText.indexOf('\n---', 3);
            if (closeIdx >= 0) {
                baseOffset = closeIdx + 4; // skip past closing ---\n
                body = rawText.slice(baseOffset);
            }
        }

        // Try heading-based chunking first
        const headingChunks = this.buildHeadingChunks(body, baseOffset);
        if (headingChunks.length >= 2) return headingChunks;

        // Fallback: paragraph-based (double newline separated)
        return this.buildParagraphChunks(body, baseOffset);
    }

    /** Split by Markdown headings (# at line start). */
    private buildHeadingChunks(rawText: string, baseOffset = 0): SurfUnit[] {
        const chunks: SurfUnit[] = [];
        const headingRe = /^#{1,6}\s+/gm;
        const matches: number[] = [];
        let m: RegExpExecArray | null;
        while ((m = headingRe.exec(rawText)) !== null) {
            matches.push(m.index);
        }
        if (matches.length === 0) return [];

        // Content before first heading
        if (matches[0] > 0) {
            const text = rawText.slice(0, matches[0]).trim();
            if (text.length > 0) {
                chunks.push({ text, start: baseOffset, end: baseOffset + matches[0] });
            }
        }
        // Each heading → next heading
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i];
            const end = i + 1 < matches.length ? matches[i + 1] : rawText.length;
            const text = rawText.slice(start, end).trim();
            if (text.length > 0) {
                chunks.push({ text, start: baseOffset + start, end: baseOffset + end });
            }
        }
        return chunks;
    }

    /** Split by blank lines (paragraph blocks). */
    private buildParagraphChunks(rawText: string, baseOffset = 0): SurfUnit[] {
        const chunks: SurfUnit[] = [];
        // Use regex to find paragraph separators and track offsets (O(n), not O(n^2))
        const sepRe = /\n\s*\n/g;
        let blockStart = 0;
        let m: RegExpExecArray | null;
        while ((m = sepRe.exec(rawText)) !== null) {
            const blockText = rawText.slice(blockStart, m.index);
            const trimmed = blockText.trim();
            if (trimmed.length > 0) {
                const leadWs = blockText.length - blockText.trimStart().length;
                const trailWs = blockText.length - blockText.trimEnd().length;
                chunks.push({ text: trimmed, start: baseOffset + blockStart + leadWs, end: baseOffset + m.index - trailWs });
            }
            blockStart = m.index + m[0].length;
        }
        // Final block after last separator
        if (blockStart < rawText.length) {
            const blockText = rawText.slice(blockStart);
            const trimmed = blockText.trim();
            if (trimmed.length > 0) {
                const leadWs = blockText.length - blockText.trimStart().length;
                const trailWs = blockText.length - blockText.trimEnd().length;
                chunks.push({ text: trimmed, start: baseOffset + blockStart + leadWs, end: baseOffset + rawText.length - trailWs });
            }
        }

        // Merge tiny chunks (< 30 chars) into the previous chunk
        const merged: SurfUnit[] = [];
        for (const chunk of chunks) {
            if (merged.length > 0 && chunk.text.length < 30) {
                const prev = merged[merged.length - 1];
                prev.text = prev.text + '\n\n' + chunk.text;
                prev.end = chunk.end;
            } else {
                merged.push({ ...chunk });
            }
        }

        return merged.length > 0 ? merged : [{ text: rawText.trim(), start: baseOffset, end: baseOffset + rawText.length }];
    }

    /**
     * Level 1: Merge consecutive bunsetsu into ren-bunsetsu.
     * Content bunsetsu ending with a dependency particle merges with next.
     * Short adverb-like chunks (≤3 chars) also merge forward.
     * Max 3 bunsetsu per ren-group.
     */
    private buildRenBunsetsu(
        chunks: BunsetsuChunk[],
        mapStart: (i: number) => number,
        mapEnd: (i: number) => number
    ): SurfUnit[] {
        if (chunks.length === 0) return [];
        const groups: SurfUnit[] = [];
        let i = 0;

        while (i < chunks.length) {
            let groupEnd = i;
            let merged = 1;

            while (groupEnd + 1 < chunks.length && merged < 3) {
                const curr = chunks[groupEnd];
                const next = chunks[groupEnd + 1];
                // Don't merge across sentence-ending punctuation
                if (/[。！？!?]/.test(curr.text)) break;
                // Don't merge across large gaps (likely different lines)
                if (next.start - curr.end > 2) break;

                // Merge if chunk ends with a dependency particle (1-, 2-, or 3-char)
                const tail1 = curr.text.slice(-1);
                const tail2 = curr.text.slice(-2);
                const tail3 = curr.text.slice(-3);
                if (DEPENDENCY_TAILS.has(tail1) || DEPENDENCY_TAILS.has(tail2) || DEPENDENCY_TAILS.has(tail3)) {
                    groupEnd++; merged++; continue;
                }

                // Merge short adverb-like chunks (≤3 chars, no punctuation)
                if (curr.text.length <= 3 && !/[。、！？!?,，]/.test(curr.text)) {
                    groupEnd++; merged++; continue;
                }

                break;
            }

            const sc = chunks[i];
            const ec = chunks[groupEnd];
            let text = '';
            for (let j = i; j <= groupEnd; j++) text += chunks[j].text;
            const s = mapStart(sc.start);
            const e = mapEnd(ec.end);
            if (text.trim().length > 0 && e > s) {
                groups.push({ text: text.trim(), start: s, end: e });
            }
            i = groupEnd + 1;
        }

        return groups;
    }

    /**
     * Level 2: Merge bunsetsu into clauses (節).
     * Boundaries: conjunctive particles, comma, sentence-end punctuation.
     */
    private buildClauses(
        chunks: BunsetsuChunk[],
        mapStart: (i: number) => number,
        mapEnd: (i: number) => number
    ): SurfUnit[] {
        if (chunks.length === 0) return [];
        const clauses: SurfUnit[] = [];
        let clauseStartIdx = 0;

        // I-1: Ambiguous single-char closers that need a minimum clause size
        // to avoid false splits (が as subject marker vs contrastive conjunction)
        const AMBIGUOUS_CLOSERS = new Set(['が', 'と', 'し']);
        const MIN_BUNSETSU_FOR_AMBIGUOUS = 3;

        for (let i = 0; i < chunks.length; i++) {
            const text = chunks[i].text;
            const chunksInClause = i - clauseStartIdx + 1;

            // Check if boundary is triggered by an ambiguous closer
            const isAmbiguousCloser = !(/[。！？!?]/.test(text)) &&
                !(/[、，,]$/.test(text)) &&
                this.endsWithAmbiguousCloser(text, AMBIGUOUS_CLOSERS);

            const isBoundary = (
                /[。！？!?]/.test(text) ||
                /[、，,]$/.test(text) ||
                (this.endsWithClauseCloser(text) &&
                    // Guard: ambiguous closers need enough preceding context
                    (!isAmbiguousCloser || chunksInClause >= MIN_BUNSETSU_FOR_AMBIGUOUS)) ||
                i === chunks.length - 1
            );

            if (isBoundary) {
                const sc = chunks[clauseStartIdx];
                const ec = chunks[i];
                let clauseText = '';
                for (let j = clauseStartIdx; j <= i; j++) clauseText += chunks[j].text;
                const s = mapStart(sc.start);
                const e = mapEnd(ec.end);
                if (clauseText.trim().length > 0 && e > s) {
                    clauses.push({ text: clauseText.trim(), start: s, end: e });
                }
                clauseStartIdx = i + 1;
            }
        }

        return clauses;
    }

    private endsWithClauseCloser(text: string): boolean {
        for (let len = Math.min(4, text.length); len >= 1; len--) {
            if (CLAUSE_CLOSERS.has(text.slice(-len))) return true;
        }
        return false;
    }

    /** I-1: Check if text ends with an ambiguous single-char closer (が/と/し). */
    private endsWithAmbiguousCloser(text: string, ambiguousSet: Set<string>): boolean {
        if (text.length === 0) return false;
        return ambiguousSet.has(text.slice(-1));
    }

    /**
     * Build sentence units from transcript cleanText where newlines have been
     * collapsed into spaces. Split on JP sentence-ending punctuation (。！？!?)
     * then map offsets back to raw document positions via the position map.
     */
    private buildTranscriptSentences(
        cleanText: string,
        map: number[]
    ): SurfUnit[] {
        const units: SurfUnit[] = [];
        // Split on sentence-ending punctuation WITHOUT lookbehind (Safari < 16.4 compat).
        // Collect sentences by scanning for end-punctuation runs, then slicing.
        const SENT_END = /[。！？!?][」』）\)]*/g;
        const parts: string[] = [];
        let last = 0;
        let em: RegExpExecArray | null;
        while ((em = SENT_END.exec(cleanText)) !== null) {
            const segEnd = em.index + em[0].length;
            parts.push(cleanText.slice(last, segEnd));
            last = segEnd;
            while (last < cleanText.length && cleanText[last] === ' ') last++;
        }
        if (last < cleanText.length) parts.push(cleanText.slice(last));
        let offset = 0;
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) { offset += part.length; continue; }
            // Find start position in cleanText — start from current offset to avoid matching earlier duplicates
            const startInClean = cleanText.indexOf(trimmed, offset);
            if (startInClean < 0) { offset += part.length; continue; }
            const endInClean = startInClean + trimmed.length;
            const rawStart = map[startInClean] ?? 0;
            const lastIdx = Math.min(endInClean - 1, map.length - 1);
            const rawEnd = lastIdx >= 0 ? (map[lastIdx] ?? 0) + 1 : rawStart;
            if (rawEnd > rawStart && trimmed.length > 0) {
                units.push({ text: trimmed, start: rawStart, end: rawEnd });
            }
            // Always advance offset past this match to prevent re-matching the same text
            offset = endInClean;
        }
        // If no punctuation-based splits found, return whole as one unit
        if (units.length === 0 && cleanText.trim().length > 0) {
            units.push({
                text: cleanText.trim(),
                start: map[0] ?? 0,
                end: map.length > 0 ? (map[map.length - 1] ?? 0) + 1 : 0
            });
        }
        return units;
    }
}
