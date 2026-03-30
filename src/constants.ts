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

// ─── Surf Physics Constants (NHL-inspired) ────────────────────────────────────

/**
 * Lerp easing factor — how quickly scroll catches up to target per frame.
 * 0.14 = smooth, buttery. Higher values = snappier.
 */
export const SURF_EASE = 0.14;

/**
 * Friction multiplier for staggered wave-highlight easing.
 * Elements further from the focus chunk get progressively slower easing.
 */
export const SURF_FRICTION = 0.92;

/**
 * Momentum decay per frame after last tap.
 * Higher = sustains momentum longer. Lower = stops faster.
 */
export const SURF_MOMENTUM_DECAY = 0.85;

/**
 * Delta multiplier for touch velocity → scroll momentum translation.
 * Equivalent to NHL's SCROLL_DELTA_EASE.
 */
export const SURF_DELTA_EASE = 0.45;

/**
 * Minimum velocity threshold below which animation is considered settled.
 */
export const SURF_SETTLE_THRESHOLD = 0.5;

/**
 * Number of neighboring chunks that receive wave-highlight echo effects.
 */
export const SURF_WAVE_RADIUS = 3;

/**
 * Gesture dead zone in degrees — below this angle, treat as horizontal gesture.
 */
export const GESTURE_DEAD_ZONE_DEGREES = 30;

/**
 * Minimum swipe distance (px) to register as a swipe gesture.
 */
export const GESTURE_MIN_SWIPE_PX = 40;

/**
 * Long-press duration threshold in milliseconds.
 */
export const GESTURE_LONG_PRESS_MS = 500;

/**
 * Double-tap maximum interval in milliseconds.
 */
export const GESTURE_DOUBLE_TAP_MS = 300;



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
