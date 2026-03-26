/**
 * JP Sentence Parser — primary parsing module.
 *
 * Exposes `parseBunsetsu(text)` which returns an array of BunsetsuChunk
 * objects each with { text, start, end } offsets into the cleaned text.
 */

import { BunsetsuChunk } from "./types";
import { TinySegmenter } from "./tiny-segmenter";
import { groupIntoBunsetsu } from "./bunsetsu-grouper";

const segmenter = new TinySegmenter();

/**
 * Parse `text` into bunsetsu (文節) phrase chunks.
 *
 * @param text  Clean Japanese text (timestamps and annotations already
 *              stripped by the ytranscript module if applicable).
 * @returns     Array of BunsetsuChunk with text + start/end offsets.
 */
export function parseBunsetsu(text: string): BunsetsuChunk[] {
	if (!text || !text.trim()) return [];

	const tokens = segmenter.segment(text);
	return groupIntoBunsetsu(tokens, text);
}
