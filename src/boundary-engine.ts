/**
 * BoundaryEngine — multi-mode navigation layer.
 *
 * Extends beyond the 8-tier bunsetsu grouper to support 7 overlapping
 * boundary definitions that users can surf between. Parses text once,
 * caches the result, and invalidates on edit.
 *
 * SurfMode definitions:
 *   Bunsetsu    — existing 8-tier system (via groupBunsetsu)
 *   Sentence    — full sentences ending in 。！？
 *   Clause      — clause-level breaks at て/から/けど/ので/たら
 *   Particle    — jump to each particle in sequence
 *   ContentWord — skip particles, jump to content words only
 *   Collocation — spans identified by the jp-collocations plugin
 *   Bold        — **bold** spans
 */

import { BunsetsuChunk, SurfMode } from './types';
import { parseBunsetsu, findChunkAt, findNextChunk, findPrevChunk } from './jp-sentence-parser';
import { BOLD_REGEX } from './constants';

// ─── Clause boundary markers ─────────────────────────────────────────────────

const CLAUSE_ENDINGS = [
    'から', 'けど', 'けれども', 'ので', 'のに', 'ながら', 'たら', 'なら', 'ば',
    'て', 'で', 'し', 'が', 'ところで', 'ものの',
];

// ─── Particle set (for Particle mode) ────────────────────────────────────────

const PARTICLE_TOKENS = new Set([
    'は', 'が', 'を', 'に', 'で', 'と', 'も', 'か', 'や', 'の',
    'から', 'まで', 'より', 'へ', 'て', 'って', 'けど', 'けれど',
    'けれども', 'ので', 'のに', 'ながら', 'たら', 'なら', 'ば',
    'について', 'に対して', 'において', 'によって', 'として', 'にとって',
]);

// ─── Content word POS-like heuristics ────────────────────────────────────────

/** Hiragana-only tokens are almost always function words / particles. */
function isHiraganaOnly(token: string): boolean {
    return /^[\u3041-\u3096ー]+$/.test(token);
}

/** Return true if token is a content word (has at least one kanji or katakana). */
function isContentWord(token: string): boolean {
    return /[\u4E00-\u9FFF\u30A0-\u30FF\uFF65-\uFF9F]/.test(token);
}

// ─── Sentence-level splitting ─────────────────────────────────────────────────

const SENTENCE_END_RE = /[。！？!?]/;

/**
 * Split text into full-sentence chunks (ending at 。！？).
 */
function parseSentenceChunks(text: string): BunsetsuChunk[] {
    const chunks: BunsetsuChunk[] = [];
    let start = 0;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (SENTENCE_END_RE.test(ch)) {
            // Absorb trailing closing brackets
            let end = i + 1;
            while (end < text.length && /[」』）)】]/.test(text[end])) end++;
            // Skip trailing whitespace/newline in the chunk text
            const chunkText = text.slice(start, end);
            if (chunkText.trim().length > 0) {
                chunks.push({ text: chunkText, start, end });
            }
            start = end;
            i = end;
        } else if (ch === '\n') {
            if (i > start && text.slice(start, i).trim().length > 0) {
                chunks.push({ text: text.slice(start, i), start, end: i });
            }
            start = i + 1;
            i++;
        } else {
            i++;
        }
    }
    if (start < text.length && text.slice(start).trim().length > 0) {
        chunks.push({ text: text.slice(start), start, end: text.length });
    }
    return chunks;
}

/**
 * Parse clause-level chunks by splitting at clause-ending particles/conjunctions.
 * Uses a simple forward scan on TinySegmenter output.
 */
