/**
 * Discourse Chunk Capture & Indexing System
 *
 * When a user captures a chunk at any granularity level, this module:
 *  1. Runs full discourse grammar analysis on the chunk
 *  2. Creates a DiscourseChunkEntry with all metadata
 *  3. Builds a CoOccurrenceConstellation for the chunk
 *  4. Extracts GrammarBitOccurrence entries into the OccurrenceIndex
 *  5. Matches CoOperation templates
 *  6. Maintains a multi-dimensional index for fast lookup
 *  7. Persists to a JSON file in the vault
 */

import { App, TFile, Notice } from 'obsidian';
import {
    DiscourseChunkEntry,
    DiscourseGranularity,
    DiscourseMarker,
    DiscoursePatternType,
    DiscourseUnit,
    CoOccurrenceConstellation,
    GrammarBitOccurrence,
    CoOperationMatch,
} from '../types';
import { analyzeDiscourseChunk } from './discourse-grammar';
import { expandContext } from './discourse-parser';
import { buildConstellation } from './co-occurrence';
import { OccurrenceIndex, extractOccurrences } from './occurrence-index';
import { matchTemplates, COOPERATION_TEMPLATES } from './cooperation-templates';

// ─── Index structure ──────────────────────────────────────────────────────────

interface DiscourseIndexData {
    version: number;
    entries: DiscourseChunkEntry[];
    constellations?: CoOccurrenceConstellation[];
    coopMatches?: CoOperationMatch[];
}

// ─── Main DiscourseIndex class ────────────────────────────────────────────────

export class DiscourseIndex {
    private app: App;
    private indexPath: string;
    private entries: Map<string, DiscourseChunkEntry> = new Map();
    private constellations: Map<string, CoOccurrenceConstellation> = new Map();
    private coopMatches: CoOperationMatch[] = [];

    /** OccurrenceIndex is stored separately but managed here */
    occurrenceIndex: OccurrenceIndex;

    private loaded = false;

