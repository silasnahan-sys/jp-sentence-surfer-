import { DiscourseGranularity } from './discourse-parser';
import {
    DetectedPattern,
    DiscoursePatternCategory,
    detectDiscoursePatterns,
} from './discourse-grammar';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiscourseChunkEntry {
    id: string;
    text: string;
    cleanText: string;
    granularity: DiscourseGranularity;
    sourceFile: string;
    sourceOffset: { start: number; end: number };
    timestamp?: string;
    ytUrl?: string;
    openingMarkers: DetectedPattern[];
    closingMarkers: DetectedPattern[];
    internalMarkers: DetectedPattern[];
    collocations: string[];
    patternTags: string[];
    context: {
        before: string;
        after: string;
        fullUtterance: string;
    };
    capturedAt: number;
}

export interface DiscourseIndexData {
    version: number;
    entries: DiscourseChunkEntry[];
    lastUpdated: number;
}

// ─── Index class ──────────────────────────────────────────────────────────────

export class DiscourseIndex {
    private entries: DiscourseChunkEntry[] = [];

    constructor() {}

    addEntry(entry: DiscourseChunkEntry): void {
        this.entries.push(entry);
    }

    removeEntry(id: string): void {
        this.entries = this.entries.filter(e => e.id !== id);
    }

    searchByMarker(surfaceForm: string): DiscourseChunkEntry[] {
        return this.entries.filter(e =>
            [...e.openingMarkers, ...e.closingMarkers, ...e.internalMarkers]
                .some(m => m.surfaceForm === surfaceForm)
        );
    }

    searchByPatternCategory(category: DiscoursePatternCategory): DiscourseChunkEntry[] {
        return this.entries.filter(e =>
            [...e.openingMarkers, ...e.closingMarkers, ...e.internalMarkers]
                .some(m => m.category === category)
        );
    }

    searchByGranularity(granularity: DiscourseGranularity): DiscourseChunkEntry[] {
        return this.entries.filter(e => e.granularity === granularity);
    }

    searchByText(query: string): DiscourseChunkEntry[] {
        const lower = query.toLowerCase();
        return this.entries.filter(e =>
            e.text.toLowerCase().includes(lower) ||
            e.cleanText.toLowerCase().includes(lower)
        );
    }

    searchBySourceFile(sourceFile: string): DiscourseChunkEntry[] {
        return this.entries.filter(e => e.sourceFile === sourceFile);
    }

    getAllEntries(): DiscourseChunkEntry[] {
        return [...this.entries];
    }

    toJSON(): DiscourseIndexData {
        return {
            version: 1,
            entries: [...this.entries],
            lastUpdated: Date.now(),
        };
    }

    fromJSON(data: DiscourseIndexData): void {
        this.entries = [...data.entries];
    }

    clear(): void {
        this.entries = [];
    }
}

// ─── Factory function ─────────────────────────────────────────────────────────

export function createChunkEntry(params: {
    text: string;
    granularity: DiscourseGranularity;
    sourceFile: string;
    sourceOffset: { start: number; end: number };
    fullText: string;
    timestamp?: string;
    ytUrl?: string;
    collocations?: string[];
}): DiscourseChunkEntry {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const cleanText = params.text.trim();

    const detected = detectDiscoursePatterns(params.text);

    const len = params.text.length;
    const openingThreshold = Math.floor(len * 0.2);
    const closingThreshold = Math.floor(len * 0.8);

    const openingMarkers: DetectedPattern[] = [];
    const closingMarkers: DetectedPattern[] = [];
    const internalMarkers: DetectedPattern[] = [];

    for (const pattern of detected) {
        const pos = pattern.startChar ?? 0;
        if (pos < openingThreshold) {
            openingMarkers.push(pattern);
        } else if (pos >= closingThreshold) {
            closingMarkers.push(pattern);
        } else {
            internalMarkers.push(pattern);
        }
    }

    const patternTags = [...new Set(detected.map(p => p.label))];

    const offset = params.sourceOffset.start;
    const before = params.fullText.slice(Math.max(0, offset - 50), offset);
    const after = params.fullText.slice(
        params.sourceOffset.end,
        params.sourceOffset.end + 50
    );

    return {
        id,
        text: params.text,
        cleanText,
        granularity: params.granularity,
        sourceFile: params.sourceFile,
        sourceOffset: params.sourceOffset,
        timestamp: params.timestamp,
        ytUrl: params.ytUrl,
        openingMarkers,
        closingMarkers,
        internalMarkers,
        collocations: params.collocations ?? [],
        patternTags,
        context: {
            before,
            after,
            fullUtterance: params.text,
        },
        capturedAt: Date.now(),
    };
}
