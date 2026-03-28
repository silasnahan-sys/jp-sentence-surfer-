/**
 * Co-occurrence Constellation System (共起パターン)
 *
 * Detects, records, and indexes grammar bit co-occurrences within captured
 * chunks.  Every chunk gets a CoOccurrenceConstellation that describes:
 *   - All grammar bits found (with position, stem family, variation)
 *   - Pairwise/group relationships (adjacent, proximate, distant, framing)
 *   - The inferred discourse texture (stance, move, register)
 */

import { TinySegmenter } from '../tiny-segmenter';
import {
    CoOccurrenceConstellation,
    GrammarBitInstance,
    GrammarBitRelationship,
    DiscourseTexture,
} from '../types';
import { VARIATION_BY_SURFACE, ALL_VARIATION_TREES } from './variation-trees';

// ─── Category heuristics ──────────────────────────────────────────────────────

function inferCategory(stemFamily: string): { category: string; subcategory: string } {
    const OPENING_STEMS = new Set(['まず', 'ね', 'というより', 'って']);
    const CLOSING_STEMS = new Set(['わけ', 'はず', 'もの', 'んだ', 'でしょう', 'かもしれない', 'らしい', 'そう']);
    const CONNECTIVE_STEMS = new Set(['から', 'ので', 'けど', 'ても', 'ながら', 'ば', 'たら']);
    const ASPECT_STEMS = new Set(['ている']);
    const INTENSIFIER_STEMS = new Set(['しかも']);

    if (OPENING_STEMS.has(stemFamily)) return { category: 'opening', subcategory: 'utterance-initial' };
    if (CLOSING_STEMS.has(stemFamily)) return { category: 'closing', subcategory: 'modality' };
    if (CONNECTIVE_STEMS.has(stemFamily)) return { category: 'connective', subcategory: 'logical' };
    if (ASPECT_STEMS.has(stemFamily)) return { category: 'aspect', subcategory: 'tense-aspect' };
    if (INTENSIFIER_STEMS.has(stemFamily)) return { category: 'intensifier', subcategory: 'escalation' };
    return { category: 'internal', subcategory: 'general' };
}

// ─── Stance & move inference ──────────────────────────────────────────────────

const STANCE_MAP: Record<string, string[]> = {
    'なんか':       ['dismissive', 'casual-distancing'],
    'どうせ':       ['disdain', 'resigned'],
    'まあ':         ['hedging', 'softening'],
    'ちょっと':     ['hedging', 'softening'],
    'やっぱり':     ['reconfirmation', 'assertive'],
    'やっぱ':       ['reconfirmation', 'assertive'],
    'むしろ':       ['reframing', 'correction'],
    '逆に':         ['contrast', 'reframing'],
    '確かに':       ['concession', 'acknowledgment'],
    'わけ':         ['explanatory', 'assertive'],
    'はず':         ['expectation', 'evidential'],
    'もの':         ['emotional-reasoning', 'subjective'],
    'んだ':         ['explanatory', 'sharing-background'],
    'でしょう':     ['seeking-confirmation', 'probability'],
    'かもしれない': ['hedging', 'low-confidence'],
    'らしい':       ['hearsay', 'evidential'],
    'そう':         ['appearance', 'hearsay'],
    'というより':   ['correction', 'precision'],
    'しかも':       ['escalation', 'adding'],
    'さらに':       ['escalation', 'intensification'],
    'おまけに':     ['escalation', 'negative-adding'],
    '結局':         ['summarizing', 'conclusive'],
    'つまり':       ['summarizing', 'reformulating'],
    'そもそも':     ['fundamental-reframe', 'questioning-premise'],
};

const MOVE_MAP: Record<string, string[]> = {
    'というより':   ['correction', 'reformulation'],
    'わけ':         ['explanation', 'conclusion'],
    'はず':         ['prediction', 'logical-deduction'],
    'もの':         ['justification', 'emotional-appeal'],
    'んだ':         ['explanation', 'background-sharing'],
    'でしょう':     ['confirmation-seeking', 'shared-knowledge-appeal'],
    'かもしれない': ['hedged-assertion', 'possibility-raising'],
    'けど':         ['contrast', 'concession-retraction'],
    'から':         ['cause-giving', 'reason-stating'],
    'ので':         ['cause-giving', 'polite-reason'],
    'ても':         ['concession', 'hypothetical'],
    'ながら':       ['simultaneous', 'concessive'],
    'って':         ['quotation', 'topic-setting'],
    '結局':         ['summarizing', 'wrap-up'],
    'つまり':       ['reformulation', 'clarification'],
    'そもそも':     ['premise-questioning', 'reframing'],
    'しかも':       ['escalation', 'accumulation'],
    'さらに':       ['escalation', 'addition'],
    'むしろ':       ['correction', 'preference-stating'],
    '確かに':       ['concession', 'partial-agreement'],
};