function parseClauseChunks(text: string): BunsetsuChunk[] {
    // Re-use bunsetsu chunking but merge chunks that don't end on clause boundaries
    // Strategy: get bunsetsu chunks, then group consecutive ones until we hit
    // a clause-ending token.
    const bunsetsuChunks = parseBunsetsu(text);
    if (bunsetsuChunks.length === 0) return [];

    const clauseChunks: BunsetsuChunk[] = [];
    let groupStart = bunsetsuChunks[0].start;
    let groupText = '';

    for (const chunk of bunsetsuChunks) {
        groupText += chunk.text;

        // Check if this chunk ends with a clause boundary
        const endsWithClause = CLAUSE_ENDINGS.some(ending => chunk.text.endsWith(ending));
        // Also break on sentence-ending punctuation
        const endsWithSentence = SENTENCE_END_RE.test(chunk.text[chunk.text.length - 1] ?? '');

        if (endsWithClause || endsWithSentence) {
            clauseChunks.push({ text: groupText, start: groupStart, end: chunk.end });
            groupStart = chunk.end;
            groupText = '';
        }
    }

    // Flush remainder
    if (groupText.length > 0) {
        const lastChunk = bunsetsuChunks[bunsetsuChunks.length - 1];
        clauseChunks.push({ text: groupText, start: groupStart, end: lastChunk.end });
    }

    return clauseChunks;
}

/**
 * Parse particle-level chunks: each chunk consists of a run of content tokens
 * ending with a particle.
 */
function parseParticleChunks(text: string): BunsetsuChunk[] {
    const bunsetsuChunks = parseBunsetsu(text);
    // Flatten into particle-terminated groups: start a new chunk after each
    // bunsetsu chunk whose final token is a particle.
    // Since we don't re-tokenize, we use the existing bunsetsu chunks and check
    // whether their text ends with a known particle.
    const chunks: BunsetsuChunk[] = [];
    let groupStart: number | null = null;
    let groupText = '';

    for (const chunk of bunsetsuChunks) {
        if (groupStart === null) groupStart = chunk.start;
        groupText += chunk.text;

        const endsWithParticle = [...PARTICLE_TOKENS].some(p => chunk.text.endsWith(p));
        const endsWithSentence = SENTENCE_END_RE.test(chunk.text[chunk.text.length - 1] ?? '');

        if (endsWithParticle || endsWithSentence) {
            chunks.push({ text: groupText, start: groupStart, end: chunk.end });
            groupStart = null;
            groupText = '';
        }
    }

    if (groupText.length > 0 && groupStart !== null) {
        const last = bunsetsuChunks[bunsetsuChunks.length - 1];
        chunks.push({ text: groupText, start: groupStart, end: last.end });
    }

    return chunks.length > 0 ? chunks : bunsetsuChunks;
}

/**
 * Content-word chunks: skip function-word-only bunsetsu and return only those
 * that contain at least one kanji/katakana content word.
 */
function parseContentWordChunks(text: string): BunsetsuChunk[] {
    const bunsetsuChunks = parseBunsetsu(text);
    return bunsetsuChunks.filter(chunk => isContentWord(chunk.text));
}

/**
 * Bold chunks: extract **bold** spans as surfable units.
 */
