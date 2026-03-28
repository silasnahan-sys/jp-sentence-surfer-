/**
 * discourse-index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Chunk capture & multi-dimensional indexing for 談話文法.
 *
 * Captured chunks are indexed by:
 *   - Discourse markers present (opening, closing, internal)
 *   - Logical flow patterns
 *   - Collocation strings (from jp-collocations vault)
 *   - Source file / note
 *   - Timestamp / position
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { App, TFile } from 'obsidian';
import { DiscourseChunk, DiscourseMarker } from '../types';
import { detectPatternsInText, detectLogicalFlow } from './discourse-grammar';
import { expandToLogicalBoundary, parseUtterances } from './discourse-parser';

// ─── Index structure ──────────────────────────────────────────────────────────

export interface DiscourseIndexEntry {
    id: string;
    chunk: DiscourseChunk;
    /** All unique marker IDs in this chunk */
    markerIds: string[];
    /** All unique pattern set IDs */
    patternSetIds: string[];
    /** Collocation strings found in this chunk */
    collocations: string[];
    /** ISO timestamp of capture */
    capturedAt: string;
    /** Source note path */
    sourcePath: string;
}

/** In-memory multi-dimensional index */
export class DiscourseIndex {
    private entries: Map<string, DiscourseIndexEntry> = new Map();
    /** by-marker inverted index: markerLabel → entry IDs */
    private byMarker: Map<string, Set<string>> = new Map();
    /** by-patternSet: patternSetId → entry IDs */
    private byPattern: Map<string, Set<string>> = new Map();
    /** by-collocation: collocation → entry IDs */
    private byCollocation: Map<string, Set<string>> = new Map();
    /** by-source: sourcePath → entry IDs */
    private bySource: Map<string, Set<string>> = new Map();

    private app: App;
    private indexPath: string;

    constructor(app: App, indexPath: string) {
        this.app = app;
        this.indexPath = indexPath;
    }

    // ─── Capture ────────────────────────────────────────────────────────────

