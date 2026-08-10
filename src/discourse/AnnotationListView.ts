import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type JpSentenceSurferPlugin from '../main';
import { LayerType, renderSpanNotation } from './LayerTypes';

export const ANNOTATION_LIST_VIEW = 'jp-surfer-annotation-list';

/**
 * AnnotationListView — a sidebar list of every layer annotation in the active
 * note, grouped by layer (serifu / collocation / rhetorical-collocation /
 * rhetorical-construction / discourse), each in its layer colour.
 *
 * Tap a row → reveal + select its span in the editor (jump-to).
 * Each row has an inline gloss field and a ✕ to delete.
 * A legend across the top doubles as a layer filter.
 *
 * The view subscribes to RelationController change events and re-renders, so it
 * stays in sync as you annotate from the picker / commands.
 */
export class AnnotationListView extends ItemView {
    private plugin: JpSentenceSurferPlugin;
    private unsubscribe: (() => void) | null = null;
    /** When non-empty, only these layer ids are shown. */
    private filter: Set<string> = new Set();

    constructor(leaf: WorkspaceLeaf, plugin: JpSentenceSurferPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return ANNOTATION_LIST_VIEW;
    }

    getDisplayText(): string {
        return 'Annotations';
    }

    getIcon(): string {
        return 'highlighter';
    }

