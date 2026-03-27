/**
 * Collocation Chunker
 *
 * Generates multi-granularity collocation chunks from a Japanese sentence by
 * layering on top of the existing TinySegmenter / bunsetsu grouper.
 *
 * Strategy:
 *  1. Parse the sentence into bunsetsu chunks (base layer).
 *  2. Detect noun-phrase chains (N+の+N, arbitrary depth).
 *  3. Detect verb-phrase collocations (N+を/に/で+V, etc.).
 *  4. Detect relative clauses (連体修飾節).
 *  5. Detect te-form chains and adverbial forms.
 *  6. Detect conditional/quotative patterns.
 *  7. Detect compound expressions (fixed multi-morpheme phrases).
 *  8. Build sliding-window n-gram chunks (2-gram, 3-gram) for sub-phrases.
 *  9. De-duplicate and sort by text start offset.
 */

import { BunsetsuChunk, CollocationChunk, CollocationChunkType, CollocationChunkDepth } from './types';
import { parseBunsetsu } from './jp-sentence-parser';
import {
    NO_PARTICLE,
    VP_PARTICLES,
    CONDITIONAL_TOKENS,
    QUOTATIVE_TOKENS,
    TE_FORM_ENDINGS,
    COMPOUND_EXPRESSIONS,
    RENTAI_ENDINGS,
} from './constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChunk(
    text: string,
    start: number,
    end: number,
    type: CollocationChunkType,
    pattern: string,
    opts: Partial<CollocationChunk> = {}
): CollocationChunk {
    return { text, start, end, type, pattern, ...opts };
}

