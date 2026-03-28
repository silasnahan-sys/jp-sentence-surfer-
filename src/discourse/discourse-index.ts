import { detectDiscourseMarkers, DetectedMarker, DiscourseCategory } from './discourse-grammar';
import { GranularityLevel } from './discourse-parser';

export interface SourceInfo {
    filePath: string;
    offset: number;
    timestamp?: string;
    videoUrl?: string;
}

export interface CapturedChunk {
    id: string;
    text: string;
    level: GranularityLevel;
    source: SourceInfo;
    markers: DetectedMarker[];
    categories: DiscourseCategory[];
    collocationIds: string[];
    capturedAt: number;
}

export interface MarkerFrequency {
    patternId: string;
    count: number;
    percentage: number;
}

export class DiscourseIndex {
    private chunks: Map<string, CapturedChunk> = new Map();
    private markerIndex: Map<string, Set<string>> = new Map();
    private categoryIndex: Map<string, Set<string>> = new Map();
    private collocationIndex: Map<string, Set<string>> = new Map();
    private sourceIndex: Map<string, Set<string>> = new Map();

    captureChunk(
        text: string,
        level: GranularityLevel,
        sourceInfo: SourceInfo,
        markers?: DetectedMarker[],
        collocationIds?: string[]
    ): CapturedChunk {
        const id = `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const resolvedMarkers = markers ?? detectDiscourseMarkers(text);
        const categories = deriveCategories(resolvedMarkers);
        const resolvedCollocationIds = collocationIds ?? [];

        const chunk: CapturedChunk = {
            id,
            text,
            level,
            source: sourceInfo,
            markers: resolvedMarkers,
            categories,
            collocationIds: resolvedCollocationIds,
            capturedAt: Date.now(),
        };

        this.chunks.set(id, chunk);

        // Update marker index
        for (const m of resolvedMarkers) {
            if (!this.markerIndex.has(m.patternId)) this.markerIndex.set(m.patternId, new Set());
            this.markerIndex.get(m.patternId)!.add(id);
        }

        // Update category index
        for (const cat of categories) {
            if (!this.categoryIndex.has(cat)) this.categoryIndex.set(cat, new Set());
            this.categoryIndex.get(cat)!.add(id);
        }

        // Update collocation index
        for (const cid of resolvedCollocationIds) {
            if (!this.collocationIndex.has(cid)) this.collocationIndex.set(cid, new Set());
            this.collocationIndex.get(cid)!.add(id);
        }

        // Update source index
        const fp = sourceInfo.filePath;
        if (!this.sourceIndex.has(fp)) this.sourceIndex.set(fp, new Set());
        this.sourceIndex.get(fp)!.add(id);

        return chunk;
    }

    searchByMarker(markerId: string): CapturedChunk[] {
        const ids = this.markerIndex.get(markerId);
        if (!ids) return [];
        return [...ids].map(id => this.chunks.get(id)!).filter(Boolean);
    }

    searchByCategory(category: DiscourseCategory): CapturedChunk[] {
        const ids = this.categoryIndex.get(category);
        if (!ids) return [];
        return [...ids].map(id => this.chunks.get(id)!).filter(Boolean);
    }

    searchByCoOccurrence(marker1: string, marker2: string): CapturedChunk[] {
        const ids1 = this.markerIndex.get(marker1);
        const ids2 = this.markerIndex.get(marker2);
        if (!ids1 || !ids2) return [];
        const intersection = new Set([...ids1].filter(id => ids2.has(id)));
        return [...intersection].map(id => this.chunks.get(id)!).filter(Boolean);
    }

    searchByCollocation(collocationId: string): CapturedChunk[] {
        const ids = this.collocationIndex.get(collocationId);
        if (!ids) return [];
        return [...ids].map(id => this.chunks.get(id)!).filter(Boolean);
    }

    searchBySource(filePath: string): CapturedChunk[] {
        const ids = this.sourceIndex.get(filePath);
        if (!ids) return [];
        return [...ids].map(id => this.chunks.get(id)!).filter(Boolean);
    }

    getAllCapturedChunks(): CapturedChunk[] {
        return [...this.chunks.values()];
    }

    getMarkerFrequency(): MarkerFrequency[] {
        const total = this.chunks.size;
        const freq: MarkerFrequency[] = [];
        for (const [patternId, chunkIds] of this.markerIndex.entries()) {
            const count = chunkIds.size;
            freq.push({
                patternId,
                count,
                percentage: total > 0 ? (count / total) * 100 : 0,
            });
        }
        freq.sort((a, b) => b.count - a.count);
        return freq;
    }

    removeChunk(id: string): boolean {
        const chunk = this.chunks.get(id);
        if (!chunk) return false;

        this.chunks.delete(id);

        for (const m of chunk.markers) {
            this.markerIndex.get(m.patternId)?.delete(id);
        }
        for (const cat of chunk.categories) {
            this.categoryIndex.get(cat)?.delete(id);
        }
        for (const cid of chunk.collocationIds) {
            this.collocationIndex.get(cid)?.delete(id);
        }
        this.sourceIndex.get(chunk.source.filePath)?.delete(id);

        return true;
    }

    clear(): void {
        this.chunks.clear();
        this.markerIndex.clear();
        this.categoryIndex.clear();
        this.collocationIndex.clear();
        this.sourceIndex.clear();
    }

    toJSON(): object {
        return {
            chunks: [...this.chunks.values()].map(c => ({
                ...c,
                markers: c.markers.map(m => ({
                    patternId: m.patternId,
                    matchedText: m.matchedText,
                    startIndex: m.startIndex,
                    endIndex: m.endIndex,
                    position: m.position,
                })),
            })),
        };
    }

    fromJSON(data: any): void {
        this.clear();
        if (!data || !Array.isArray(data.chunks)) return;
        for (const raw of data.chunks) {
            if (!raw || typeof raw.id !== 'string') continue;
            // Re-detect markers to restore full pattern references
            const markers = detectDiscourseMarkers(raw.text ?? '');
            const chunk: CapturedChunk = {
                id: raw.id,
                text: raw.text ?? '',
                level: raw.level ?? 4,
                source: raw.source ?? { filePath: '', offset: 0 },
                markers,
                categories: deriveCategories(markers),
                collocationIds: raw.collocationIds ?? [],
                capturedAt: raw.capturedAt ?? 0,
            };
            this.chunks.set(chunk.id, chunk);

            for (const m of markers) {
                if (!this.markerIndex.has(m.patternId)) this.markerIndex.set(m.patternId, new Set());
                this.markerIndex.get(m.patternId)!.add(chunk.id);
            }
            for (const cat of chunk.categories) {
                if (!this.categoryIndex.has(cat)) this.categoryIndex.set(cat, new Set());
                this.categoryIndex.get(cat)!.add(chunk.id);
            }
            for (const cid of chunk.collocationIds) {
                if (!this.collocationIndex.has(cid)) this.collocationIndex.set(cid, new Set());
                this.collocationIndex.get(cid)!.add(chunk.id);
            }
            const fp = chunk.source.filePath;
            if (!this.sourceIndex.has(fp)) this.sourceIndex.set(fp, new Set());
            this.sourceIndex.get(fp)!.add(chunk.id);
        }
    }
}

function deriveCategories(markers: DetectedMarker[]): DiscourseCategory[] {
    const seen = new Set<DiscourseCategory>();
    for (const m of markers) {
        seen.add(m.pattern.category);
    }
    return [...seen];
}