    async onOpen(): Promise<void> {
        this.unsubscribe = this.plugin.relations?.onChange(() => this.render()) ?? null;
        // Re-render when the active note changes.
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.render()));
        this.registerEvent(this.app.workspace.on('file-open', () => this.render()));
        this.render();
    }

    async onClose(): Promise<void> {
        if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    }

    /** Public so a command / data change can force a refresh. */
    render(): void {
        const root = this.contentEl;
        root.empty();
        root.addClass('jp-ann-list');

        const ctrl = this.plugin.relations;
        if (!ctrl) {
            root.createDiv({ cls: 'jp-ann-empty', text: 'Annotation engine not ready.' });
            return;
        }

        const layers = ctrl.layerTypes();
        const anns = ctrl.getResolvedAnnotationsForActive();
        const rels = ctrl.getResolvedRelationsForActive();
        const tags = ctrl.getResolvedTagsForActive();

        this.renderLegend(root, layers, anns);

        if (anns.length === 0 && rels.length === 0 && tags.length === 0) {
            root.createDiv({
                cls: 'jp-ann-empty',
                text: 'No annotations in this note yet. Use the picker (層) or the "Annotate marked spans" command.',
            });
            return;
        }

        const visible = this.filter.size === 0
            ? anns
            : anns.filter(a => this.filter.has(a.layer.id));

        // Group by layer, preserving the big-5 order.
        for (const layer of layers) {
            const group = visible.filter(a => a.layer.id === layer.id);
            if (group.length === 0) continue;
            this.renderGroup(root, layer, group, ctrl);
        }

        this.renderRelations(root, rels, ctrl);
        this.renderTags(root, tags, ctrl);
    }

    private renderLegend(
        root: HTMLElement,
        layers: LayerType[],
        anns: ReturnType<NonNullable<JpSentenceSurferPlugin['relations']>['getResolvedAnnotationsForActive']>,
    ): void {
        const legend = root.createDiv({ cls: 'jp-ann-legend' });
        for (const layer of layers) {
            const count = anns.filter(a => a.layer.id === layer.id).length;
            if (count === 0 && layer.custom) continue;
            const chip = legend.createDiv({ cls: 'jp-ann-legend-chip' });
            if (this.filter.has(layer.id)) chip.addClass('is-active');
            chip.style.setProperty('--layer-color', layer.color);
            chip.createSpan({ cls: 'jp-ann-legend-glyph', text: layer.glyph });
            chip.createSpan({ cls: 'jp-ann-legend-label', text: layer.jp });
            chip.createSpan({ cls: 'jp-ann-legend-count', text: String(count) });
            chip.setAttr('aria-label', layer.hint);
            chip.onclick = () => {
                if (this.filter.has(layer.id)) this.filter.delete(layer.id);
                else this.filter.add(layer.id);
                this.render();
            };
        }
    }

    private renderGroup(
        root: HTMLElement,
        layer: LayerType,
        group: ReturnType<NonNullable<JpSentenceSurferPlugin['relations']>['getResolvedAnnotationsForActive']>,
        ctrl: NonNullable<JpSentenceSurferPlugin['relations']>,
    ): void {
        const section = root.createDiv({ cls: 'jp-ann-group' });
        section.style.setProperty('--layer-color', layer.color);
        const head = section.createDiv({ cls: 'jp-ann-group-head' });
        head.createSpan({ cls: 'jp-ann-group-glyph', text: layer.glyph });
        head.createSpan({ cls: 'jp-ann-group-title', text: `${layer.jp} · ${layer.en}` });
        head.createSpan({ cls: 'jp-ann-group-count', text: String(group.length) });

        for (const a of group) {
            const card = section.createDiv({ cls: 'jp-ann-card' });
            card.style.setProperty('--layer-color', layer.color);

            const textRow = card.createDiv({ cls: 'jp-ann-card-text' });
            // For multi-span layers show the lifted pattern (spans in document
            // order, each in its role notation); otherwise the plain span text.
            if (a.members.length > 0) {
                const parts = [
                    { from: a.span.from, text: renderSpanNotation(a.text, a.primaryRole) },
                    ...a.members.map(m => ({ from: m.from, text: renderSpanNotation(m.text, m.role) })),
                ].sort((x, y) => x.from - y.from);
                textRow.setText(parts.map(p => p.text).join(' \u00b7 '));
                textRow.addClass('jp-ann-card-text--pattern');
            } else {
                textRow.setText(a.text || '(span lost)');
            }
            textRow.onclick = () => ctrl.revealAnnotation(a.id);

            // Subtitle: the layer's "primary" structured field, if filled.
            const primaryKey = layer.fields?.find(f => f.primary)?.key;
            const primaryVal = primaryKey ? a.fields?.[primaryKey] : undefined;
            if (primaryVal) {
                const sub = card.createDiv({ cls: 'jp-ann-card-sub' });
                sub.setText(primaryVal);
            }

            // Member-span count badge for multi-span layers (envelope / lattice).
            if (a.members.length > 0) {
                const badge = card.createDiv({ cls: 'jp-ann-card-members' });
                const word = layer.memberSpanLabel?.split(' · ')[1] ?? 'spans';
                badge.setText(`+${a.members.length} ${word}`);
            }

            const glossInput = card.createEl('input', {
                cls: 'jp-ann-card-gloss',
                attr: { type: 'text', placeholder: 'gloss / note…', value: a.gloss ?? '' },
            });
            glossInput.addEventListener('change', () => {
                ctrl.editAnnotation(a.id, { gloss: glossInput.value });
            });

            const actions = card.createDiv({ cls: 'jp-ann-card-actions' });
            const edit = actions.createEl('button', { cls: 'jp-ann-card-edit', text: '\u270e' });
            edit.setAttr('aria-label', 'Edit structured fields');
            edit.onclick = (e) => {
                e.stopPropagation();
                ctrl.openAnnotationEditor(a.id);
            };

            const del = actions.createEl('button', { cls: 'jp-ann-card-del', text: '\u00d7' });
            del.setAttr('aria-label', 'Delete annotation');
            del.onclick = (e) => {
                e.stopPropagation();
                ctrl.deleteAnnotationById(a.id);
                new Notice('Annotation removed.');
            };
        }
    }

    private renderRelations(
        root: HTMLElement,
        rels: ReturnType<NonNullable<JpSentenceSurferPlugin['relations']>['getResolvedRelationsForActive']>,
        ctrl: NonNullable<JpSentenceSurferPlugin['relations']>,
    ): void {
        if (rels.length === 0) return;
        const section = root.createDiv({ cls: 'jp-ann-group jp-rel-section' });
        const head = section.createDiv({ cls: 'jp-ann-group-head' });
        head.createSpan({ cls: 'jp-ann-group-glyph', text: '\u21c4' }); // ⇄
        head.createSpan({ cls: 'jp-ann-group-title', text: '関係 · Relations' });
        head.createSpan({ cls: 'jp-ann-group-count', text: String(rels.length) });

        for (const r of rels) {
            const card = section.createDiv({ cls: 'jp-ann-card jp-rel-card' });
            card.style.setProperty('--layer-color', r.type.color);

            const chip = card.createDiv({ cls: 'jp-rel-row-chip' });
            chip.style.setProperty('--layer-color', r.type.color);
            chip.createSpan({ cls: 'jp-rel-row-glyph', text: r.type.glyph });
            chip.createSpan({ cls: 'jp-rel-row-type', text: r.type.jp });

            const textRow = card.createDiv({ cls: 'jp-ann-card-text jp-rel-row-text' });
            const srcText = r.sourceText || '(lost)';
            const tgtText = r.targetText || '(lost)';
            textRow.createSpan({ cls: 'jp-rel-row-src', text: srcText });
            textRow.createSpan({ cls: 'jp-rel-row-arrow', text: ' \u2192 ' });
            textRow.createSpan({ cls: 'jp-rel-row-tgt', text: tgtText });
            textRow.onclick = () => ctrl.revealRelation(r.id);

            if (r.label) card.createDiv({ cls: 'jp-ann-card-sub', text: r.label });

            const actions = card.createDiv({ cls: 'jp-ann-card-actions' });
            const del = actions.createEl('button', { cls: 'jp-ann-card-del', text: '\u00d7' });
            del.setAttr('aria-label', 'Delete relation');
            del.onclick = (e) => {
                e.stopPropagation();
                ctrl.deleteById(r.id);
            };
        }
    }

    private renderTags(
        root: HTMLElement,
        tags: ReturnType<NonNullable<JpSentenceSurferPlugin['relations']>['getResolvedTagsForActive']>,
        ctrl: NonNullable<JpSentenceSurferPlugin['relations']>,
    ): void {
        if (tags.length === 0) return;
        const section = root.createDiv({ cls: 'jp-ann-group jp-tag-section' });
        const head = section.createDiv({ cls: 'jp-ann-group-head' });
        head.createSpan({ cls: 'jp-ann-group-glyph', text: '\u6a19' }); // 標
        head.createSpan({ cls: 'jp-ann-group-title', text: '標識 · Markers' });
        head.createSpan({ cls: 'jp-ann-group-count', text: String(tags.length) });

        for (const t of tags) {
            const card = section.createDiv({ cls: 'jp-ann-card jp-tag-card' });
            card.style.setProperty('--layer-color', t.category.color);

            const chip = card.createDiv({ cls: 'jp-rel-row-chip' });
            chip.style.setProperty('--layer-color', t.category.color);
            chip.createSpan({ cls: 'jp-rel-row-glyph', text: t.category.glyph });
            chip.createSpan({ cls: 'jp-rel-row-type', text: t.category.jp });

            const textRow = card.createDiv({ cls: 'jp-ann-card-text' });
            textRow.setText(t.text || '(span lost)');
            textRow.onclick = () => ctrl.revealTag(t.id);

            const actions = card.createDiv({ cls: 'jp-ann-card-actions' });
            const del = actions.createEl('button', { cls: 'jp-ann-card-del', text: '\u00d7' });
            del.setAttr('aria-label', 'Delete marker');
            del.onclick = (e) => {
                e.stopPropagation();
                ctrl.deleteTagById(t.id);
            };
        }
    }
}
