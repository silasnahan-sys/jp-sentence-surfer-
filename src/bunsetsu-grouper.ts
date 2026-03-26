/**
 * Bunsetsu Grouper — groups TinySegmenter morpheme tokens into
 * bunsetsu (文節) phrase chunks.
 *
 * Algorithm overview
 * ──────────────────
 * Tokens are iterated in order.  Each token is appended to the
 * current chunk, then we decide whether to CLOSE the chunk:
 *
 * 1. HARD STOP  — sentence-ending punctuation (。！？!?) always
 *    closes.  A closing quote (」』）) that follows immediately is
 *    absorbed into the same chunk before closing.
 *
 * 2. WHITESPACE TOKEN — a token that is entirely whitespace signals
 *    a line-level boundary (from timestamp stripping).  Close the
 *    current chunk; the whitespace chunk itself is discarded.
 *
 * 3. ALWAYS-CLOSE TOKENS — certain particles and verb endings almost
 *    always mark a phrase boundary.  They close the chunk UNLESS the
 *    very next token is 。 (in which case we let 。 be the final
 *    closer, producing e.g. "わけだから。" as one chunk).
 *
 * 4. TEIRU ENDINGS (てる/ている) — close unless the next token is ん
 *    (the nominaliser that continues the clause, as in 思ってるんですが).
 *
 * 5. に (CONDITIONAL) — closes only when the next token is whitespace,
 *    は, or も (forming compounds like には/にも), or when the next
 *    token is 。.  Otherwise に is embedded in a longer phrase and
 *    should not break it.
 *
 * 6. COMPOUND CLOSER (は/も) — when the last accumulated token is a
 *    known particle preceder (に, で, と, から…), は/も closes the
 *    chunk as a compound particle (には, では, にも…).
 *
 * 7. SPECIAL: な after たい — forms the たいな ending.  Do NOT close
 *    at たい; DO close at the following な.
 *
 * 8. COMPOUND-PARTICLE PROTECTION — if the accumulated chunk so far
 *    is a prefix of a known compound (について…), suppress the boundary
 *    until the compound is complete.
 */

import { BunsetsuChunk } from "./types";
import {
	ALWAYS_CLOSE_PARTICLES,
	ALWAYS_CLOSE_VERB_ENDINGS,
	TEIRU_ENDINGS,
	SENTENCE_END_PUNCTUATION,
	COMPOUND_PARTICLE_PRECEDERS,
	COMPOUND_PARTICLES,
} from "./constants";

/** Tokens that are only closing-quote characters. */
const CLOSING_QUOTES = new Set(["」", "』", "）", ")", "】"]);

/** Returns true when token is exclusively whitespace. */
function isWhitespace(token: string): boolean {
	return token.trim() === "";
}

/**
 * Returns true when the accumulated chunk text so far is a strict
 * prefix of a known compound particle (we should not break mid-compound).
 */
function isInsideCompound(accumulated: string): boolean {
	for (const cp of COMPOUND_PARTICLES) {
		if (cp.startsWith(accumulated) && cp.length > accumulated.length) {
			return true;
		}
	}
	return false;
}

/**
 * Group an array of TinySegmenter tokens into bunsetsu chunks,
 * tracking character offsets back into `originalText`.
 */
