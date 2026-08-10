import { RelationType } from './RelationTypes';
import { MarkerType } from './MarkerTypes';

/**
 * suggest — lightweight, surface-driven type inference.
 *
 * The relation/marker taxonomies already carry the Japanese connective system
 * that signals each relation. This module turns that latent data into a
 * one-tap shortcut: when you stage a relation or tag a span, the picker can
 * pre-highlight the type whose surface marker actually appears in the text, so
 * the most likely choice is obvious without scanning the whole grid.
 *
 * All functions are PURE (no DOM, no plugin state) so they stay trivially
 * testable and side-effect free. They return a type id (or null) — the caller
 * resolves it against its live, user-extended type list.
 */

/** Strip trailing punctuation/whitespace that would hide an end-marker. */
function tidy(text: string): string {
    return text.replace(/[\s、。，．,.!?！？」』）)]+$/u, '').trim();
}

/**
 * Suggest a relation type from the surface text spanning the link.
 *
 * Discourse relations are typically realised by a connective sitting at the
 * boundary between the two clauses (clause-final から/けど/ので, or clause-initial
 * でも/だから). We scan the combined source+target surface for any built-in
 * connective and return the type whose LONGEST connective matches — longest
 * first so から beats a stray か, でも beats で, というのは beats と.
 *
 * @param sourceText  surface of the source span group
 * @param targetText  surface of the target span group
 * @param types       the live (built-in + custom) relation type list
 */
export function suggestRelationType(
    sourceText: string,
    targetText: string,
    types: RelationType[],
): string | null {
    // The target tail and the source tail are where connectives concentrate;
    // weight them by scanning a joined haystack but matching longest-first.
    const haystack = `${sourceText}\u0001${targetText}`;
    const pairs: Array<{ id: string; conn: string }> = [];
    for (const t of types) {
        for (const c of t.connectives) {
            if (c) pairs.push({ id: t.id, conn: c });
        }
    }
    pairs.sort((a, b) => b.conn.length - a.conn.length);
    for (const p of pairs) {
        if (haystack.includes(p.conn)) return p.id;
    }
    return null;
}

/** Ordered classification rules for a single tagged span → marker type id. */
const FINAL_PARTICLES = ['よね', 'でしょ', 'だろ', 'じゃん', 'かな', 'っけ', 'ね', 'よ', 'わ', 'な', 'ぞ', 'さ'];
const FILLERS = ['えっと', 'ええと', 'えーと', 'あの', 'あのー', 'まあ', 'まぁ', 'うーん', 'ええ', 'その', 'なんか', 'こう'];
const HEDGES = ['かもしれない', 'みたいな', 'みたいに', 'っぽい', 'という感じ', 'って感じ', '的な', 'ような', 'ぐらい', 'くらい', 'とか', 'ちょっと'];
const QUOTATIVES = ['っていう', 'という', 'って', 'みたいな', 'と'];
const CONNECTIVES = ['なんですけど', 'んですけど', 'だから', 'それで', 'でも', 'けれど', 'けど', 'ので', 'から', 'そして', 'また', 'つまり', 'なので', 'で'];
const TOPICS = ['としては', 'については', 'は', 'って', 'では'];

/**
 * Suggest a discourse-marker category for a single span from its surface form.
 *
 * Heuristic, ordered most→least specific. Returns a built-in MarkerType id
 * ('filler' | 'connective' | 'topic' | 'hedge' | 'quotative' | 'final-particle')
 * or null when nothing is confident. Grounded in the compound-discourse-unit
 * inventory (fillers, sentence-final particles, quotatives, topic particles).
 */
export function suggestMarkerType(spanText: string): string | null {
    const s = tidy(spanText);
    if (!s) return null;
    const short = [...s].length <= 4;

    // Pure fillers (often standalone).
    if (FILLERS.includes(s)) return 'filler';

    // Sentence-final particles: short spans that ARE / END WITH a final particle.
    for (const fp of FINAL_PARTICLES) {
        if (s === fp) return 'final-particle';
        if (short && s.endsWith(fp)) return 'final-particle';
    }

    // Topic / contrast particle spans.
    if (TOPICS.includes(s)) return 'topic';

    // Hedges (epistemic / approximative / similative).
    for (const h of HEDGES) {
        if (s.includes(h)) return 'hedge';
    }

    // Quotatives.
    for (const q of QUOTATIVES) {
        if (s === q || s.endsWith(q)) return 'quotative';
    }

    // Connectives (clause linkers).
    for (const c of CONNECTIVES) {
        if (s === c || s.startsWith(c) || s.endsWith(c)) return 'connective';
    }

    return null;
}

/** Resolve a suggested id to its index within a type list (−1 if absent). */
export function indexOfType<T extends { id: string }>(id: string | null, list: T[]): number {
    if (!id) return -1;
    return list.findIndex(t => t.id === id);
}
