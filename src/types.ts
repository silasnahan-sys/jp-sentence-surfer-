/**
 * Types for the JP Sentence Surfer plugin.
 */

/** A bunsetsu (文節) phrase chunk with its position in the original text. */
export interface BunsetsuChunk {
	/** The text of this chunk */
	text: string;
	/** Start offset in the original (cleaned) text */
	start: number;
	/** End offset (exclusive) in the original (cleaned) text */
	end: number;
}

/** Plugin settings */
export interface JpSurferSettings {
	/** Whether to strip timestamps from YTranscript format */
	stripTimestamps: boolean;
	/** Whether to strip bracket annotations like [笑い] [音楽] */
	stripAnnotations: boolean;
	/** Cloze format template — use {text} as placeholder */
	clozeTemplate: string;
	/** Whether the floating toolbar is enabled */
	toolbarEnabled: boolean;
	/** Toolbar position: 'bottom' | 'top' */
	toolbarPosition: "bottom" | "top";
	/** Highlight colour for the selected chunk */
	highlightColor: string;
}

export const DEFAULT_SETTINGS: JpSurferSettings = {
	stripTimestamps: true,
	stripAnnotations: true,
	clozeTemplate: "{{c1::{text}}}",
	toolbarEnabled: true,
	toolbarPosition: "bottom",
	highlightColor: "#ffe066",
};