    constructor(app: App, indexPath: string) {
        this.app = app;
        this.indexPath = indexPath;
        // OccurrenceIndex lives next to the main index
        const occPath = indexPath.replace(/\.json$/, '-occurrences.json');
        this.occurrenceIndex = new OccurrenceIndex(app, occPath);
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    async load(): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(this.indexPath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                const data: DiscourseIndexData = JSON.parse(content);
                this.entries.clear();
                for (const entry of data.entries ?? []) {
                    this.entries.set(entry.id, entry);
                }
                this.constellations.clear();
                for (const c of data.constellations ?? []) {
                    this.constellations.set(c.id, c);
                }
                this.coopMatches = data.coopMatches ?? [];
            }
        } catch {
            // Index doesn't exist yet — start fresh
        }
        await this.occurrenceIndex.load();
        this.loaded = true;
    }

    async save(): Promise<void> {
        const data: DiscourseIndexData = {
            version: 2,
            entries: Array.from(this.entries.values()),
            constellations: Array.from(this.constellations.values()),
            coopMatches: this.coopMatches,
        };
        const json = JSON.stringify(data, null, 2);
        const file = this.app.vault.getAbstractFileByPath(this.indexPath);
        if (file instanceof TFile) {
            await this.app.vault.modify(file, json);
        } else {
            await this.app.vault.create(this.indexPath, json);
        }
        await this.occurrenceIndex.save();
    }

    // ── Entry management ──────────────────────────────────────────────────────

    /**
     * Capture a discourse unit and add it to the index.
     * Also builds a co-occurrence constellation, extracts occurrence entries,
     * and matches co-operation templates.
     * Returns the created entry.
     */
    async captureChunk(
        unit: DiscourseUnit,
        sourceFile: string,
        fullText: string,
        contextMode: 'smart' | 'fixed' = 'smart',
        fixedContextChars = 200,
        collocationsFound: string[] = [],
        ytTimestamp?: string,
    ): Promise<DiscourseChunkEntry> {
        if (!this.loaded) await this.load();

        const analysis = unit.analysis ?? analyzeDiscourseChunk(unit.text);
        const context = expandContext(fullText, unit, contextMode, fixedContextChars);

        const id = generateId(unit.text, sourceFile, unit.start);

        const entry: DiscourseChunkEntry = {
            id,
            text: unit.text,
            granularityLevel: unit.granularity,
            sourceFile,
            sourceOffset: { start: unit.start, end: unit.end },
            openingMarkers: analysis.openingMarkers,
            closingMarkers: analysis.closingMarkers,
            internalMarkers: analysis.internalMarkers,
            boundaryMarkers: analysis.boundaryMarkers,
            collocationsFound,
            discoursePatternTags: analysis.discoursePatternTags,
            timestamp: ytTimestamp,
            context,
            capturedAt: new Date().toISOString(),
        };

        this.entries.set(id, entry);

        // Build co-occurrence constellation
        const constellation = buildConstellation(id, unit.text);
        this.constellations.set(constellation.id, constellation);

        // Extract occurrence entries
        const coOccurringBits = [...new Set(constellation.bits.map(b => b.stemFamily))];
        const occs = extractOccurrences(
            unit.text,
            id,
            constellation.id,
            sourceFile,
            sourceFile.split('/').pop()?.replace(/\.md$/, '') ?? sourceFile,
            unit.granularity,
            coOccurringBits,
            ytTimestamp,
            false,
        );
        this.occurrenceIndex.addOccurrences(occs);

        // Match co-operation templates
        const newMatches = matchTemplates(constellation, unit.text, sourceFile, false);
        this.coopMatches.push(...newMatches);

        await this.save();
        return entry;
    }

    removeEntry(id: string): void {
        this.entries.delete(id);
        // Also remove associated constellations and occurrences
        for (const [cid, c] of this.constellations) {
            if (c.chunkId === id) this.constellations.delete(cid);
        }
        this.coopMatches = this.coopMatches.filter(m => m.chunkId !== id);
        this.occurrenceIndex.removeByChunkId(id);
    }

    async removeAndSave(id: string): Promise<void> {
        this.removeEntry(id);
        await this.save();
    }

    getAll(): DiscourseChunkEntry[] {
        return Array.from(this.entries.values()).sort(
            (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
        );
    }

    getById(id: string): DiscourseChunkEntry | undefined {
        return this.entries.get(id);
    }

    // ── Constellation & co-op accessors ───────────────────────────────────────

    getConstellationForChunk(chunkId: string): CoOccurrenceConstellation | undefined {
        for (const c of this.constellations.values()) {
            if (c.chunkId === chunkId) return c;
        }
        return undefined;
    }

    getAllConstellations(): CoOccurrenceConstellation[] {
        return Array.from(this.constellations.values());
    }

    getCoopMatches(): CoOperationMatch[] {
        return [...this.coopMatches];
    }

    getCoopMatchesByTemplate(templateName: string): CoOperationMatch[] {
        return this.coopMatches.filter(m => m.templateName === templateName);
    }

    get size(): number {
        return this.entries.size;
    }

    // ── Multi-dimensional search ───────────────────────────────────────────────

    /** Find all entries that contain the given opening marker surface form */
    byOpeningMarker(surface: string): DiscourseChunkEntry[] {
        return this.getAll().filter(e =>
            e.openingMarkers.some(m => m.surface === surface || m.surface.includes(surface))
        );
    }

    /** Find all entries that contain the given closing marker surface form */
    byClosingMarker(surface: string): DiscourseChunkEntry[] {
        return this.getAll().filter(e =>
            e.closingMarkers.some(m => m.surface === surface || m.surface.includes(surface))
        );
    }

    /** Find all entries that contain the given internal marker surface form */
    byInternalMarker(surface: string): DiscourseChunkEntry[] {
        return this.getAll().filter(e =>
            e.internalMarkers.some(m => m.surface === surface || m.surface.includes(surface))
        );
    }

    /** Find all entries with a given discourse pattern tag */
    byPatternTag(tag: DiscoursePatternType): DiscourseChunkEntry[] {
        return this.getAll().filter(e => e.discoursePatternTags.includes(tag));
    }

    /** Find all entries that contain a given collocation */
    byCollocation(collocation: string): DiscourseChunkEntry[] {
        return this.getAll().filter(e =>
            e.collocationsFound.some(c => c.includes(collocation))
        );
    }

    /** Find all entries at a given granularity level */
    byGranularity(level: DiscourseGranularity): DiscourseChunkEntry[] {
        return this.getAll().filter(e => e.granularityLevel === level);
    }

    /** Find all entries from a given source file */
    bySourceFile(file: string): DiscourseChunkEntry[] {
        return this.getAll().filter(e => e.sourceFile === file);
    }

    /**
     * General search: filter entries by text, marker, pattern tag, or collocation.
     */
    search(query: string): DiscourseChunkEntry[] {
        const q = query.toLowerCase();
        return this.getAll().filter(e => {
            if (e.text.toLowerCase().includes(q)) return true;
            if (e.openingMarkers.some(m => m.surface.includes(q))) return true;
            if (e.closingMarkers.some(m => m.surface.includes(q))) return true;
            if (e.internalMarkers.some(m => m.surface.includes(q))) return true;
            if (e.discoursePatternTags.some(t => t.includes(q))) return true;
            if (e.collocationsFound.some(c => c.toLowerCase().includes(q))) return true;
            if (e.sourceFile.toLowerCase().includes(q)) return true;
            return false;
        });
    }

    /**
     * Get all unique opening marker surfaces across all entries.
     */
    allOpeningMarkerSurfaces(): string[] {
        const set = new Set<string>();
        for (const e of this.getAll()) {
            for (const m of e.openingMarkers) set.add(m.surface);
        }
        return Array.from(set).sort();
    }

    allClosingMarkerSurfaces(): string[] {
        const set = new Set<string>();
        for (const e of this.getAll()) {
            for (const m of e.closingMarkers) set.add(m.surface);
        }
        return Array.from(set).sort();
    }

    allPatternTags(): DiscoursePatternType[] {
        const set = new Set<DiscoursePatternType>();
        for (const e of this.getAll()) {
            for (const t of e.discoursePatternTags) set.add(t);
        }
        return Array.from(set);
    }

    allCollocations(): string[] {
        const set = new Set<string>();
        for (const e of this.getAll()) {
            for (const c of e.collocationsFound) set.add(c);
        }
        return Array.from(set).sort();
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(text: string, file: string, offset: number): string {
    // Deterministic short ID from content + location
    const raw = `${file}:${offset}:${text.slice(0, 20)}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = (hash << 5) - hash + raw.charCodeAt(i);
        hash |= 0;
    }
    return `dce_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

/**
 * Try to find collocations from the vault's jp-collocations data
 * that appear in the given chunk text.
 *
 * This is a best-effort implementation — it scans the text for known
 * collocation terms extracted from the collocations plugin.
 */
export function findCollocationsInText(
    text: string,
    knownCollocations: string[],
): string[] {
    return knownCollocations.filter(c => text.includes(c));
}
