import type JpSentenceSurferPlugin from '../main';
import type { SpanRole } from './LayerTypes';

/**
 * RelationStore — persistence for discourse relations.
 *
 * DESIGN GOALS
 *   • Keep the note markdown 100% clean. No inline relation syntax leaks into
 *     the text, so the existing cloze / Anki pipeline is never polluted. All
 *     relation data lives in ONE sidecar JSON file in the plugin folder.
 *   • Survive edits. Endpoints are stored as W3C-style TEXT-QUOTE ANCHORS
 *     (exact substring + surrounding prefix/suffix context + an occurrence
 *     index fallback) rather than raw offsets, so a relation re-resolves to the
 *     right span even after the surrounding text is edited, re-timestamped, or
 *     re-ordered.
 *   • Key by file path. Relations for `Daily/2026-06-11.md` are stored under
 *     that path; opening the note re-resolves and renders them.
 */

/** A robust, edit-surviving locator for one contiguous span of text. */
export interface TextAnchor {
    /** The exact text of the span. */
    exact: string;
    /** Up to CONTEXT chars immediately before the span. */
    prefix: string;
    /** Up to CONTEXT chars immediately after the span. */
    suffix: string;
    /** 0-based index of `exact` among all its occurrences (fallback locator). */
    occurrence: number;
}

/** One side of a relation: one or more spans grouped together. */
export interface RelationEndpoint {
    anchors: TextAnchor[];
}

export interface Relation {
    id: string;
    /** RelationType id ('reason' … or 'custom:<slug>'). */
    type: string;
    /** Optional freeform note shown on the arc / in details. */
    label?: string;
    source: RelationEndpoint;
    target: RelationEndpoint;
    createdAt: number;
}

/** A single span tagged as a kind of discourse marker (filler / connective …). */
export interface SpanTag {
    id: string;
    /** MarkerType id ('filler' … or 'marker:<slug>'). */
    category: string;
    anchor: TextAnchor;
    createdAt: number;
}

/**
 * One extra anchored span of a multi-span annotation, tagged with the ROLE it
 * plays in the lifted pattern (collocate / slot / frame / context / anchor).
 * The primary `Annotation.anchor` carries `Annotation.primaryRole` (headword /
 * hub by default).
 */
export interface AnnotationMember {
    anchor: TextAnchor;
    role: SpanRole;
}

/**
 * A span annotated as one of the FIVE top-level layers (serifu / collocation /
 * rhetorical-collocation / rhetorical-construction / discourse). Minimal model:
 * one span + an optional gloss + a freeform note. Layer-specific structured
 * fields (focal core + envelope, anchor lattice, …) are enriched in a later pass.
 */
export interface Annotation {
    id: string;
    /** LayerType id ('serifu' … or 'layer:<slug>'). */
    layer: string;
    anchor: TextAnchor;
    /** Role of the primary `anchor` in a multi-span layer (headword / hub). */
    primaryRole?: SpanRole;
    /** Short gloss / reading shown on the sidebar card. */
    gloss?: string;
    /** Freeform note ("context indicators"). */
    note?: string;
    /** Layer-specific structured fields (keyed by LayerFieldSpec.key). */
    fields?: Record<string, string>;
    /**
     * Extra anchored spans beyond the primary `anchor`, each tagged with its role
     * in the lifted pattern. Used by inherently discontinuous layers: the scenic
     * collocate / slot / frame spans (rhetorical collocation) or the anchor
     * lattice (rhetorical construction). The primary `anchor` is the headword /
     * hub; these are the partner / lattice / frame spans.
     */
    members?: AnnotationMember[];
    createdAt: number;
}

interface StoreFile {
    version: number;
    files: Record<string, Relation[]>;
    tags?: Record<string, SpanTag[]>;
    annotations?: Record<string, Annotation[]>;
}

const CONTEXT = 24;
const STORE_VERSION = 1;

