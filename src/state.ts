import { JpSentenceSurferSettings } from './types';
import { JP_SENTENCE_REGEX } from './constants';

/**
 * Global plugin state — active sentence regex and current mode.
 */
export interface PluginState {
    activeRegex: RegExp;
    useBoldBoundaries: boolean;
    stripTimestamps: boolean;
}

export function buildState(settings: JpSentenceSurferSettings): PluginState {
    let regexSource = settings.sentenceRegex;
    let flags = 'gm';
    let activeRegex: RegExp;
    try {
        activeRegex = new RegExp(regexSource, flags);
    } catch {
        // User entered an invalid regex in settings — fall back to the built-in JP sentence regex
        activeRegex = new RegExp(JP_SENTENCE_REGEX.source, flags);
    }
    return {
        activeRegex,
        useBoldBoundaries: settings.useBoldBoundaries,
        stripTimestamps: settings.stripTimestampsOnSelect,
    };
}
