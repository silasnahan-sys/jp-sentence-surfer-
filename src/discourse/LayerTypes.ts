import { CustomRelationTypeDef, customTypeId } from './RelationTypes';

/**
 * LayerTypes — the FIVE top-level annotation layers (Silas's "big 5").
 *
 * Every annotation on a span belongs to exactly one layer. The layer fixes the
 * colour and the broad analytic intent; layer-specific structured fields (focal
 * core + envelope for rhetorical collocation, anchor lattice for rhetorical
 * construction, …) are enriched in a later pass — for now an annotation carries
 * its layer + one span + an optional gloss + a freeform note.
 *
 * AUTHORITATIVE COLOURS (per spec):
 *   serifu                  = yellow   — a fixed quotable line; identity = surface form
 *   collocation             = blue     — word↔word syntactic bond; identity = pattern
 *   rhetorical-collocation  = green    — scenic envelope rendering a focal core
 *   rhetorical-construction = orange   — operator lattice performing a discursive move
 *   discourse               = red      — span→discourse-function mapping + relations
 *
 * Layers OVERLAP and STACK freely: the same surface text may carry several
 * annotations of different layers (orthogonal analytic projections).
 */

/**
 * A layer-specific structured field. Values are stored as plain strings under
 * `Annotation.fields[key]`; the modal renders one input per spec.
 */
export interface LayerFieldSpec {
    /** Stable storage key under `Annotation.fields`. */
    key: string;
    /** Japanese label. */
    jp: string;
    /** English label. */
    en: string;
    /** Input placeholder / example. */
    placeholder?: string;
    /** Render a multi-line textarea instead of a single-line input. */
    multiline?: boolean;
    /** Show this field's value as the card subtitle in the sidebar. */
    primary?: boolean;
}

export interface LayerType {
    id: string;
    jp: string;
    en: string;
    glyph: string;
    color: string;
    /** One-line reminder of what this layer captures (shown in palette / sidebar). */
    hint: string;
    /** Layer-specific structured fields shown in the annotation editor. */
    fields?: LayerFieldSpec[];
    /**
     * When true, this layer is inherently discontinuous: marking several spans
     * and picking it groups them into ONE annotation whose primary span is the
     * focal core / hub and whose extra spans become anchored MEMBERS (the scenic
     * envelope / anchor lattice). Single-span layers (serifu, collocation,
     * discourse) keep the batch behaviour: N marks → N annotations.
     */
    multiSpan?: boolean;
    /** Role label for the primary span of a multi-span layer (e.g. focal core). */
    primarySpanLabel?: string;
    /** Role label for the member spans of a multi-span layer (e.g. envelope). */
    memberSpanLabel?: string;
    /**
     * Ordered role vocabulary for the spans of a multi-span layer. Tapping a span
     * on the overlay cycles through these in order; the FIRST role is the default
     * for the primary span, and `defaultMemberRole` is the default for members.
     * Each role renders the span text with its own bracket notation (Eijiro-style:
     * [headword] · (collocate / alternant) · {slot} · frame dimmed · context linked).
     */
    roleVocab?: SpanRole[];
    /** Default role assigned to extra (member) spans at capture time. */
    defaultMemberRole?: SpanRole;
    custom?: boolean;
}

/**
 * A span role inside a multi-span rhetorical annotation. Roles encode the
 * Eijiro-style "altitude of belonging" of each span to the lifted pattern:
 *
 *   headword  [エゴ]   — the fixed lexical anchor / index key
 *   collocate (される) — the bond partner; if itself variable, an ALTERNANT
 *   hub       ❮はずがない❯ — a functional operator (the 構 core)
 *   anchor    ❮できる❯  — an operator anchoring the construction lattice
 *   slot      {本}     — a constrained placeholder whose filler still bears meaning
 *   frame     この…は   — instance tissue (deixis/particles), a step above context
 *   context            — the full sentence of record (shown but de-emphasised)
 */
