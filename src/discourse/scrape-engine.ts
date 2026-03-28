/**
 * Vault-Wide Scrape Engine (スクレープエンジン)
 *
 * Scans all markdown files in the vault (or a configured folder),
 * runs discourse grammar detection on each, and builds:
 *   - GrammarBitOccurrence entries for the OccurrenceIndex
 *   - CoOccurrenceConstellations for the constellation store
 *   - CoOperationMatches for the cooperation template store
 *
 * The scrape runs asynchronously in batches to stay non-blocking.
 */

import { App, TFile } from 'obsidian';
import { CoOccurrenceConstellation, GrammarBitOccurrence, CoOperationMatch } from '../types';
import { buildConstellation } from './co-occurrence';
import { extractOccurrences } from './occurrence-index';
import { matchTemplates } from './cooperation-templates';

// ─── Scrape result ────────────────────────────────────────────────────────────

export interface ScrapeResult {
    filesScanned: number;
    occurrencesFound: number;
    constellationsBuilt: number;
    templateMatchesFound: number;
    errors: string[];
}

// ─── Scrape state ─────────────────────────────────────────────────────────────

interface ScrapeIndexData {
    version: number;
    scannedAt: number;
    occurrences: GrammarBitOccurrence[];
    constellations: CoOccurrenceConstellation[];
    matches: CoOperationMatch[];
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ScrapeEngine {
    private app: App;
    private scrapeIndexPath: string;
    private scrapeFolderPath: string;
    private batchSize: number;

    private occurrences: GrammarBitOccurrence[] = [];
    private constellations: CoOccurrenceConstellation[] = [];
    private matches: CoOperationMatch[] = [];
    private loaded = false;

    private onProgress?: (scanned: number, total: number) => void;
    private abortRequested = false;

    constructor(
        app: App,
        scrapeIndexPath: string,
        scrapeFolderPath: string,
        batchSize = 20,
    ) {
        this.app = app;
        this.scrapeIndexPath = scrapeIndexPath;
        this.scrapeFolderPath = scrapeFolderPath;
        this.batchSize = batchSize;
    }

    setProgressCallback(cb: (scanned: number, total: number) => void): void {
        this.onProgress = cb;
    }

    abort(): void {
        this.abortRequested = true;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    async load(): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(this.scrapeIndexPath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                const data: ScrapeIndexData = JSON.parse(content);
                this.occurrences   = data.occurrences   ?? [];
                this.constellations = data.constellations ?? [];
                this.matches       = data.matches        ?? [];
            }
        } catch {
            this.occurrences   = [];
            this.constellations = [];
            this.matches       = [];
        }
        this.loaded = true;
    }

    async save(): Promise<void> {
        const data: ScrapeIndexData = {
            version: 1,
            scannedAt: Date.now(),
            occurrences: this.occurrences,
            constellations: this.constellations,
            matches: this.matches,
        };
        const json = JSON.stringify(data, null, 2);
        const file = this.app.vault.getAbstractFileByPath(this.scrapeIndexPath);
        if (file instanceof TFile) {
            await this.app.vault.modify(file, json);
        } else {
            await this.app.vault.create(this.scrapeIndexPath, json);
        }
    }

    // ── Scrape ────────────────────────────────────────────────────────────────

