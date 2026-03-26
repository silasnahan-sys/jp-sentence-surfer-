import { JpSentenceSurferSettings } from './types';

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
    return {
        activeRegex: new RegExp(regexSource, flags),
        useBoldBoundaries: settings.useBoldBoundaries,
        stripTimestamps: settings.stripTimestampsOnSelect,
    };
}
