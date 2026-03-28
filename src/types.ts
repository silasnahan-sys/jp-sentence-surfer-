// All interfaces and types for JP Sentence Surfer

export interface DiscourseSettings {
    defaultGranularity: number; // 1-7
    enableOverlayByDefault: boolean;
    categoryColors: Record<string, string>; // A-H → CSS color
    autoCaptureOnNavigation: boolean;
    coOccurrenceDepth: number; // sentences of context
}

export interface DictionarySettings {
    dictFolderPath: string;
    loadedDictionaries: Record<string, boolean>; // name → enabled
    defaultSearchMode: 'exact' | 'prefix' | 'substring';
    autoLookupOnSelection: boolean;
    saveToCollocationsTemplate: string;
}

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
    /** Discourse analysis settings */
    discourse: DiscourseSettings;
    /** Dictionary lookup settings */
    dictionary: DictionarySettings;
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