function inferTexture(bits: GrammarBitInstance[]): DiscourseTexture {
    const stanceSet = new Set<string>();
    const moveSet = new Set<string>();

    for (const bit of bits) {
        const stances = STANCE_MAP[bit.stemFamily] ?? [];
        const moves = MOVE_MAP[bit.stemFamily] ?? [];
        stances.forEach(s => stanceSet.add(s));
        moves.forEach(m => moveSet.add(m));
    }

    // Register: rough if any rough bit present, else formal if any formal, else casual or neutral
    const families = bits.map(b => b.stemFamily);
    let register: DiscourseTexture['registerLevel'] = 'neutral';
    // Simple heuristic based on common spoken forms
    const hasCasual = bits.some(b => ['なんか', 'ちょっと', 'まあ', 'やっぱ', 'ってわけ'].includes(b.surface));
    const hasFormal = bits.some(b => b.surface.endsWith('です') || b.surface.endsWith('ます') || b.surface.endsWith('でしょう'));
    const hasRough  = bits.some(b => ['ぞ', 'ぜ', 'なんか', 'どうせ'].includes(b.surface));
    if (hasRough)  register = 'rough';
    else if (hasFormal && !hasCasual) register = 'formal';
    else if (hasCasual) register = 'casual';

    const confidence = Math.min(1, (stanceSet.size + moveSet.size) / 10);

    return {
        stance: Array.from(stanceSet),
        move:   Array.from(moveSet),
        registerLevel: register,
        confidence,
    };
}

// ─── Relationship detection ───────────────────────────────────────────────────

function detectRelationships(bits: GrammarBitInstance[]): GrammarBitRelationship[] {
    const relationships: GrammarBitRelationship[] = [];
    if (bits.length < 2) return relationships;

    for (let i = 0; i < bits.length; i++) {
        for (let j = i + 1; j < bits.length; j++) {
            const a = bits[i];
            const b = bits[j];
            const morphDist = Math.abs(b.morphemeIndex - a.morphemeIndex);
            const charDist  = Math.abs(b.position - a.position);

            let type: GrammarBitRelationship['type'];
            if (morphDist <= 2)       type = 'adjacent';
            else if (charDist <= 15)  type = 'proximate';
            else if (charDist <= 40)  type = 'proximate';
            else                      type = 'distant';

            // Detect framing: opening + closing
            const isFraming =
                (a.category === 'opening' && b.category === 'closing') ||
                (a.category === 'closing' && b.category === 'opening');
            if (isFraming) type = 'framing';

            // Direction heuristic
            let direction: GrammarBitRelationship['direction'] = 'parallel';
            if (a.category === 'opening' && b.category !== 'opening') direction = 'a→b';
            else if (b.category === 'closing' && a.category !== 'closing') direction = 'a→b';
            else if (a.category === 'connective') direction = 'a→b';

            // Combined function
            let combinedFunction = `${a.stemFamily}→${b.stemFamily}`;
            const knownCombos: Record<string, string> = {
                'まず→んだ':              '優先度設定→説明的断定',
                'なんか→というより':      '軽視フレーミング→訂正',
                '確かに→けど':            '譲歩→逆接',
                'まあ→けど':              'ヘッジ→逆接',
                '結局→わけ':              '要約→理由断定',
                'そもそも→んだ':          '根本問い直し→説明',
                'から→わけ':              '原因→理由強調',
                'って→というより':        '引用→訂正比較',
                'しかも→さらに':          '追加→上積み',
                'なんか→でしょう':        '軽視→確認求め',
            };
            const comboKey = `${a.stemFamily}→${b.stemFamily}`;
            if (knownCombos[comboKey]) combinedFunction = knownCombos[comboKey];

            relationships.push({
                bitIds: [a.id, b.id],
                type,
                morphemeDistance: morphDist,
                combinedFunction,
                direction,
            });
        }
    }
    return relationships;
}

// ─── Surface matching in tokens ───────────────────────────────────────────────

const segmenter = new TinySegmenter();

