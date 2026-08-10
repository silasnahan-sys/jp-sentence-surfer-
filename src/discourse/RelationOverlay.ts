import { EditorView } from '@codemirror/view';
import { RelationType } from './RelationTypes';
import { MarkerType } from './MarkerTypes';
import { LayerType, SpanRole, spanRoleSpec } from './LayerTypes';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A relation with its endpoints already resolved to current document offsets. */
export interface ResolvedRelation {
    id: string;
    type: RelationType;
    label?: string;
    source: Array<{ from: number; to: number }>;
    target: Array<{ from: number; to: number }>;
}

/** A span tag resolved to a current document offset span. */
export interface ResolvedTag {
    id: string;
    category: MarkerType;
    span: { from: number; to: number };
}

/** A layer annotation resolved to a current document offset span. */
export interface ResolvedAnnotation {
    id: string;
    layer: LayerType;
    gloss?: string;
    span: { from: number; to: number };
    /** Role of the primary span (headword / hub) in a multi-span layer. */
    primaryRole?: SpanRole;
    /** Extra anchored spans (collocate / slot / frame / anchor) for multi-span layers. */
    members?: Array<{ from: number; to: number; role: SpanRole }>;
}

/** Which kind of object is currently selected in the overlay. */
export type OverlaySelection = { kind: 'rel' | 'tag' | 'ann'; id: string } | null;

interface RepPoint {
    /** Representative point (centre-top of the span group), content-space. */
    x: number;
    y: number;
    /** Per-line underline rects, content-space. */
    rects: Array<{ x: number; y: number; w: number; h: number }>;
    /** True if at least one piece was on-screen and measurable. */
    ok: boolean;
}

/**
 * RelationOverlay — draws typed discourse-relation arcs over the editor.
 *
 * The SVG is appended INSIDE the CodeMirror scroll container in content-space
 * coordinates, so arcs scroll naturally with the text. Because CM6 virtualises
 * off-screen lines (coordsAtPos returns null for them), we redraw on scroll via
 * requestAnimationFrame and simply skip any relation whose endpoints are not
 * currently measurable.
 *
 * Each relation renders as:
 *   • faint coloured underlines beneath every member span (both sides),
 *   • one quadratic arc from the source group to the target group,
 *   • an arrowhead at the target and a glyph chip at the arc apex.
 * Tapping the chip selects the relation (thickened) and reveals a ✕ to delete —
 * a one-thumb interaction that works without raising the keyboard.
 */
export class RelationOverlay {
    private cm: EditorView | null = null;
    private svg: SVGSVGElement | null = null;
    private resolved: ResolvedRelation[] = [];
    private tags: ResolvedTag[] = [];
    private annotations: ResolvedAnnotation[] = [];
    private selected: OverlaySelection = null;
    private rafPending = false;
    /** Occupied glyph-chip positions for the current redraw (fan-out tracker). */
    private chipSlots: Array<{ x: number; y: number; r: number }> = [];

    private onScroll = () => this.scheduleRedraw();
    private resizeObs: ResizeObserver | null = null;

    constructor(
        private onSelect: (kind: 'rel' | 'tag' | 'ann', id: string) => void,
        private onDelete: (kind: 'rel' | 'tag' | 'ann', id: string) => void,
        /** Cycle a span's role; memberIndex < 0 = the primary span. */
        private onCycleRole?: (annId: string, memberIndex: number) => void,
    ) {}

    isAttachedTo(cm: EditorView): boolean {
        return this.cm === cm && !!this.svg && this.svg.isConnected;
    }

    attach(cm: EditorView): void {
        if (this.isAttachedTo(cm)) return;
        this.detach();
        this.cm = cm;
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.classList.add('jp-rel-overlay');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        cm.scrollDOM.appendChild(svg);
        this.svg = svg;

        cm.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
        try {
            this.resizeObs = new ResizeObserver(() => this.scheduleRedraw());
            this.resizeObs.observe(cm.scrollDOM);
        } catch {
            /* ResizeObserver unavailable — scroll + explicit refresh still drive redraws */
        }
    }

    detach(): void {
        if (this.cm) {
            this.cm.scrollDOM.removeEventListener('scroll', this.onScroll);
        }
        if (this.resizeObs) {
            this.resizeObs.disconnect();
            this.resizeObs = null;
        }
        if (this.svg) {
            this.svg.remove();
            this.svg = null;
        }
        this.cm = null;
    }

