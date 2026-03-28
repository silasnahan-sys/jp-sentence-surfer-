// All interfaces and types for JP Sentence Surfer

export interface JpSentenceSurferSettings {
    /** Custom JP sentence regex pattern */
    sentenceRegex: string;
    /** Use **bold** text as sentence boundary markers */
    useBoldBoundaries: boolean;
    /** Auto-strip YTranscript timestamps on sentence select */
    stripTimestampsOnSelect: boolean;
    /** Template for cloze output, $BOLD is replaced by bold text */
    clozeFormat: string;
    /** Show the floating mobile toolbar */
    showFloatingToolbar: boolean;
    /** Toolbar position */
    toolbarPosition: 'top' | 'bottom';
    /** Highlight the current sentence */
    highlightCurrentSentence: boolean;
    /** Highlight color (CSS color string) */
    highlightColor: string;
    discourse: DiscourseSettings;
    dict: DictSettings;
}

export interface SentenceBoundary {
    start: number;
    end: number;
    text: string;
}

export interface ParsedSentence {
    raw: string;
    clean: string;
    start: number;
    end: number;
    hasBold: boolean;
    boldSegments: BoldSegment[];
    hasTimestamps: boolean;
}

export interface BoldSegment {
    text: string;
    startInSentence: number;
    endInSentence: number;
}

export interface YTranscriptLine {
    timestamp: string;
    url: string;
    text: string;
    lineIndex: number;
}

export interface BunsetsuChunk {
    text: string;
    start: number;
    end: number;
}

// ─── Discourse Settings ───────────────────────────────────────────────────────

export type DiscourseGranularity = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DiscourseSettings {
    defaultGranularity: DiscourseGranularity;
    showCategories: Record<string, boolean>;
    autoCaptureMode: boolean;
    coOccurrenceThreshold: number;
}

// ─── Dictionary Settings ─────────────────────────────────────────────────────

export interface DictSettings {
    dictionaryFolder: string;
    maxResults: number;
    showFrequencyScores: boolean;
    enableDeconjugation: boolean;
}
