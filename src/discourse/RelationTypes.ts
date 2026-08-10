/**
 * RelationTypes — the JP-connective discourse-relation taxonomy.
 *
 * Each relation links a SOURCE span-group to a TARGET span-group with a typed,
 * directional arc (source → target). The taxonomy is grounded in the Japanese
 * connective system so the labels map onto how the spoken language actually
 * signals the relation (the `connectives` hints are the surface markers that
 * typically realise each relation — used for future auto-suggestion).
 *
 * Users can add their own types at runtime (stored in settings); a custom type
 * is referenced as `custom:<slug>` and resolved via the merged list.
 */

export interface RelationType {
    /** Stable id used in persisted relations. Built-ins are bare slugs. */
    id: string;
    /** Japanese label (e.g. 因果). */
    jp: string;
    /** English label (e.g. Reason). */
    en: string;
    /** One- or two-char glyph for compact HUD / arc chips. */
    glyph: string;
    /** Arc + underline colour (CSS). */
    color: string;
    /** Surface connectives that typically realise this relation. */
    connectives: string[];
    /** True for user-defined types loaded from settings. */
    custom?: boolean;
}

export const BUILTIN_RELATION_TYPES: RelationType[] = [
    {
        id: 'reason',
        jp: '因果',
        en: 'Reason / Cause',
        glyph: '因',
        color: '#ff8a5c',
        connectives: ['から', 'ので', 'ため', 'だって', 'なので', 'ことで'],
    },
    {
        id: 'contrast',
        jp: '逆接',
        en: 'Contrast',
        glyph: '逆',
        color: '#ff6b9d',
        connectives: ['でも', 'けど', 'けれど', 'が', 'しかし', 'ものの', 'のに', 'ところが'],
    },
    {
        id: 'elaboration',
        jp: '詳述',
        en: 'Elaboration',
        glyph: '詳',
        color: '#6ec6ff',
        connectives: ['つまり', 'というのは', 'たとえば', 'など', 'ようするに', 'なんていうか'],
    },
    {
        id: 'quotative',
        jp: '引用',
        en: 'Quotation',
        glyph: '引',
        color: '#b388ff',
        connectives: ['と', 'という', 'って', 'とか', 'みたいな'],
    },
    {
        id: 'confirmation',
        jp: '確認',
        en: 'Confirmation',
        glyph: '確',
        color: '#5ce6c0',
        connectives: ['ね', 'よね', 'でしょ', 'じゃん', 'だろ', 'かな'],
    },
    {
        id: 'connection',
        jp: '接続',
        en: 'Connection',
        glyph: '接',
        color: '#ffd166',
        connectives: ['そして', 'で', 'それで', 'だから', 'すると', 'また'],
    },
    {
        id: 'listing',
        jp: '列挙',
        en: 'Listing',
        glyph: '列',
        color: '#9ccc65',
        connectives: ['たり', 'や', 'とか', 'し', 'も'],
    },
    {
        id: 'condition',
        jp: '条件',
        en: 'Condition',
        glyph: '条',
        color: '#4dd0e1',
        connectives: ['たら', 'れば', 'なら', 'と', 'ては', 'ば'],
    },
];

/** Fallback type for relations whose stored id is no longer known. */
export const UNKNOWN_RELATION_TYPE: RelationType = {
    id: 'unknown',
    jp: '関連',
    en: 'Relation',
    glyph: '関',
    color: '#b0bec5',
    connectives: [],
};

/**
 * A user-defined relation type as persisted in settings. Kept minimal — the
 * id is derived from the label so the same custom type round-trips.
 */
export interface CustomRelationTypeDef {
    label: string;
    color?: string;
    glyph?: string;
}

/** Slugify a custom label into a stable `custom:<slug>` id. */
export function customTypeId(label: string): string {
    const slug = label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, '')
        .slice(0, 32) || 'type';
    return `custom:${slug}`;
}

/** Build the full type list: built-ins + user custom types from settings. */
export function buildRelationTypes(custom: CustomRelationTypeDef[]): RelationType[] {
    const palette = ['#f48fb1', '#ce93d8', '#90caf9', '#80cbc4', '#a5d6a7', '#ffcc80', '#bcaaa4'];
    const customTypes: RelationType[] = (custom ?? []).map((c, i) => ({
        id: customTypeId(c.label),
        jp: c.label,
        en: c.label,
        glyph: c.glyph?.slice(0, 2) || c.label.slice(0, 1) || '＊',
        color: c.color || palette[i % palette.length],
        connectives: [],
        custom: true,
    }));
    return [...BUILTIN_RELATION_TYPES, ...customTypes];
}

/** Resolve a stored type id against the merged list, falling back gracefully. */
export function resolveRelationType(id: string, all: RelationType[]): RelationType {
    return all.find(t => t.id === id) ?? UNKNOWN_RELATION_TYPE;
}
