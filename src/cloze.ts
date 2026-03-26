import { ParsedSentence } from './types';
import { BOLD_REGEX } from './constants';

/**
 * Generate Anki cloze deletion text from a parsed sentence.
 *
 * If the sentence has bold segments, each becomes a {{cN::text}} cloze.
 * If no bold segments, the entire clean sentence is wrapped as {{c1::...}}.
 *
 * @param sentence - The parsed sentence to generate cloze from
 * @param format   - The cloze format template, e.g. "{{c1::$BOLD}}"
 */
export function buildClozeText(
    sentence: ParsedSentence,
    format: string = '{{c1::$BOLD}}'
): string {
    if (!sentence.hasBold) {
        const base = format.replace(/c\d+::/, 'c1::').replace('$BOLD', sentence.clean);
        return base;
    }

    let result = sentence.clean;
    let counter = 1;
    const regex = new RegExp(BOLD_REGEX.source, 'g');

    result = result.replace(regex, (_match: string, boldText: string) => {
        const cloze = format
            .replace(/c\d+::/, `c${counter}::`)
            .replace('$BOLD', boldText);
        counter++;
        return cloze;
    });

    return result;
}

/**
 * Extract the clean bold text from within a sentence string.
 * Returns all bold segments concatenated with spaces.
 */
export function extractBoldText(text: string): string {
    const segments: string[] = [];
    const regex = new RegExp(BOLD_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        segments.push(match[1]);
    }
    return segments.join(' ');
}
