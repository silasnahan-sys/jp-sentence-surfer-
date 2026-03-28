/**
 * Co-operation Pattern Templates (協働パターン)
 *
 * Pattern templates that the system tries to match against captured chunks.
 * Each template describes a sequence of discourse "slots" that must be
 * filled by grammar bits from specific stem families.
 */

import { CoOperationTemplate, CoOperationMatch, TemplateSlot } from '../types';
import { CoOccurrenceConstellation } from '../types';

// ─── Template definitions ─────────────────────────────────────────────────────

export const COOPERATION_TEMPLATES: CoOperationTemplate[] = [
    // 1. Hedge → Assert
    {
        name: 'hedge-assert',
        nameJp: 'ヘッジ→断定',
        description: 'Speaker hedges first, then asserts with confidence.',
        slots: [
            { position: 'opening', acceptedStems: ['まず', 'ね'], required: true },
            { position: 'closing', acceptedStems: ['んだ', 'わけ', 'はず'], required: true },
        ],
        function: 'hedge-then-assert',
        example: 'まあ…わけなんですよね',
    },
    // 2. Concession Sandwich
    {
        name: 'concession-sandwich',
        nameJp: '譲歩サンドイッチ',
        description: 'Concede → contrast → assert (確かに … けど … んですよ).',
        slots: [
            { position: 'opening', acceptedStems: ['まず'],       required: true },  // 確かに lives in OPENER tree
            { position: 'mid',     acceptedStems: ['けど'],        required: true },
            { position: 'closing', acceptedStems: ['んだ', 'わけ'], required: true },
        ],
        function: 'concession-but-assertion',
        example: '確かに…けど…んですよ',
    },
    // 3. Dismissive Correction
    {
        name: 'dismissive-correction',
        nameJp: '軽視→訂正',
        description: 'Dismissive filler followed by a correction/reframe.',
        slots: [
            { position: 'opening', acceptedStems: ['まず'],         required: true },
            { position: 'early',   acceptedStems: ['というより'],    required: true },
            { position: 'closing', acceptedStems: ['んだ', 'わけ'], required: false },
        ],
        function: 'dismissive-then-correct',
        example: 'なんか…というよりは…んだよ',
    },
    // 4. Cause-Effect Frame
    {
        name: 'cause-effect',
        nameJp: '原因→結果フレーム',
        description: 'Cause marker leads to a result/consequence ending.',
        slots: [
            { position: 'early',   acceptedStems: ['から', 'ので'], required: true },
            { position: 'closing', acceptedStems: ['わけ', 'んだ', 'はず'], required: true },
        ],
        function: 'cause-result',
        example: 'から…わけなんです',
    },
    // 5. Summary Frame
    {
        name: 'summary-frame',
        nameJp: '要約フレーム',
        description: 'Opens with a summary/conclusion marker, closes with reasoning.',
        slots: [
            { position: 'opening', acceptedStems: ['まず'],         required: true },  // 結局 lives in OPENER
            { position: 'closing', acceptedStems: ['わけ', 'んだ'], required: true },
        ],
        function: 'summary-conclusion',
        example: '結局…わけですよね',
    },
    // 6. Quotation → Evaluation
    {
        name: 'quotation-evaluation',
        nameJp: '引用→評価',
        description: 'Quotation/hearsay followed by speaker evaluation or stance.',
        slots: [
            { position: 'early',   acceptedStems: ['って'],          required: true },
            { position: 'closing', acceptedStems: ['んだ', 'わけ', 'はず', 'らしい', 'そう'], required: true },
        ],
        function: 'quote-then-evaluate',
        example: 'って…らしいんですよ',
    },
    // 7. Escalation Stack
    {
        name: 'escalation-stack',
        nameJp: 'エスカレーションスタック',
        description: 'Multiple intensifiers stacked before a conclusion.',
        slots: [
            { position: 'early',   acceptedStems: ['しかも'], required: true },
            { position: 'mid',     acceptedStems: ['しかも'], required: false },
            { position: 'closing', acceptedStems: ['んだ', 'わけ', 'はず'], required: false },
        ],
        function: 'escalation-accumulation',
        example: 'しかも…さらに…わけです',
    },
    // 8. Fundamental Reframe
    {
        name: 'fundamental-reframe',
        nameJp: '根本的再定義',
        description: 'そもそも reframes the premise; ends with assertion.',
        slots: [
            { position: 'opening', acceptedStems: ['まず'], required: true },  // そもそも in OPENER
            { position: 'mid',     acceptedStems: ['というより'], required: false },
            { position: 'closing', acceptedStems: ['んだ', 'わけ'], required: true },
        ],
        function: 'premise-reframe',
        example: 'そもそも…というより…んです',
    },
    // 9. Hedged Question
    {
        name: 'hedged-question',
        nameJp: 'ヘッジ付き疑問',
        description: 'Hedge or softening + question/confirmation ending.',
        slots: [
            { position: 'opening', acceptedStems: ['まず', 'ね'], required: true },
            { position: 'closing', acceptedStems: ['でしょう', 'かもしれない', 'かな'], required: true },
        ],
        function: 'hedged-question',
        example: 'まあ…じゃないでしょうか',
    },
    // 10. Experience Narration
    {
        name: 'experience-narration',
        nameJp: '経験語り',
        description: 'Temporal/aspect marker + evaluation ending.',
        slots: [
            { position: 'early',   acceptedStems: ['ている'],        required: true },
            { position: 'closing', acceptedStems: ['んだ', 'わけ', 'もの'], required: true },
        ],
        function: 'experience-evaluation',
        example: 'てたんだけど…ものだよ',
    },
    // 11. Comparison → Preference
    {
        name: 'comparison-preference',
        nameJp: '比較→優先表現',
        description: 'というより family marks correction/preference.',
        slots: [
            { position: 'mid',     acceptedStems: ['というより'],                    required: true },
            { position: 'closing', acceptedStems: ['んだ', 'わけ', 'はず', 'でしょう'], required: false },
        ],
        function: 'correction-preference',
        example: 'というよりは…んですよ',
    },
    // 12. Explanatory Assertion Chain
    {
        name: 'explanatory-chain',
        nameJp: '説明断定チェーン',
        description: 'Multiple explanatory modality markers building an explanation.',
        slots: [
            { position: 'early',   acceptedStems: ['んだ'],  required: true },
            { position: 'mid',     acceptedStems: ['から', 'ので'], required: false },
            { position: 'closing', acceptedStems: ['わけ'],  required: true },
        ],
        function: 'layered-explanation',
        example: 'んだから…わけですよね',
    },
];

