import { CustomRelationTypeDef, customTypeId } from './RelationTypes';

/**
 * MarkerTypes — the SPAN-level discourse-marker taxonomy.
 *
 * Distinct from RelationTypes (which classify how two clauses relate, 因果 /
 * 逆接 …). A marker categorises what a single span IS as a piece of spoken
 * discourse: a filler, a connective, a topic particle, a hedge, etc. This maps
 * directly onto the kind of fragments picked in the keyboard-free picker
 * (えっと / なんですけど / で、 / は / も).
 *
 * Each tagged span renders as a coloured underline + a small category glyph.
 * Users can extend the set with their own marker types from settings.
 */

export interface MarkerType {
    id: string;
    jp: string;
    en: string;
    glyph: string;
    color: string;
    custom?: boolean;
}

export const BUILTIN_MARKER_TYPES: MarkerType[] = [
    { id: 'filler',         jp: 'フィラー', en: 'Filler',          glyph: 'フ', color: '#9e9e9e' },
    { id: 'connective',     jp: '接続',     en: 'Connective',      glyph: '接', color: '#ffb74d' },
    { id: 'topic',          jp: '主題',     en: 'Topic',           glyph: '題', color: '#4fc3f7' },
    { id: 'hedge',          jp: 'ヘッジ',   en: 'Hedge',           glyph: '緩', color: '#ba68c8' },
    { id: 'quotative',      jp: '引用',     en: 'Quotative',       glyph: '引', color: '#7e57c2' },
    { id: 'final-particle', jp: '終助詞',   en: 'Final particle',  glyph: '終', color: '#4db6ac' },
    { id: 'other',          jp: 'その他',   en: 'Other',           glyph: '他', color: '#90a4ae' },
];

export const UNKNOWN_MARKER_TYPE: MarkerType = {
    id: 'unknown', jp: '標識', en: 'Marker', glyph: '標', color: '#b0bec5',
};

/** Marker custom ids are namespaced `marker:<slug>` to avoid clashing with relation custom ids. */
function markerCustomId(label: string): string {
    return customTypeId(label).replace(/^custom:/, 'marker:');
}

export function buildMarkerTypes(custom: CustomRelationTypeDef[]): MarkerType[] {
    const palette = ['#f06292', '#9575cd', '#64b5f6', '#4dd0e1', '#81c784', '#ffd54f', '#a1887f'];
    const customTypes: MarkerType[] = (custom ?? []).map((c, i) => ({
        id: markerCustomId(c.label),
        jp: c.label,
        en: c.label,
        glyph: c.glyph?.slice(0, 2) || c.label.slice(0, 1) || '＊',
        color: c.color || palette[i % palette.length],
        custom: true,
    }));
    return [...BUILTIN_MARKER_TYPES, ...customTypes];
}

export function resolveMarkerType(id: string, all: MarkerType[]): MarkerType {
    return all.find(t => t.id === id) ?? UNKNOWN_MARKER_TYPE;
}
