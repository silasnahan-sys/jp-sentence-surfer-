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

    // ─── Discourse Grammar Settings ───────────────────────────────────────────
    /** Current discourse granularity level for surfing/selection */
    discourseGranularity: 'morpheme' | 'bunsetsu' | 'clause' | 'utterance' | 'turn' | 'exchange' | 'episode';
    /** Show discourse pattern overlay on active editor */
    showDiscourseOverlay: boolean;
    /** Path to persist discourse index JSON */
    discourseIndexPath: string;
    /** Auto-detect discourse patterns in real time */
    autoDetectPatterns: boolean;
    /** Context expansion mode for captured chunks */
    contextExpansionMode: 'none' | 'smart' | 'fixed';
    /** Fixed context window in chars (used when contextExpansionMode = 'fixed') */
    fixedContextChars: number;

    // ─── Dictionary Settings ──────────────────────────────────────────────────
    /** Vault-relative folder containing Yomitan term_bank_*.json files */
    dictionaryFolderPath: string;
    /** Enable deconjugation in dictionary search */
    enableDeconjugation: boolean;
    /** Automatically open dictionary search when text is selected */
    autoSearchOnSelect: boolean;
    /** Vault folder where saved example sentences are stored */
    savedSentencesFolder: string;
    /** How to save collocations: via jp-collocations plugin or plain markdown */
    savedCollocationFormat: 'plugin' | 'markdown';
    /** Debounce delay for dictionary search auto-search (ms) */
    dictSearchDebounceMs: number;
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