    async captureChunk(
        text: string,
        rawStart: number,
        rawEnd: number,
        sourcePath: string,
        expandLogically = true,
    ): Promise<DiscourseIndexEntry> {
        let start = rawStart;
        let end = rawEnd;

        if (expandLogically) {
            // Get the full text from the source note for boundary detection
            const file = this.app.vault.getAbstractFileByPath(sourcePath);
            if (file instanceof TFile) {
                const fullText = await this.app.vault.read(file);
                const expanded = expandToLogicalBoundary(fullText, start, end);
                start = expanded.start;
                end = expanded.end;
                text = fullText.slice(start, end);
            }
        }

        const markers = detectPatternsInText(text, start);
        const utterances = parseUtterances(text);
        const utteranceMarkers = utterances.map(u => detectPatternsInText(u.text, u.start));
        const logicalFlows = detectLogicalFlow(utteranceMarkers);

        const openingMarkers = markers.filter(m => m.isOpening);
        const closingMarkers = markers.filter(m => m.isClosing);
        const internalMarkers = markers.filter(m => !m.isOpening && !m.isClosing);

        const chunk: DiscourseChunk = {
            id: `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            text,
            rawText: text,
            start,
            end,
            sourcePath,
            markers,
            openingMarkers,
            closingMarkers,
            internalMarkers,
            logicalFlows: logicalFlows.map(lf => ({
                patternId: lf.pattern.id,
                name: lf.pattern.name,
                description: lf.pattern.description,
                confidence: lf.confidence,
            })),
            utterances,
            capturedAt: new Date().toISOString(),
        };

        const markerIds = [...new Set(markers.map(m => m.label))];
        const patternSetIds = [...new Set(markers.map(m => m.type + ':' + m.subcategory))];

        const entry: DiscourseIndexEntry = {
            id: chunk.id,
            chunk,
            markerIds,
            patternSetIds,
            collocations: [],
            capturedAt: chunk.capturedAt,
            sourcePath,
        };

        this.addEntry(entry);
        await this.persist();
        return entry;
    }

    // ─── Index management ────────────────────────────────────────────────────

    private addEntry(entry: DiscourseIndexEntry): void {
        this.entries.set(entry.id, entry);

        for (const mid of entry.markerIds) {
            if (!this.byMarker.has(mid)) this.byMarker.set(mid, new Set());
            this.byMarker.get(mid)!.add(entry.id);
        }
        for (const pid of entry.patternSetIds) {
            if (!this.byPattern.has(pid)) this.byPattern.set(pid, new Set());
            this.byPattern.get(pid)!.add(entry.id);
        }
        for (const col of entry.collocations) {
            if (!this.byCollocation.has(col)) this.byCollocation.set(col, new Set());
            this.byCollocation.get(col)!.add(entry.id);
        }
        if (!this.bySource.has(entry.sourcePath)) {
            this.bySource.set(entry.sourcePath, new Set());
        }
        this.bySource.get(entry.sourcePath)!.add(entry.id);
    }

    removeEntry(id: string): void {
        const entry = this.entries.get(id);
        if (!entry) return;
        this.entries.delete(id);
        for (const mid of entry.markerIds) this.byMarker.get(mid)?.delete(id);
        for (const pid of entry.patternSetIds) this.byPattern.get(pid)?.delete(id);
        for (const col of entry.collocations) this.byCollocation.get(col)?.delete(id);
        this.bySource.get(entry.sourcePath)?.delete(id);
    }

    // ─── Query API ───────────────────────────────────────────────────────────

    getAll(): DiscourseIndexEntry[] {
        return [...this.entries.values()].sort(
            (a, b) => b.capturedAt.localeCompare(a.capturedAt)
        );
    }

    getByMarker(markerLabel: string): DiscourseIndexEntry[] {
        const ids = this.byMarker.get(markerLabel) ?? new Set();
        return [...ids].map(id => this.entries.get(id)!).filter(Boolean);
    }

    getByPattern(patternSetId: string): DiscourseIndexEntry[] {
        const ids = this.byPattern.get(patternSetId) ?? new Set();
        return [...ids].map(id => this.entries.get(id)!).filter(Boolean);
    }

    getByCollocation(coll: string): DiscourseIndexEntry[] {
        const ids = this.byCollocation.get(coll) ?? new Set();
        return [...ids].map(id => this.entries.get(id)!).filter(Boolean);
    }

    getBySource(sourcePath: string): DiscourseIndexEntry[] {
        const ids = this.bySource.get(sourcePath) ?? new Set();
        return [...ids].map(id => this.entries.get(id)!).filter(Boolean);
    }

    search(query: string): DiscourseIndexEntry[] {
        const q = query.toLowerCase();
        return this.getAll().filter(e =>
            e.chunk.text.includes(query) ||
            e.markerIds.some(m => m.toLowerCase().includes(q)) ||
            e.collocations.some(c => c.toLowerCase().includes(q))
        );
    }

    /** All unique marker labels in the index */
    allMarkerLabels(): string[] {
        return [...this.byMarker.keys()].sort();
    }

    /** All unique pattern set IDs in the index */
    allPatternSetIds(): string[] {
        return [...this.byPattern.keys()].sort();
    }

    size(): number {
        return this.entries.size;
    }

    // ─── Persistence (vault JSON file) ───────────────────────────────────────

    async persist(): Promise<void> {
        const data = JSON.stringify(this.toJSON(), null, 2);
        const existing = this.app.vault.getAbstractFileByPath(this.indexPath);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, data);
        } else {
            // Create parent dirs if needed
            const parts = this.indexPath.split('/');
            if (parts.length > 1) {
                const dir = parts.slice(0, -1).join('/');
                try {
                    await this.app.vault.createFolder(dir);
                } catch (_) { /* folder may already exist */ }
            }
            await this.app.vault.create(this.indexPath, data);
        }
    }

    async load(): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(this.indexPath);
        if (!(file instanceof TFile)) return;
        try {
            const raw = await this.app.vault.read(file);
            const data = JSON.parse(raw) as ReturnType<typeof this.toJSON>;
            this.entries.clear();
            this.byMarker.clear();
            this.byPattern.clear();
            this.byCollocation.clear();
            this.bySource.clear();
            for (const entry of data.entries) {
                this.addEntry(entry as DiscourseIndexEntry);
            }
        } catch (e) {
            console.warn('[DiscourseIndex] Failed to load index:', e);
        }
    }

    toJSON(): { version: number; entries: DiscourseIndexEntry[] } {
        return { version: 1, entries: [...this.entries.values()] };
    }
}