/** Deduplicate chunks by (start, end, type). */
function dedup(chunks: CollocationChunk[]): CollocationChunk[] {
    const seen = new Set<string>();
    return chunks.filter(c => {
        const key = `${c.start}:${c.end}:${c.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Check whether a token is a の particle (and not の+だ etc.).
 */
function isNoParticle(token: string): boolean {
    return token === NO_PARTICLE;
}

/**
 * Check whether a chunk is likely a noun or noun phrase
 * (doesn't end with known verb/particle endings).
 */
function looksLikeNoun(text: string): boolean {
    // Heuristic: doesn't end with a hiragana verb/particle unless it's の
    const verbParticleEndings = /[うくすつぬふむゆるをにでてへがからまで]$/;
    if (verbParticleEndings.test(text)) return false;
    return true;
}

/**
 * Check whether a token is a VP-linking particle.
 */
function isVpParticle(token: string): boolean {
    return VP_PARTICLES.has(token);
}

// ─── Noun-phrase chain detection ─────────────────────────────────────────────

/**
 * Detect N+の+N (and longer) chains.
 * Returns chunks for each sub-chain found within `chunks`.
 */
function detectNounPhraseChains(
    chunks: BunsetsuChunk[],
    originalText: string
): CollocationChunk[] {
    const result: CollocationChunk[] = [];

    // Walk through chunks looking for sequences: <noun> <の> <noun> ...
    // We treat each bunsetsu chunk as a candidate "noun" unit.
    // The の particle is either its own chunk or embedded at the start of a chunk.

    for (let i = 0; i < chunks.length; i++) {
        // Start a potential N+の+N chain from index i
        let chainParts: BunsetsuChunk[] = [chunks[i]];
        let j = i + 1;

        while (j < chunks.length) {
            const cur = chunks[j];
            // Check if this chunk starts with の or is the の particle itself
            const startsWithNo = cur.text.startsWith(NO_PARTICLE);
            const isJustNo = cur.text === NO_PARTICLE;

            if (isJustNo && j + 1 < chunks.length) {
                // の is its own chunk — include it and the following chunk
                chainParts.push(cur);
                chainParts.push(chunks[j + 1]);
                j += 2;
            } else if (startsWithNo) {
                // の is embedded at the start of the next chunk (e.g. "の話")
                chainParts.push(cur);
                j++;
            } else {
                break;
            }
        }

        if (chainParts.length >= 3) {
            // We have at least N+の+N
            const start = chainParts[0].start;
            const end = chainParts[chainParts.length - 1].end;
            const text = originalText.slice(start, end);
            const depth = Math.floor(chainParts.length / 2); // number of の links
            const patternParts: string[] = [];
            for (let k = 0; k < chainParts.length; k++) {
                patternParts.push(k % 2 === 0 ? 'N' : 'の');
            }
            const pattern = patternParts.join('+');

            // Emit the full chain
            result.push(makeChunk(text, start, end, 'noun_phrase', pattern, {
                grammarNotes: `Noun phrase chain (depth ${depth}): ${pattern}`,
            }));

            // Also emit all sub-chains (for shallow/medium depth)
            if (chainParts.length > 3) {
                for (let len = 3; len < chainParts.length; len += 2) {
                    for (let s = 0; s + len <= chainParts.length; s += 2) {
                        const sub = chainParts.slice(s, s + len);
                        const subStart = sub[0].start;
                        const subEnd = sub[sub.length - 1].end;
                        if (subStart === start && subEnd === end) continue; // same as full
                        const subText = originalText.slice(subStart, subEnd);
                        const subPattern = sub.map((_, k) => k % 2 === 0 ? 'N' : 'の').join('+');
                        result.push(makeChunk(subText, subStart, subEnd, 'noun_phrase', subPattern, {
                            grammarNotes: `Noun phrase sub-chain: ${subPattern}`,
                        }));
                    }
                }
            }
        }
    }

    return result;
}

// ─── Verb-phrase collocation detection ───────────────────────────────────────

/**
 * Detect N+を+V, N+に+V, N+で+V etc. patterns.
 */
function detectVerbPhraseCollocations(
    chunks: BunsetsuChunk[],
    originalText: string
): CollocationChunk[] {
    const result: CollocationChunk[] = [];

    for (let i = 0; i + 1 < chunks.length; i++) {
        const noun = chunks[i];
        const vp = chunks[i + 1];

        // The VP chunk might start with a VP particle
        for (const particle of VP_PARTICLES) {
            if (vp.text.startsWith(particle)) {
                const start = noun.start;
                const end = vp.end;
                const text = originalText.slice(start, end);
                const pattern = `N+${particle}+V`;

                // Check if there's a following verb chunk
                let actualEnd = end;
                let fullPattern = pattern;
                if (i + 2 < chunks.length) {
                    // Include verb chunk if the VP chunk only has the particle
                    const maybeVerb = chunks[i + 2];
                    actualEnd = maybeVerb.end;
                    const fullText = originalText.slice(start, actualEnd);
                    fullPattern = `N+${particle}+V`;
                    result.push(makeChunk(fullText, start, actualEnd, 'verb_phrase', fullPattern, {
                        grammarNotes: `Verb phrase: noun + ${particle} + verb`,
                    }));
                } else {
                    result.push(makeChunk(text, start, end, 'verb_phrase', pattern, {
                        grammarNotes: `Verb phrase: noun + ${particle} + verb`,
                    }));
                }
                break;
            }
        }
    }

    return result;
}

// ─── Relative clause detection ────────────────────────────────────────────────

/**
 * Detect relative clause patterns: [verb/adj in 連体形]+noun.
 * Heuristic: a bunsetsu chunk ending in a 連体形 followed by a noun chunk.
 */
function detectRelativeClauses(
    chunks: BunsetsuChunk[],
    originalText: string
): CollocationChunk[] {
    const result: CollocationChunk[] = [];

    for (let i = 0; i + 1 < chunks.length; i++) {
        const mod = chunks[i];
        const head = chunks[i + 1];

        // Heuristic: modifier ends with a rentai form ending
        const endsWithRentai = Array.from(RENTAI_ENDINGS).some(e => mod.text.endsWith(e));
        // Head should look like a noun
        const headIsNoun = looksLikeNoun(head.text) || head.text.endsWith('の') || head.text.endsWith('こと') || head.text.endsWith('もの');

        if (endsWithRentai && headIsNoun) {
            const start = mod.start;
            const end = head.end;
            const text = originalText.slice(start, end);
            result.push(makeChunk(text, start, end, 'relative_clause', 'Vる+N', {
                grammarNotes: '連体修飾節 (relative clause modifying a noun)',
            }));
        }
    }

    return result;
}

// ─── て-form chain detection ──────────────────────────────────────────────────

/**
 * Detect て-form chains: sequences where chunks end in て/で.
 */
function detectTeFormChains(
    chunks: BunsetsuChunk[],
    originalText: string
): CollocationChunk[] {
    const result: CollocationChunk[] = [];
    let chainStart: number | null = null;
    let chainStartIdx = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const endsWithTe = Array.from(TE_FORM_ENDINGS).some(e => chunk.text.endsWith(e));

        if (chainStart === null && endsWithTe) {
            chainStart = chunk.start;
            chainStartIdx = i;
        } else if (chainStart !== null && !endsWithTe) {
            // Chain ends here — include the current non-て chunk as the final element
            if (i - chainStartIdx >= 1) {
                const end = chunk.end;
                const text = originalText.slice(chainStart, end);
                result.push(makeChunk(text, chainStart, end, 'te_chain', 'V+て+V', {
                    grammarNotes: 'て-form chain (sequential/conjunctive connection)',
                }));
            }
            chainStart = null;
        }
    }

    return result;
}

// ─── Conditional/quotative detection ─────────────────────────────────────────

/**
 * Detect conditional/quotative patterns: chunks ending with と/たら/ば/って etc.
 */
function detectConditionalQuotative(
    chunks: BunsetsuChunk[],
    originalText: string
): CollocationChunk[] {
    const result: CollocationChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const text = chunk.text;

        // Quotative patterns
        for (const q of QUOTATIVE_TOKENS) {
            if (text.includes(q) || text.endsWith(q)) {
                // Include up to 2 preceding chunks for context
                const contextStart = i >= 2 ? chunks[i - 2].start : chunks[Math.max(0, i - 1)].start;
                const fullText = originalText.slice(contextStart, chunk.end);
                result.push(makeChunk(fullText, contextStart, chunk.end, 'quotative', `[clause]+${q}`, {
                    grammarNotes: `Quotative expression ending in ${q}`,
                }));
                break;
            }
        }

        // Conditional patterns
        for (const c of CONDITIONAL_TOKENS) {
            if (text.endsWith(c) && !QUOTATIVE_TOKENS.has(text)) {
                const contextStart = i >= 1 ? chunks[i - 1].start : chunk.start;
                const fullText = originalText.slice(contextStart, chunk.end);
                result.push(makeChunk(fullText, contextStart, chunk.end, 'conditional', `[clause]+${c}`, {
                    grammarNotes: `Conditional/conjunctive form ending in ${c}`,
                }));
                break;
            }
        }
    }

    return result;
}

// ─── Compound expression detection ───────────────────────────────────────────

/**
 * Detect known compound expressions in the original text.
 */
function detectCompoundExpressions(
    originalText: string
): CollocationChunk[] {
    const result: CollocationChunk[] = [];

    for (const expr of COMPOUND_EXPRESSIONS) {
        let idx = originalText.indexOf(expr);
        while (idx !== -1) {
            result.push(makeChunk(
                expr,
                idx,
                idx + expr.length,
                'compound_expression',
                'fixed_expression',
                { grammarNotes: `Fixed compound expression: ${expr}` }
            ));
            idx = originalText.indexOf(expr, idx + 1);
        }
    }

    return result;
}

// ─── Sliding-window n-gram chunks ────────────────────────────────────────────

/**
 * Build 2-gram and 3-gram (optionally 4-gram) chunks from bunsetsu groups.
 * This catches sub-phrases not covered by the grammar-aware rules.
 */
function buildNgramChunks(
    chunks: BunsetsuChunk[],
    originalText: string,
    depth: CollocationChunkDepth
): CollocationChunk[] {
    const result: CollocationChunk[] = [];
    const maxN = depth === 'shallow' ? 2 : depth === 'medium' ? 3 : 4;

    for (let n = 2; n <= maxN; n++) {
        for (let i = 0; i + n <= chunks.length; i++) {
            const start = chunks[i].start;
            const end = chunks[i + n - 1].end;
            const text = originalText.slice(start, end);

            // Skip single-morpheme or whitespace-only chunks
            if (text.trim().length < 2) continue;

            result.push(makeChunk(text, start, end, 'core_collocation', `${n}-gram`, {
                grammarNotes: `${n}-gram sub-phrase`,
            }));
        }
    }

    return result;
}

// ─── Peripheral decomposition ─────────────────────────────────────────────────

/**
 * For a selected chunk, decompose it into collocation iterations:
 * - Core NP (innermost noun phrase chain)
 * - Extended NP
 * - Full phrase with peripheral (parenthetical) functional parts
 *
 * Returns an array of CollocationChunk representing the iterations,
 * from innermost core to full phrase.
 */
export function decomposeIntoIterations(
    selectedText: string,
    sourceStart: number
): CollocationChunk[] {
    const iterations: CollocationChunk[] = [];
    const chunks = parseBunsetsu(selectedText);

    // Detect all NP chains in the selection
    const nps = detectNounPhraseChains(chunks, selectedText);
    if (nps.length > 0) {
        // Sort by length (shortest first = innermost core)
        nps.sort((a, b) => (a.end - a.start) - (b.end - b.start));

        for (const np of nps) {
            iterations.push({
                ...np,
                start: sourceStart + np.start,
                end: sourceStart + np.end,
            });
        }

        // The full phrase with peripheral parts
        if (nps.length > 0) {
            const coreEnd = nps[nps.length - 1].end;
            if (coreEnd < selectedText.length) {
                const peripheral = selectedText.slice(coreEnd);
                const fullChunk = nps[nps.length - 1];
                iterations.push({
                    text: selectedText,
                    start: sourceStart,
                    end: sourceStart + selectedText.length,
                    type: 'noun_phrase',
                    pattern: fullChunk.pattern + '+peripheral',
                    coreRange: {
                        start: sourceStart + nps[nps.length - 1].start,
                        end: sourceStart + coreEnd,
                    },
                    peripheralText: `(${peripheral})`,
                    grammarNotes: `Full phrase with peripheral: core=${nps[nps.length - 1].text}, peripheral=(${peripheral})`,
                });
            }
        }
    } else {
        // No NP chains — emit the full selection as a core collocation
        iterations.push(makeChunk(selectedText, sourceStart, sourceStart + selectedText.length, 'core_collocation', 'phrase', {
            grammarNotes: 'Selected phrase (no NP chain detected)',
        }));
    }

    return iterations;
}

// ─── Main chunking entry point ────────────────────────────────────────────────

/**
 * Extract all collocation chunks from a line of Japanese text.
 *
 * @param text   The source text (a single line / sentence).
 * @param depth  How many levels of sub-phrases to generate.
 * @returns      Deduplicated, sorted array of CollocationChunk.
 */
export function extractCollocationChunks(
    text: string,
    depth: CollocationChunkDepth = 'medium'
): CollocationChunk[] {
    // Strip timestamps for analysis
    const clean = text.replace(/\[\d+:\d+(?::\d+)?\]\(https?:\/\/[^)]+\)\s*/g, '').trim();
    if (!clean) return [];

    const bunsetsuChunks = parseBunsetsu(clean);
    if (bunsetsuChunks.length === 0) return [];

    const all: CollocationChunk[] = [];

    // Grammar-aware passes
    all.push(...detectNounPhraseChains(bunsetsuChunks, clean));
    all.push(...detectVerbPhraseCollocations(bunsetsuChunks, clean));
    all.push(...detectRelativeClauses(bunsetsuChunks, clean));
    all.push(...detectTeFormChains(bunsetsuChunks, clean));
    all.push(...detectConditionalQuotative(bunsetsuChunks, clean));
    all.push(...detectCompoundExpressions(clean));

    // Sliding-window n-grams (fill in gaps)
    if (depth !== 'shallow') {
        all.push(...buildNgramChunks(bunsetsuChunks, clean, depth));
    }

    // Filter out chunks that are too short or purely whitespace
    const filtered = all.filter(c => c.text.trim().length >= 2);

    // Deduplicate and sort by start offset
    return dedup(filtered).sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
}

/**
 * Group chunks by their grammatical type for display in the Collocation View.
 */
export function groupChunksByType(chunks: CollocationChunk[]): Map<CollocationChunkType, CollocationChunk[]> {
    const map = new Map<CollocationChunkType, CollocationChunk[]>();
    for (const chunk of chunks) {
        if (!map.has(chunk.type)) map.set(chunk.type, []);
        map.get(chunk.type)!.push(chunk);
    }
    return map;
}

/**
 * Human-readable label for each CollocationChunkType.
 */
export function chunkTypeLabel(type: CollocationChunkType): string {
    switch (type) {
        case 'noun_phrase':         return '名詞句 Noun Phrase';
        case 'verb_phrase':         return '動詞句 Verb Phrase';
        case 'relative_clause':     return '連体修飾節 Relative Clause';
        case 'adverbial':           return '副詞的表現 Adverbial';
        case 'conditional':         return '条件節 Conditional';
        case 'quotative':           return '引用表現 Quotative';
        case 'compound_expression': return '複合表現 Compound Expression';
        case 'te_chain':            return 'て形連鎖 て-chain';
        case 'core_collocation':    return 'コア表現 Core Collocation';
        default:                    return type;
    }
}
