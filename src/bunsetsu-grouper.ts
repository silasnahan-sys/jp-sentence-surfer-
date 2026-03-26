/**
 * Bunsetsu grouper — converts TinySegmenter morpheme tokens into
 * bunsetsu (文節) phrase chunks.
 *
 * A bunsetsu is a minimal Japanese phrase unit consisting of a content word
 * (noun, verb, adjective, adverb) followed by its associated function words
 * (particles, auxiliaries, verb endings).
 *
 * The grouper uses 8 boundary tiers in order of precedence:
 *
 * Tier 1  Hard stops    。！？!?   — always close; absorb trailing 」』））
 * Tier 2  Whitespace    space/newline — natural speech boundary (not included in chunk)
 * Tier 3  Always-close particles  を で から って けど けれども ので のに ながら
 *                                   compound particles (について etc.)
 *                                   — close unless next token is a hard stop
 * Tier 4  Always-close verb endings  た て たら ちゃった った
 *                                   — same deference-to-punctuation rule;
 *                                   bare 'て' defers to Tier 5 when followed by 'る'
 * Tier 5  てる / ている            — close UNLESS the next token is 'ん'
 * Tier 6  に                       — close only before whitespace, or before は/も
 * Tier 7  Compound は/も          — close when preceded by a particle preceder
 *                                   (に→には, で→では, と→とは …)
 * Tier 8  な after たい            — closes the たいな wishful form
 */

import { BunsetsuChunk } from './types';
import {
    HARD_STOP_TOKENS,
    ALWAYS_CLOSE_PARTICLES,
    ALWAYS_CLOSE_VERB_ENDINGS,
    TEIRU_TOKENS,
    COMPOUND_PARTICLES,
    PARTICLE_PRECEDERS,
    CLOSING_BRACKETS,
} from './constants';

/** Return true if the token is any kind of whitespace. */
function isWhitespace(token: string): boolean {
    return /^[\s　]+$/.test(token);
}

/** Return true if the token ends with a てる / ている pattern. */
function isTeiruToken(token: string): boolean {
    if (TEIRU_TOKENS.has(token)) return true;
    if (token.endsWith('てる') || token.endsWith('ている')) return true;
    if (token.endsWith('ってる') || token.endsWith('っている')) return true;
    return false;
}

/** Hiragana prefixes that follow に to form compound particles (について etc.). */
const NI_COMPOUND_CONTINUATIONS = ['つい', 'たい', 'おい', 'よっ', 'とっ', 'よる'];

/**
 * Group a flat array of morpheme tokens into bunsetsu chunks.
 *
 * @param tokens — output of TinySegmenter.segment()
 * @returns array of BunsetsuChunk with `text`, `start`, `end` (char offsets
 *          into the original text that was passed to the segmenter)
 */
