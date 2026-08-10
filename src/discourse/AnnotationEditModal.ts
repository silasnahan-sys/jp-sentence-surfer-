import { App, Modal, Setting, Notice } from 'obsidian';
import type { RelationController } from './RelationController';
import { SPAN_ROLE_SPECS, renderSpanNotation, spanRoleSpec, primaryRoleOf, type SpanRole } from './LayerTypes';

/**
 * AnnotationEditModal — the structured per-layer editor for a single annotation.
 *
 * The form adapts to the annotation's current layer: switching the layer in the
 * dropdown re-renders the field section with that layer's structured fields
 * (collocation → pattern; rhetorical-collocation → focal core + envelope + image
 * gloss; rhetorical-construction → function + hub + slots; serifu → speaker +
 * register; discourse → discourse function). Every layer also has a shared gloss
 * and a freeform note.
 *
 * Edits are written through the controller as they happen, so the overlay and
 * the sidebar list stay live.
 */
export class AnnotationEditModal extends Modal {
    private ctrl: RelationController;
    private annId: string;

    constructor(app: App, ctrl: RelationController, annId: string) {
        super(app);
        this.ctrl = ctrl;
        this.annId = annId;
    }

    onOpen(): void {
        this.modalEl.addClass('jp-ann-modal');
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private current() {
        return this.ctrl.getResolvedAnnotationsForActive().find(a => a.id === this.annId) ?? null;
    }

    private render(): void {
        const { contentEl, titleEl } = this;
        contentEl.empty();

        const ann = this.current();
        if (!ann) {
            titleEl.setText('Annotation');
            contentEl.createDiv({ cls: 'jp-ann-modal-empty', text: 'This annotation is no longer in the active note.' });
            new Setting(contentEl).addButton(b => b.setButtonText('Close').onClick(() => this.close()));
            return;
        }

        const layers = this.ctrl.layerTypes();
        const layer = ann.layer;

        titleEl.setText(`${layer.glyph} ${layer.jp} · ${layer.en}`);
        titleEl.style.color = layer.color;

        // The annotated text, read-only, with a jump-to.
        const quote = contentEl.createDiv({ cls: 'jp-ann-modal-quote' });
        quote.style.setProperty('--layer-color', layer.color);
        quote.setText(ann.text || '(span lost)');
        quote.setAttr('aria-label', 'Reveal in editor');
        quote.onclick = () => { this.ctrl.revealAnnotation(this.annId); };

        // Layer switcher.
        new Setting(contentEl)
            .setName('Layer')
            .setDesc(layer.hint)
            .addDropdown(dd => {
                for (const l of layers) dd.addOption(l.id, `${l.glyph} ${l.jp} · ${l.en}`);
                dd.setValue(layer.id);
                dd.onChange((value) => {
                    this.ctrl.editAnnotation(this.annId, { layer: value });
                    this.render(); // fields differ per layer
                });
            });

        // Multi-span members (the lifted pattern). Each span shows its role
        // notation ([headword] (collocate) {slot} ❮hub❯ frame), a role dropdown,
        // jump-to, ☆ promote-to-primary, and ✕ remove. The primary span is first.
        if (layer.multiSpan || ann.members.length > 0) {
            const primaryLabel = layer.primarySpanLabel ?? 'primary';
            const vocab = layer.roleVocab ?? [];
            contentEl.createEl('div', {
                cls: 'jp-ann-modal-section',
                text: `Spans · lifted pattern`,
            });

            // Live preview of the whole lifted pattern (spans in document order).
            const preview = this.liftedPattern(ann);
            if (preview) {
                const pv = contentEl.createDiv({ cls: 'jp-ann-pattern' });
                pv.style.setProperty('--layer-color', layer.color);
                pv.setText(preview);
            }

            const roleDropdown = (row: HTMLElement, current: SpanRole | undefined, onPick: (r: SpanRole) => void) => {
                if (vocab.length === 0) return;
                const sel = row.createEl('select', { cls: 'jp-ann-member-role-sel' });
                for (const rid of vocab) {
                    const spec = SPAN_ROLE_SPECS[rid];
                    const opt = sel.createEl('option', { value: rid, text: `${spec.open || '·'}${spec.jp}${spec.close || ''}` });
                    if (rid === current) opt.selected = true;
                }
                sel.onchange = () => onPick(sel.value as SpanRole);
            };

            // Primary (headword / hub) row.
            const primaryRole = ann.primaryRole ?? primaryRoleOf(layer);
            const primaryRow = contentEl.createDiv({ cls: 'jp-ann-member jp-ann-member--primary' });
            primaryRow.style.setProperty('--layer-color', layer.color);
            primaryRow.createSpan({ cls: 'jp-ann-member-role', text: primaryLabel });
            const pText = primaryRow.createSpan({
                cls: 'jp-ann-member-text',
                text: renderSpanNotation(ann.text || '(span lost)', primaryRole),
            });
            pText.onclick = () => this.ctrl.revealAnnotation(this.annId);
            roleDropdown(primaryRow, primaryRole, (r) => { this.ctrl.setSpanRole(this.annId, -1, r); this.render(); });

            ann.members.forEach((m, i) => {
                const row = contentEl.createDiv({ cls: 'jp-ann-member' });
                row.style.setProperty('--layer-color', layer.color);
                const spec = spanRoleSpec(m.role);
                row.createSpan({ cls: 'jp-ann-member-role', text: spec.jp });
                const mText = row.createSpan({
                    cls: 'jp-ann-member-text',
                    text: renderSpanNotation(m.text || '(span lost)', m.role),
                });
                if (spec.dim) mText.addClass('is-dim');
                mText.onclick = () => this.ctrl.revealAnnotationMember(this.annId, i);

                roleDropdown(row, m.role, (r) => { this.ctrl.setSpanRole(this.annId, i, r); this.render(); });

                const promote = row.createEl('button', { cls: 'jp-ann-member-btn', text: '\u2606' });
                promote.setAttr('aria-label', `Make this the ${primaryLabel}`);
                promote.onclick = () => { this.ctrl.promoteAnnotationMember(this.annId, i); this.render(); };

                const rm = row.createEl('button', { cls: 'jp-ann-member-btn', text: '\u00d7' });
                rm.setAttr('aria-label', 'Remove this span');
                rm.onclick = () => { this.ctrl.removeAnnotationMember(this.annId, i); this.render(); };
            });

            if (layer.multiSpan && ann.members.length === 0) {
                contentEl.createDiv({
                    cls: 'jp-ann-modal-empty',
                    text: `Tip: in the picker, mark the ${primaryLabel} plus its partner / slot / frame spans together, then pick this layer to group them. Tap a span on the page to cycle its role.`,
                });
            }
        }

        // Layer-specific structured fields.
        const fields = layer.fields ?? [];
        if (fields.length > 0) {
            contentEl.createEl('div', { cls: 'jp-ann-modal-section', text: 'Structured fields' });
            for (const spec of fields) {
                const value = ann.fields?.[spec.key] ?? '';
                const setting = new Setting(contentEl)
                    .setName(`${spec.jp} · ${spec.en}`);
                const apply = (v: string) => this.ctrl.editAnnotation(this.annId, { fields: { [spec.key]: v } });
                if (spec.multiline) {
                    setting.addTextArea(t => {
                        t.setPlaceholder(spec.placeholder ?? '').setValue(value);
                        t.onChange(apply);
                    });
                } else {
                    setting.addText(t => {
                        t.setPlaceholder(spec.placeholder ?? '').setValue(value);
                        t.onChange(apply);
                    });
                }
            }
        }

        // Shared gloss + note.
        contentEl.createEl('div', { cls: 'jp-ann-modal-section', text: 'General' });
        new Setting(contentEl)
            .setName('語釈 · Gloss')
            .setDesc('Short reading / translation shown on the card.')
            .addText(t => {
                t.setPlaceholder('gloss').setValue(ann.gloss ?? '');
                t.onChange(v => this.ctrl.editAnnotation(this.annId, { gloss: v }));
            });
        new Setting(contentEl)
            .setName('備考 · Note')
            .setDesc('Freeform notes / context indicators.')
            .addTextArea(t => {
                t.setPlaceholder('note').setValue(ann.note ?? '');
                t.onChange(v => this.ctrl.editAnnotation(this.annId, { note: v }));
            });

        // Actions.
        new Setting(contentEl)
            .addButton(b => b
                .setButtonText('Reveal in editor')
                .onClick(() => { this.ctrl.revealAnnotation(this.annId); }))
            .addButton(b => b
                .setButtonText('Delete')
                .setWarning()
                .onClick(() => {
                    this.ctrl.deleteAnnotationById(this.annId);
                    new Notice('Annotation removed.');
                    this.close();
                }))
            .addButton(b => b
                .setButtonText('Done')
                .setCta()
                .onClick(() => this.close()));
    }

    /**
     * Assemble the lifted Eijiro-style pattern: every span (primary + members)
     * in document order, each wrapped in its role notation, joined by middle
     * dots. e.g. [紙幅] を (かなり) 費やす, or {本} は … with frame dimmed.
     */
    private liftedPattern(ann: NonNullable<ReturnType<RelationController['getResolvedAnnotationsForActive']>[number]>): string {
        const parts: Array<{ from: number; text: string }> = [
            { from: ann.span.from, text: renderSpanNotation(ann.text, ann.primaryRole) },
            ...ann.members.map(m => ({ from: m.from, text: renderSpanNotation(m.text, m.role) })),
        ];
        parts.sort((a, b) => a.from - b.from);
        return parts.map(p => p.text).join(' \u00b7 ');
    }
}
