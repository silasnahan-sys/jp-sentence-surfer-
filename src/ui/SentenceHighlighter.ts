import { Editor, MarkdownView } from 'obsidian';
import { StateEffect, StateField, Extension } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import JpSentenceSurferPlugin from '../main';
import { parseSentences, findSentenceAt } from '../jp-sentence-parser';

/**
 * SentenceHighlighter v3 — CM6 Decoration sentence highlight.
 * Dispatches a StateEffect to apply Decoration.mark() on the current sentence
 * range so the highlight scrolls with the text natively.
 */

const setHighlight = StateEffect.define<{ from: number; to: number } | null>();

const highlightField = StateField.define<DecorationSet>({
    create() { return Decoration.none; },
    update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setHighlight)) {
                if (e.value === null) {
                    deco = Decoration.none;
                } else {
                    const mark = Decoration.mark({ class: 'jp-surfer-sentence-highlight' });
                    try { deco = Decoration.set([mark.range(e.value.from, e.value.to)]); }
                    catch { deco = Decoration.none; }
                }
            }
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f),
});

export class SentenceHighlighter {
    private plugin: JpSentenceSurferPlugin;
    private lastOffset = -1;
    private boundUpdate: () => void;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private installedViews = new WeakSet<object>();
    private paused = false;
    private started = false;  // guard: prevent double-registration if start() called twice

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
        this.boundUpdate = () => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.updateHighlight(), 16);
        };
    }

    start(): void {
        if (!this.plugin.settings.highlightCurrentSentence) return;
        if (this.started) return;  // idempotent — prevents duplicate event listeners
        this.started = true;
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', this.boundUpdate)
        );
        this.plugin.registerEvent(
            (this.plugin.app.workspace as any).on('editor-change', this.boundUpdate)
        );
        this.plugin.registerDomEvent(document, 'keyup', this.boundUpdate);
        this.plugin.registerDomEvent(document, 'mouseup', this.boundUpdate);
        this.plugin.registerDomEvent(document, 'touchend', this.boundUpdate);
    }

    stop(): void {
        if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
        this.started = false;
        this.clearHighlight();
    }

    /** Suppress highlight updates while the monkey scroller is active. */
    pause(): void {
        this.paused = true;
        this.clearHighlight();
    }

    resume(): void {
        this.paused = false;
        this.lastOffset = -1; // force re-highlight on next cursor event
    }

    private getCmView(editor: Editor): any {
        return (editor as any).cm ?? null;
    }

    /** Inject the StateField into a CM6 editor instance exactly once. */
    private ensureExtension(cmView: any): void {
        if (!cmView || this.installedViews.has(cmView as object)) return;
        this.installedViews.add(cmView as object);
        try {
            cmView.dispatch({
                effects: StateEffect.appendConfig.of([highlightField] as Extension[]),
            });
        } catch { /* noop */ }
    }

    private updateHighlight(): void {
        if (this.paused) return;
        if (!this.plugin.settings.highlightCurrentSentence) return;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) { this.clearHighlight(); return; }

        const editor: Editor = view.editor;
        const cmView = this.getCmView(editor);
        if (!cmView) { this.clearHighlight(); return; }

        const offset = editor.posToOffset(editor.getCursor());
        if (offset === this.lastOffset) return;
        this.lastOffset = offset;

        // Scan a ~40-line window around cursor rather than the full document
        const cursorLine = editor.getCursor().line;
        const lineCount = editor.lineCount();
        const windowStart = Math.max(0, cursorLine - 20);
        const windowEnd = Math.min(lineCount - 1, cursorLine + 20);
        const lines: string[] = [];
        for (let i = windowStart; i <= windowEnd; i++) lines.push(editor.getLine(i));
        const content = lines.join('\n');

        const windowOffset = editor.posToOffset({ line: windowStart, ch: 0 });
        const localOffset = offset - windowOffset;

        const sentences = parseSentences(content, this.plugin.settings);
        const sentence = findSentenceAt(sentences, localOffset);

        if (!sentence) { this.clearHighlight(); return; }

        // Register the highlight field on this editor instance if not yet done
        this.ensureExtension(cmView);

        // Set CSS var so the highlight color setting is honoured
        const editorEl = (editor as any).containerEl as HTMLElement | undefined;
        if (editorEl) {
            editorEl.style.setProperty('--jp-surfer-highlight-color', this.plugin.settings.highlightColor);
        }

        // Dispatch the decoration range (sentence offsets are relative to window content)
        const from = sentence.start + windowOffset;
        const to = sentence.end + windowOffset;
        try {
            cmView.dispatch({ effects: setHighlight.of({ from, to }) });
        } catch { /* noop */ }
    }

    private clearHighlight(): void {
        this.lastOffset = -1;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;
        const cmView = this.getCmView(editor);
        if (cmView) {
            try { cmView.dispatch({ effects: setHighlight.of(null) }); } catch { /* noop */ }
        }
        const editorEl = (editor as any).containerEl as HTMLElement | undefined;
        if (editorEl) editorEl.style.removeProperty('--jp-surfer-highlight-color');
    }
}
