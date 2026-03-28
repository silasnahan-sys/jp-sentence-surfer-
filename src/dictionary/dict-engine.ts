// ─── Deconjugation rules ──────────────────────────────────────────────────────

const DECONJ_RULES: Array<{ suffix: string; base: string; type: string }> = [
    // て/た forms
    { suffix: 'って', base: 'う', type: 'v5' },
    { suffix: 'いて', base: 'く', type: 'v5' },
    { suffix: 'いで', base: 'ぐ', type: 'v5' },
    { suffix: 'して', base: 'す', type: 'v5' },
    { suffix: 'んで', base: 'ぬ/ぶ/む', type: 'v5' },
    { suffix: 'って', base: 'つ/る', type: 'v5' },
    { suffix: 'て', base: 'る', type: 'v1' },
    // ない form
    { suffix: 'わない', base: 'う', type: 'neg' },
    { suffix: 'かない', base: 'く', type: 'neg' },
    { suffix: 'がない', base: 'ぐ', type: 'neg' },
    { suffix: 'さない', base: 'す', type: 'neg' },
    { suffix: 'たない', base: 'つ', type: 'neg' },
    { suffix: 'なない', base: 'ぬ', type: 'neg' },
    { suffix: 'ばない', base: 'ぶ', type: 'neg' },
    { suffix: 'まない', base: 'む', type: 'neg' },
    { suffix: 'らない', base: 'る', type: 'neg' },
    { suffix: 'ない', base: '', type: 'neg' },
    // ます form
    { suffix: 'います', base: 'う', type: 'masu' },
    { suffix: 'きます', base: 'く', type: 'masu' },
    { suffix: 'ぎます', base: 'ぐ', type: 'masu' },
    { suffix: 'します', base: 'す', type: 'masu' },
    { suffix: 'ちます', base: 'つ', type: 'masu' },
    { suffix: 'にます', base: 'ぬ', type: 'masu' },
    { suffix: 'びます', base: 'ぶ', type: 'masu' },
    { suffix: 'みます', base: 'む', type: 'masu' },
    { suffix: 'ります', base: 'る', type: 'masu' },
    { suffix: 'ます', base: '', type: 'masu' },
    // i-adjective
    { suffix: 'くない', base: 'い', type: 'adj-i' },
    { suffix: 'くて', base: 'い', type: 'adj-i' },
    { suffix: 'かった', base: 'い', type: 'adj-i' },
];

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StructuredContent {
    type?: string;
    content?: string | StructuredContent | (string | StructuredContent)[];
    tag?: string;
    [key: string]: unknown;
}

export interface DictEntry {
    term: string;
    reading: string;
    definitionTags: string;
    rules: string;
    score: number;
    definitions: (string | StructuredContent)[];
    sequence: number;
    termTags: string;
}

export interface DictSearchResult {
    entry: DictEntry;
    matchType: 'exact' | 'prefix' | 'deconjugated';
    matchedForm: string;
}

// ─── Engine class ─────────────────────────────────────────────────────────────

export class DictEngine {
    private entries: DictEntry[] = [];

    constructor() {}

    loadFromJSON(data: unknown[][]): void {
        this.entries = [];
        for (const row of data) {
            if (!Array.isArray(row) || row.length < 8) continue;
            const [term, reading, definitionTags, rules, score, definitions, sequence, termTags] = row;
            const defs = Array.isArray(definitions) ? definitions as (string | StructuredContent)[] : [];
            this.entries.push({
                term: String(term ?? ''),
                reading: String(reading ?? ''),
                definitionTags: String(definitionTags ?? ''),
                rules: String(rules ?? ''),
                score: typeof score === 'number' ? score : 0,
                definitions: defs,
                sequence: typeof sequence === 'number' ? sequence : 0,
                termTags: String(termTags ?? ''),
            });
        }
    }

    search(query: string, mode: 'exact' | 'prefix' | 'deconjugated'): DictSearchResult[] {
        const results: DictSearchResult[] = [];

        if (mode === 'exact') {
            for (const entry of this.entries) {
                if (entry.term === query || entry.reading === query) {
                    results.push({ entry, matchType: 'exact', matchedForm: query });
                }
            }
            return results;
        }

        if (mode === 'prefix') {
            for (const entry of this.entries) {
                if (entry.term.startsWith(query) || entry.reading.startsWith(query)) {
                    results.push({ entry, matchType: 'prefix', matchedForm: query });
                }
            }
            return results;
        }

        // deconjugated: try exact first, then produce candidate bases
        const seen = new Set<string>();

        for (const entry of this.entries) {
            if (entry.term === query || entry.reading === query) {
                const key = `exact:${entry.term}:${entry.reading}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({ entry, matchType: 'exact', matchedForm: query });
                }
            }
        }

        for (const rule of DECONJ_RULES) {
            if (!query.endsWith(rule.suffix)) continue;
            const stem = query.slice(0, query.length - rule.suffix.length);
            const bases = rule.base.split('/').map(b => stem + b);
            for (const candidate of bases) {
                if (!candidate) continue;
                for (const entry of this.entries) {
                    if (entry.term === candidate || entry.reading === candidate) {
                        const key = `deconj:${entry.term}:${entry.reading}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            results.push({ entry, matchType: 'deconjugated', matchedForm: candidate });
                        }
                    }
                }
            }
        }

        return results;
    }

    scanText(text: string): DictSearchResult[] {
        const results: DictSearchResult[] = [];
        const seen = new Set<string>();

        for (let start = 0; start < text.length; start++) {
            for (let end = start + 1; end <= text.length; end++) {
                const sub = text.slice(start, end);
                for (const entry of this.entries) {
                    if (entry.term === sub || entry.reading === sub) {
                        const key = `${entry.term}:${entry.reading}:${entry.sequence}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            results.push({ entry, matchType: 'exact', matchedForm: sub });
                        }
                    }
                }
            }
        }

        return results;
    }

    getEntryCount(): number {
        return this.entries.length;
    }
}