export type SpanRole =
    | 'headword'
    | 'collocate'
    | 'hub'
    | 'anchor'
    | 'slot'
    | 'frame'
    | 'context';

export interface SpanRoleSpec {
    id: SpanRole;
    jp: string;
    en: string;
    /** Opening / closing bracket used when rendering the lifted notation. */
    open: string;
    close: string;
    /** Render the span dimmed (frame/context are scaffolding, not the pattern). */
    dim?: boolean;
}

/** Master registry of span roles → label + bracket notation. */
export const SPAN_ROLE_SPECS: Record<SpanRole, SpanRoleSpec> = {
    headword: { id: 'headword', jp: '見出し', en: 'headword', open: '[', close: ']' },
    collocate: { id: 'collocate', jp: '連結', en: 'collocate', open: '(', close: ')' },
    hub: { id: 'hub', jp: '基点', en: 'hub', open: '\u276e', close: '\u276f' },
    anchor: { id: 'anchor', jp: 'アンカー', en: 'anchor', open: '\u276e', close: '\u276f' },
    slot: { id: 'slot', jp: 'スロット', en: 'slot', open: '{', close: '}' },
    frame: { id: 'frame', jp: '枠', en: 'frame', open: '', close: '', dim: true },
    context: { id: 'context', jp: '文脈', en: 'context', open: '', close: '', dim: true },
};

export function spanRoleSpec(role: SpanRole | undefined): SpanRoleSpec {
    return (role && SPAN_ROLE_SPECS[role]) || SPAN_ROLE_SPECS.frame;
}

/** Render a span's text wrapped in its role's bracket notation (Eijiro-style). */
export function renderSpanNotation(text: string, role: SpanRole | undefined): string {
    const spec = spanRoleSpec(role);
    return `${spec.open}${text}${spec.close}`;
}

/** The default role for the primary span of a layer (first in its vocab). */
export function primaryRoleOf(layer: LayerType): SpanRole {
    return layer.roleVocab?.[0] ?? 'headword';
}

/** Cycle a role forward through a layer's vocabulary (wraps); used by the overlay tap. */
export function nextSpanRole(role: SpanRole | undefined, layer: LayerType): SpanRole {
    const vocab = layer.roleVocab ?? [];
    if (vocab.length === 0) return role ?? 'frame';
    const i = role ? vocab.indexOf(role) : -1;
    return vocab[(i + 1) % vocab.length];
}

export const LAYER_SERIFU = 'serifu';
export const LAYER_COLLOCATION = 'collocation';
export const LAYER_RHET_COLLOCATION = 'rhetorical-collocation';
export const LAYER_RHET_CONSTRUCTION = 'rhetorical-construction';
export const LAYER_DISCOURSE = 'discourse';

