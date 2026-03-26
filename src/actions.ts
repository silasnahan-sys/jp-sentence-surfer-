/**
 * Surf actions — navigate, select, and cloze bunsetsu chunks inside an
 * Obsidian editor.
 *
 * All commands operate on the bunsetsu chunks parsed from the current
 * note's content (or the selected text if a selection exists).
 */

import { Editor, Notice } from "obsidian";
import { BunsetsuChunk } from "./types";
import { parseBunsetsu } from "./jp-sentence-parser";
import { cleanYTranscript, isYTranscriptText } from "./ytranscript";
import { JpSurferSettings } from "./types";

/** State held per-editor-session while the user is surfing. */
export interface SurfState {
	/** All chunks parsed from the current text */
	chunks: BunsetsuChunk[];
	/** Index of the currently highlighted chunk */
	currentIndex: number;
	/** The clean text from which chunks were parsed */
	cleanedText: string;
	/** The original raw text (may contain timestamps) */
	originalText: string;
	/** Offset of `cleanedText` inside `originalText` (used for cursor mapping) */
	textOffset: number;
}

let surfState: SurfState | null = null;

/** Build (or rebuild) surf state from the editor content. */
function buildSurfState(editor: Editor, settings: JpSurferSettings): SurfState | null {
	const fullText = editor.getValue();
	if (!fullText.trim()) return null;

	let cleanedText = fullText;
	if (settings.stripTimestamps && isYTranscriptText(fullText)) {
		cleanedText = cleanYTranscript(fullText);
	} else if (settings.stripAnnotations) {
		// Still strip bracket annotations even in non-YTranscript notes
		cleanedText = cleanYTranscript(fullText);
	}

	const chunks = parseBunsetsu(cleanedText);
	if (chunks.length === 0) return null;

	return {
		chunks,
		currentIndex: 0,
		cleanedText,
		originalText: fullText,
		textOffset: 0,
	};
}

/**
 * Find the chunk index that best matches the current cursor position.
 * Returns -1 if nothing matches.
 */
function findChunkAtCursor(state: SurfState, editor: Editor): number {
	const cursor = editor.getCursor();
	const offset = editor.posToOffset(cursor);

	// Find the chunk whose range contains (or is nearest to) the cursor
	let best = -1;
	let bestDist = Infinity;
	for (let i = 0; i < state.chunks.length; i++) {
		const c = state.chunks[i];
		if (offset >= c.start && offset <= c.end) return i;
		const dist = Math.min(Math.abs(offset - c.start), Math.abs(offset - c.end));
		if (dist < bestDist) {
			bestDist = dist;
			best = i;
		}
	}
	return best;
}

/** Move the cursor to the start of a chunk. */
function moveCursorToChunk(editor: Editor, chunk: BunsetsuChunk): void {
	const pos = editor.offsetToPos(chunk.start);
	editor.setCursor(pos);
	editor.scrollIntoView({ from: pos, to: pos }, true);
}

/** Select the text of a chunk in the editor. */
function selectChunk(editor: Editor, chunk: BunsetsuChunk): void {
	const from = editor.offsetToPos(chunk.start);
	const to = editor.offsetToPos(chunk.end);
	editor.setSelection(from, to);
	editor.scrollIntoView({ from, to }, true);
}

// ─── Public command handlers ──────────────────────────────────────────────────

/**
 * surf-next: Move to the next bunsetsu chunk.
 */
export function surfNext(editor: Editor, settings: JpSurferSettings): void {
	if (!surfState) {
		surfState = buildSurfState(editor, settings);
		if (!surfState) {
			new Notice("No Japanese text found to surf.");
			return;
		}
		// Start from cursor position
		const idx = findChunkAtCursor(surfState, editor);
		surfState.currentIndex = idx >= 0 ? idx : 0;
	} else {
		surfState.currentIndex = Math.min(
			surfState.currentIndex + 1,
			surfState.chunks.length - 1
		);
	}

	const chunk = surfState.chunks[surfState.currentIndex];
	moveCursorToChunk(editor, chunk);
}

/**
 * surf-prev: Move to the previous bunsetsu chunk.
 */
export function surfPrev(editor: Editor, settings: JpSurferSettings): void {
	if (!surfState) {
		surfState = buildSurfState(editor, settings);
		if (!surfState) {
			new Notice("No Japanese text found to surf.");
			return;
		}
		const idx = findChunkAtCursor(surfState, editor);
		surfState.currentIndex = idx >= 0 ? idx : surfState.chunks.length - 1;
	} else {
		surfState.currentIndex = Math.max(surfState.currentIndex - 1, 0);
	}

	const chunk = surfState.chunks[surfState.currentIndex];
	moveCursorToChunk(editor, chunk);
}

/**
 * surf-select: Select the current bunsetsu chunk.
 * If surfState is null, builds it and selects from cursor.
 */
export function surfSelect(editor: Editor, settings: JpSurferSettings): void {
	if (!surfState) {
		surfState = buildSurfState(editor, settings);
		if (!surfState) {
			new Notice("No Japanese text found to surf.");
			return;
		}
		const idx = findChunkAtCursor(surfState, editor);
		surfState.currentIndex = idx >= 0 ? idx : 0;
	}

	const chunk = surfState.chunks[surfState.currentIndex];
	selectChunk(editor, chunk);
}

/**
 * surf-cloze: Convert the selected text (or current chunk) to a cloze
 * deletion card.
 *
 * Rules:
 * - If the selection contains `**bold**` markers, each bold span becomes
 *   a numbered cloze: {{c1::…}}, {{c2::…}}, etc.
 * - If there is no bold, the entire selection is wrapped: {{c1::…}}.
 * - The template in settings is used (default `{{c1::{text}}}`).
 */
export function surfCloze(editor: Editor, settings: JpSurferSettings): void {
	let selectedText = editor.getSelection();

	// If nothing selected, use the current surf chunk
	if (!selectedText && surfState) {
		const chunk = surfState.chunks[surfState.currentIndex];
		selectChunk(editor, chunk);
		selectedText = chunk.text;
	}

	if (!selectedText) {
		new Notice("Nothing selected and no active surf chunk.");
		return;
	}

	const result = convertToCloze(selectedText, settings.clozeTemplate);
	editor.replaceSelection(result);
}

/**
 * Convert `text` to cloze format.
 * If text contains `**…**` spans, each becomes a numbered cloze.
 * Otherwise the whole text is wrapped as c1.
 */
export function convertToCloze(text: string, template: string): string {
	const boldPattern = /\*\*(.+?)\*\*/g;
	const hasBold = boldPattern.test(text);

	if (!hasBold) {
		return template.replace("{text}", text);
	}

	let counter = 1;
	return text.replace(/\*\*(.+?)\*\*/g, (_match, inner: string) => {
		const cloze = template
			.replace("c1", `c${counter}`)
			.replace("{text}", inner);
		counter++;
		return cloze;
	});
}

/**
 * Reset surf state — call when the editor content changes or the user
 * moves away from the note.
 */
export function resetSurfState(): void {
	surfState = null;
}

/** Expose current surf state for toolbar rendering. */
export function getSurfState(): SurfState | null {
	return surfState;
}
