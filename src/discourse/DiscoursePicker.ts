import { MarkdownView, Editor, Notice } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type JpSentenceSurferPlugin from '../main';
import { DiscourseController, BulkFormat } from './DiscourseController';
import { TinySegmenter } from '../tiny-segmenter';
import { HapticEngine } from '../ui/HapticEngine';

/**
 * DiscoursePicker — direct-on-text, keyboard-free bulk picking for mobile.
 *
 * THE PROBLEM IT SOLVES
 * Discourse fragments (は / も / なんですけど / と また違う / になります。) are
 * morpheme-level and wildly variable in length — they do NOT align to a single
 * scope. Navigating the trackball to 18 scattered fragments is slow, and tapping
 * the editor directly raises the iOS/Android keyboard and the native selection
 * toolbar, both of which interrupt the flow.
 *
 * THE DESIGN
 *   • A transparent capture overlay sits over the whole viewport. Every touch is
 *     consumed here (touch-action:none + preventDefault) so the contenteditable
 *     never focuses → THE KEYBOARD NEVER APPEARS. The editor is blurred on enter.
 *   • TAP a word → snaps to the morpheme under the finger (TinySegmenter) and
 *     toggles it as a mark.
 *   • HORIZONTAL DRAG → paints a span from the start morpheme to the morpheme
 *     under the finger (snapped to token boundaries); commits ONE mark on lift.
 *     This is how you grab なんですけど or と また違う in a single stroke.
 *   • VERTICAL DRAG → scrolls the document, so you pick through a long chunk
 *     without leaving the mode.
 *   • Marks accumulate (they map through edits via MarkedSet). A compact HUD
 *     gives bulk Bold / Cloze / Copy / Activate(→edit) / Clear / Done.
 *
 * Marks are shared with DiscourseController, so the combo ring, the hotkey
 * commands, and this picker all operate on one staging set.
 */

const MOVE_TAP_THRESHOLD = 8;       // px of movement below which a touch is a tap
const VERTICAL_BIAS = 1.3;          // |dy| must exceed |dx| * this to count as scroll
const PREVIEW_POOL = 8;

export class DiscoursePicker {
    private plugin: JpSentenceSurferPlugin;
    private controller: DiscourseController;
    private seg = new TinySegmenter();
    private haptics = new HapticEngine();

    private active = false;
    private overlayEl: HTMLElement | null = null;
    private hudEl: HTMLElement | null = null;
    private countEl: HTMLElement | null = null;
    private previewEls: HTMLElement[] = [];

    // Gesture state
    private touchStartX = 0;
    private touchStartY = 0;
    private lastY = 0;
    private gestureMode: 'undecided' | 'paint' | 'scroll' = 'undecided';
    private paintAnchor: { from: number; to: number } | null = null;
    private boundTouchStart: ((e: TouchEvent) => void) | null = null;
    private boundTouchMove: ((e: TouchEvent) => void) | null = null;
    private boundTouchEnd: ((e: TouchEvent) => void) | null = null;
    private vvResizeListener: (() => void) | null = null;
    /** Unsubscribe from relation-store change events (keeps the HUD count live). */
    private relationsUnsub: (() => void) | null = null;

    constructor(plugin: JpSentenceSurferPlugin, controller: DiscourseController) {
        this.plugin = plugin;
        this.controller = controller;
    }

    isActive(): boolean {
        return this.active;
    }

    toggle(): void {
        if (this.active) this.exit();
        else this.enter();
    }

    // ── Lifecycle ────────────────────────────────────────────

    enter(): void {
        if (this.active) return;
        const view = this.getView();
        if (!view) {
            new Notice('Open a note first.');
            return;
        }
        const cm = this.getCmView(view.editor);
        if (!cm) return;

        this.active = true;
        // Drop focus and prevent re-focus → keyboard stays down.
        try { (cm.contentDOM as HTMLElement).blur(); } catch { /* */ }
        try { (document.activeElement as HTMLElement | null)?.blur(); } catch { /* */ }

        this.buildOverlay();
        this.buildHud();
        this.updateCount();
        // Async picks (tag / annotate / link) and bulk ops clear or remap marks
        // through the store; keep the HUD count in sync when that happens.
        this.relationsUnsub = this.plugin.relations?.onChange(() => this.updateCount()) ?? null;
        this.attachKeyboardAvoidance();
        this.haptics.fire('zoom');
        new Notice('Discourse pick: tap = morpheme · drag = span · ↕ scroll');
    }

