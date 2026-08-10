/**
 * Quick test: does buildTranscriptChunks produce sensible chunks for
 * a real YTranscript with no blank-line separators?
 *
 * Run: npx ts-node --skip-project test-chunks.ts
 * (or just compile and run with node after tsc)
 */

// Inline the chunk-building logic so we don't need to import the full plugin
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

// ── The test transcript (no blank line separators) ──
const transcript = `[00:02](https://youtu.be/naLCjAM8R5g?t=2) まずは判定しましょう。資本主義は正義か悪か。皇帝よりであればこちらにお願いします。ああ、すごい。極端に分かれたな。 いや、でも僕実は あ、え、カ屋さんそっちなの?あ、そうなんだ。 マジ裏切り物。
[00:19](https://youtu.be/naLCjAM8R5g?t=19) え、そんな感じなの? 堀本さん、どうですか? 僕資本主義好きなんですよ。僕まこうやって YouTube
[00:24](https://youtu.be/naLCjAM8R5g?t=24) 作る仕事とかで食ってるんですけど、面白いもの作ってる自信があるんですね。 で、僕が面白いもの作れるようになったのって資本主義のおかげなんですよ。
[00:57](https://youtu.be/naLCjAM8R5g?t=57) 黒川さん、どうですか? 僕はね、好きじゃないですね。
[01:07](https://youtu.be/naLCjAM8R5g?t=67) 1 人にいい悪いで断ぜられないのは資本主義社会に生まれてきてしまった以上分かっているのですが受け付けられないところが多すぎてですね。
[01:21](https://youtu.be/naLCjAM8R5g?t=81) 収ですね。 環境にいいとされてたくさん作ってとかにもなったけど結局環境に悪いじゃないか。
[01:34](https://youtu.be/naLCjAM8R5g?t=94) あれ信じられないすよね。 信じられんですよ。
[01:41](https://youtu.be/naLCjAM8R5g?t=101) やめた方がいい。 じゃあちょっと革命を起こした方がいいと思
[02:06](https://youtu.be/naLCjAM8R5g?t=126) 僕はね、だからそうじゃないと思う。 忙しいな、この人。
[02:25](https://youtu.be/naLCjAM8R5g?t=145) うん。 間て相んですが僕はずっとこんなことしたくないのに思いながらやっ
[02:44](https://youtu.be/naLCjAM8R5g?t=164) だから真し目に言ってもさ子家の問題とかは資本主義の良くないところが出ている。
[03:03](https://youtu.be/naLCjAM8R5g?t=183) 分かりますよ。 僕もそう思うぞ。
[03:18](https://youtu.be/naLCjAM8R5g?t=198) でも僕やっぱ85% ぐらいはこっちですね。資本主義の方を持ちたいですね。
[03:28](https://youtu.be/naLCjAM8R5g?t=208) はい。これなんかちゃんとした定義難しいからさ、
[03:56](https://youtu.be/naLCjAM8R5g?t=236) うん。だ、さっきの堀本さんの主張で僕が違和感あったのは
[04:23](https://youtu.be/naLCjAM8R5g?t=263) あの記事読んだよ。めっちゃ良かったねって言われて、
[04:35](https://youtu.be/naLCjAM8R5g?t=275) には分かるいい記事を出してたように聞こえちゃうんだけど
[04:48](https://youtu.be/naLCjAM8R5g?t=288) ブログ界隈って界隈みんな友達だから会った時褒めてくれんの?
[05:00](https://youtu.be/naLCjAM8R5g?t=300) 何が言いたいかって言うと、
[05:19](https://youtu.be/naLCjAM8R5g?t=319) ちゃんとすれてんな。
[05:49](https://youtu.be/naLCjAM8R5g?t=349) あれ、これ俺作ってるものゴミだなって。`;

const chunks = buildTranscriptChunks(transcript);

console.log(`Total transcript length: ${transcript.length} chars`);
console.log(`Total lines: ${transcript.split('\n').length}`);
console.log(`Timestamp lines: ${transcript.split('\n').filter(l => /^\[[\d:.,]+\]\(/.test(l.trim())).length}`);
console.log(`Chunks produced: ${chunks.length}\n`);

chunks.forEach((c, i) => {
    const firstLine = c.text.split('\n')[0];
    const lineCount = c.text.split('\n').length;
    const preview = firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
    console.log(`  Chunk ${i + 1}: ${lineCount} lines, ${c.text.length} chars [${c.start}..${c.end}]`);
    console.log(`    ${preview}`);
    console.log();
});

// Verify coverage: chunks should tile the text without gaps
let lastEnd = 0;
let gaps = 0;
for (const c of chunks) {
    if (c.start > lastEnd) {
        const gapText = transcript.slice(lastEnd, c.start);
        if (gapText.trim().length > 0) {
            console.log(`⚠ Gap with content between ${lastEnd} and ${c.start}: "${gapText.trim().slice(0, 50)}"`);
            gaps++;
        }
    }
    lastEnd = Math.max(lastEnd, c.end);
}
if (lastEnd < transcript.length) {
    const tail = transcript.slice(lastEnd).trim();
    if (tail.length > 0) {
        console.log(`⚠ Uncovered tail: "${tail.slice(0, 50)}"`);
        gaps++;
    }
}
console.log(gaps === 0 ? '✓ Full coverage — no content gaps' : `✗ ${gaps} gap(s) found`);
