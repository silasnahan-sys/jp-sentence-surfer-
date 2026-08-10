import { StateEffect, StateField, Extension } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

/**
 * MarkedSet — KCS-style "inactive selections" for JP Sentence Surfer.
 *
 * A persistent set of marked text ranges, stored as CM6 decorations so they
 * MAP THROUGH DOCUMENT EDITS (the same property that makes KCS's inactive
 * selections survive edits). Ranges are always quantized to whole linguistic
 * units by the caller (DiscourseController), which is what eliminates the
 * monkey-scroller's momentum inaccuracy: you can only mark real bunsetsu /
 * clause / sentence units, never a pixel-approximate range.
 *
 * The set is editor-local (decorations live in the CM6 EditorState), so each
 * note keeps its own staging set. Marks are working state — they are NOT
 * persisted to disk (relations, added in a later phase, are).
 */

export interface MarkRange {
    from: number;
    to: number;
}

const addMark = StateEffect.define<MarkRange>();
const removeMark = StateEffect.define<MarkRange>();
const clearAllMarks = StateEffect.define<null>();

const markDecoration = Decoration.mark({ class: 'jp-surfer-mark' });

const markField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(deco, tr) {
        // Map existing marks through the edit so they track their text.
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(clearAllMarks)) {
                deco = Decoration.none;
            } else if (e.is(addMark)) {
                if (e.value.to > e.value.from) {
                    try {
                        deco = deco.update({
                            add: [markDecoration.range(e.value.from, e.value.to)],
                            sort: true,
                        });
                    } catch {
                        /* out-of-range after a concurrent edit — ignore */
                    }
                }
            } else if (e.is(removeMark)) {
                const { from, to } = e.value;
                deco = deco.update({
                    filter: (f, t) => !(f === from && t === to),
                });
            }
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f),
});

export class MarkedSet {
    private installedViews = new WeakSet<object>();

    /** Register the decoration StateField on a CM6 editor exactly once. */
    private ensureExtension(cmView: EditorView): void {
        if (!cmView || this.installedViews.has(cmView as object)) return;
        this.installedViews.add(cmView as object);
        try {
            cmView.dispatch({
                effects: StateEffect.appendConfig.of([markField] as Extension[]),
            });
        } catch {
            /* noop */
        }
    }

    /** All marked ranges in document order. */
    getRanges(cmView: EditorView): MarkRange[] {
        const ranges: MarkRange[] = [];
        const set = cmView.state.field(markField, false);
        if (!set) return ranges;
        set.between(0, cmView.state.doc.length, (from, to) => {
            ranges.push({ from, to });
        });
        return ranges;
    }

    /** Marks overlapping [from, to). Used for forgiving toggle behaviour. */
    private getOverlapping(cmView: EditorView, from: number, to: number): MarkRange[] {
        const out: MarkRange[] = [];
        const set = cmView.state.field(markField, false);
        if (!set) return out;
        set.between(from, to, (f, t) => {
            // between() is end-inclusive; exclude a mark that merely touches the edge
            if (t > from && f < to) out.push({ from: f, to: t });
        });
        return out;
    }

    count(cmView: EditorView): number {
        return this.getRanges(cmView).length;
    }

    has(cmView: EditorView, from: number, to: number): boolean {
        return this.getOverlapping(cmView, from, to).length > 0;
    }

    /**
     * Toggle a range. If any existing mark overlaps it, all overlapping marks
     * are removed (forgiving un-mark); otherwise the range is added.
     * Returns true if a mark was added, false if mark(s) were removed.
     */
    toggle(cmView: EditorView, from: number, to: number): boolean {
        this.ensureExtension(cmView);
        const overlaps = this.getOverlapping(cmView, from, to);
        if (overlaps.length > 0) {
            cmView.dispatch({ effects: overlaps.map(r => removeMark.of(r)) });
            return false;
        }
        cmView.dispatch({ effects: addMark.of({ from, to }) });
        return true;
    }

    add(cmView: EditorView, from: number, to: number): void {
        this.ensureExtension(cmView);
        if (this.getOverlapping(cmView, from, to).length === 0) {
            cmView.dispatch({ effects: addMark.of({ from, to }) });
        }
    }

    clear(cmView: EditorView): void {
        const set = cmView.state.field(markField, false);
        if (!set) return;
        cmView.dispatch({ effects: clearAllMarks.of(null) });
    }
}
