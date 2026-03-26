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
