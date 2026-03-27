// Constants for JP Sentence Surfer

/**
 * Default JP sentence regex.
 * Matches text ending with JP/EN terminal punctuation, or text to end of line.
 * Does NOT split on conjunctive commas like が、けど、ので、
 */
export const JP_SENTENCE_REGEX =
    /[^。！？!?\n]*[。！？!?][」』）\)]*|[^。！？!?\n]+$/gm;

/**
 * Regex to detect bold text: **text**
 */
export const BOLD_REGEX = /\*\*(.+?)\*\*/g;

/**
 * Regex for a YTranscript timestamp prefix on a line.
 * Matches: [00:00:01](https://youtube.com/watch?v=xxx&t=1)
 */
export const YTRANSCRIPT_TIMESTAMP_REGEX =
    /^\[[\d:]+\]\(https?:\/\/[^)]+\)\s*/;

/**
 * Regex to strip any YTranscript timestamp inline (for cleaning selected text).
 */
export const YTRANSCRIPT_INLINE_REGEX =
    /\[[\d:]+\]\(https?:\/\/[^)]+\)\s*/g;

/**
 * Regex to strip YTranscript-style annotations like [笑い] [音楽] [拍手]
 */
export const YTRANSCRIPT_ANNOTATION_REGEX = /\[[^\]]+\]\s*/g;

/**
 * JP sentence-ending punctuation characters
 */
export const JP_TERMINAL_CHARS = '。！？!?';

/**
 * JP closing bracket characters that can trail after terminal punctuation
 */
export const JP_CLOSING_BRACKETS = '」』）)';

/**
 * Plugin ID for jp-collocations sister plugin
 */
export const JP_COLLOCATIONS_PLUGIN_ID = 'jp-collocations';

// ─── Bunsetsu boundary token sets ────────────────────────────────────────────

/**
 * Tier 1 – Hard-stop punctuation. Always closes the current chunk.
 * Absorb trailing closing brackets after emitting.
 */
export const HARD_STOP_TOKENS = new Set(['。', '！', '？', '!', '?']);

/**
 * Tier 3 – Always-close particles.
 * Close the current chunk unconditionally, EXCEPT defer to a following 。.
 */
export const ALWAYS_CLOSE_PARTICLES = new Set([
    'を', 'で', 'から', 'って', 'けど', 'けれども', 'ので', 'のに', 'ながら',
]);

/**
 * Always-close particles that contain compound forms (longest first, for segmenter).
 */
export const ALWAYS_CLOSE_PARTICLES_LIST = [
    'けれども', 'ながら', 'から', 'ので', 'のに', 'って', 'けど',
    'を', 'で',
];

/**
 * Tier 4 – Always-close verb endings.
 * Close unconditionally (with deference-to-punctuation).
 * Note: bare 'て' is Tier 4 BUT Tier 5 takes priority when followed by 'る'.
 */
export const ALWAYS_CLOSE_VERB_ENDINGS = new Set([
    'た', 'て', 'たら', 'ちゃった', 'った',
]);

/**
 * Tier 5 – てる / ている tokens.
 * Close UNLESS the following token is 'ん'.
 */
export const TEIRU_TOKENS = new Set(['てる', 'ている', 'ってる', 'っている']);

/**
 * Compound particles that should be kept as single tokens and treated as
 * always-close particles (like に+について).
 */
export const COMPOUND_PARTICLES = new Set([
    'について', 'に対して', 'において', 'によって', 'として', 'にとって',
]);

/**
 * Tokens after which 'は' or 'も' form a compound boundary (Tier 7).
 * E.g. に→には, で→では.
 */
export const PARTICLE_PRECEDERS = new Set(['に', 'で', 'と', 'から', 'まで']);

/**
 * Closing bracket characters that may immediately follow a hard stop.
 */
export const CLOSING_BRACKETS = new Set(['」', '』', '）', ')']);


// ─── Collocation chunker constants ───────────────────────────────────────────

/**
 * Hiragana possessive particle の — the primary noun-phrase linker.
 */
export const NO_PARTICLE = 'の';

/**
 * Particles that introduce verb-phrase collocations (N+P+V patterns).
 */
export const VP_PARTICLES = new Set(['を', 'に', 'で', 'が', 'と', 'へ', 'から', 'まで']);

/**
 * Tokens that signal a conditional/quotative clause boundary.
 * These close a collocation chunk and tag it as conditional/quotative.
 */
export const CONDITIONAL_TOKENS = new Set(['と', 'たら', 'ば', 'なら', 'ても']);

/**
 * Quotative tokens — 〜って言ったら、〜って、〜と言う patterns.
 */
export const QUOTATIVE_TOKENS = new Set(['って', 'という', 'と言う', 'と言ったら', 'って言ったら']);

/**
 * て-form endings that signal a te-chain (continuative/sequential connection).
 */
export const TE_FORM_ENDINGS = new Set(['て', 'で', 'ちゃって', 'じゃって', 'ちゃ', 'てから']);

/**
 * Adverbial (連用形) endings that are commonly used as adverbs.
 */
export const RENYOKEI_ENDINGS = new Set(['く', 'に', 'で', 'と', 'に', 'ながら', 'つつ']);

/**
 * Known compound expressions (fixed multi-morpheme expressions).
 */
export const COMPOUND_EXPRESSIONS = [
    'なんでかって言ったら',
    'そもそも',
    'なんといっても',
    'それにしても',
    'というわけで',
    'ということで',
    'ということは',
    'それはそうと',
    'それはともかく',
    'ということになると',
    'というふうに',
    'というように',
];

/**
 * Relative clause ending patterns — verb/adj forms that modify a following noun.
 * These indicate a 連体修飾節 (relative clause).
 */
export const RENTAI_ENDINGS = new Set([
    'る', 'た', 'ている', 'てる', 'ていた', 'てた',
    'ない', 'ている', 'ていない',
    'い',   // i-adjective
]);