export function groupBunsetsu(tokens: string[]): BunsetsuChunk[] {
    const chunks: BunsetsuChunk[] = [];

    let chunkText = '';
    let chunkStart = 0;
    let pos = 0;          // running char position in the original text
    let prevToken = '';   // last non-whitespace token added to current chunk

    const flush = (end: number) => {
        if (chunkText.length > 0) {
            chunks.push({ text: chunkText, start: chunkStart, end });
            chunkText = '';
        }
        chunkStart = end;
        prevToken = '';
    };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const tokenStart = pos;
        pos += token.length;

        // ── Tier 2: Whitespace ────────────────────────────────────────────────
        if (isWhitespace(token)) {
            flush(tokenStart);       // close current chunk (whitespace not included)
            chunkStart = pos;        // next chunk starts after the whitespace
            continue;
        }

        // Peek ahead (skip whitespace for boundary-check purposes)
        let nextToken = '';
        for (let j = i + 1; j < tokens.length; j++) {
            if (!isWhitespace(tokens[j])) {
                nextToken = tokens[j];
                break;
            }
        }

        // ── Tier 1: Hard stops ────────────────────────────────────────────────
        if (HARD_STOP_TOKENS.has(token)) {
            if (chunkText === '') chunkStart = tokenStart;
            chunkText += token;
            prevToken = token;
            // Absorb any immediately-following closing brackets
            while (i + 1 < tokens.length && CLOSING_BRACKETS.has(tokens[i + 1])) {
                i++;
                pos += tokens[i].length;
                chunkText += tokens[i];
            }
            flush(pos);
            continue;
        }

        // ── Closing bracket: absorb into current chunk if present ─────────────
        if (CLOSING_BRACKETS.has(token)) {
            if (chunkText === '') chunkStart = tokenStart;
            chunkText += token;
            flush(pos);
            continue;
        }

        // ── Add token to current chunk ────────────────────────────────────────
        if (chunkText === '') chunkStart = tokenStart;
        chunkText += token;

        // ── Tier 5 (checked before Tier 4): てる / ている ─────────────────────
        if (isTeiruToken(token)) {
            if (nextToken !== 'ん') {
                flush(pos);
            }
            // If next is ん, continue (nominaliser chain)
            prevToken = token;
            continue;
        }

        // ── Tier 4: bare て (only if NOT followed by る, handled above) ────────
        if (token === 'て' && nextToken === 'る') {
            // Will be captured by Tier 5 on the next iteration when 'る' arrives
            // via isTeiruToken('てる') check — but we have single tokens here.
            // Handle the two-token て+る sequence:
            // Consume 'る' now so we can apply Tier 5 logic here.
            i++;
            pos += tokens[i].length;
            chunkText += tokens[i]; // append 'る'

            // Re-peek next after 'る'
            let nextAfterRu = '';
            for (let j = i + 1; j < tokens.length; j++) {
                if (!isWhitespace(tokens[j])) {
                    nextAfterRu = tokens[j];
                    break;
                }
            }
            if (nextAfterRu !== 'ん') {
                flush(pos);
            }
            prevToken = 'る';
            continue;
        }

        // ── Tier 3: Compound particles (について etc.) ─────────────────────────
        if (COMPOUND_PARTICLES.has(token)) {
            if (!HARD_STOP_TOKENS.has(nextToken)) {
                flush(pos);
            }
            prevToken = token;
            continue;
        }

        // ── Tier 3: Always-close particles ───────────────────────────────────
        if (ALWAYS_CLOSE_PARTICLES.has(token)) {
            // Defer if the very next non-whitespace token is a hard stop
            if (!HARD_STOP_TOKENS.has(nextToken)) {
                flush(pos);
            }
            prevToken = token;
            continue;
        }

        // ── Tier 4: Always-close verb endings ────────────────────────────────
        if (ALWAYS_CLOSE_VERB_ENDINGS.has(token)) {
            if (!HARD_STOP_TOKENS.has(nextToken)) {
                flush(pos);
            }
            prevToken = token;
            continue;
        }

        // ── Tier 6: に ────────────────────────────────────────────────────────
        if (token === 'に') {
            // Close before whitespace (nextToken already skips whitespace, so
            // check whether the token immediately after 'に' is whitespace).
            const immediateNext = tokens[i + 1] ?? '';
            const beforeWhitespace = isWhitespace(immediateNext) || immediateNext === '';
            // Close before は or も (compound に+は / に+も)
            const formsCompound = nextToken === 'は' || nextToken === 'も';
            // Do NOT close before compound particle continuations
            const compoundStart = NI_COMPOUND_CONTINUATIONS;
            const isCompoundParticle = compoundStart.some(s => nextToken.startsWith(s));

            if (!isCompoundParticle && (beforeWhitespace || formsCompound)) {
                if (formsCompound) {
                    // Absorb は/も into this chunk as the compound marker
                    i++;
                    pos += tokens[i].length;
                    chunkText += tokens[i];
                }
                flush(pos);
            }
            prevToken = token;
            continue;
        }

        // ── Tier 7: Compound は/も ────────────────────────────────────────────
        if ((token === 'は' || token === 'も') && PARTICLE_PRECEDERS.has(prevToken)) {
            flush(pos);
            prevToken = token;
            continue;
        }

        // ── Tier 8: な after たい ─────────────────────────────────────────────
        if (token === 'な' && prevToken === 'たい') {
            flush(pos);
            prevToken = token;
            continue;
        }

        prevToken = token;
    }

    // Flush any remaining chunk
    if (chunkText.length > 0) {
        chunks.push({ text: chunkText, start: chunkStart, end: pos });
    }

    return chunks;
}