export const BUILTIN_LAYER_TYPES: LayerType[] = [
    {
        id: LAYER_SERIFU,
        jp: 'セリフ', en: 'Serifu', glyph: '言',
        color: '#f9c74f', // yellow
        hint: 'A fixed quotable line — identity is the surface form.',
        fields: [
            { key: 'speaker', jp: '話者', en: 'Speaker', placeholder: 'who says it', primary: true },
            { key: 'register', jp: '位相', en: 'Register', placeholder: 'casual / polite / archaic …' },
        ],
    },
    {
        id: LAYER_COLLOCATION,
        jp: '連語', en: 'Collocation', glyph: '連',
        color: '#2196f3', // blue
        hint: 'Word↔word syntactic bond (N+が+V …) — paraphrasable, pattern-keyed.',
        fields: [
            { key: 'pattern', jp: '型', en: 'Pattern', placeholder: 'N が V / A く なる …', primary: true },
            { key: 'paraphrase', jp: '言い換え', en: 'Paraphrase', placeholder: 'plain restatement' },
        ],
    },
    {
        id: LAYER_RHET_COLLOCATION,
        jp: '修辞連語', en: 'Rhetorical collocation', glyph: '描',
        color: '#4caf50', // green
        hint: 'A lexical bond (headword + collocate) lifted into a pattern: [headword] (collocate) {slot} + instance frame.',
        multiSpan: true,
        primarySpanLabel: '見出し · headword',
        memberSpanLabel: '連結・枠 · collocate / frame',
        // Eijiro-style altitude of belonging: the pure pair is headword+collocate;
        // {slot} is a meaning-bearing placeholder; frame = this-instance tissue;
        // context = the full sentence of record. Tapping a span cycles these.
        roleVocab: ['headword', 'collocate', 'slot', 'frame', 'context'],
        defaultMemberRole: 'collocate',
        fields: [
            { key: 'headword', jp: '見出し', en: 'Headword', placeholder: 'the index lemma, e.g. 紙幅', primary: true },
            { key: 'pattern', jp: '型', en: 'Lifted pattern', placeholder: '[紙幅]を(かなり)費やす — auto from spans' },
            { key: 'imageGloss', jp: '像', en: 'Image gloss', placeholder: 'what the rendered picture evokes', multiline: true },
        ],
    },
    {
        id: LAYER_RHET_CONSTRUCTION,
        jp: '修辞構文', en: 'Rhetorical construction', glyph: '構',
        color: '#ff9800', // orange
        hint: 'An operator lattice performing a maneuver on the listener: ❮hub❯ ❮anchor❯ {slot} + frame. Not paraphrasable.',
        multiSpan: true,
        primarySpanLabel: '基点 · hub',
        memberSpanLabel: 'アンカー・枠 · anchor / frame',
        roleVocab: ['hub', 'anchor', 'slot', 'frame', 'context'],
        defaultMemberRole: 'anchor',
        fields: [
            { key: 'rhetoricalFunction', jp: '修辞機能', en: 'Rhetorical function', placeholder: 'concession / counterfactual / restriction …', primary: true },
            { key: 'constructionId', jp: '構文ID', en: 'Construction id', placeholder: 'hub-keyed id, e.g. ことはほとんどない' },
            { key: 'slots', jp: 'スロット', en: 'Slot notes', placeholder: 'what each {slot} ranges over' },
        ],
    },
    {
        id: LAYER_DISCOURSE,
        jp: '談話', en: 'Discourse', glyph: '談',
        color: '#f44336', // red
        hint: 'Span→discourse-function mapping and relations between units.',
        fields: [
            { key: 'discourseFunction', jp: '談話機能', en: 'Discourse function', placeholder: 'topic-shift / aside / repair …', primary: true },
        ],
    },
];

export const UNKNOWN_LAYER_TYPE: LayerType = {
    id: 'unknown', jp: '注釈', en: 'Annotation', glyph: '注',
    color: '#b0bec5', hint: 'Unclassified annotation.',
};

/** Layer custom ids are namespaced `layer:<slug>` to avoid clashing with other custom ids. */
function layerCustomId(label: string): string {
    return customTypeId(label).replace(/^custom:/, 'layer:');
}

export function buildLayerTypes(custom: CustomRelationTypeDef[]): LayerType[] {
    const palette = ['#ec407a', '#ab47bc', '#26c6da', '#8d6e63', '#789262', '#5c6bc0'];
    const customTypes: LayerType[] = (custom ?? []).map((c, i) => ({
        id: layerCustomId(c.label),
        jp: c.label,
        en: c.label,
        glyph: c.glyph?.slice(0, 2) || c.label.slice(0, 1) || '＊',
        color: c.color || palette[i % palette.length],
        hint: 'Custom layer.',
        custom: true,
    }));
    return [...BUILTIN_LAYER_TYPES, ...customTypes];
}

export function resolveLayerType(id: string, all: LayerType[]): LayerType {
    return all.find(t => t.id === id) ?? UNKNOWN_LAYER_TYPE;
}