function parseBoldChunks(text: string): BunsetsuChunk[] {
    const chunks: BunsetsuChunk[] = [];
    const re = new RegExp(BOLD_REGEX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        chunks.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return chunks;
}

/**
 * Collocation chunks: match against the jp-collocations plugin's store.
 * Falls back to bunsetsu if the plugin is not available.
 */
function parseCollocationChunks(text: string, collocPlugin: CollocationPlugin | null): BunsetsuChunk[] {
    try {
        if (collocPlugin && typeof collocPlugin.getCollocationSpans === 'function') {
            const spans = collocPlugin.getCollocationSpans(text);
            if (spans && spans.length > 0) {
                return spans.map(s => ({
                    text: text.slice(s.start, s.end),
                    start: s.start,
                    end: s.end,
                }));
            }
        }
    } catch {
        // Plugin call failed — fall through to bunsetsu
    }
    // Fallback: use bunsetsu
    return parseBunsetsu(text);
}

/**
 * Minimal interface for the jp-collocations plugin's public API surface.
 * The actual plugin may expose more methods; we only type what we use.
 */
interface CollocationPlugin {
    getCollocationSpans?: (text: string) => Array<{ start: number; end: number; phrase: string }>;
    searchTerm?: (term: string) => void;
}

/**
 * Minimal interface for the CodeMirror 6 EditorView API surface we use.
 * We avoid importing CM6 directly to stay dependency-free.
 */
interface CM6View {
    coordsAtPos(pos: number): { top: number; bottom: number; left: number; right: number } | null;
    scrollDOM: HTMLElement;
    dispatch(tr: object): void;
}


interface CacheEntry {
    text: string;
    chunks: Record<SurfMode, BunsetsuChunk[]>;
}

export class BoundaryEngine {
    private cache: CacheEntry | null = null;
    private collocPlugin: CollocationPlugin | null = null;

    /** Supply the jp-collocations plugin instance for Collocation mode. */
    setCollocationPlugin(plugin: CollocationPlugin): void {
        this.collocPlugin = plugin;
        // Invalidate cache so collocation spans are re-computed
        this.cache = null;
    }

    /** Invalidate the parse cache (call on document edits). */
    invalidate(): void {
        this.cache = null;
    }

    /**
     * Get chunks for the given mode and text.
     * Results are cached per-text so repeated calls within the same document
     * state are essentially free.
     */
    getChunks(text: string, mode: SurfMode): BunsetsuChunk[] {
        if (this.cache?.text !== text) {
            this.cache = this._buildCache(text);
        }
        return this.cache.chunks[mode];
    }

    /** Navigate: find the next chunk from the given cursor offset. */
    findNext(text: string, offset: number, mode: SurfMode): BunsetsuChunk | null {
        const chunks = this.getChunks(text, mode);
        return findNextChunk(chunks, offset);
    }

    /** Navigate: find the previous chunk from the given cursor offset. */
    findPrev(text: string, offset: number, mode: SurfMode): BunsetsuChunk | null {
        const chunks = this.getChunks(text, mode);
        return findPrevChunk(chunks, offset);
    }

    /** Navigate: find the chunk at the given cursor offset. */
    findAt(text: string, offset: number, mode: SurfMode): BunsetsuChunk | null {
        const chunks = this.getChunks(text, mode);
        return findChunkAt(chunks, offset);
    }

    /** Return the index of the chunk at the given offset, or -1. */
    indexAt(text: string, offset: number, mode: SurfMode): number {
        const chunks = this.getChunks(text, mode);
        for (let i = 0; i < chunks.length; i++) {
            if (offset >= chunks[i].start && offset < chunks[i].end) return i;
        }
        return -1;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private _buildCache(text: string): CacheEntry {
        const bunsetsu      = parseBunsetsu(text);
        const sentence      = parseSentenceChunks(text);
        const clause        = parseClauseChunks(text);
        const particle      = parseParticleChunks(text);
        const contentWord   = parseContentWordChunks(text);
        const collocation   = parseCollocationChunks(text, this.collocPlugin);
        const bold          = parseBoldChunks(text);

        // Ensure we always have a final fallback — if text is non-empty,
        // return it as a single chunk so navigation never silently fails.
        const wholeText: BunsetsuChunk[] = text.trim().length > 0
            ? [{ text, start: 0, end: text.length }]
            : [];

        const or = (primary: BunsetsuChunk[], ...fallbacks: BunsetsuChunk[][]): BunsetsuChunk[] => {
            for (const f of [primary, ...fallbacks]) {
                if (f.length > 0) return f;
            }
            return wholeText;
        };

        return {
            text,
            chunks: {
                [SurfMode.Bunsetsu]:    or(bunsetsu, sentence, wholeText),
                [SurfMode.Sentence]:    or(sentence, bunsetsu, wholeText),
                [SurfMode.Clause]:      or(clause, bunsetsu, wholeText),
                [SurfMode.Particle]:    or(particle, bunsetsu, wholeText),
                [SurfMode.ContentWord]: or(contentWord, bunsetsu, wholeText),
                [SurfMode.Collocation]: or(collocation, bunsetsu, wholeText),
                [SurfMode.Bold]:        or(bold, bunsetsu, wholeText),
            },
        };
    }
}
