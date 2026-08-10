import { MarkdownView, Notice, TFile } from 'obsidian';
import type JpSentenceSurferPlugin from '../main';
import { DiscourseController } from './DiscourseController';
import { RelationStore, Relation, RelationEndpoint, TextAnchor, SpanTag, Annotation } from './RelationStore';
import { RelationOverlay, ResolvedRelation, ResolvedTag, ResolvedAnnotation, OverlaySelection } from './RelationOverlay';
import {
    RelationType,
    buildRelationTypes,
    resolveRelationType,
} from './RelationTypes';
import { MarkerType, buildMarkerTypes, resolveMarkerType } from './MarkerTypes';
import { LayerType, SpanRole, buildLayerTypes, resolveLayerType, primaryRoleOf, nextSpanRole, spanRoleSpec } from './LayerTypes';
import { AnnotationEditModal } from './AnnotationEditModal';
import { suggestRelationType, suggestMarkerType, indexOfType } from './suggest';

/**
 * RelationController — the brain for discourse RELATIONS (Phase 2).
 *
 * A relation connects a SOURCE span-group to a TARGET span-group with a typed
 * arc. Authoring reuses the existing mark staging set so it works from the
 * keyboard-free picker, the combo ring, or hotkeys identically:
 *
 *   1. Mark the source span(s)  → "Set source"  (stashes them, clears marks)
 *   2. Mark the target span(s)  → "Link"        (pick a type → relation created)
 *
 * Relations persist to a sidecar JSON (RelationStore) keyed by file path, using
 * edit-surviving text anchors, and render as arcs via RelationOverlay. They are
 * never written into the note body, so the cloze/Anki pipeline stays clean.
 */
export class RelationController {
    private plugin: JpSentenceSurferPlugin;
    private discourse: DiscourseController;
    private store: RelationStore;
    private overlay: RelationOverlay;

    /** Stashed source endpoint awaiting a target + type. */
    private pendingSource: RelationEndpoint | null = null;

    private paletteEl: HTMLElement | null = null;
    private refreshTimer: number | null = null;
    private changeListeners: Array<() => void> = [];

    constructor(plugin: JpSentenceSurferPlugin, discourse: DiscourseController) {
        this.plugin = plugin;
        this.discourse = discourse;
        this.store = new RelationStore(plugin);
        this.overlay = new RelationOverlay(
            (kind, id) => this.onOverlaySelect(kind, id),
            (kind, id) => this.onOverlayDelete(kind, id),
            (annId, memberIndex) => this.cycleSpanRole(annId, memberIndex),
        );
    }

    // ── Lifecycle ────────────────────────────────────────────

