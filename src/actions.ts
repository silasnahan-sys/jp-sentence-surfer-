import { Editor, Notice } from 'obsidian';
import { JpSentenceSurferSettings } from './types';
import {
    parseBunsetsu,
    findChunkAt,
    findNextChunk,
    findPrevChunk,
    extractBoldSegments,
    stripTimestamps,
} from './jp-sentence-parser';
import { buildClozeText } from './cloze';
import { segmentYTranscript, isYTranscriptText, cleanYTranscriptText } from './ytranscript';
import { BOLD_REGEX } from './constants';
import {
    parseAtGranularity,
    findUnitAt,
    findNextUnit,
    findPrevUnit,
    DiscourseGranularity,
} from './discourse/discourse-parser';

/**
 * Get the cursor offset from an editor (as a single number in the full doc).
 */
function getCursorOffset(editor: Editor): number {
    const cursor = editor.getCursor();
    return editor.posToOffset(cursor);
}

/**
 * Get the full editor content.
 */
function getContent(editor: Editor): string {
    return editor.getValue();
}

/**
 * Move cursor to start of next bunsetsu chunk.
 */
export function surfNextSentence(editor: Editor, settings: JpSentenceSurferSettings): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const chunks = parseBunsetsu(content);
    const next = findNextChunk(chunks, offset);
    if (next) {
        editor.setCursor(editor.offsetToPos(next.start));
    } else {
        new Notice('No next chunk found.');
    }
}

/**
 * Move cursor to start of previous bunsetsu chunk.
 */
export function surfPrevSentence(editor: Editor, settings: JpSentenceSurferSettings): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const chunks = parseBunsetsu(content);
    const prev = findPrevChunk(chunks, offset);
    if (prev) {
        editor.setCursor(editor.offsetToPos(prev.start));
    } else {
        new Notice('No previous chunk found.');
    }
}

/**
 * Select the current bunsetsu chunk (the one containing the cursor).
 */
export function surfSelectSentence(editor: Editor, settings: JpSentenceSurferSettings): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const chunks = parseBunsetsu(content);
    const chunk = findChunkAt(chunks, offset);
    if (!chunk) {
        new Notice('No chunk found at cursor.');
        return;
    }
    editor.setSelection(
        editor.offsetToPos(chunk.start),
        editor.offsetToPos(chunk.end)
    );
}

/**
 * Select just the bold (**text**) portion within the current bunsetsu chunk.
 */
export function surfSelectBoldTarget(editor: Editor, settings: JpSentenceSurferSettings): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const chunks = parseBunsetsu(content);
    const chunk = findChunkAt(chunks, offset);
    if (!chunk) {
        new Notice('No chunk found at cursor.');
        return;
    }
    const boldSegs = extractBoldSegments(chunk.text);
    if (boldSegs.length === 0) {
        new Notice('No bold text in current chunk.');
        return;
    }
    // Select first bold segment
    const seg = boldSegs[0];
    const boldStart = chunk.start + seg.startInSentence;
    const boldEnd = chunk.start + seg.endInSentence;
    editor.setSelection(
        editor.offsetToPos(boldStart),
        editor.offsetToPos(boldEnd)
    );
}

/**
 * Jump to next bold boundary marker in the document.
 */
export function surfJumpNextBold(editor: Editor): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const regex = new RegExp(BOLD_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        if (match.index > offset) {
            editor.setCursor(editor.offsetToPos(match.index));
            return;
        }
    }
    new Notice('No next bold marker found.');
}

/**
 * Save the current bunsetsu chunk (or selection) as a cloze card.
 * Copies the cloze text to the clipboard.
 */
export async function surfSaveCloze(editor: Editor, settings: JpSentenceSurferSettings): Promise<void> {
    const selection = editor.getSelection();
    if (selection && selection.trim()) {
        // Use the current selection
        const boldSegments = extractBoldSegments(selection);
        const sentence = {
            raw: selection,
            clean: stripTimestamps(selection),
            start: 0,
            end: selection.length,
            hasBold: boldSegments.length > 0,
            boldSegments,
            hasTimestamps: false,
        };
        const cloze = buildClozeText(sentence, settings.clozeFormat);
        await navigator.clipboard.writeText(cloze);
        new Notice(`Cloze copied: ${cloze}`);
        return;
    }

    // Use current bunsetsu chunk
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const chunks = parseBunsetsu(content);
    const chunk = findChunkAt(chunks, offset);
    if (!chunk) {
        new Notice('No chunk found at cursor.');
        return;
    }
    const boldSegments = extractBoldSegments(chunk.text);
    const sentence = {
        raw: chunk.text,
        clean: chunk.text,
        start: chunk.start,
        end: chunk.end,
        hasBold: boldSegments.length > 0,
        boldSegments,
        hasTimestamps: false,
    };
    const cloze = buildClozeText(sentence, settings.clozeFormat);
    await navigator.clipboard.writeText(cloze);
    new Notice(`Cloze copied: ${cloze}`);
}

/**
 * Segment the current note's YTranscript content:
 * stitch fragments, add sentence boundaries, clean timestamps.
 */
export function surfSegmentYTranscript(editor: Editor): void {
    const content = getContent(editor);
    if (!isYTranscriptText(content)) {
        new Notice('This note does not appear to contain YTranscript content.');
        return;
    }
    const segmented = segmentYTranscript(content);
    editor.setValue(segmented);
    new Notice('YTranscript segmented successfully.');
}

/**
 * Look up the selected text in jp-collocations plugin.
 */
export function surfLookupCollocations(
    editor: Editor,
    lookupFn: (term: string) => void
): void {
    const selection = editor.getSelection();
    if (!selection || !selection.trim()) {
        new Notice('Select text to look up in jp-collocations.');
        return;
    }
    lookupFn(selection.trim());
}

/**
 * Move cursor to the next discourse unit at the given granularity level.
 */
export function surfDiscourseNext(
    editor: Editor,
    settings: JpSentenceSurferSettings,
    level: number
): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const units = parseAtGranularity(content, level as DiscourseGranularity);
    const next = findNextUnit(units, offset);
    if (next) {
        editor.setCursor(editor.offsetToPos(next.start));
    } else {
        new Notice('No next discourse unit found.');
    }
}

/**
 * Move cursor to the previous discourse unit at the given granularity level.
 */
export function surfDiscoursePrev(
    editor: Editor,
    settings: JpSentenceSurferSettings,
    level: number
): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const units = parseAtGranularity(content, level as DiscourseGranularity);
    const prev = findPrevUnit(units, offset);
    if (prev) {
        editor.setCursor(editor.offsetToPos(prev.start));
    } else {
        new Notice('No previous discourse unit found.');
    }
}

/**
 * Select the discourse unit at the cursor position for the given granularity level.
 */
export function surfDiscourseSelect(
    editor: Editor,
    settings: JpSentenceSurferSettings,
    level: number
): void {
    const content = getContent(editor);
    const offset = getCursorOffset(editor);
    const units = parseAtGranularity(content, level as DiscourseGranularity);
    const unit = findUnitAt(units, offset);
    if (!unit) {
        new Notice('No discourse unit found at cursor.');
        return;
    }
    editor.setSelection(
        editor.offsetToPos(unit.start),
        editor.offsetToPos(unit.end)
    );
}
