export interface DictEntry {
    expression: string;
    reading: string;
    definitionTags: string[];
    rules: string[];
    score: number;
    definitions: (string | any)[];
    sequence: number;
    termTags: string[];
    dictionaryName: string;
}

export interface DictSearchResult {
    entry: DictEntry;
    matchType: 'exact' | 'prefix' | 'deconjugated' | 'substring';
}

export class DictEngine {
    private dictionaries: Map<string, DictEntry[]>;

    constructor() {
        this.dictionaries = new Map();
    }

    loadDictionary(name: string, indexJson: any, termBanks: any[][]): void {
        const entries: DictEntry[] = [];
        for (const bank of termBanks) {
            for (const row of bank) {
                const defTagsRaw: string = row[2] ?? '';
                const rulesRaw: string = row[3] ?? '';
                const termTagsRaw: string = row[7] ?? '';
                entries.push({
                    expression:     String(row[0] ?? ''),
                    reading:        String(row[1] ?? ''),
                    definitionTags: defTagsRaw.length > 0 ? defTagsRaw.split(' ') : [],
                    rules:          rulesRaw.length > 0 ? rulesRaw.split(' ') : [],
                    score:          Number(row[4] ?? 0),
                    definitions:    Array.isArray(row[5]) ? row[5] : [row[5]],
                    sequence:       Number(row[6] ?? 0),
                    termTags:       termTagsRaw.length > 0 ? termTagsRaw.split(' ') : [],
                    dictionaryName: name,
                });
            }
        }
        this.dictionaries.set(name, entries);
    }

    search(query: string, mode: 'exact' | 'prefix' | 'substring'): DictSearchResult[] {
        const seen = new Set<string>();
        const results: DictSearchResult[] = [];

        const matches = (entry: DictEntry): boolean => {
            switch (mode) {
                case 'exact':
                    return entry.expression === query || entry.reading === query;
                case 'prefix':
                    return entry.expression.startsWith(query) || entry.reading.startsWith(query);
                case 'substring':
                    return entry.expression.includes(query) || entry.reading.includes(query);
            }
        };

        for (const entries of this.dictionaries.values()) {
            for (const entry of entries) {
                if (matches(entry)) {
                    const key = `${entry.expression}\0${entry.reading}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        results.push({ entry, matchType: mode });
                    }
                }
            }
        }

        results.sort((a, b) => b.entry.score - a.entry.score);
        return results;
    }

    searchDeconjugated(query: string): DictSearchResult[] {
        const candidates = new Set<string>();

        // Verb deconjugation
        if (query.endsWith('ます')) {
            candidates.add(query.slice(0, -2) + 'る');
        }
        if (query.endsWith('ません')) {
            candidates.add(query.slice(0, -3) + 'る');
        }
        if (query.endsWith('ている')) {
            candidates.add(query.slice(0, -3));
        }
        if (query.endsWith('てる')) {
            candidates.add(query.slice(0, -2));
        }
        if (query.endsWith('いて')) {
            candidates.add(query.slice(0, -2) + 'く');
        }
        if (query.endsWith('いで')) {
            candidates.add(query.slice(0, -2) + 'ぐ');
        }
        if (query.endsWith('して')) {
            candidates.add(query.slice(0, -2) + 'す');
        }
        if (query.endsWith('って')) {
            const stem = query.slice(0, -2);
            candidates.add(stem + 'う');
            candidates.add(stem + 'つ');
            candidates.add(stem + 'る');
        }
        if (query.endsWith('んで')) {
            const stem = query.slice(0, -2);
            candidates.add(stem + 'ぬ');
            candidates.add(stem + 'む');
            candidates.add(stem + 'ぶ');
        }
        if (query.endsWith('べて')) {
            candidates.add(query.slice(0, -2) + 'ぶ');
        }
        if (query.endsWith('ない')) {
            const stem = query.slice(0, -2);
            candidates.add(stem + 'る');
            candidates.add(stem + 'う');
        }
        if (query.endsWith('なかった')) {
            const stem = query.slice(0, -4);
            candidates.add(stem + 'る');
            candidates.add(stem + 'う');
        }
        if (query.endsWith('った')) {
            const stem = query.slice(0, -2);
            candidates.add(stem + 'う');
            candidates.add(stem + 'つ');
            candidates.add(stem + 'る');
        } else if (query.endsWith('た') && !query.endsWith('した') && !query.endsWith('いた')) {
            candidates.add(query.slice(0, -1) + 'る');
        }

        // I-adjective deconjugation
        if (query.endsWith('くない')) {
            candidates.add(query.slice(0, -3) + 'い');
        }
        if (query.endsWith('くて')) {
            candidates.add(query.slice(0, -2) + 'い');
        }
        if (query.endsWith('かった')) {
            candidates.add(query.slice(0, -3) + 'い');
        }

        const seen = new Set<string>();
        const results: DictSearchResult[] = [];

        for (const candidate of candidates) {
            for (const entries of this.dictionaries.values()) {
                for (const entry of entries) {
                    if (entry.expression === candidate || entry.reading === candidate) {
                        const key = `${entry.expression}\0${entry.reading}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            results.push({ entry, matchType: 'deconjugated' });
                        }
                    }
                }
            }
        }

        results.sort((a, b) => b.entry.score - a.entry.score);
        return results;
    }

    getLoadedDictionaries(): string[] {
        return Array.from(this.dictionaries.keys());
    }

    unloadDictionary(name: string): void {
        this.dictionaries.delete(name);
    }
}
