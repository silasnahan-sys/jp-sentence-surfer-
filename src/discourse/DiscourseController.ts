import { MarkdownView, Notice, Editor } from 'obsidian';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type JpSentenceSurferPlugin from '../main';
import { ScopeEngine, SCOPE_COUNT, SCOPE_LABELS, SCOPE_BADGES } from '../scope-engine';
import { MarkedSet, MarkRange } from './MarkedSet';

export type BulkFormat = 'bold' | 'highlight' | 'cloze' | 'spoiler';

/**
 * DiscourseController — the brain behind the KCS-inspired bulk select & edit
 * workflow.
 *
 * Responsibilities:
 *   1. Snap a raw cursor offset to a whole linguistic unit (bunsetsu / 連文節 /
 *      clause / sentence) via ScopeEngine. This is what removes the monkey
 *      scroller's momentum inaccuracy — selection is always quantized.
 *   2. Manage the MarkedSet (place / toggle / clear inactive selections).
 *   3. "Activate" marks into a native multi-selection (KCS: Activate
 *      Selections) for free-form simultaneous editing.
 *   4. Apply a format to ALL marked ranges in a single atomic transaction
 *      (bulk bold / highlight / cloze / spoiler / copy).
 *
 * It owns its own ScopeEngine instance so commands work whether or not the
 * monkey scroller is currently mounted.
 */
