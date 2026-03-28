import { DetectedMarker, DiscourseCategory, detectPatterns } from './discourse-grammar';

export interface DiscourseChunkEntry {
    id: string;
    text: string;
    sourcePath: string;
    startOffset: number;
    endOffset: number;
    capturedAt: number;
    markers: DetectedMarker[];
    markerCategories: DiscourseCategory[];
    coOccurringPatterns: string[][];
    collocationsPresent: string[];
    surroundingContext: string;
}

export class DiscourseIndex {
    private entries: DiscourseChunkEntry[];
    private plugin: any;

    constructor(plugin: any) {
        this.plugin = plugin;
        this.entries = [];
    }

    captureChunk(text: string, sourcePath: string, startOffset: number, endOffset: number): DiscourseChunkEntry {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        const markers = detectPatterns(text);

        const markerCategories = [...new Set(markers.map(m => m.category))];

        const coOccurringPatterns: string[][] = [];
        for (let i = 0; i < markers.length; i++) {
            for (let j = i + 1; j < markers.length; j++) {
                const a = markers[i];
                const b = markers[j];
                const distance = Math.abs(a.startOffset - b.startOffset);
                if (distance <= 50) {
                    coOccurringPatterns.push([a.patternId, b.patternId]);
                }
            }
        }

        const collocationsPresent = markers.map(m => m.matchedText);

        const entry: DiscourseChunkEntry = {
            id,
            text,
            sourcePath,
            startOffset,
            endOffset,
            capturedAt: Date.now(),
            markers,
            markerCategories,
            coOccurringPatterns,
            collocationsPresent,
            surroundingContext: text.slice(0, 200),
        };

        this.entries.push(entry);
        return entry;
    }

    queryByPattern(patternId: string): DiscourseChunkEntry[] {
        return this.entries.filter(e => e.markers.some(m => m.patternId === patternId));
    }

    queryByCategory(category: DiscourseCategory): DiscourseChunkEntry[] {
        return this.entries.filter(e => e.markerCategories.includes(category));
    }

    queryBySource(sourcePath: string): DiscourseChunkEntry[] {
        return this.entries.filter(e => e.sourcePath === sourcePath);
    }

    queryByCoOccurrence(patternId1: string, patternId2: string): DiscourseChunkEntry[] {
        return this.entries.filter(e =>
            e.coOccurringPatterns.some(
                pair =>
                    (pair[0] === patternId1 && pair[1] === patternId2) ||
                    (pair[0] === patternId2 && pair[1] === patternId1)
            )
        );
    }

    getAllEntries(): DiscourseChunkEntry[] {
        return [...this.entries];
    }

    removeEntry(id: string): void {
        this.entries = this.entries.filter(e => e.id !== id);
    }

    async save(): Promise<void> {
        const existing = (await this.plugin.loadData()) ?? {};
        await this.plugin.saveData({ ...existing, discourseIndex: this.entries });
    }

    async load(): Promise<void> {
        const data = await this.plugin.loadData();
        this.entries = data?.discourseIndex ?? [];
    }
}