    exit(): void {
        if (!this.active) return;
        this.active = false;
        this.clearPreview();
        this.detachOverlay();
        if (this.hudEl) { this.hudEl.remove(); this.hudEl = null; }
        this.countEl = null;
        if (this.relationsUnsub) { this.relationsUnsub(); this.relationsUnsub = null; }
        this.detachKeyboardAvoidance();
        this.haptics.fire('impact');
    }

    // ── Overlay + capture ────────────────────────────────────

    private buildOverlay(): void {
        const el = document.createElement('div');
        el.className = 'dp-capture';
        this.boundTouchStart = (e) => this.onTouchStart(e);
        this.boundTouchMove = (e) => this.onTouchMove(e);
        this.boundTouchEnd = (e) => this.onTouchEnd(e);
        el.addEventListener('touchstart', this.boundTouchStart, { passive: false });
        el.addEventListener('touchmove', this.boundTouchMove, { passive: false });
        el.addEventListener('touchend', this.boundTouchEnd, { passive: false });
        el.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
        document.body.appendChild(el);
        this.overlayEl = el;
    }

    private detachOverlay(): void {
        if (this.overlayEl) {
            if (this.boundTouchStart) this.overlayEl.removeEventListener('touchstart', this.boundTouchStart);
            if (this.boundTouchMove) this.overlayEl.removeEventListener('touchmove', this.boundTouchMove);
            if (this.boundTouchEnd) {
                this.overlayEl.removeEventListener('touchend', this.boundTouchEnd);
                this.overlayEl.removeEventListener('touchcancel', this.boundTouchEnd);
            }
            this.overlayEl.remove();
            this.overlayEl = null;
        }
        this.boundTouchStart = this.boundTouchMove = this.boundTouchEnd = null;
    }