/** All known surfaces sorted longest-first for greedy matching */
const ALL_SURFACES_SORTED = Array.from(VARIATION_BY_SURFACE.keys())
    .sort((a, b) => b.length - a.length);

/**
 * Find all grammar bit instances in a text chunk.
 */
function findAllBits(chunkText: string): GrammarBitInstance[] {
    const tokens = segmenter.segment(chunkText);
    const bits: GrammarBitInstance[] = [];
    const usedRanges: Array<[number, number]> = [];

    // Compute character offsets for each token
    const charOffsets: number[] = [];
    let pos = 0;
    for (const tok of tokens) {
        const idx = chunkText.indexOf(tok, pos);
        charOffsets.push(idx === -1 ? pos : idx);
        pos = (idx === -1 ? pos : idx) + tok.length;
    }

    for (const surface of ALL_SURFACES_SORTED) {
        let searchFrom = 0;
        let idx: number;
        while ((idx = chunkText.indexOf(surface, searchFrom)) !== -1) {
            const endIdx = idx + surface.length;
            // Check no overlap
            const overlaps = usedRanges.some(([s, e]) => idx < e && endIdx > s);
            if (!overlaps) {
                const hit = VARIATION_BY_SURFACE.get(surface);
                if (hit) {
                    // Find morpheme index closest to character position
                    let morphIdx = 0;
                    for (let i = 0; i < charOffsets.length; i++) {
                        if (charOffsets[i] <= idx) morphIdx = i;
                    }
                    const { category, subcategory } = inferCategory(hit.tree.stem);
                    const bitId = `bit_${hit.tree.stem}_${idx}`;
                    bits.push({
                        id: bitId,
                        surface,
                        stemFamily: hit.tree.stem,
                        variationId: surface,
                        position: idx,
                        morphemeIndex: morphIdx,
                        category,
                        subcategory,
                    });
                    usedRanges.push([idx, endIdx]);
                }
            }
            searchFrom = idx + 1;
        }
    }

    // Sort by position
    bits.sort((a, b) => a.position - b.position);
    return bits;
}

// ─── Public API ───────────────────────────────────────────────────────────────

let constellationCounter = 0;

/**
 * Build a full co-occurrence constellation for a captured chunk.
 */
export function buildConstellation(
    chunkId: string,
    chunkText: string,
): CoOccurrenceConstellation {
    const bits = findAllBits(chunkText);
    const relationships = detectRelationships(bits);
    const textureProfile = inferTexture(bits);

    const id = `const_${chunkId}_${Date.now().toString(36)}_${(++constellationCounter).toString(36)}`;

    return { id, chunkId, bits, relationships, textureProfile };
}

/**
 * Serialize all constellations for persistence.
 */
export function serializeConstellations(consts: CoOccurrenceConstellation[]): string {
    return JSON.stringify(consts, null, 2);
}

/**
 * Deserialize constellations from JSON string.
 */
export function deserializeConstellations(json: string): CoOccurrenceConstellation[] {
    try {
        return JSON.parse(json) as CoOccurrenceConstellation[];
    } catch {
        return [];
    }
}

/**
 * Filter constellations by stance (any stance in textureProfile.stance).
 */
export function filterByStance(
    consts: CoOccurrenceConstellation[],
    stance: string,
): CoOccurrenceConstellation[] {
    return consts.filter(c => c.textureProfile.stance.includes(stance));
}

/**
 * Filter constellations by discourse move.
 */
export function filterByMove(
    consts: CoOccurrenceConstellation[],
    move: string,
): CoOccurrenceConstellation[] {
    return consts.filter(c => c.textureProfile.move.includes(move));
}

/**
 * Filter constellations that contain ALL of the specified stem families.
 */
export function filterByStemFamilies(
    consts: CoOccurrenceConstellation[],
    stems: string[],
): CoOccurrenceConstellation[] {
    return consts.filter(c =>
        stems.every(stem => c.bits.some(b => b.stemFamily === stem))
    );
}

/**
 * Get all unique stances across all constellations.
 */
export function allStances(consts: CoOccurrenceConstellation[]): string[] {
    const s = new Set<string>();
    for (const c of consts) c.textureProfile.stance.forEach(st => s.add(st));
    return Array.from(s).sort();
}

/**
 * Get all unique moves across all constellations.
 */
export function allMoves(consts: CoOccurrenceConstellation[]): string[] {
    const m = new Set<string>();
    for (const c of consts) c.textureProfile.move.forEach(mv => m.add(mv));
    return Array.from(m).sort();
}