export class DiscourseController {
    private plugin: JpSentenceSurferPlugin;
    private scope = new ScopeEngine();
    private marks = new MarkedSet();
    /** Scope level used when snapping the cursor to a unit. 0..SCOPE_COUNT-1. */
    private scopeLevel = 0;
    private lastHash = '';

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
    }

    // ── Helpers ──────────────────────────────────────────────

    private getView(): MarkdownView | null {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    private getCmView(editor: Editor): EditorView | null {
        return ((editor as unknown as { cm?: EditorView }).cm) ?? null;
    }

    /** Re-analyze scope only when the document content actually changed. */
    private ensureAnalyzed(content: string): void {
        const hash = `${content.length}:${content.slice(0, 48)}:${content.slice(-48)}`;
        if (hash !== this.lastHash) {
            this.lastHash = hash;
            this.scope.analyze(content, this.plugin.settings.sentenceRegex);
        }
    }

    // ── Scope ────────────────────────────────────────────────

    /** Cycle the snap scope: 文節 → 連文節 → 節 → 文 → 文節 … */
    cycleScope(): void {
        this.scopeLevel = (this.scopeLevel + 1) % SCOPE_COUNT;
        new Notice(`Mark scope: ${SCOPE_BADGES[this.scopeLevel]} ${SCOPE_LABELS[this.scopeLevel]}`);
    }

    getScopeLevel(): number {
        return this.scopeLevel;
    }

    // ── Marking ──────────────────────────────────────────────

    /** Snap the editor cursor to its unit at the current scope and toggle it. */
    toggleAtCursor(): void {
        const view = this.getView();
        if (!view) return;
        const editor = view.editor;
        const content = editor.getValue();
        this.ensureAnalyzed(content);
        const offset = editor.posToOffset(editor.getCursor());
        const units = this.scope.getUnits(this.scopeLevel);
        if (units.length === 0) {
            new Notice('No surfable units in this note.');
            return;
        }
        const idx = this.scope.findUnitAt(this.scopeLevel, offset);
        const unit = units[idx];
        if (!unit) {
            new Notice('No unit under the cursor.');
            return;
        }
        this.toggleRange(unit.start, unit.end);
    }

    /**
     * Toggle an explicit range (already unit-quantized). Used by the monkey
     * scroller, which passes the exact unit it is currently focused on, so the
     * mark always matches the on-screen highlight — no cursor round-trip,
     * no inaccuracy.
     *
     * @param notify show a Notice (suppressed during rapid touch-picking).
     */
    toggleRange(from: number, to: number, notify = true): boolean {
        const view = this.getView();
        if (!view) return false;
        const cm = this.getCmView(view.editor);
        if (!cm) return false;
        const added = this.marks.toggle(cm, from, to);
        if (notify) {
            const n = this.marks.count(cm);
            new Notice(added ? `Marked · ${n}` : `Unmarked · ${n}`);
        }
        return added;
    }

    clear(): void {
        const view = this.getView();
        if (!view) return;
        const cm = this.getCmView(view.editor);
        if (!cm) return;
        const had = this.marks.count(cm);
        this.marks.clear(cm);
        if (had > 0) new Notice('Marks cleared.');
    }

    /** Number of marks in the active editor. */
    count(): number {
        const view = this.getView();
        if (!view) return 0;
        const cm = this.getCmView(view.editor);
        return cm ? this.marks.count(cm) : 0;
    }

    // ── Public accessors (used by the relation layer) ────────

    /** Active MarkdownView, or null. */
    getActiveView(): MarkdownView | null {
        return this.getView();
    }

    /** CM6 view for the active editor, or null. */
    getActiveCmView(): EditorView | null {
        const view = this.getView();
        if (!view) return null;
        return this.getCmView(view.editor);
    }

    /** All currently marked ranges in document order. */
    getMarkedRanges(): MarkRange[] {
        const cm = this.getActiveCmView();
        return cm ? this.marks.getRanges(cm) : [];
    }

    /** Clear marks without emitting a Notice. */
    clearSilently(): void {
        const cm = this.getActiveCmView();
        if (cm) this.marks.clear(cm);
    }

    // ── Activate (KCS: Activate Selections) ──────────────────

    /** Turn all marks into a native CM6 multi-selection for free-form editing. */
    activate(): void {
        const view = this.getView();
        if (!view) return;
        const cm = this.getCmView(view.editor);
        if (!cm) return;
        const ranges = this.marks.getRanges(cm);
        if (ranges.length === 0) {
            new Notice('No marks to activate.');
            return;
        }
        try {
            const sel = EditorSelection.create(
                ranges.map(r => EditorSelection.range(r.from, r.to)),
                ranges.length - 1
            );
            cm.dispatch({ selection: sel, scrollIntoView: true });
            cm.focus();
            new Notice(`Activated ${ranges.length} selection${ranges.length > 1 ? 's' : ''}.`);
        } catch {
            new Notice('Could not activate selections.');
        }
    }

    // ── Bulk edit ────────────────────────────────────────────

    private wrap(kind: BulkFormat, text: string, clozeIndex: number): string {
        switch (kind) {
            case 'bold':
                return text.startsWith('**') && text.endsWith('**') && text.length > 4
                    ? text.slice(2, -2)
                    : `**${text}**`;
            case 'highlight':
                return text.startsWith('==') && text.endsWith('==') && text.length > 4
                    ? text.slice(2, -2)
                    : `==${text}==`;
            case 'spoiler':
                return text.startsWith('%%') && text.endsWith('%%') && text.length > 4
                    ? text.slice(2, -2)
                    : `%%${text}%%`;
            case 'cloze':
                return /^\{\{c\d+::[\s\S]+\}\}$/.test(text)
                    ? text.replace(/^\{\{c\d+::([\s\S]+)\}\}$/, '$1')
                    : `{{c${clozeIndex}::${text}}}`;
        }
    }

    /**
     * Apply a format to every marked range in ONE atomic transaction. Changes
     * are dispatched together so offsets never shift mid-edit and the marks
     * remap cleanly around the new (wrapped) text. Cloze indices auto-increment
     * (c1, c2, c3 …) so a set of marks becomes a single multi-cloze card —
     * ideal for showing discourse relations within one sentence.
     */
    bulkWrap(kind: BulkFormat): void {
        const view = this.getView();
        if (!view) return;
        const cm = this.getCmView(view.editor);
        if (!cm) return;
        const ranges = this.marks.getRanges(cm).sort((a, b) => a.from - b.from);
        if (ranges.length === 0) {
            new Notice('No marks to format.');
            return;
        }
        const changes: Array<{ from: number; to: number; insert: string }> = [];
        let clozeIndex = 1;
        for (const r of ranges) {
            const text = cm.state.sliceDoc(r.from, r.to);
            const replacement = this.wrap(kind, text, clozeIndex);
            if (kind === 'cloze') clozeIndex++;
            changes.push({ from: r.from, to: r.to, insert: replacement });
        }
        try {
            cm.dispatch({ changes });
            new Notice(`${kind} × ${ranges.length}`);
        } catch {
            new Notice('Bulk edit failed.');
        }
    }

    /** Copy all marked texts joined by newlines (document order). */
    bulkCopy(): void {
        const view = this.getView();
        if (!view) return;
        const cm = this.getCmView(view.editor);
        if (!cm) return;
        const ranges = this.marks.getRanges(cm);
        if (ranges.length === 0) {
            new Notice('No marks to copy.');
            return;
        }
        const texts = ranges.map((r: MarkRange) =>
            DiscourseController.normalizeFragment(cm.state.sliceDoc(r.from, r.to)));
        navigator.clipboard
            .writeText(texts.join('\n'))
            .then(() => new Notice(`Copied ${texts.length} marks.`))
            .catch(() => new Notice('Clipboard permission denied.'));
    }

    /**
     * Tidy a copied discourse fragment: strip line-breaks (YTranscript inserts
     * caption-wrap newlines mid-word, e.g. 落とし⏎いのか → 落としいのか) while
     * PRESERVING intentional single spaces (と また違う stays as-is). Runs of
     * whitespace that contain a newline collapse to nothing; a lone space with
     * no adjacent newline is kept. Trailing/leading whitespace is trimmed.
     */
    static normalizeFragment(text: string): string {
        return text
            .replace(/[ \t]*[\r\n]+[ \t]*/g, '') // drop caption-wrap breaks + hugging spaces
            .replace(/[ \t]{2,}/g, ' ')          // squeeze accidental double spaces
            .trim();
    }
}