    /**
     * Run a full scrape of the configured folder (or vault).
     * Processes files in batches; yields to the event loop between batches.
     */
    async runFullScrape(): Promise<ScrapeResult> {
        if (!this.loaded) await this.load();
        this.abortRequested = false;

        // Clear existing scraped data
        this.occurrences   = this.occurrences.filter(o => !o.scraped);
        this.constellations = this.constellations.filter(c => {
            // Keep constellations whose chunkId is from a captured (non-scraped) chunk
            // We identify scraped constellations by a prefix
            return !c.chunkId.startsWith('scrape_');
        });
        this.matches = this.matches.filter(m => !m.scraped);

        const errors: string[] = [];
        const files = this.getMarkdownFiles();
        const total = files.length;
        let scanned = 0;
        let occurrencesFound = 0;
        let constellationsBuilt = 0;
        let templateMatchesFound = 0;

        // Process in batches
        for (let i = 0; i < files.length; i += this.batchSize) {
            if (this.abortRequested) break;

            const batch = files.slice(i, i + this.batchSize);
            for (const file of batch) {
                if (this.abortRequested) break;
                try {
                    const result = await this.scrapeFile(file);
                    occurrencesFound    += result.occurrences;
                    constellationsBuilt += result.constellations;
                    templateMatchesFound += result.matches;
                    scanned++;
                } catch (e) {
                    errors.push(`${file.path}: ${String(e)}`);
                    scanned++;
                }
            }
            this.onProgress?.(scanned, total);
            // Yield to event loop
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        await this.save();

        return {
            filesScanned: scanned,
            occurrencesFound,
            constellationsBuilt,
            templateMatchesFound,
            errors,
        };
    }

    /**
     * Incrementally scrape a single file (e.g., on file save).
     */
    async scrapeFilePath(filePath: string): Promise<void> {
        if (!this.loaded) await this.load();

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        // Remove existing scraped data for this file
        this.occurrences    = this.occurrences.filter(o => o.sourceFile !== filePath || !o.scraped);
        this.constellations = this.constellations.filter(c =>
            !c.chunkId.startsWith(`scrape_${filePath}`)
        );
        this.matches = this.matches.filter(m => m.sourceFile !== filePath || !m.scraped);

        try {
            await this.scrapeFile(file);
            await this.save();
        } catch {
            // Silently ignore errors for incremental scrape
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private getMarkdownFiles(): TFile[] {
        const allFiles = this.app.vault.getMarkdownFiles();
        if (!this.scrapeFolderPath || this.scrapeFolderPath === '') {
            return allFiles;
        }
        const prefix = this.scrapeFolderPath.endsWith('/')
            ? this.scrapeFolderPath
            : this.scrapeFolderPath + '/';
        return allFiles.filter(f => f.path.startsWith(prefix));
    }

    private async scrapeFile(file: TFile): Promise<{ occurrences: number; constellations: number; matches: number }> {
        const content = await this.app.vault.read(file);
        // Split into paragraphs / utterance-like chunks (split on blank lines or JP sentence boundaries)
        const chunks = this.splitIntoChunks(content);

        let occCount  = 0;
        let constCount = 0;
        let matchCount = 0;

        for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
            const chunkText = chunks[chunkIdx].trim();
            if (!chunkText || chunkText.length < 5) continue;

            const chunkId = `scrape_${file.path}_${chunkIdx}`;

            // Build constellation
            const constellation = buildConstellation(chunkId, chunkText);
            if (constellation.bits.length === 0) continue;

            this.constellations.push(constellation);
            constCount++;

            // Extract co-occurring bit surfaces
            const coOccurringBits = [...new Set(constellation.bits.map(b => b.stemFamily))];

            // Extract occurrences
            const occs = extractOccurrences(
                chunkText,
                chunkId,
                constellation.id,
                file.path,
                file.basename,
                'utterance',
                coOccurringBits,
                undefined,
                true, // scraped = true
            );
            this.occurrences.push(...occs);
            occCount += occs.length;

            // Match templates
            const templateMatches = matchTemplates(constellation, chunkText, file.path, true);
            this.matches.push(...templateMatches);
            matchCount += templateMatches.length;
        }

        return { occurrences: occCount, constellations: constCount, matches: matchCount };
    }

    private splitIntoChunks(text: string): string[] {
        // Split on blank lines first, then on JP sentence-ending characters
        const paragraphs = text.split(/\n{2,}/);
        const chunks: string[] = [];
        for (const para of paragraphs) {
            // Further split long paragraphs on JP sentence boundaries
            const sentences = para.split(/(?<=[。！？])/);
            for (const sent of sentences) {
                const trimmed = sent.trim();
                if (trimmed.length > 0) chunks.push(trimmed);
            }
        }
        return chunks;
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    getOccurrences(): GrammarBitOccurrence[] { return [...this.occurrences]; }
    getConstellations(): CoOccurrenceConstellation[] { return [...this.constellations]; }
    getMatches(): CoOperationMatch[] { return [...this.matches]; }

    get occurrenceCount(): number { return this.occurrences.length; }
    get constellationCount(): number { return this.constellations.length; }
    get matchCount(): number { return this.matches.length; }
}
