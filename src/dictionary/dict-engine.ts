export interface DictEntry {
    expression: string;
    reading: string;
    definitionTags: string[];
    rules: string[];
    score: number;
    definitions: DictDefinition[];
    sequence: number;
}

export interface DictDefinition {
    text: string;
    type: 'text' | 'structured-content' | 'image';
}

export interface SearchResult {
    entry: DictEntry;
    score: number;
    matchType: 'exact' | 'prefix' | 'substring' | 'deconjugated';
    deconjugatedForm?: string;
}

export class DictEngine {
    private entries: DictEntry[] = [];
    private byExpression: Map<string, DictEntry[]> = new Map();
    private byReading: Map<string, DictEntry[]> = new Map();

    /** Load a Yomitan term_bank JSON array */
    loadTermBank(data: any[]): void {
        for (const row of data) {
            if (!Array.isArray(row) || row.length < 7) continue;
            const entry: DictEntry = {
                expression: row[0],
                reading: row[1],
                definitionTags: (row[2] || '').split(' ').filter(Boolean),
                rules: (row[3] || '').split(' ').filter(Boolean),
                score: row[4] || 0,
                definitions: this.parseDefinitions(row[5]),
                sequence: row[6] || 0,
            };
            this.entries.push(entry);
            if (!this.byExpression.has(entry.expression)) this.byExpression.set(entry.expression, []);
            this.byExpression.get(entry.expression)!.push(entry);
            if (entry.reading) {
                if (!this.byReading.has(entry.reading)) this.byReading.set(entry.reading, []);
                this.byReading.get(entry.reading)!.push(entry);
            }
        }
    }