    async init(): Promise<void> {
        await this.store.load();
        const ws = this.plugin.app.workspace;
        this.plugin.registerEvent(ws.on('file-open', () => this.attachAndRefresh()));
        this.plugin.registerEvent(ws.on('active-leaf-change', () => this.attachAndRefresh()));
        // Re-resolve anchors as the document changes (debounced).
        this.plugin.registerEvent(ws.on('editor-change', () => this.scheduleRefresh()));
        // Keep relations attached to a file when it is renamed.
        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) this.store.rename(oldPath, file.path);
            }),
        );
        // Initial paint once layout is ready.
        this.plugin.app.workspace.onLayoutReady(() => this.attachAndRefresh());
    }

    unload(): void {
        this.closePalette();
        this.overlay.detach();
        void this.store.flush();
    }

    // ── Types ────────────────────────────────────────────────

    private allTypes(): RelationType[] {
        return buildRelationTypes(this.plugin.settings.customRelationTypes ?? []);
    }

    private allMarkerTypes(): MarkerType[] {
        return buildMarkerTypes(this.plugin.settings.customMarkerTypes ?? []);
    }

    private allLayerTypes(): LayerType[] {
        return buildLayerTypes(this.plugin.settings.customLayerTypes ?? []);
    }

    // ── Authoring ────────────────────────────────────────────

    /** Stash the currently-marked spans as the relation's source. */
    setSourceFromMarks(): void {
        const ep = this.endpointFromMarks();
        if (!ep) {
            new Notice('Mark the source span(s) first.');
            return;
        }
        this.pendingSource = ep;
        this.discourse.clearSilently();
        this.refresh();
        new Notice(`Source set · ${ep.anchors.length} span${ep.anchors.length > 1 ? 's' : ''} — now mark the target, then Link.`);
    }

    /** Whether a source is staged and waiting for a target. */
    hasPendingSource(): boolean {
        return this.pendingSource != null;
    }

    /** Cancel a staged source. */
    cancelPendingSource(): void {
        if (this.pendingSource) {
            this.pendingSource = null;
            new Notice('Source cleared.');
        }
    }

    /**
     * Use the currently-marked spans as the target, then prompt for a relation
     * type and create the relation. If no source is staged yet, this stages the
     * marks AS the source instead (so a single button can do both steps).
     */
    linkFromMarks(): void {
        if (!this.pendingSource) {
            this.setSourceFromMarks();
            return;
        }
        const target = this.endpointFromMarks();
        if (!target) {
            new Notice('Mark the target span(s) first.');
            return;
        }
        const source = this.pendingSource;
        this.showTypePalette((type) => {
            this.createRelation(type, source, target);
            this.pendingSource = null;
            this.discourse.clearSilently();
        }, source, target);
    }

    private createRelation(type: RelationType, source: RelationEndpoint, target: RelationEndpoint): void {
        const file = this.activeFilePath();
        if (!file) return;
        const relation: Relation = {
            id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            type: type.id,
            source,
            target,
            createdAt: Date.now(),
        };
        this.store.add(file, relation);
        this.refresh();
        new Notice(`${type.jp} relation linked.`);
    }

    // ── Span tagging (save spans AS a kind of discourse marker) ─

    /**
     * Tag every currently-marked span as a discourse marker. Opens the marker
     * palette; on pick, each marked range becomes its own SpanTag (so you can
     * tag five fillers at once). Marks are cleared afterwards.
     */
    tagFromMarks(): void {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return;
        const ranges = this.discourse.getMarkedRanges();
        if (ranges.length === 0) {
            new Notice('Mark the span(s) to tag first.');
            return;
        }
        const doc = cm.state.doc.toString();
        const sorted = ranges.slice().sort((a, b) => a.from - b.from);
        const suggested = suggestMarkerType(doc.slice(sorted[0].from, sorted[0].to));
        this.showMarkerPalette((cat) => {
            for (const r of sorted) {
                const tag: SpanTag = {
                    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                    category: cat.id,
                    anchor: RelationStore.buildAnchor(doc, r.from, r.to),
                    createdAt: Date.now(),
                };
                this.store.addTag(file, tag);
            }
            this.discourse.clearSilently();
            this.refresh();
            new Notice(`Tagged ${ranges.length} span${ranges.length > 1 ? 's' : ''} as ${cat.jp}.`);
        }, suggested);
    }

    /**
     * Annotate every currently-marked span as one of the FIVE layers (serifu /
     * collocation / rhetorical-collocation / rhetorical-construction / discourse).
     * Opens the layer palette; on pick:
     *   • single-span layers (serifu / collocation / discourse): each marked
     *     range becomes its own Annotation (batch — tag many at once);
     *   • multi-span layers (rhetorical collocation / construction) with >1 mark:
     *     ALL ranges become ONE annotation — the first (document order) is the
     *     primary focal core / hub, the rest become anchored members (the scenic
     *     envelope / anchor lattice). The focal role can be reassigned later.
     * Marks are cleared afterwards.
     */
    annotateFromMarks(): void {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return;
        const ranges = this.discourse.getMarkedRanges();
        if (ranges.length === 0) {
            new Notice('Mark the span(s) to annotate first.');
            return;
        }
        const doc = cm.state.doc.toString();
        const sorted = ranges.slice().sort((a, b) => a.from - b.from);
        this.showLayerPalette((layer) => {
            const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            if (layer.multiSpan && sorted.length > 1) {
                // One grouped annotation: primary span + member spans, each
                // tagged with a default role (primary=headword/hub, members=the
                // layer's default member role — collocate for 描, anchor for 構).
                // Roles are refined later by tapping spans on the overlay.
                const [primary, ...rest] = sorted;
                const memberRole = layer.defaultMemberRole ?? 'frame';
                const ann: Annotation = {
                    id: newId(),
                    layer: layer.id,
                    anchor: RelationStore.buildAnchor(doc, primary.from, primary.to),
                    primaryRole: primaryRoleOf(layer),
                    members: rest.map(r => ({
                        anchor: RelationStore.buildAnchor(doc, r.from, r.to),
                        role: memberRole,
                    })),
                    createdAt: Date.now(),
                };
                this.store.addAnnotation(file, ann);
                this.discourse.clearSilently();
                this.refresh();
                new Notice(`${layer.jp}: 1 ${layer.primarySpanLabel ?? 'core'} + ${rest.length} ${layer.memberSpanLabel ?? 'member'}.`);
                return;
            }
            for (const r of sorted) {
                const ann: Annotation = {
                    id: newId(),
                    layer: layer.id,
                    anchor: RelationStore.buildAnchor(doc, r.from, r.to),
                    createdAt: Date.now(),
                };
                this.store.addAnnotation(file, ann);
            }
            this.discourse.clearSilently();
            this.refresh();
            new Notice(`Annotated ${sorted.length} span${sorted.length > 1 ? 's' : ''} as ${layer.jp}.`);
        });
    }

    /** Build an endpoint (anchor group) from the current marks. */
    private endpointFromMarks(): RelationEndpoint | null {
        const cm = this.discourse.getActiveCmView();
        if (!cm) return null;
        const ranges = this.discourse.getMarkedRanges();
        if (ranges.length === 0) return null;
        const doc = cm.state.doc.toString();
        const anchors: TextAnchor[] = ranges
            .slice()
            .sort((a, b) => a.from - b.from)
            .map(r => RelationStore.buildAnchor(doc, r.from, r.to));
        return { anchors };
    }

    // ── Deletion ─────────────────────────────────────────────

    deleteById(id: string): void {
        const file = this.activeFilePath();
        if (!file) return;
        if (this.store.remove(file, id)) {
            this.overlay.setSelected(null);
            this.refresh();
            new Notice('Relation deleted.');
        }
    }

    deleteTagById(id: string): void {
        const file = this.activeFilePath();
        if (!file) return;
        if (this.store.removeTag(file, id)) {
            this.overlay.setSelected(null);
            this.refresh();
            new Notice('Tag removed.');
        }
    }

    deleteAnnotationById(id: string): void {
        const file = this.activeFilePath();
        if (!file) return;
        if (this.store.removeAnnotation(file, id)) {
            this.overlay.setSelected(null);
            this.refresh();
            new Notice('Annotation removed.');
        }
    }

    deleteSelected(): void {
        const sel = this.overlay.getSelected();
        if (!sel) {
            new Notice('Tap a relation arc or a tagged span to select it first.');
            return;
        }
        this.onOverlayDelete(sel.kind, sel.id);
    }

    clearFile(): void {
        const file = this.activeFilePath();
        if (!file) return;
        const n = this.store.clearFile(file);
        this.overlay.setSelected(null);
        this.refresh();
        new Notice(n > 0 ? `Cleared ${n} item${n > 1 ? 's' : ''}.` : 'Nothing to clear in this note.');
    }

    private onOverlaySelect(kind: 'rel' | 'tag' | 'ann', id: string): void {
        const cur = this.overlay.getSelected();
        const same = cur && cur.kind === kind && cur.id === id;
        this.overlay.setSelected(same ? null : { kind, id });
    }

    private onOverlayDelete(kind: 'rel' | 'tag' | 'ann', id: string): void {
        if (kind === 'tag') this.deleteTagById(id);
        else if (kind === 'ann') this.deleteAnnotationById(id);
        else this.deleteById(id);
    }

    // ── Overlay sync ─────────────────────────────────────────

    /** Attach the overlay to the active editor and redraw. */
    attachAndRefresh(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const cm = view ? this.getCm(view) : null;
        if (!cm || !this.plugin.settings.showRelationOverlay) {
            this.overlay.detach();
            return;
        }
        this.overlay.attach(cm);
        this.refresh();
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer != null) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            this.refresh();
        }, 180);
    }

    /** Resolve all relations for the active file and hand them to the overlay. */
    refresh(): void {
        if (!this.plugin.settings.showRelationOverlay) {
            this.overlay.setRelations([]);
            this.overlay.setTags([]);
            this.overlay.setAnnotations([]);
            // Sidebar reads the store directly, so keep it live even with the
            // overlay hidden.
            this.notifyChange();
            return;
        }
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) {
            this.overlay.setRelations([]);
            this.overlay.setTags([]);
            this.overlay.setAnnotations([]);
            this.notifyChange();
            return;
        }
        const doc = cm.state.doc.toString();
        const types = this.allTypes();
        const resolved: ResolvedRelation[] = [];
        for (const rel of this.store.getForFile(file)) {
            const source = this.resolveEndpoint(doc, rel.source);
            const target = this.resolveEndpoint(doc, rel.target);
            if (source.length === 0 && target.length === 0) continue;
            resolved.push({
                id: rel.id,
                type: resolveRelationType(rel.type, types),
                label: rel.label,
                source,
                target,
            });
        }
        this.overlay.setRelations(resolved);

        const markerTypes = this.allMarkerTypes();
        const resolvedTags: ResolvedTag[] = [];
        for (const tag of this.store.getTagsForFile(file)) {
            const span = RelationStore.resolveAnchor(doc, tag.anchor);
            if (!span) continue;
            resolvedTags.push({
                id: tag.id,
                category: resolveMarkerType(tag.category, markerTypes),
                span,
            });
        }
        this.overlay.setTags(resolvedTags);

        const layerTypes = this.allLayerTypes();
        const resolvedAnns: ResolvedAnnotation[] = [];
        for (const ann of this.store.getAnnotationsForFile(file)) {
            const span = RelationStore.resolveAnchor(doc, ann.anchor);
            if (!span) continue;
            const members = (ann.members ?? [])
                .map(m => {
                    const s = RelationStore.resolveAnchor(doc, m.anchor);
                    return s ? { from: s.from, to: s.to, role: m.role } : null;
                })
                .filter((s): s is { from: number; to: number; role: SpanRole } => s != null);
            resolvedAnns.push({
                id: ann.id,
                layer: resolveLayerType(ann.layer, layerTypes),
                gloss: ann.gloss,
                span,
                primaryRole: ann.primaryRole,
                members,
            });
        }
        this.overlay.setAnnotations(resolvedAnns);
        this.notifyChange();
    }

    private resolveEndpoint(doc: string, ep: RelationEndpoint): Array<{ from: number; to: number }> {
        const spans: Array<{ from: number; to: number }> = [];
        for (const a of ep.anchors) {
            const span = RelationStore.resolveAnchor(doc, a);
            if (span) spans.push(span);
        }
        return spans;
    }

    // ── Type palette (mobile-friendly, keyboard-free) ────────

    private showTypePalette(
        onPick: (type: RelationType) => void,
        source?: RelationEndpoint,
        target?: RelationEndpoint,
    ): void {
        const types = this.allTypes();
        let suggested = -1;
        if (source && target) {
            const srcText = source.anchors.map(a => a.exact).join('');
            const tgtText = target.anchors.map(a => a.exact).join('');
            suggested = indexOfType(suggestRelationType(srcText, tgtText, types), types);
        }
        this.showPalette(
            '関係を選択 · pick relation type',
            types.map(t => ({ glyph: t.glyph, jp: t.jp, en: t.en, color: t.color })),
            (i) => onPick(types[i]),
            suggested,
        );
    }

    private showMarkerPalette(onPick: (cat: MarkerType) => void, suggestedId?: string | null): void {
        const cats = this.allMarkerTypes();
        this.showPalette(
            '記して保存 · pick discourse marker',
            cats.map(t => ({ glyph: t.glyph, jp: t.jp, en: t.en, color: t.color })),
            (i) => onPick(cats[i]),
            indexOfType(suggestedId ?? null, cats),
        );
    }

    private showLayerPalette(onPick: (layer: LayerType) => void): void {
        this.showPalette(
            '層を選択 · pick annotation layer',
            this.allLayerTypes().map(t => ({ glyph: t.glyph, jp: t.jp, en: t.en, color: t.color })),
            (i) => onPick(this.allLayerTypes()[i]),
        );
    }

    private showPalette(
        title: string,
        items: Array<{ glyph: string; jp: string; en: string; color: string }>,
        onPick: (index: number) => void,
        suggestedIndex = -1,
    ): void {
        this.closePalette();
        const backdrop = document.createElement('div');
        backdrop.className = 'jp-rel-palette-backdrop';
        // Only dismiss when the tap lands on the backdrop itself — NOT when it
        // bubbles up from a chip (otherwise the palette closes before the chip's
        // touchend can fire the pick, which breaks selection on touch devices).
        const onCancel = (e: Event) => {
            if (e.target !== backdrop) return;
            e.preventDefault();
            e.stopPropagation();
            this.closePalette();
        };
        backdrop.addEventListener('touchstart', onCancel, { passive: false });
        backdrop.addEventListener('mousedown', onCancel);

        const wrap = document.createElement('div');
        wrap.className = 'jp-rel-palette';
        const titleEl = document.createElement('div');
        titleEl.className = 'jp-rel-palette-title';
        titleEl.textContent = title;
        wrap.appendChild(titleEl);

        const grid = document.createElement('div');
        grid.className = 'jp-rel-palette-grid';
        items.forEach((item, i) => {
            const chip = document.createElement('button');
            chip.className = 'jp-rel-chip-btn';
            if (i === suggestedIndex) chip.classList.add('is-suggested');
            chip.style.setProperty('--rel-color', item.color);
            chip.setAttribute('aria-label', item.en);
            const g = document.createElement('span');
            g.className = 'jp-rel-chip-glyph';
            g.textContent = item.glyph;
            const lbl = document.createElement('span');
            lbl.className = 'jp-rel-chip-label';
            lbl.textContent = item.jp;
            chip.appendChild(g);
            chip.appendChild(lbl);
            if (i === suggestedIndex) {
                const star = document.createElement('span');
                star.className = 'jp-rel-chip-suggest';
                star.textContent = '\u2726'; // ✦
                star.setAttribute('aria-label', 'suggested');
                chip.appendChild(star);
            }
            const fire = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                this.closePalette();
                onPick(i);
            };
            chip.addEventListener('touchend', fire, { passive: false });
            chip.addEventListener('click', fire);
            grid.appendChild(chip);
        });
        wrap.appendChild(grid);

        backdrop.appendChild(wrap);
        document.body.appendChild(backdrop);
        this.paletteEl = backdrop;
    }

    private closePalette(): void {
        if (this.paletteEl) {
            this.paletteEl.remove();
            this.paletteEl = null;
        }
    }

    // ── Sidebar API (annotations list view) ──────────────────

    /** All layer annotations in the active file, resolved to current spans + text. */
    getResolvedAnnotationsForActive(): Array<{
        id: string; layer: LayerType; gloss?: string; note?: string;
        fields?: Record<string, string>;
        span: { from: number; to: number }; text: string;
        primaryRole?: SpanRole;
        members: Array<{ from: number; to: number; text: string; role: SpanRole }>;
    }> {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return [];
        const doc = cm.state.doc.toString();
        const layers = this.allLayerTypes();
        const out: Array<{
            id: string; layer: LayerType; gloss?: string; note?: string;
            fields?: Record<string, string>;
            span: { from: number; to: number }; text: string;
            primaryRole?: SpanRole;
            members: Array<{ from: number; to: number; text: string; role: SpanRole }>;
        }> = [];
        for (const ann of this.store.getAnnotationsForFile(file)) {
            const span = RelationStore.resolveAnchor(doc, ann.anchor);
            if (!span) continue;
            const members = (ann.members ?? [])
                .map(m => {
                    const s = RelationStore.resolveAnchor(doc, m.anchor);
                    return s ? { from: s.from, to: s.to, text: doc.slice(s.from, s.to), role: m.role } : null;
                })
                .filter((s): s is { from: number; to: number; text: string; role: SpanRole } => s != null);
            out.push({
                id: ann.id,
                layer: resolveLayerType(ann.layer, layers),
                gloss: ann.gloss,
                note: ann.note,
                fields: ann.fields,
                span,
                text: doc.slice(span.from, span.to),
                primaryRole: ann.primaryRole,
                members,
            });
        }
        return out.sort((a, b) => a.span.from - b.span.from);
    }

    /** Reveal + select an annotation's primary span in the editor (sidebar jump-to). */
    revealAnnotation(id: string): void {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return;
        const ann = this.store.getAnnotationsForFile(file).find(a => a.id === id);
        if (!ann) return;
        const doc = cm.state.doc.toString();
        const span = RelationStore.resolveAnchor(doc, ann.anchor);
        if (!span) return;
        cm.dispatch({ selection: { anchor: span.from, head: span.to }, scrollIntoView: true });
        this.overlay.setSelected({ kind: 'ann', id });
    }

    /** Reveal a member (envelope / lattice) span of a multi-span annotation. */
    revealAnnotationMember(id: string, memberIndex: number): void {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return;
        const ann = this.store.getAnnotationsForFile(file).find(a => a.id === id);
        if (!ann?.members || memberIndex < 0 || memberIndex >= ann.members.length) return;
        const doc = cm.state.doc.toString();
        const span = RelationStore.resolveAnchor(doc, ann.members[memberIndex].anchor);
        if (!span) return;
        cm.dispatch({ selection: { anchor: span.from, head: span.to }, scrollIntoView: true });
        this.overlay.setSelected({ kind: 'ann', id });
    }

    /**
     * Cycle the role of a span forward through its layer's role vocabulary
     * (the fast, mobile, no-modal gesture invoked by tapping a span chip on the
     * overlay). `memberIndex < 0` cycles the PRIMARY span's role.
     */
    cycleSpanRole(id: string, memberIndex: number): void {
        const file = this.activeFilePath();
        if (!file) return;
        const ann = this.store.getAnnotationsForFile(file).find(a => a.id === id);
        if (!ann) return;
        const layer = resolveLayerType(ann.layer, this.allLayerTypes());
        if (!layer.roleVocab || layer.roleVocab.length === 0) return;
        if (memberIndex < 0) {
            const next = nextSpanRole(ann.primaryRole ?? primaryRoleOf(layer), layer);
            if (this.store.setPrimaryRole(file, id, next)) {
                this.refresh();
                new Notice(`${layer.glyph} primary → ${spanRoleSpec(next).en}`);
            }
        } else {
            if (!ann.members || memberIndex >= ann.members.length) return;
            const next = nextSpanRole(ann.members[memberIndex].role, layer);
            if (this.store.setMemberRole(file, id, memberIndex, next)) {
                this.refresh();
                new Notice(`${layer.glyph} span → ${spanRoleSpec(next).en}`);
            }
        }
    }

    /** Explicitly set a span's role (used by the modal's role dropdowns). */
    setSpanRole(id: string, memberIndex: number, role: SpanRole): void {
        const file = this.activeFilePath();
        if (!file) return;
        const ok = memberIndex < 0
            ? this.store.setPrimaryRole(file, id, role)
            : this.store.setMemberRole(file, id, memberIndex, role);
        if (ok) this.refresh();
    }

    /** Reassign which span is the focal core / hub (promote a member to primary). */
    promoteAnnotationMember(id: string, memberIndex: number): void {
        const file = this.activeFilePath();
        if (!file) return;
        if (this.store.promoteAnnotationMember(file, id, memberIndex)) this.refresh();
    }

    /** Remove a member (envelope / lattice) span from a multi-span annotation. */
    removeAnnotationMember(id: string, memberIndex: number): void {
        const file = this.activeFilePath();
        if (!file) return;
        if (this.store.removeAnnotationMember(file, id, memberIndex)) this.refresh();
    }

    /** All relations in the active file, resolved to source/target spans + text. */
    getResolvedRelationsForActive(): Array<{
        id: string; type: RelationType; label?: string;
        source: { from: number; to: number } | null; sourceText: string;
        target: { from: number; to: number } | null; targetText: string;
    }> {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return [];
        const doc = cm.state.doc.toString();
        const types = this.allTypes();
        const out: Array<{
            id: string; type: RelationType; label?: string;
            source: { from: number; to: number } | null; sourceText: string;
            target: { from: number; to: number } | null; targetText: string;
        }> = [];
        for (const rel of this.store.getForFile(file)) {
            const src = this.resolveEndpoint(doc, rel.source);
            const tgt = this.resolveEndpoint(doc, rel.target);
            if (src.length === 0 && tgt.length === 0) continue;
            const srcHull = src.length ? { from: src[0].from, to: src[src.length - 1].to } : null;
            const tgtHull = tgt.length ? { from: tgt[0].from, to: tgt[tgt.length - 1].to } : null;
            out.push({
                id: rel.id,
                type: resolveRelationType(rel.type, types),
                label: rel.label,
                source: srcHull,
                sourceText: srcHull ? doc.slice(srcHull.from, srcHull.to) : '',
                target: tgtHull,
                targetText: tgtHull ? doc.slice(tgtHull.from, tgtHull.to) : '',
            });
        }
        return out.sort((a, b) => (a.source?.from ?? a.target?.from ?? 0) - (b.source?.from ?? b.target?.from ?? 0));
    }

    /** All span tags in the active file, resolved to current spans + text. */
    getResolvedTagsForActive(): Array<{
        id: string; category: MarkerType; span: { from: number; to: number }; text: string;
    }> {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return [];
        const doc = cm.state.doc.toString();
        const cats = this.allMarkerTypes();
        const out: Array<{ id: string; category: MarkerType; span: { from: number; to: number }; text: string }> = [];
        for (const tag of this.store.getTagsForFile(file)) {
            const span = RelationStore.resolveAnchor(doc, tag.anchor);
            if (!span) continue;
            out.push({
                id: tag.id,
                category: resolveMarkerType(tag.category, cats),
                span,
                text: doc.slice(span.from, span.to),
            });
        }
        return out.sort((a, b) => a.span.from - b.span.from);
    }

    /** Reveal + select a relation's source span in the editor (sidebar jump-to). */
    revealRelation(id: string): void {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return;
        const rel = this.store.getForFile(file).find(r => r.id === id);
        if (!rel) return;
        const doc = cm.state.doc.toString();
        const src = this.resolveEndpoint(doc, rel.source);
        const target = src.length ? src : this.resolveEndpoint(doc, rel.target);
        if (target.length === 0) return;
        const from = target[0].from;
        const to = target[target.length - 1].to;
        cm.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
        this.overlay.setSelected({ kind: 'rel', id });
    }

    /** Reveal + select a tagged span in the editor (sidebar jump-to). */
    revealTag(id: string): void {
        const cm = this.discourse.getActiveCmView();
        const file = this.activeFilePath();
        if (!cm || !file) return;
        const tag = this.store.getTagsForFile(file).find(t => t.id === id);
        if (!tag) return;
        const doc = cm.state.doc.toString();
        const span = RelationStore.resolveAnchor(doc, tag.anchor);
        if (!span) return;
        cm.dispatch({ selection: { anchor: span.from, head: span.to }, scrollIntoView: true });
        this.overlay.setSelected({ kind: 'tag', id });
    }

    editAnnotation(
        id: string,
        patch: { gloss?: string; note?: string; layer?: string; fields?: Record<string, string> },
    ): void {
        const file = this.activeFilePath();
        if (!file) return;
        if (this.store.updateAnnotation(file, id, patch)) this.refresh();
    }

    /** Open the structured per-layer editor modal for an annotation. */
    openAnnotationEditor(id: string): void {
        const ann = this.getResolvedAnnotationsForActive().find(a => a.id === id);
        if (!ann) {
            new Notice('Annotation not found in the active note.');
            return;
        }
        new AnnotationEditModal(this.plugin.app, this, id).open();
    }

    /** The full layer taxonomy (for the sidebar legend / filters). */
    layerTypes(): LayerType[] {
        return this.allLayerTypes();
    }

    /** Subscribe to data changes (sidebar list view). Returns an unsubscribe fn. */
    onChange(cb: () => void): () => void {
        this.changeListeners.push(cb);
        return () => {
            this.changeListeners = this.changeListeners.filter(l => l !== cb);
        };
    }

    private notifyChange(): void {
        for (const cb of this.changeListeners) {
            try { cb(); } catch { /* a listener throwing must not break the redraw */ }
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    private activeFilePath(): string | null {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        return view?.file?.path ?? null;
    }

    private getCm(view: MarkdownView) {
        return (view.editor as unknown as { cm?: import('@codemirror/view').EditorView }).cm ?? null;
    }
}
