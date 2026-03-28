/**
 * Literal Context Occurrence Index (文脈インスタンス・インデックス)
 *
 * Every single time a grammar bit appears in a captured (or scraped) chunk,
 * a GrammarBitOccurrence is recorded with full left/right context.
 *
 * This enables:
 *   - Stem-family browsing → all variations used across all chunks
 *   - Context comparison (KWIC-style)
 *   - Variation spectrum display
 *   - Co-occurrence distribution statistics
 */

import { App, TFile } from 'obsidian';
import { GrammarBitOccurrence } from '../types';
import { VARIATION_BY_SURFACE, ALL_VARIATION_TREES } from './variation-trees';
import { TinySegmenter } from '../tiny-segmenter';

const segmenter = new TinySegmenter();

// ─── Persistence ──────────────────────────────────────────────────────────────

interface OccurrenceIndexData {
    version: number;
    occurrences: GrammarBitOccurrence[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let occCounter = 0;

function generateOccId(): string {
    return `occ_${Date.now().toString(36)}_${(++occCounter).toString(36)}`;
}

/** Extract 1-3 morphemes to the left / right of a position in the token array */
function getTokenContext(
    tokens: string[],
    tokenIndex: number,
    contextTokens = 3,
): { left: string; right: string } {
    const leftStart = Math.max(0, tokenIndex - contextTokens);
    const rightEnd = Math.min(tokens.length, tokenIndex + contextTokens + 1);
    const left = tokens.slice(leftStart, tokenIndex).join('');
    const right = tokens.slice(tokenIndex + 1, rightEnd).join('');
    return { left, right };
}

/** Find the sentence that contains the given character offset */
function findSentenceContext(text: string, charPos: number): string {
    const sentenceEnd = /[。！？\n]/;
    let start = charPos;
    let end   = charPos;
    while (start > 0 && !sentenceEnd.test(text[start - 1])) start--;
    while (end < text.length && !sentenceEnd.test(text[end])) end++;
    return text.slice(start, end + 1).trim();
}

// ─── Extraction ───────────────────────────────────────────────────────────────

/** All known variation surfaces sorted longest-first */
const ALL_SURFACES_SORTED = Array.from(VARIATION_BY_SURFACE.keys())
    .sort((a, b) => b.length - a.length);

/**
 * Extract all GrammarBitOccurrence entries from a single chunk.
 */
export function extractOccurrences(
    chunkText: string,
    chunkId: string,
    constellationId: string,
    sourceFile: string,
    sourceTitle: string,
    granularity: string,
    coOccurringBits: string[],
    timestamp?: string,
    scraped = false,
): GrammarBitOccurrence[] {
    const tokens = segmenter.segment(chunkText);
    const occurrences: GrammarBitOccurrence[] = [];
    const usedRanges: Array<[number, number]> = [];

    // Build char offsets for tokens
    const charOffsets: number[] = [];
    let pos = 0;
    for (const tok of tokens) {
        const idx = chunkText.indexOf(tok, pos);
        charOffsets.push(idx === -1 ? pos : idx);
        pos = (idx === -1 ? pos : idx) + tok.length;
    }

    for (const surface of ALL_SURFACES_SORTED) {
        let searchFrom = 0;
        let idx: number;
        while ((idx = chunkText.indexOf(surface, searchFrom)) !== -1) {
            const endIdx = idx + surface.length;
            const overlaps = usedRanges.some(([s, e]) => idx < e && endIdx > s);
            if (!overlaps) {
                const hit = VARIATION_BY_SURFACE.get(surface);
                if (hit) {
                    usedRanges.push([idx, endIdx]);

                    // Find nearest token index
                    let tokenIdx = 0;
                    for (let i = 0; i < charOffsets.length; i++) {
                        if (charOffsets[i] <= idx) tokenIdx = i;
                    }
                    const { left, right } = getTokenContext(tokens, tokenIdx, 3);
                    const sentenceCtx = findSentenceContext(chunkText, idx);

                    occurrences.push({
                        id: generateOccId(),
                        stemFamily: hit.tree.stem,
                        variation: surface,
                        surfaceForm: surface,
                        chunkId,
                        chunkText,
                        positionInChunk: idx,
                        leftContext: left,
                        rightContext: right,
                        sentenceContext: sentenceCtx,
                        coOccurringBits,
                        constellationId,
                        sourceFile,
                        sourceTitle,
                        timestamp,
                        capturedAtGranularity: granularity,
                        capturedAt: Date.now(),
                        scraped,
                    });
                }
            }
            searchFrom = idx + 1;
        }
    }

    return occurrences;
}

// ─── OccurrenceIndex class ────────────────────────────────────────────────────

export class OccurrenceIndex {
    private app: App;
    private indexPath: string;
    private occurrences: GrammarBitOccurrence[] = [];
    private loaded = false;

    constructor(app: App, indexPath: string) {
        this.app = app;
        this.indexPath = indexPath;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    async load(): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(this.indexPath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                const data: OccurrenceIndexData = JSON.parse(content);
                this.occurrences = data.occurrences ?? [];
            }
        } catch {
            this.occurrences = [];
        }
        this.loaded = true;
    }

    async save(): Promise<void> {
        const data: OccurrenceIndexData = {
            version: 1,
            occurrences: this.occurrences,
        };
        const json = JSON.stringify(data, null, 2);
        const file = this.app.vault.getAbstractFileByPath(this.indexPath);
        if (file instanceof TFile) {
            await this.app.vault.modify(file, json);
        } else {
            await this.app.vault.create(this.indexPath, json);
        }
    }

    // ── Add / remove ──────────────────────────────────────────────────────────

    addOccurrences(occs: GrammarBitOccurrence[]): void {
        for (const occ of occs) {
            // Avoid duplicates by id
            if (!this.occurrences.find(o => o.id === occ.id)) {
                this.occurrences.push(occ);
            }
        }
    }

    removeByChunkId(chunkId: string): void {
        this.occurrences = this.occurrences.filter(o => o.chunkId !== chunkId);
    }

    removeBySourceFile(sourceFile: string): void {
        this.occurrences = this.occurrences.filter(o => o.sourceFile !== sourceFile);
    }

    clearScraped(): void {
        this.occurrences = this.occurrences.filter(o => !o.scraped);
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    getAll(includeScraped = true): GrammarBitOccurrence[] {
        if (includeScraped) return [...this.occurrences];
        return this.occurrences.filter(o => !o.scraped);
    }

    /** All occurrences for a stem family */
    byStemFamily(stem: string, includeScraped = true): GrammarBitOccurrence[] {
        return this.getAll(includeScraped).filter(o => o.stemFamily === stem);
    }

    /** All occurrences for a specific variation surface */
    byVariation(surface: string, includeScraped = true): GrammarBitOccurrence[] {
        return this.getAll(includeScraped).filter(o => o.variation === surface);
    }

    /** KWIC query: find occurrences whose chunkText contains the query */
    kwic(query: string, includeScraped = true): GrammarBitOccurrence[] {
        const q = query.toLowerCase();
        return this.getAll(includeScraped).filter(o =>
            o.chunkText.toLowerCase().includes(q) ||
            o.sentenceContext.toLowerCase().includes(q) ||
            o.variation.includes(query) ||
            o.stemFamily.includes(query)
        );
    }

    /** All occurrences that co-occur with a given stem family */
    coOccurringWith(stem: string, includeScraped = true): GrammarBitOccurrence[] {
        return this.getAll(includeScraped).filter(o => o.coOccurringBits.includes(stem));
    }

    /** All occurrences from a specific source file */
    bySourceFile(file: string, includeScraped = true): GrammarBitOccurrence[] {
        return this.getAll(includeScraped).filter(o => o.sourceFile === file);
    }

    /** Variation frequency distribution for a stem family */
    variationDistribution(stem: string, includeScraped = true): Map<string, number> {
        const dist = new Map<string, number>();
        for (const occ of this.byStemFamily(stem, includeScraped)) {
            dist.set(occ.variation, (dist.get(occ.variation) ?? 0) + 1);
        }
        return dist;
    }

    /** All stem families present in the index */
    allStemFamilies(includeScraped = true): string[] {
        const s = new Set<string>();
        for (const o of this.getAll(includeScraped)) s.add(o.stemFamily);
        return Array.from(s).sort();
    }

    /** All variations present for a stem family */
    allVariationsForStem(stem: string, includeScraped = true): string[] {
        const s = new Set<string>();
        for (const o of this.byStemFamily(stem, includeScraped)) s.add(o.variation);
        return Array.from(s);
    }

    get size(): number {
        return this.occurrences.length;
    }
}
