/**
 * Full transcript chunking test — the real ~53 min video content
 * Tests both the no-blank-line path (fixed-size groups of 5)
 * and what happens if we add paragraph breaks at natural topic points.
 */

interface SurfUnit { text: string; start: number; end: number; }

function buildFixedSizeTranscriptChunks(rawText: string, groupSize: number): SurfUnit[] {
    const chunks: SurfUnit[] = [];
    const lines = rawText.split('\n');
    let tsCount = 0;
    let chunkStart = -1;
    let lastEnd = 0;
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineEnd = offset + lines[i].length;
        const trimmed = lines[i].trim();
        const isTimestamp = /^\[[\d:.,]+\]\(/.test(trimmed);
        if (trimmed.length > 0) {
            if (chunkStart < 0) chunkStart = offset;
            lastEnd = lineEnd;
            if (isTimestamp) tsCount++;
            if (tsCount >= groupSize) {
                const text = rawText.slice(chunkStart, lastEnd).trim();
                if (text.length > 0) chunks.push({ text, start: chunkStart, end: lastEnd });
                chunkStart = -1;
                tsCount = 0;
            }
        }
        offset = lineEnd + 1;
    }
    if (chunkStart >= 0 && lastEnd > chunkStart) {
        const text = rawText.slice(chunkStart, lastEnd).trim();
        if (text.length > 0) chunks.push({ text, start: chunkStart, end: lastEnd });
    }
    return chunks;
}

function buildTranscriptChunks(rawText: string): SurfUnit[] {
    const chunks: SurfUnit[] = [];
    const lines = rawText.split('\n');
    let chunkStart = -1;
    let lastNonEmptyEnd = 0;
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineEnd = offset + lines[i].length;
        const trimmed = lines[i].trim();
        if (trimmed.length === 0) {
            if (chunkStart >= 0) {
                const text = rawText.slice(chunkStart, lastNonEmptyEnd).trim();
                if (text.length > 0) chunks.push({ text, start: chunkStart, end: lastNonEmptyEnd });
                chunkStart = -1;
            }
        } else {
            if (chunkStart < 0) chunkStart = offset;
            lastNonEmptyEnd = lineEnd;
        }
        offset = lineEnd + 1;
    }
    if (chunkStart >= 0 && lastNonEmptyEnd > chunkStart) {
        const text = rawText.slice(chunkStart, lastNonEmptyEnd).trim();
        if (text.length > 0) chunks.push({ text, start: chunkStart, end: lastNonEmptyEnd });
    }
    if (chunks.length <= 1 && lines.filter(l => /^\[[\d:.,]+\]\(/.test(l.trim())).length > 5) {
        return buildFixedSizeTranscriptChunks(rawText, 5);
    }
    return chunks.length > 0 ? chunks : [{ text: rawText.trim(), start: 0, end: rawText.length }];
}

// Read from file
const fs = require('fs');
const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node test-chunks-full.js <transcript-file>'); process.exit(1); }
const rawText = fs.readFileSync(filePath, 'utf-8');

const chunks = buildTranscriptChunks(rawText);
const lines = rawText.split('\n');
const tsLines = lines.filter((l: string) => /^\[[\d:.,]+\]\(/.test(l.trim())).length;

console.log(`Transcript: ${rawText.length} chars, ${lines.length} lines, ${tsLines} timestamp lines`);
console.log(`Chunks: ${chunks.length}\n`);

// Timestamp extractor
function extractTime(text: string): string {
    const m = text.match(/^\[([^\]]+)\]/);
    return m ? m[1] : '??:??';
}

chunks.forEach((c: SurfUnit, i: number) => {
    const cLines = c.text.split('\n');
    const first = extractTime(cLines[0]);
    const last = extractTime(cLines[cLines.length - 1]);
    console.log(`  Chunk ${String(i + 1).padStart(2)}: [${first} → ${last}]  ${cLines.length} lines, ${c.text.length} chars`);
});

// Coverage check
let lastEnd = 0;
let gaps = 0;
for (const c of chunks) {
    if (c.start > lastEnd) {
        const gapText = rawText.slice(lastEnd, c.start);
        if (gapText.trim().length > 0) { gaps++; }
    }
    lastEnd = Math.max(lastEnd, c.end);
}
if (lastEnd < rawText.length && rawText.slice(lastEnd).trim().length > 0) gaps++;
console.log(`\n${gaps === 0 ? '✓ Full coverage' : `✗ ${gaps} gap(s)`}`);

// Stats
const sizes = chunks.map((c: SurfUnit) => c.text.length);
console.log(`Chunk sizes: min=${Math.min(...sizes)}, max=${Math.max(...sizes)}, avg=${Math.round(sizes.reduce((a: number, b: number) => a + b, 0) / sizes.length)}`);

// Check if last chunk is too small (runt)
if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    const avgSize = sizes.reduce((a: number, b: number) => a + b, 0) / (sizes.length - 1);
    if (lastChunk.text.length < avgSize * 0.3) {
        console.log(`⚠ Last chunk is a runt (${lastChunk.text.length} chars vs avg ${Math.round(avgSize)})`);
    }
}