    setSelected(sel: OverlaySelection): void {
        this.selected = sel;
        this.scheduleRedraw();
    }

    getSelected(): OverlaySelection {
        return this.selected;
    }

    setRelations(resolved: ResolvedRelation[]): void {
        this.resolved = resolved;
        if (this.selected?.kind === 'rel' && !resolved.some(r => r.id === this.selected!.id)) {
            this.selected = null;
        }
        this.scheduleRedraw();
    }

    setTags(tags: ResolvedTag[]): void {
        this.tags = tags;
        if (this.selected?.kind === 'tag' && !tags.some(t => t.id === this.selected!.id)) {
            this.selected = null;
        }
        this.scheduleRedraw();
    }

    setAnnotations(anns: ResolvedAnnotation[]): void {
        this.annotations = anns;
        if (this.selected?.kind === 'ann' && !anns.some(a => a.id === this.selected!.id)) {
            this.selected = null;
        }
        this.scheduleRedraw();
    }

    private scheduleRedraw(): void {
        if (this.rafPending) return;
        this.rafPending = true;
        window.requestAnimationFrame(() => {
            this.rafPending = false;
            this.redraw();
        });
    }

    // ── Geometry ─────────────────────────────────────────────

    private contentRectOf(from: number, to: number): RepPoint {
        const cm = this.cm;
        const empty: RepPoint = { x: 0, y: 0, rects: [], ok: false };
        if (!cm) return empty;
        const box = cm.scrollDOM.getBoundingClientRect();
        const offX = -box.left + cm.scrollDOM.scrollLeft;
        const offY = -box.top + cm.scrollDOM.scrollTop;
        const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
        let minLeft = Infinity, maxRight = -Infinity, topY = Infinity, midY = 0;
        try {
            const doc = cm.state.doc;
            const a = doc.lineAt(from);
            const b = doc.lineAt(to);
            for (let ln = a.number; ln <= b.number; ln++) {
                const line = doc.line(ln);
                const s = ln === a.number ? from : line.from;
                const e = ln === b.number ? to : line.to;
                if (s >= e) continue;
                const sc = cm.coordsAtPos(s, 1);
                const ec = cm.coordsAtPos(e, -1);
                if (!sc || !ec) continue;
                const x = sc.left + offX;
                const y = sc.top + offY;
                const w = Math.max(2, (ec.right + offX) - x);
                const h = (ec.bottom + offY) - y;
                rects.push({ x, y, w, h });
                minLeft = Math.min(minLeft, x);
                maxRight = Math.max(maxRight, x + w);
                topY = Math.min(topY, y);
                midY = y + h / 2;
            }
        } catch {
            return empty;
        }
        if (rects.length === 0) return empty;
        return { x: (minLeft + maxRight) / 2, y: topY, rects, ok: true };
    }

    private groupRep(spans: Array<{ from: number; to: number }>): RepPoint {
        const all: RepPoint = { x: 0, y: 0, rects: [], ok: false };
        let sx = 0, sy = 0, count = 0;
        for (const s of spans) {
            const r = this.contentRectOf(s.from, s.to);
            if (!r.ok) continue;
            all.rects.push(...r.rects);
            sx += r.x;
            sy += r.y;
            count++;
        }
        if (count === 0) return all;
        all.x = sx / count;
        all.y = sy / count;
        all.ok = true;
        return all;
    }

    // ── Render ───────────────────────────────────────────────

    private redraw(): void {
        const svg = this.svg;
        const cm = this.cm;
        if (!svg || !cm) return;
        // Size the canvas to the full scrollable content.
        svg.setAttribute('width', String(cm.scrollDOM.scrollWidth));
        svg.setAttribute('height', String(cm.scrollDOM.scrollHeight));
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        // Reset the chip-slot tracker so overlapping tag/annotation glyphs
        // stack instead of hiding one another (the taxonomy expects layering).
        this.chipSlots = [];

        // Span tags first (underneath the arcs).
        for (const tag of this.tags) {
            const rep = this.contentRectOf(tag.span.from, tag.span.to);
            if (!rep.ok) continue;
            const selected = this.selected?.kind === 'tag' && this.selected.id === tag.id;
            this.drawTag(svg, tag, rep, selected);
        }

        // Layer annotations (the big-5) — a thicker double underline + layer glyph.
        for (const ann of this.annotations) {
            const rep = this.contentRectOf(ann.span.from, ann.span.to);
            if (!rep.ok) continue;
            const selected = this.selected?.kind === 'ann' && this.selected.id === ann.id;
            this.drawAnnotation(svg, ann, rep, selected);
        }

        for (const rel of this.resolved) {
            const src = this.groupRep(rel.source);
            const dst = this.groupRep(rel.target);
            if (!src.ok && !dst.ok) continue; // fully off-screen
            const selected = this.selected?.kind === 'rel' && this.selected.id === rel.id;
            this.drawRelation(svg, rel, src, dst, selected);
        }
    }