    search(query: string, maxResults = 20): SearchResult[] {
        if (!query) return [];
        const exact = this.searchExact(query);
        if (exact.length > 0) return exact.slice(0, maxResults);

        const prefix = this.searchPrefix(query, maxResults);
        const deco = this.searchDeconjugated(query, maxResults);

        // Merge, deduplicate by expression+reading, sort by score desc
        const combined = [...prefix, ...deco];
        const seen = new Set<string>();
        const unique: SearchResult[] = [];
        for (const r of combined) {
            const key = r.entry.expression + '||' + r.entry.reading;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(r);
            }
        }
        unique.sort((a, b) => b.score - a.score);
        return unique.slice(0, maxResults);
    }

    searchExact(query: string): SearchResult[] {
        const byExpr = this.byExpression.get(query) ?? [];
        const byRead = this.byReading.get(query) ?? [];
        const all = [...byExpr, ...byRead];
        const seen = new Set<DictEntry>();
        const results: SearchResult[] = [];
        for (const entry of all) {
            if (seen.has(entry)) continue;
            seen.add(entry);
            results.push({ entry, score: entry.score, matchType: 'exact' });
        }
        results.sort((a, b) => b.score - a.score);
        return results;
    }

    searchPrefix(query: string, maxResults = 20): SearchResult[] {
        const results: SearchResult[] = [];
        for (const entry of this.entries) {
            if (entry.expression.startsWith(query) || entry.reading.startsWith(query)) {
                results.push({ entry, score: entry.score, matchType: 'prefix' });
                if (results.length >= maxResults * 2) break;
            }
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, maxResults);
    }

    private searchDeconjugated(query: string, maxResults = 20): SearchResult[] {
        const forms = this.deconjugate(query);
        const results: SearchResult[] = [];
        for (const form of forms) {
            if (form === query) continue;
            const exactMatches = this.searchExact(form);
            for (const r of exactMatches) {
                results.push({ ...r, matchType: 'deconjugated', deconjugatedForm: form });
            }
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, maxResults);
    }

    deconjugate(form: string): string[] {
        const results = new Set<string>([form]);
        for (const f of this.deconjugateVerb(form)) results.add(f);
        for (const f of this.deconjugateAdj(form)) results.add(f);
        return [...results];
    }

    clear(): void {
        this.entries = [];
        this.byExpression.clear();
        this.byReading.clear();
    }

    get size(): number {
        return this.entries.length;
    }

    private parseDefinitions(defs: any): DictDefinition[] {
        if (!defs) return [];
        if (typeof defs === 'string') return [{ text: defs, type: 'text' }];
        if (Array.isArray(defs)) {
            return defs.map((d: any): DictDefinition => {
                if (typeof d === 'string') return { text: d, type: 'text' };
                if (d && typeof d === 'object') {
                    if (d.type === 'image') return { text: '', type: 'image' };
                    if (d.type === 'structured-content') {
                        return { text: this.extractTextFromStructured(d), type: 'structured-content' };
                    }
                    if (typeof d.text === 'string') return { text: d.text, type: 'text' };
                }
                return { text: String(d), type: 'text' };
            });
        }
        return [{ text: String(defs), type: 'text' }];
    }

    private extractTextFromStructured(node: any): string {
        if (!node) return '';
        if (typeof node === 'string') return node;
        if (typeof node.content === 'string') return node.content;
        if (Array.isArray(node.content)) return node.content.map((c: any) => this.extractTextFromStructured(c)).join('');
        return '';
    }

    private deconjugateVerb(form: string): string[] {
        const results: string[] = [];

        // ます-form → dictionary form (ichidan guess: remove ます → る)
        if (form.endsWith('ます')) {
            const stem = form.slice(0, -2);
            results.push(stem + 'る');
        }
        if (form.endsWith('ません')) {
            const stem = form.slice(0, -3);
            results.push(stem + 'る');
        }
        if (form.endsWith('ました')) {
            const stem = form.slice(0, -3);
            results.push(stem + 'る');
        }

        // て-form reversals
        if (form.endsWith('って')) {
            const stem = form.slice(0, -2);
            results.push(stem + 'う', stem + 'つ', stem + 'る');
        }
        if (form.endsWith('いて')) {
            results.push(form.slice(0, -2) + 'く');
        }
        if (form.endsWith('いで')) {
            results.push(form.slice(0, -2) + 'ぐ');
        }
        if (form.endsWith('して')) {
            results.push(form.slice(0, -2) + 'す');
        }
        if (form.endsWith('んで')) {
            const stem = form.slice(0, -2);
            results.push(stem + 'ぬ', stem + 'ぶ', stem + 'む');
        }
        if (form.endsWith('て')) {
            results.push(form.slice(0, -1) + 'る');
        }

        // た-form (past) reversals
        if (form.endsWith('った')) {
            const stem = form.slice(0, -2);
            results.push(stem + 'う', stem + 'つ', stem + 'る');
        }
        if (form.endsWith('いた')) {
            results.push(form.slice(0, -2) + 'く');
        }
        if (form.endsWith('いだ')) {
            results.push(form.slice(0, -2) + 'ぐ');
        }
        if (form.endsWith('した')) {
            results.push(form.slice(0, -2) + 'す');
        }
        if (form.endsWith('んだ')) {
            const stem = form.slice(0, -2);
            results.push(stem + 'ぬ', stem + 'ぶ', stem + 'む');
        }
        if (form.endsWith('た')) {
            results.push(form.slice(0, -1) + 'る');
        }

        // ている / てる → base
        if (form.endsWith('ている')) {
            results.push(form.slice(0, -3) + 'る');
        }
        if (form.endsWith('てる')) {
            results.push(form.slice(0, -2) + 'る');
        }
        if (form.endsWith('でいる')) {
            results.push(form.slice(0, -3) + 'ぐ');
        }

        // ない-form
        if (form.endsWith('ない')) {
            const stem = form.slice(0, -2);
            results.push(stem + 'る', stem + 'う');
        }
        if (form.endsWith('わない')) {
            results.push(form.slice(0, -3) + 'う');
        }
        if (form.endsWith('かない')) {
            results.push(form.slice(0, -3) + 'く');
        }
        if (form.endsWith('がない')) {
            results.push(form.slice(0, -3) + 'ぐ');
        }
        if (form.endsWith('さない')) {
            results.push(form.slice(0, -3) + 'す');
        }
        if (form.endsWith('たない')) {
            results.push(form.slice(0, -3) + 'つ');
        }
        if (form.endsWith('なない')) {
            results.push(form.slice(0, -3) + 'ぬ');
        }
        if (form.endsWith('ばない')) {
            results.push(form.slice(0, -3) + 'ぶ');
        }
        if (form.endsWith('まない')) {
            results.push(form.slice(0, -3) + 'む');
        }
        if (form.endsWith('らない')) {
            results.push(form.slice(0, -3) + 'る');
        }

        // Godan masu-stem → dictionary (heuristic)
        const godanMasuMap: [string, string][] = [
            ['い', 'う'], ['き', 'く'], ['ぎ', 'ぐ'], ['し', 'す'],
            ['ち', 'つ'], ['に', 'ぬ'], ['び', 'ぶ'], ['み', 'む'], ['り', 'る'],
        ];
        for (const [masuEnd, dictEnd] of godanMasuMap) {
            if (form.endsWith(masuEnd + 'ます')) {
                results.push(form.slice(0, -(masuEnd.length + 2)) + dictEnd);
            }
        }

        return results;
    }

    private deconjugateAdj(form: string): string[] {
        const results: string[] = [];

        // くない → い
        if (form.endsWith('くない')) {
            results.push(form.slice(0, -3) + 'い');
        }
        // かった → い (past)
        if (form.endsWith('かった')) {
            results.push(form.slice(0, -3) + 'い');
        }
        // くなかった → い
        if (form.endsWith('くなかった')) {
            results.push(form.slice(0, -5) + 'い');
        }
        // く → い (adverbial)
        if (form.endsWith('く')) {
            results.push(form.slice(0, -1) + 'い');
        }

        return results;
    }
}