export function groupIntoBunsetsu(
	tokens: string[],
	originalText: string
): BunsetsuChunk[] {
	const chunks: BunsetsuChunk[] = [];
	let currentTokens: string[] = [];
	let chunkStart = 0;
	let searchFrom = 0; // current search position in originalText

	/** Push a completed chunk (skip whitespace-only chunks). */
	const flush = (end: number): void => {
		const text = currentTokens.join("").trim();
		if (text) {
			chunks.push({ text, start: chunkStart, end });
		}
		currentTokens = [];
	};

	/** Advance searchFrom past `token` in originalText, returning the token's end offset. */
	const advance = (token: string): number => {
		const pos = originalText.indexOf(token, searchFrom);
		if (pos >= 0) {
			searchFrom = pos + token.length;
			return searchFrom;
		}
		// Fallback: advance by token length even if not found
		const fallback = searchFrom + token.length;
		searchFrom = fallback;
		return fallback;
	};

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const next = tokens[i + 1] ?? "";
		const nextNext = tokens[i + 2] ?? "";

		// Track position before consuming this token
		const tokenEnd = advance(token);

		// Record start offset for a new chunk
		if (currentTokens.length === 0) {
			chunkStart = tokenEnd - token.length;
		}

		// ── 2. Whitespace token ───────────────────────────────────────────
		if (isWhitespace(token)) {
			// Close whatever was accumulated (discard the whitespace itself)
			flush(tokenEnd - token.length);
			continue;
		}

		currentTokens.push(token);

		// ── Compound-particle protection ─────────────────────────────────
		const accumulated = currentTokens.join("");
		if (isInsideCompound(accumulated)) {
			// We are in the middle of e.g. "について" — never break here
			continue;
		}

		// ── 1. Hard stop ──────────────────────────────────────────────────
		if (SENTENCE_END_PUNCTUATION.has(token)) {
			// Absorb an immediately following closing quote
			if (CLOSING_QUOTES.has(next)) {
				advance(next);
				currentTokens.push(next);
				i++;
			}
			flush(searchFrom);
			continue;
		}

		// ── Closing quote (rare lone occurrence) ─────────────────────────
		// A 」 that didn't follow 。 stays in the chunk; we don't special-case it.

		// ── Helper: should we suppress the close because next token is 。? ──
		// When a boundary token would fire but the very next token is 。,
		// skip closing here and let 。 be the final closer (so the 。 is
		// absorbed into the same chunk, e.g. "わけだから。").
		const nextIsPunctuation = SENTENCE_END_PUNCTUATION.has(next);

		// ── 3. ALWAYS-CLOSE particles / verb endings ──────────────────────
		if (ALWAYS_CLOSE_PARTICLES.has(token) || ALWAYS_CLOSE_VERB_ENDINGS.has(token)) {
			if (!nextIsPunctuation) {
				flush(searchFrom);
			}
			// If next is 。, just continue — 。 will close on the next iteration
			continue;
		}

		// ── 4. TEIRU endings (てる / ている) ───────────────────────────────
		if (TEIRU_ENDINGS.has(token)) {
			// Suppress if next is ん (nominaliser keeps the clause going)
			if (next !== "ん" && !nextIsPunctuation) {
				flush(searchFrom);
			}
			continue;
		}

		// ── 7. SPECIAL: な after たい (forming たいな) ─────────────────────
		if (token === "な") {
			const prev = currentTokens[currentTokens.length - 2] ?? ""; // token before な
			if (prev === "たい") {
				if (!nextIsPunctuation) {
					flush(searchFrom);
				}
			}
			// Otherwise な is an adjective connector — leave in chunk
			continue;
		}

		// ── 5. に (CONDITIONAL) ───────────────────────────────────────────
		if (token === "に") {
			const nextIsWhitespace = isWhitespace(next);
			const nextIsCompoundParticle = next === "は" || next === "も";
			if ((nextIsWhitespace || nextIsPunctuation) && !nextIsCompoundParticle) {
				// に before whitespace / punctuation → natural boundary
				flush(searchFrom);
			} else if (nextIsCompoundParticle) {
				// Let は/も handle the close (rule 6)
			}
			// Otherwise に is embedded — continue
			continue;
		}

		// ── 6. COMPOUND CLOSER: は / も ───────────────────────────────────
		if (token === "は" || token === "も") {
			// The token BEFORE this one (already in currentTokens) is at index length-2
			const prevInChunk = currentTokens[currentTokens.length - 2] ?? "";
			if (COMPOUND_PARTICLE_PRECEDERS.has(prevInChunk)) {
				// e.g. に + は = には → close as compound
				if (!nextIsPunctuation) {
					flush(searchFrom);
				}
			}
			// Standalone は/も are kept in the chunk (topic / additive particles)
			continue;
		}
	}

	// Flush any remaining tokens
	if (currentTokens.length > 0) {
		flush(searchFrom);
	}

	return chunks;
}