export class RelationStore {
    private plugin: JpSentenceSurferPlugin;
    private data: StoreFile = { version: STORE_VERSION, files: {} };
    private loaded = false;
    private saveTimer: number | null = null;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
    }

    private get path(): string {
        const cfg = this.plugin.app.vault.configDir;
        return `${cfg}/plugins/${this.plugin.manifest.id}/relations.json`;
    }

    // ── Load / save ──────────────────────────────────────────

    async load(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        try {
            const adapter = this.plugin.app.vault.adapter;
            if (await adapter.exists(this.path)) {
                const raw = await adapter.read(this.path);
                const parsed = JSON.parse(raw) as StoreFile;
                if (parsed && typeof parsed === 'object' && parsed.files) {
                    this.data = {
                        version: parsed.version ?? STORE_VERSION,
                        files: parsed.files,
                        tags: parsed.tags ?? {},
                        annotations: parsed.annotations ?? {},
                    };
                }
            }
        } catch {
            // Corrupt or unreadable sidecar — start clean rather than crash.
            this.data = { version: STORE_VERSION, files: {} };
        }
    }

    /** Debounced write so rapid create/delete bursts collapse into one I/O. */
    private scheduleSave(): void {
        if (this.saveTimer != null) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            void this.flush();
        }, 300);
    }

    async flush(): Promise<void> {
        try {
            const adapter = this.plugin.app.vault.adapter;
            await adapter.write(this.path, JSON.stringify(this.data, null, 0));
        } catch {
            /* sidecar write failed — relations stay in memory for this session */
        }
    }

    // ── CRUD ─────────────────────────────────────────────────

    getForFile(filePath: string): Relation[] {
        return this.data.files[filePath] ?? [];
    }

    add(filePath: string, relation: Relation): void {
        const list = this.data.files[filePath] ?? (this.data.files[filePath] = []);
        list.push(relation);
        this.scheduleSave();
    }

    remove(filePath: string, relationId: string): boolean {
        const list = this.data.files[filePath];
        if (!list) return false;
        const before = list.length;
        this.data.files[filePath] = list.filter(r => r.id !== relationId);
        if (this.data.files[filePath].length === 0) delete this.data.files[filePath];
        const changed = this.data.files[filePath]?.length !== before;
        if (changed) this.scheduleSave();
        return changed;
    }

    clearFile(filePath: string): number {
        const n = (this.data.files[filePath]?.length ?? 0)
            + (this.data.tags?.[filePath]?.length ?? 0)
            + (this.data.annotations?.[filePath]?.length ?? 0);
        let changed = false;
        if (this.data.files[filePath]) { delete this.data.files[filePath]; changed = true; }
        if (this.data.tags?.[filePath]) { delete this.data.tags[filePath]; changed = true; }
        if (this.data.annotations?.[filePath]) { delete this.data.annotations[filePath]; changed = true; }
        if (changed) this.scheduleSave();
        return n;
    }

    /** Move all relations from oldPath to newPath (vault rename). */
    rename(oldPath: string, newPath: string): void {
        const list = this.data.files[oldPath];
        if (list) {
            delete this.data.files[oldPath];
            this.data.files[newPath] = [...(this.data.files[newPath] ?? []), ...list];
        }
        if (this.data.tags?.[oldPath]) {
            const t = this.data.tags[oldPath];
            delete this.data.tags[oldPath];
            this.data.tags[newPath] = [...(this.data.tags[newPath] ?? []), ...t];
        }
        if (this.data.annotations?.[oldPath]) {
            const a = this.data.annotations[oldPath];
            delete this.data.annotations[oldPath];
            this.data.annotations[newPath] = [...(this.data.annotations[newPath] ?? []), ...a];
        }
        this.scheduleSave();
    }

    // ── Span tags ────────────────────────────────────────────

    getTagsForFile(filePath: string): SpanTag[] {
        return this.data.tags?.[filePath] ?? [];
    }

    addTag(filePath: string, tag: SpanTag): void {
        if (!this.data.tags) this.data.tags = {};
        const list = this.data.tags[filePath] ?? (this.data.tags[filePath] = []);
        list.push(tag);
        this.scheduleSave();
    }

    removeTag(filePath: string, tagId: string): boolean {
        const list = this.data.tags?.[filePath];
        if (!list) return false;
        const before = list.length;
        this.data.tags![filePath] = list.filter(t => t.id !== tagId);
        if (this.data.tags![filePath].length === 0) delete this.data.tags![filePath];
        const changed = (this.data.tags![filePath]?.length ?? 0) !== before;
        if (changed) this.scheduleSave();
        return changed;
    }

    // ── Layer annotations ────────────────────────────────────

    getAnnotationsForFile(filePath: string): Annotation[] {
        return this.data.annotations?.[filePath] ?? [];
    }

    addAnnotation(filePath: string, ann: Annotation): void {
        if (!this.data.annotations) this.data.annotations = {};
        const list = this.data.annotations[filePath] ?? (this.data.annotations[filePath] = []);
        list.push(ann);
        this.scheduleSave();
    }

    removeAnnotation(filePath: string, annId: string): boolean {
        const list = this.data.annotations?.[filePath];
        if (!list) return false;
        const before = list.length;
        this.data.annotations![filePath] = list.filter(a => a.id !== annId);
        if (this.data.annotations![filePath].length === 0) delete this.data.annotations![filePath];
        const changed = (this.data.annotations![filePath]?.length ?? 0) !== before;
        if (changed) this.scheduleSave();
        return changed;
    }

    /** Patch an annotation's gloss / note / layer / structured fields in place. */
    updateAnnotation(
        filePath: string,
        annId: string,
        patch: Partial<Pick<Annotation, 'gloss' | 'note' | 'layer'>> & { fields?: Record<string, string> },
    ): boolean {
        const ann = this.data.annotations?.[filePath]?.find(a => a.id === annId);
        if (!ann) return false;
        if (patch.gloss !== undefined) ann.gloss = patch.gloss;
        if (patch.note !== undefined) ann.note = patch.note;
        if (patch.layer !== undefined) ann.layer = patch.layer;
        if (patch.fields !== undefined) {
            const merged: Record<string, string> = { ...(ann.fields ?? {}), ...patch.fields };
            // Drop emptied fields so the sidecar stays tidy.
            for (const k of Object.keys(merged)) {
                if (merged[k] === '' || merged[k] == null) delete merged[k];
            }
            ann.fields = Object.keys(merged).length > 0 ? merged : undefined;
        }
        this.scheduleSave();
        return true;
    }

    /** Remove a member span (by index) from a multi-span annotation. */
    removeAnnotationMember(filePath: string, annId: string, memberIndex: number): boolean {
        const ann = this.data.annotations?.[filePath]?.find(a => a.id === annId);
        if (!ann || !ann.members || memberIndex < 0 || memberIndex >= ann.members.length) return false;
        ann.members.splice(memberIndex, 1);
        if (ann.members.length === 0) ann.members = undefined;
        this.scheduleSave();
        return true;
    }

    /**
     * Promote a member span to the primary `anchor` (and demote the old primary
     * into the members list). The promoted span takes over the primary role
     * (headword / hub); the demoted span inherits the role the promoted span
     * previously held, so the lattice stays well-formed.
     */
    promoteAnnotationMember(filePath: string, annId: string, memberIndex: number): boolean {
        const ann = this.data.annotations?.[filePath]?.find(a => a.id === annId);
        if (!ann || !ann.members || memberIndex < 0 || memberIndex >= ann.members.length) return false;
        const member = ann.members[memberIndex];
        const oldPrimaryAnchor = ann.anchor;
        const oldPrimaryRole = ann.primaryRole;
        ann.anchor = member.anchor;
        ann.primaryRole = oldPrimaryRole; // primary slot keeps its role label
        ann.members[memberIndex] = { anchor: oldPrimaryAnchor, role: member.role };
        this.scheduleSave();
        return true;
    }

    /** Set the role of a member span (used by the overlay tap-to-cycle gesture). */
    setMemberRole(filePath: string, annId: string, memberIndex: number, role: SpanRole): boolean {
        const ann = this.data.annotations?.[filePath]?.find(a => a.id === annId);
        if (!ann || !ann.members || memberIndex < 0 || memberIndex >= ann.members.length) return false;
        ann.members[memberIndex].role = role;
        this.scheduleSave();
        return true;
    }

    /** Set the role of the primary span. */
    setPrimaryRole(filePath: string, annId: string, role: SpanRole): boolean {
        const ann = this.data.annotations?.[filePath]?.find(a => a.id === annId);
        if (!ann) return false;
        ann.primaryRole = role;
        this.scheduleSave();
        return true;
    }

    /** Build an edit-surviving anchor for [from, to) within `doc`. */
    static buildAnchor(doc: string, from: number, to: number): TextAnchor {
        const exact = doc.slice(from, to);
        const prefix = doc.slice(Math.max(0, from - CONTEXT), from);
        const suffix = doc.slice(to, Math.min(doc.length, to + CONTEXT));
        let occurrence = 0;
        let idx = doc.indexOf(exact);
        while (idx !== -1 && idx < from) {
            occurrence++;
            idx = doc.indexOf(exact, idx + 1);
        }
        return { exact, prefix, suffix, occurrence };
    }

    /**
     * Resolve an anchor back to a [from, to) span in the current `doc`.
     * Strategy (most→least specific):
     *   1. prefix + exact + suffix unique-ish context match
     *   2. prefix + exact   (text after the span changed)
     *   3. exact + suffix   (text before the span changed)
     *   4. the Nth (occurrence) bare match of exact
     *   5. the first bare match of exact
     * Returns null if the text no longer exists.
     */
    static resolveAnchor(doc: string, a: TextAnchor): { from: number; to: number } | null {
        if (!a.exact) return null;

        const ctxFull = a.prefix + a.exact + a.suffix;
        let i = doc.indexOf(ctxFull);
        if (i !== -1) {
            const from = i + a.prefix.length;
            return { from, to: from + a.exact.length };
        }

        if (a.prefix) {
            const ctxPre = a.prefix + a.exact;
            i = doc.indexOf(ctxPre);
            if (i !== -1) {
                const from = i + a.prefix.length;
                return { from, to: from + a.exact.length };
            }
        }

        if (a.suffix) {
            const ctxSuf = a.exact + a.suffix;
            i = doc.indexOf(ctxSuf);
            if (i !== -1) {
                return { from: i, to: i + a.exact.length };
            }
        }

        let idx = doc.indexOf(a.exact);
        let n = 0;
        let first = -1;
        while (idx !== -1) {
            if (first === -1) first = idx;
            if (n === a.occurrence) return { from: idx, to: idx + a.exact.length };
            n++;
            idx = doc.indexOf(a.exact, idx + 1);
        }
        if (first !== -1) return { from: first, to: first + a.exact.length };
        return null;
    }
}