    private buildHud(): void {
        const hud = document.createElement('div');
        hud.className = 'dp-hud';

        const count = document.createElement('span');
        count.className = 'dp-hud-count';
        count.textContent = '0';
        hud.appendChild(count);
        this.countEl = count;

        const buttons: Array<{ icon: string; label: string; run: () => void }> = [
            { icon: '太', label: 'Bold all', run: () => this.bulk('bold') },
            { icon: '穴', label: 'Cloze all', run: () => this.bulk('cloze') },
            { icon: '光', label: 'Highlight all', run: () => this.bulk('highlight') },
            { icon: '⧉', label: 'Copy all', run: () => { this.controller.bulkCopy(); } },
            { icon: '層', label: 'Annotate as a layer (serifu / collocation …)', run: () => { this.plugin.relations?.annotateFromMarks(); this.updateCount(); } },
            { icon: '印', label: 'Tag as discourse marker', run: () => { this.plugin.relations?.tagFromMarks(); this.updateCount(); } },
            { icon: '源', label: 'Set as relation source', run: () => { this.plugin.relations?.setSourceFromMarks(); this.updateCount(); } },
            { icon: '繋', label: 'Link source → target', run: () => { this.plugin.relations?.linkFromMarks(); this.updateCount(); } },
            { icon: '✓', label: 'Edit (activate)', run: () => { this.controller.activate(); this.exit(); } },
            { icon: '⌫', label: 'Clear', run: () => { this.controller.clear(); this.updateCount(); this.haptics.fire('impact'); } },
            { icon: '完', label: 'Done', run: () => this.exit() },
        ];
        for (const b of buttons) {
            const btn = document.createElement('button');
            btn.className = 'dp-hud-btn';
            btn.setAttribute('aria-label', b.label);
            btn.textContent = b.icon;
            // Stop the touch from reaching the capture overlay or the editor.
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.add('dp-hud-btn--press'); this.haptics.fire('light'); }, { passive: false });
            btn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.remove('dp-hud-btn--press'); b.run(); }, { passive: false });
            hud.appendChild(btn);
        }
        document.body.appendChild(hud);
        this.hudEl = hud;
    }

    private bulk(kind: BulkFormat): void {
        this.controller.bulkWrap(kind);
        // Marks remap around the wrapped text; refresh count + previews.
        this.updateCount();
        this.haptics.fire('success');
    }

    private updateCount(): void {
        if (this.countEl) this.countEl.textContent = String(this.controller.count());
    }

    // ── Touch handling ───────────────────────────────────────

    private onTouchStart(e: TouchEvent): void {
        if (!this.active) return;
        const t = e.touches[0];
        if (!t) return;
        // Don't preventDefault yet — let a tap pass cheaply; we cancel on move.
        this.touchStartX = t.clientX;
        this.touchStartY = t.clientY;
        this.lastY = t.clientY;
        this.gestureMode = 'undecided';
        this.paintAnchor = this.snapAt(t.clientX, t.clientY);
    }

    private onTouchMove(e: TouchEvent): void {
        if (!this.active) return;
        const t = e.touches[0];
        if (!t) return;
        const dx = t.clientX - this.touchStartX;
        const dy = t.clientY - this.touchStartY;

        if (this.gestureMode === 'undecided') {
            if (Math.abs(dx) < MOVE_TAP_THRESHOLD && Math.abs(dy) < MOVE_TAP_THRESHOLD) return;
            // Vertical-dominant → scroll; otherwise paint.
            this.gestureMode = Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS ? 'scroll' : 'paint';
        }

        e.preventDefault(); // we own the gesture now (stops native scroll/zoom/focus)

        if (this.gestureMode === 'scroll') {
            const cm = this.getCm();
            if (cm) cm.scrollDOM.scrollTop -= (t.clientY - this.lastY);
            this.lastY = t.clientY;
            this.clearPreview();
            return;
        }

        // paint
        const head = this.snapAt(t.clientX, t.clientY);
        if (this.paintAnchor && head) {
            const from = Math.min(this.paintAnchor.from, head.from);
            const to = Math.max(this.paintAnchor.to, head.to);
            this.renderPreview(from, to);
        }
    }

    private onTouchEnd(e: TouchEvent): void {
        if (!this.active) return;
        const mode = this.gestureMode;
        this.gestureMode = 'undecided';
        this.clearPreview();

        if (mode === 'scroll') return;

        const t = e.changedTouches[0];
        if (!t) { this.paintAnchor = null; return; }

        if (mode === 'paint' && this.paintAnchor) {
            const head = this.snapAt(t.clientX, t.clientY);
            if (head) {
                const from = Math.min(this.paintAnchor.from, head.from);
                const to = Math.max(this.paintAnchor.to, head.to);
                this.commit(from, to);
            }
        } else {
            // tap → single morpheme
            const span = this.paintAnchor ?? this.snapAt(t.clientX, t.clientY);
            if (span) this.commit(span.from, span.to);
        }
        this.paintAnchor = null;
    }

    private commit(from: number, to: number): void {
        if (to <= from) return;
        const added = this.controller.toggleRange(from, to, false);
        this.updateCount();
        this.haptics.fire(added ? 'select' : 'light');
    }

    // ── Morpheme snapping ────────────────────────────────────

    /** Map viewport coords → the morpheme span under that point. */
    private snapAt(x: number, y: number): { from: number; to: number } | null {
        const cm = this.getCm();
        if (!cm) return null;
        let offset: number | null;
        try {
            offset = cm.posAtCoords({ x, y });
        } catch {
            return null;
        }
        if (offset == null) return null;
        return this.snapToMorpheme(cm, offset);
    }

    private snapToMorpheme(cm: EditorView, offset: number): { from: number; to: number } | null {
        const docLen = cm.state.doc.length;
        const off = Math.max(0, Math.min(docLen, offset));
        const line = cm.state.doc.lineAt(off);
        const text = line.text;
        if (text.length === 0) return null;
        const local = Math.max(0, Math.min(text.length, off - line.from));
        const tokens = this.seg.segment(text);
        let acc = 0;
        for (const tok of tokens) {
            const start = acc;
            const end = acc + tok.length;
            if (local >= start && local < end) {
                // Skip pure-whitespace tokens — snap to the next real token instead.
                if (tok.trim().length === 0) {
                    const nextStart = end;
                    if (nextStart < text.length) {
                        return this.snapToMorpheme(cm, line.from + nextStart);
                    }
                }
                return { from: line.from + start, to: line.from + end };
            }
            acc = end;
        }
        // At line end → last non-empty token.
        for (let i = tokens.length - 1; i >= 0; i--) {
            if (tokens[i].trim().length > 0) {
                const end = text.length - tokens.slice(i + 1).reduce((s, tk) => s + tk.length, 0);
                const start = end - tokens[i].length;
                return { from: line.from + start, to: line.from + end };
            }
        }
        return null;
    }

    // ── Preview rendering ────────────────────────────────────

    private renderPreview(from: number, to: number): void {
        const cm = this.getCm();
        if (!cm) { this.clearPreview(); return; }
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        try {
            const doc = cm.state.doc;
            const startLine = doc.lineAt(from);
            const endLine = doc.lineAt(to);
            let seg = 0;
            for (let ln = startLine.number; ln <= endLine.number && seg < PREVIEW_POOL; ln++) {
                const lineObj = doc.line(ln);
                const segStart = ln === startLine.number ? from : lineObj.from;
                const segEnd = ln === endLine.number ? to : lineObj.to;
                if (segStart >= segEnd) continue;
                const sc = cm.coordsAtPos(segStart, 1);
                const ec = cm.coordsAtPos(segEnd, -1);
                if (!sc || !ec) continue;
                const el = this.getPreviewEl(seg);
                el.style.top = `${Math.max(0, sc.top)}px`;
                el.style.left = `${Math.max(0, sc.left)}px`;
                el.style.width = `${Math.max(2, Math.min(vw, ec.right) - sc.left)}px`;
                el.style.height = `${Math.min(vh, ec.bottom) - sc.top}px`;
                el.style.display = 'block';
                seg++;
            }
            for (let i = seg; i < this.previewEls.length; i++) this.previewEls[i].style.display = 'none';
        } catch {
            this.clearPreview();
        }
    }

    private getPreviewEl(i: number): HTMLElement {
        if (i < this.previewEls.length) return this.previewEls[i];
        const el = document.createElement('div');
        el.className = 'dp-preview';
        el.style.display = 'none';
        document.body.appendChild(el);
        this.previewEls.push(el);
        return el;
    }

    private clearPreview(): void {
        for (const el of this.previewEls) el.style.display = 'none';
    }

    // ── Keyboard avoidance (lift HUD above any keyboard, just in case) ──

    private attachKeyboardAvoidance(): void {
        if (!window.visualViewport || this.vvResizeListener) return;
        const update = () => {
            if (!this.hudEl) return;
            const vv = window.visualViewport!;
            const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            this.hudEl.style.bottom = `${kb + 12}px`;
        };
        this.vvResizeListener = update;
        window.visualViewport.addEventListener('resize', update, { passive: true } as AddEventListenerOptions);
        window.visualViewport.addEventListener('scroll', update, { passive: true } as AddEventListenerOptions);
    }

    private detachKeyboardAvoidance(): void {
        if (this.vvResizeListener && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this.vvResizeListener);
            window.visualViewport.removeEventListener('scroll', this.vvResizeListener);
        }
        this.vvResizeListener = null;
    }

    // ── Helpers ──────────────────────────────────────────────

    private getView(): MarkdownView | null {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    private getCm(): EditorView | null {
        const view = this.getView();
        if (!view) return null;
        return this.getCmView(view.editor);
    }

    private getCmView(editor: Editor): EditorView | null {
        return ((editor as unknown as { cm?: EditorView }).cm) ?? null;
    }
}
