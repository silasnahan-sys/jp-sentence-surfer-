/**
 * YTranscript processing pipeline.
 *
 * Steps:
 * 1. Strip all `[MM:SS](url)` timestamp prefixes from every line.
 * 2. Strip bracket annotations like [笑い] [音楽] [拍手].
 * 3. Concatenate the cleaned lines with a single space separator.
 * 4. Normalise whitespace (collapse multiple spaces/newlines to one space,
 *    but keep the text as a single continuous string for bunsetsu parsing).
 * 5. Return both the cleaned text and the parsed bunsetsu chunks.
 */

import { BunsetsuChunk } from "./types";
import { parseBunsetsu } from "./jp-sentence-parser";
import { ANNOTATION_PATTERN, TIMESTAMP_PATTERN } from "./constants";

export interface YTranscriptResult {
	/** The cleaned, concatenated Japanese text */
	cleanedText: string;
	/** Bunsetsu chunks parsed from the cleaned text */
	chunks: BunsetsuChunk[];
}

/**
 * Process raw YTranscript markdown text (as pasted from Obsidian's
 * YTranscript plugin) into an array of surfable bunsetsu chunks.
 *
 * @param raw  The raw text pasted from YTranscript, potentially containing
 *             multiple lines each prefixed with `[MM:SS](url)`.
 */
export function processYTranscript(raw: string): YTranscriptResult {
	const cleanedText = cleanYTranscript(raw);
	const chunks = parseBunsetsu(cleanedText);
	return { cleanedText, chunks };
}

/**
 * Strip timestamps and annotations from raw YTranscript text and return
 * a single cleaned string suitable for bunsetsu parsing.
 */
export function cleanYTranscript(raw: string): string {
	// Reset lastIndex for global regexes before use
	const timestampRe = new RegExp(TIMESTAMP_PATTERN.source, "g");
	const annotationRe = new RegExp(ANNOTATION_PATTERN.source, "g");

	// Strip timestamps first, then annotations
	let cleaned = raw
		.replace(timestampRe, " ")
		.replace(annotationRe, " ");

	// Collapse multiple whitespace/newlines into a single space
	cleaned = cleaned.replace(/[\s\n\r]+/g, " ").trim();

	return cleaned;
}

/**
 * Determine whether a block of text looks like YTranscript output
 * (i.e. contains one or more `[MM:SS](url)` timestamp markers).
 */
export function isYTranscriptText(text: string): boolean {
	const re = new RegExp(TIMESTAMP_PATTERN.source);
	return re.test(text);
}
