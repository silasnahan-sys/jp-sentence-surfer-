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
    /** Discourse grammar settings */
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

// ─── Discourse Grammar types ──────────────────────────────────────────────────

export type DiscourseGranularity =
    | 'morpheme'
    | 'bunsetsu'
    | 'clause'
    | 'utterance'
    | 'turn'
    | 'exchange'
    | 'episode';

export type DiscourseMarkerCategory =
    | 'opening'
    | 'closing'
    | 'boundary'
    | 'interactional'
    | 'modality'
    | 'quotation'
    | 'tense'
    | 'politeness';

export type DiscourseMarkerSubcategory =
    | 'topic-management' | 'sequence' | 'filler' | 'attention' | 'concession'
    | 'noda' | 'wake' | 'hazu' | 'mono' | 'confirmation' | 'hearsay'
    | 'assertion' | 'softening' | 'desire' | 'obligation' | 'conditional'
    | 'topic-shift' | 'topic-return' | 'summary' | 'segment'
    | 'sfp' | 'response' | 'repair' | 'evaluative'
    | 'epistemic' | 'deontic' | 'dynamic'
    | 'reported-speech'
    | 'tense-aspect'
    | 'formal' | 'casual';

export interface DiscourseMarker {
    id: string;
    type: DiscourseMarkerCategory;
    subcategory: DiscourseMarkerSubcategory;
    label: string;
    text: string;
    tokenStart: number;
    tokenEnd: number;
    charStart: number;
    charEnd: number;
    color: string;
    isOpening: boolean;
    isClosing: boolean;
    confidence: number;
}

export interface DiscourseUnit {
    level: DiscourseGranularity;
    text: string;
    start: number;
    end: number;
    markers: DiscourseMarker[];
    children: DiscourseUnit[];
}

export interface DiscourseLogicalFlow {
    patternId: string;
    name: string;
    description: string;
    confidence: number;
}

export interface DiscourseChunk {
    id: string;
    text: string;
    rawText: string;
    start: number;
    end: number;
    sourcePath: string;
    markers: DiscourseMarker[];
    openingMarkers: DiscourseMarker[];
    closingMarkers: DiscourseMarker[];
    internalMarkers: DiscourseMarker[];
    logicalFlows: DiscourseLogicalFlow[];
    utterances: DiscourseUnit[];
    capturedAt: string;
}

// ─── Discourse + Dictionary settings ─────────────────────────────────────────

export interface DiscourseSettings {
    discourseGranularity: DiscourseGranularity;
    showDiscourseOverlay: boolean;
    discourseIndexPath: string;
    autoDetectPatterns: boolean;
    contextExpansionMode: 'smart' | 'fixed';
    fixedContextChars: number;
}

export interface DictionarySettings {
    dictionaryFolder: string;
    enableDictLookup: boolean;
    savedSentencesFolder: string;
    savedCollocationFolder: string;
    dictScanLength: number;
    showDictInToolbar: boolean;
}
