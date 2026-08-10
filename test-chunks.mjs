// Quick test: verify chunk detection on the real YTranscript
import { readFileSync } from 'fs';

// Inline the chunk logic from scope-engine.ts for testing
function buildTranscriptChunks(rawText) {
    const chunks = [];
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

function buildFixedSizeTranscriptChunks(rawText, groupSize) {
    const chunks = [];
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

// The transcript
const transcript = readFileSync('test-transcript.txt', 'utf8');

const chunks = buildTranscriptChunks(transcript);
console.log(`Total lines: ${transcript.split('\n').filter(l => l.trim()).length}`);
console.log(`Timestamp lines: ${transcript.split('\n').filter(l => /^\[[\d:.,]+\]\(/.test(l.trim())).length}`);
console.log(`Chunks: ${chunks.length}\n`);

chunks.forEach((c, i) => {
    const lines = c.text.split('\n').filter(l => l.trim());
    const first = c.text.slice(0, 60).replace(/\n/g, '⏎');
    const last = c.text.slice(-40).replace(/\n/g, '⏎');
    console.log(`Chunk ${i+1}: ${lines.length} lines, ${c.text.length} chars [${c.start}-${c.end}]`);
    console.log(`  First: ${first}…`);
    console.log(`  Last:  …${last}`);
    console.log();
});