// ─── Template matching ────────────────────────────────────────────────────────

/**
 * Try to match a chunk's constellation against all templates.
 * Returns all successful matches (a chunk may match multiple templates).
 */
export function matchTemplates(
    constellation: CoOccurrenceConstellation,
    chunkText: string,
    sourceFile: string,
    scraped = false,
): CoOperationMatch[] {
    const matches: CoOperationMatch[] = [];

    for (const template of COOPERATION_TEMPLATES) {
        const filledSlots: CoOperationMatch['filledSlots'] = [];
        let allRequiredFilled = true;

        for (const slot of template.slots) {
            // Find a bit in the constellation that matches this slot
            const matchingBit = constellation.bits.find(bit =>
                slot.acceptedStems.includes(bit.stemFamily)
            );
            if (matchingBit) {
                filledSlots.push({
                    slot,
                    matchedSurface: matchingBit.surface,
                    matchedStem: matchingBit.stemFamily,
                });
            } else if (slot.required) {
                allRequiredFilled = false;
                break;
            }
        }

        if (allRequiredFilled && filledSlots.some(fs => fs.slot.required)) {
            matches.push({
                templateName: template.name,
                chunkId: constellation.chunkId,
                chunkText,
                filledSlots,
                capturedAt: Date.now(),
                sourceFile,
                scraped,
            });
        }
    }

    return matches;
}

/**
 * Get all template matches for a list of constellations.
 */
export function matchAllTemplates(
    constellations: CoOccurrenceConstellation[],
    chunkTextMap: Map<string, string>,
    sourceFileMap: Map<string, string>,
    scraped = false,
): CoOperationMatch[] {
    const allMatches: CoOperationMatch[] = [];
    for (const constellation of constellations) {
        const chunkText = chunkTextMap.get(constellation.chunkId) ?? '';
        const sourceFile = sourceFileMap.get(constellation.chunkId) ?? '';
        const matches = matchTemplates(constellation, chunkText, sourceFile, scraped);
        allMatches.push(...matches);
    }
    return allMatches;
}

/**
 * Get a template by name.
 */
export function getTemplate(name: string): CoOperationTemplate | undefined {
    return COOPERATION_TEMPLATES.find(t => t.name === name);
}

/**
 * Group matches by template name.
 */
export function groupMatchesByTemplate(
    matches: CoOperationMatch[],
): Map<string, CoOperationMatch[]> {
    const grouped = new Map<string, CoOperationMatch[]>();
    for (const match of matches) {
        const existing = grouped.get(match.templateName) ?? [];
        existing.push(match);
        grouped.set(match.templateName, existing);
    }
    return grouped;
}
