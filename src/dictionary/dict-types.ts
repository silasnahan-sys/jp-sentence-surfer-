/**
 * dict-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Type definitions for Yomitan-format dictionaries.
 * https://github.com/themoeway/yomitan (term_bank_N.json schema)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A single Yomitan term bank entry (term_bank_N.json array row). */
export type YomitanTermRow = [
    /** term */          string,
    /** reading */       string,
    /** definition-tags */ string,
    /** rules */         string,
    /** score */         number,
    /** definitions */   YomitanDefinition[],
    /** sequence */      number,
    /** term-tags */     string,
];

export type YomitanDefinition = string | YomitanStructuredContent;

export interface YomitanStructuredContent {
    type: string;
    content?: YomitanDefinition | YomitanDefinition[];
    tag?: string;
    data?: Record<string, string>;
    style?: Record<string, string>;
}

/** Parsed, typed version of a term bank entry. */
export interface DictEntry {
    term: string;
    reading: string;
    definitionTags: string;
    rules: string;
    score: number;
    definitions: YomitanDefinition[];
    sequence: number;
    termTags: string;
    /** Source dictionary name */
    dictName: string;
}

/** A loaded dictionary with its entries. */
export interface LoadedDictionary {
    name: string;
    version: string;
    revision: string;
    entries: DictEntry[];
    /** Path within the vault (folder) */
    path: string;
}

/** Result of a dictionary search. */
export interface DictSearchResult {
    entry: DictEntry;
    dictName: string;
    matchType: 'exact' | 'prefix' | 'deconjugated';
    /** The surface form that was matched */
    matchedSurface: string;
}

/** Deconjugation rule: inflected form → base form. */
export interface DeconjugationRule {
    inflected: string;
    base: string;
    type: string;
    reason: string;
}

/** Options for dict engine search. */
export interface DictSearchOptions {
    maxResults?: number;
    includeDeconjugated?: boolean;
    scanLength?: number;
}
