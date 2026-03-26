/**
 * Constants for the JP Sentence Surfer plugin.
 *
 * These lists define which tokens emitted by TinySegmenter act as
 * bunsetsu (文節) boundary tokens — i.e., the current chunk closes
 * AFTER this token is appended.
 *
 * Design rationale:
 * Only "strong" particles that reliably mark the END of a phrase are
 * unconditional boundaries.  Particles like は/が/に/の that frequently
 * appear embedded inside complex noun phrases are handled with
 * context-sensitive rules in the grouper.
 */

/**
 * Particles that ALWAYS close a bunsetsu chunk when they appear
 * as a complete token, except when the very next token is 。 (in
 * which case the 。 is absorbed into the same chunk).
 */
export const ALWAYS_CLOSE_PARTICLES = new Set([
	// Direct-object / instrumental / direction
	"を", "で", "へ",
	// Range markers
	"から", "まで", "より",
	// Topic-shift / quote
	"って",
	// Conjunctives
	"けど", "けれど", "けれども", "ので", "のに", "ながら", "たり",
	"ば", "なら", "し",
	// Listing / coordination
	"と", "や", "か",
	// Sentence-final particles
	"ね", "よ", "わ",
]);

/**
 * Verb / auxiliary endings that ALWAYS close a chunk (same 。-absorption
 * rule applies).
 */
export const ALWAYS_CLOSE_VERB_ENDINGS = new Set([
	"た", "て", "たら", "ちゃう", "ちゃった",
]);

/**
 * `teiru`-form endings: close the chunk UNLESS the very next token is
 * `ん` (the nominaliser that continues the clause, e.g. 思ってるんですが).
 */
export const TEIRU_ENDINGS = new Set(["てる", "ている"]);

/**
 * Hard sentence-ending punctuation.  These ALWAYS end a chunk and
 * also absorb an immediately following closing quote if present.
 */
export const SENTENCE_END_PUNCTUATION = new Set([
	"。", "！", "？", "!", "?",
]);

/**
 * Tokens that precede は/も to form compound particles (には, では…).
 * When the grouper sees は/も and the last accumulated token is one
 * of these, it closes the chunk AFTER the は/も.
 */
export const COMPOUND_PARTICLE_PRECEDERS = new Set([
	"に", "で", "と", "から", "まで", "の", "へ", "より",
]);

/**
 * Compound particles that must NOT be split mid-token-sequence.
 * The grouper checks whether the accumulated chunk so far is a prefix
 * of one of these and suppresses the boundary if so.
 */
export const COMPOUND_PARTICLES: readonly string[] = [
	"について", "に対して", "において", "によって", "として",
	"にとって", "によると", "に関して", "に関する",
];

/**
 * Annotation patterns to strip from YTranscript text before parsing.
 * Matches bracketed annotations like [笑い] [音楽] [拍手] [歓声] etc.
 */
export const ANNOTATION_PATTERN = /\[[^\]]*\]/g;

/**
 * YTranscript timestamp pattern.
 * Matches `[MM:SS](url)` or `[H:MM:SS](url)` prefixes.
 */
export const TIMESTAMP_PATTERN = /\[\d+:\d{2}(?::\d{2})?\]\([^)]*\)\s*/g;