    private drawRelation(
        svg: SVGSVGElement,
        rel: ResolvedRelation,
        src: RepPoint,
        dst: RepPoint,
        selected: boolean,
    ): void {
        const color = rel.type.color;

        // Underlines under every member span (both sides).
        for (const r of [...src.rects, ...dst.rects]) {
            const bar = document.createElementNS(SVG_NS, 'rect');
            bar.setAttribute('x', String(r.x));
            bar.setAttribute('y', String(r.y + r.h - 2));
            bar.setAttribute('width', String(r.w));
            bar.setAttribute('height', '2.5');
            bar.setAttribute('rx', '1.25');
            bar.setAttribute('fill', color);
            bar.setAttribute('opacity', selected ? '0.95' : '0.6');
            svg.appendChild(bar);
        }

        if (!src.ok || !dst.ok) return; // need both ends for an arc

        // Quadratic arc bowed upward above the higher endpoint.
        const x1 = src.x, y1 = src.y;
        const x2 = dst.x, y2 = dst.y;
        const apexY = Math.min(y1, y2) - Math.min(64, 26 + Math.abs(x2 - x1) * 0.08);
        const cx = (x1 + x2) / 2;
        const d = `M ${x1} ${y1} Q ${cx} ${apexY} ${x2} ${y2}`;

        // Wide invisible hit path for easy tapping.
        const hit = document.createElementNS(SVG_NS, 'path');
        hit.setAttribute('d', d);
        hit.setAttribute('fill', 'none');
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '22');
        hit.classList.add('jp-rel-hit');
        hit.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect('rel', rel.id); });
        svg.appendChild(hit);

        const arc = document.createElementNS(SVG_NS, 'path');
        arc.setAttribute('d', d);
        arc.setAttribute('fill', 'none');
        arc.setAttribute('stroke', color);
        arc.setAttribute('stroke-width', selected ? '2.6' : '1.6');
        arc.setAttribute('stroke-linecap', 'round');
        arc.setAttribute('opacity', selected ? '1' : '0.85');
        if (!selected) arc.setAttribute('stroke-dasharray', '0.1 0');
        arc.classList.add('jp-rel-arc');
        svg.appendChild(arc);

        // Arrowhead at the target.
        this.drawArrowhead(svg, cx, apexY, x2, y2, color, selected);

        // Glyph chip at the apex.
        this.drawChip(svg, rel, cx, apexY, color, selected);
    }

    private drawArrowhead(
        svg: SVGSVGElement,
        cx: number, cy: number,
        x2: number, y2: number,
        color: string, selected: boolean,
    ): void {
        // Tangent at the curve end ≈ direction from control point to endpoint.
        const ang = Math.atan2(y2 - cy, x2 - cx);
        const size = selected ? 9 : 7;
        const a1 = ang + Math.PI - 0.45;
        const a2 = ang + Math.PI + 0.45;
        const p1x = x2 + Math.cos(a1) * size;
        const p1y = y2 + Math.sin(a1) * size;
        const p2x = x2 + Math.cos(a2) * size;
        const p2y = y2 + Math.sin(a2) * size;
        const tri = document.createElementNS(SVG_NS, 'path');
        tri.setAttribute('d', `M ${x2} ${y2} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`);
        tri.setAttribute('fill', color);
        tri.setAttribute('opacity', selected ? '1' : '0.85');
        svg.appendChild(tri);
    }

    private drawChip(
        svg: SVGSVGElement,
        rel: ResolvedRelation,
        cx: number, cy: number,
        color: string, selected: boolean,
    ): void {
        const g = document.createElementNS(SVG_NS, 'g');
        g.classList.add('jp-rel-chip');
        g.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect('rel', rel.id); });

        const r = 11;
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', String(r));
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', selected ? '1' : '0.92');
        g.appendChild(circle);

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 0.5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', '#1b1d24');
        text.setAttribute('font-size', '12');
        text.setAttribute('font-weight', '700');
        text.textContent = rel.type.glyph;
        g.appendChild(text);
        svg.appendChild(g);

        // When selected, show a ✕ delete affordance just above the chip.
        if (selected) {
            const dg = document.createElementNS(SVG_NS, 'g');
            dg.classList.add('jp-rel-del');
            dg.addEventListener('click', (e) => { e.stopPropagation(); this.onDelete('rel', rel.id); });
            const dcx = cx + r + 12;
            const dcy = cy - r - 2;
            const dc = document.createElementNS(SVG_NS, 'circle');
            dc.setAttribute('cx', String(dcx));
            dc.setAttribute('cy', String(dcy));
            dc.setAttribute('r', '10');
            dc.setAttribute('fill', '#e53935');
            dg.appendChild(dc);
            const dt = document.createElementNS(SVG_NS, 'text');
            dt.setAttribute('x', String(dcx));
            dt.setAttribute('y', String(dcy + 0.5));
            dt.setAttribute('text-anchor', 'middle');
            dt.setAttribute('dominant-baseline', 'middle');
            dt.setAttribute('fill', '#fff');
            dt.setAttribute('font-size', '13');
            dt.setAttribute('font-weight', '700');
            dt.textContent = '\u00d7';
            dg.appendChild(dt);
            svg.appendChild(dg);
        }
    }

    // ── Span tags ────────────────────────────────────────────

    /**
     * Find a free vertical slot for a glyph chip at (gx, gy). If the slot is
     * already taken (another tag/annotation starts at the same span position),
     * stack upward so every layer stays visible and individually tappable.
     */
    private placeChip(gx: number, gy: number, rad: number): { x: number; y: number } {
        let y = gy;
        let guard = 0;
        while (
            guard++ < 16 &&
            this.chipSlots.some(s => Math.abs(s.x - gx) < (s.r + rad) && Math.abs(s.y - y) < (s.r + rad))
        ) {
            y -= rad * 2 + 2;
        }
        this.chipSlots.push({ x: gx, y, r: rad });
        return { x: gx, y };
    }

    private drawTag(svg: SVGSVGElement, tag: ResolvedTag, rep: RepPoint, selected: boolean): void {
        const color = tag.category.color;

        // Coloured underline under every line-piece of the span.
        for (const r of rep.rects) {
            const bar = document.createElementNS(SVG_NS, 'rect');
            bar.setAttribute('x', String(r.x));
            bar.setAttribute('y', String(r.y + r.h - 2.5));
            bar.setAttribute('width', String(r.w));
            bar.setAttribute('height', selected ? '3.5' : '2.5');
            bar.setAttribute('rx', '1.5');
            bar.setAttribute('fill', color);
            bar.setAttribute('opacity', selected ? '1' : '0.78');
            // Wide invisible hit pad so the thin underline is easy to tap.
            const pad = document.createElementNS(SVG_NS, 'rect');
            pad.setAttribute('x', String(r.x));
            pad.setAttribute('y', String(r.y));
            pad.setAttribute('width', String(r.w));
            pad.setAttribute('height', String(r.h));
            pad.setAttribute('fill', 'transparent');
            pad.classList.add('jp-rel-chip');
            pad.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect('tag', tag.id); });
            svg.appendChild(pad);
            svg.appendChild(bar);
        }

        // Small category glyph chip hugging the start of the span.
        const first = rep.rects[0];
        const rad = 8;
        const slot = this.placeChip(first.x - 2, first.y - 1, rad);
        const gx = slot.x;
        const gy = slot.y;
        const g = document.createElementNS(SVG_NS, 'g');
        g.classList.add('jp-rel-chip');
        g.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect('tag', tag.id); });
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(gx));
        circle.setAttribute('cy', String(gy));
        circle.setAttribute('r', String(selected ? rad + 1 : rad));
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', selected ? '1' : '0.9');
        g.appendChild(circle);
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(gx));
        text.setAttribute('y', String(gy + 0.5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', '#1b1d24');
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', '700');
        text.textContent = tag.category.glyph;
        g.appendChild(text);
        svg.appendChild(g);

        // Delete affordance when selected.
        if (selected) {
            const last = rep.rects[rep.rects.length - 1];
            const dcx = last.x + last.w + 10;
            const dcy = last.y + last.h / 2;
            const dg = document.createElementNS(SVG_NS, 'g');
            dg.classList.add('jp-rel-del');
            dg.addEventListener('click', (e) => { e.stopPropagation(); this.onDelete('tag', tag.id); });
            const dc = document.createElementNS(SVG_NS, 'circle');
            dc.setAttribute('cx', String(dcx));
            dc.setAttribute('cy', String(dcy));
            dc.setAttribute('r', '9');
            dc.setAttribute('fill', '#e53935');
            dg.appendChild(dc);
            const dt = document.createElementNS(SVG_NS, 'text');
            dt.setAttribute('x', String(dcx));
            dt.setAttribute('y', String(dcy + 0.5));
            dt.setAttribute('text-anchor', 'middle');
            dt.setAttribute('dominant-baseline', 'middle');
            dt.setAttribute('fill', '#fff');
            dt.setAttribute('font-size', '12');
            dt.setAttribute('font-weight', '700');
            dt.textContent = '\u00d7';
            dg.appendChild(dt);
            svg.appendChild(dg);
        }
    }

    // ── Layer annotations (the big-5) ────────────────────────

    /**
     * A layer annotation renders as a DOUBLE underline (to read distinctly from
     * the single-underline discourse markers) in the layer colour, plus a layer
     * glyph chip at the span start. Tapping selects; selected shows a ✕.
     *
     * For multi-span rhetorical layers each member span renders with its ROLE
     * notation drawn right on the text (Eijiro-style): [headword] (collocate)
     * {slot} ❮hub/anchor❯, with frame/context dimmed. When the annotation is
     * selected, tapping a span CYCLES its role (fast, no modal); when not
     * selected, tapping selects the parent — so a stray tap never mutates data.
     */
    private drawAnnotation(svg: SVGSVGElement, ann: ResolvedAnnotation, rep: RepPoint, selected: boolean): void {
        const color = ann.layer.color;

        // Member spans, drawn with role-specific notation + underline weight.
        (ann.members ?? []).forEach((m, mi) => {
            const mrep = this.contentRectOf(m.from, m.to);
            if (!mrep.ok) return;
            const spec = spanRoleSpec(m.role);
            const dim = !!spec.dim;
            for (const r of mrep.rects) {
                const pad = document.createElementNS(SVG_NS, 'rect');
                pad.setAttribute('x', String(r.x));
                pad.setAttribute('y', String(r.y));
                pad.setAttribute('width', String(r.w));
                pad.setAttribute('height', String(r.h));
                pad.setAttribute('fill', 'transparent');
                pad.classList.add('jp-rel-chip');
                // Selected → tap cycles this member's role; else select parent.
                pad.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (selected && this.onCycleRole) this.onCycleRole(ann.id, mi);
                    else this.onSelect('ann', ann.id);
                });
                svg.appendChild(pad);

                // Underline: solid-ish for content roles (collocate/slot/anchor),
                // thin dotted for frame/context scaffolding.
                const dline = document.createElementNS(SVG_NS, 'line');
                dline.setAttribute('x1', String(r.x));
                dline.setAttribute('y1', String(r.y + r.h - 1));
                dline.setAttribute('x2', String(r.x + r.w));
                dline.setAttribute('y2', String(r.y + r.h - 1));
                dline.setAttribute('stroke', color);
                dline.setAttribute('stroke-width', dim ? '1' : (selected ? '1.8' : '1.4'));
                dline.setAttribute('stroke-linecap', 'round');
                if (dim) dline.setAttribute('stroke-dasharray', '1.5 3');
                dline.setAttribute('opacity', dim ? '0.35' : (selected ? '0.9' : '0.55'));
                svg.appendChild(dline);
            }
            // Bracket notation glyphs flanking the FIRST rect of the span.
            if (spec.open || spec.close) {
                const fr = mrep.rects[0];
                const lr = mrep.rects[mrep.rects.length - 1];
                this.drawBracket(svg, spec.open, fr.x - 3, fr.y + fr.h / 2, color, selected);
                this.drawBracket(svg, spec.close, lr.x + lr.w + 3, lr.y + lr.h / 2, color, selected);
            }
        });

        for (const r of rep.rects) {
            // Wide invisible hit pad first.
            const pad = document.createElementNS(SVG_NS, 'rect');
            pad.setAttribute('x', String(r.x));
            pad.setAttribute('y', String(r.y));
            pad.setAttribute('width', String(r.w));
            pad.setAttribute('height', String(r.h));
            pad.setAttribute('fill', 'transparent');
            pad.classList.add('jp-rel-chip');
            // When selected, tapping the primary span cycles ITS role (for layers
            // with a role vocabulary); otherwise select the annotation.
            pad.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selected && this.onCycleRole && (ann.layer.roleVocab?.length ?? 0) > 0) {
                    this.onCycleRole(ann.id, -1);
                } else {
                    this.onSelect('ann', ann.id);
                }
            });
            svg.appendChild(pad);

            // Two stacked bars = the "double border" the paper notes use.
            for (let k = 0; k < 2; k++) {
                const bar = document.createElementNS(SVG_NS, 'rect');
                bar.setAttribute('x', String(r.x));
                bar.setAttribute('y', String(r.y + r.h - 1.5 - k * 3));
                bar.setAttribute('width', String(r.w));
                bar.setAttribute('height', selected ? '2.4' : '1.8');
                bar.setAttribute('rx', '1');
                bar.setAttribute('fill', color);
                bar.setAttribute('opacity', selected ? '1' : (k === 0 ? '0.85' : '0.5'));
                svg.appendChild(bar);
            }
        }

        // Primary span bracket notation (headword [] / hub ❮❯) when it has a role.
        if (ann.primaryRole) {
            const pspec = spanRoleSpec(ann.primaryRole);
            if (pspec.open || pspec.close) {
                const fr = rep.rects[0];
                const lr = rep.rects[rep.rects.length - 1];
                this.drawBracket(svg, pspec.open, fr.x - 3, fr.y + fr.h / 2, color, selected, true);
                this.drawBracket(svg, pspec.close, lr.x + lr.w + 3, lr.y + lr.h / 2, color, selected, true);
            }
        }

        // Layer glyph chip hugging the start of the span.
        const first = rep.rects[0];
        const rad = 8.5;
        const slot = this.placeChip(first.x - 2, first.y - 1, rad);
        const gx = slot.x;
        const gy = slot.y;
        const g = document.createElementNS(SVG_NS, 'g');
        g.classList.add('jp-rel-chip');
        g.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect('ann', ann.id); });
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(gx));
        circle.setAttribute('cy', String(gy));
        circle.setAttribute('r', String(selected ? rad + 1 : rad));
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', selected ? '1' : '0.92');
        g.appendChild(circle);
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(gx));
        text.setAttribute('y', String(gy + 0.5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', '#1b1d24');
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', '800');
        text.textContent = ann.layer.glyph;
        g.appendChild(text);
        svg.appendChild(g);

        if (selected) {
            const last = rep.rects[rep.rects.length - 1];
            // Shift the ✕ clear of the primary closing bracket if one is drawn.
            const dcx = last.x + last.w + (ann.primaryRole && spanRoleSpec(ann.primaryRole).close ? 20 : 10);
            const dcy = last.y + last.h / 2;
            const dg = document.createElementNS(SVG_NS, 'g');
            dg.classList.add('jp-rel-del');
            dg.addEventListener('click', (e) => { e.stopPropagation(); this.onDelete('ann', ann.id); });
            const dc = document.createElementNS(SVG_NS, 'circle');
            dc.setAttribute('cx', String(dcx));
            dc.setAttribute('cy', String(dcy));
            dc.setAttribute('r', '9');
            dc.setAttribute('fill', '#e53935');
            dg.appendChild(dc);
            const dt = document.createElementNS(SVG_NS, 'text');
            dt.setAttribute('x', String(dcx));
            dt.setAttribute('y', String(dcy + 0.5));
            dt.setAttribute('text-anchor', 'middle');
            dt.setAttribute('dominant-baseline', 'middle');
            dt.setAttribute('fill', '#fff');
            dt.setAttribute('font-size', '12');
            dt.setAttribute('font-weight', '700');
            dt.textContent = '\u00d7';
            dg.appendChild(dt);
            svg.appendChild(dg);
        }
    }

    /**
     * Draw a single bracket glyph (one of [ ] ( ) { } ❮ ❯) centred at (cx, cy)
     * in the layer colour. Primary brackets are slightly heavier. These float in
     * the gutter between spans so the lifted Eijiro-style pattern reads directly
     * off the text without altering the note.
     */
    private drawBracket(
        svg: SVGSVGElement, glyph: string, cx: number, cy: number,
        color: string, selected: boolean, primary = false,
    ): void {
        if (!glyph) return;
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', String(cx));
        t.setAttribute('y', String(cy));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('fill', color);
        t.setAttribute('font-size', primary ? '15' : '13');
        t.setAttribute('font-weight', primary ? '800' : '700');
        t.setAttribute('opacity', selected ? '1' : '0.8');
        t.setAttribute('pointer-events', 'none');
        t.textContent = glyph;
        svg.appendChild(t);
    }
}
