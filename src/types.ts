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
    /** Enable the Collocation View slide-up panel */
    enableCollocationView: boolean;
    /** Auto-classify tapped collocations to jp-collocations plugin */
    autoClassifyCollocations: boolean;
    /** Generate decomposed collocation iterations on tap */
    generateCollocationIterations: boolean;
    /** Depth of sub-phrase generation */
    collocationChunkDepth: CollocationChunkDepth;
    /** Strip YTranscript timestamps before collocation analysis */
    stripTimestampsInCollocationContext: boolean;
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

// ─── Collocation Chunker types ────────────────────────────────────────────────

/**
 * Grammatical type of a collocation chunk.
 */
export type CollocationChunkType =
    | 'noun_phrase'
    | 'verb_phrase'
    | 'relative_clause'
    | 'adverbial'
    | 'conditional'
    | 'quotative'
    | 'compound_expression'
    | 'te_chain'
    | 'core_collocation';

/**
 * A collocation chunk extracted from a sentence, with grammar metadata.
 */
export interface CollocationChunk {
    text: string;
    start: number;
    end: number;
    type: CollocationChunkType;
    /** Human-readable POS pattern, e.g. "N+の+N" */
    pattern: string;
    /** The core sub-range (sans peripheral parts) */
    coreRange?: { start: number; end: number };
    /** Peripheral (parenthetical) portion e.g. "(をすると)" */
    peripheralText?: string;
    /** Nested sub-phrases */
    children?: CollocationChunk[];
    /** Human-readable grammar classification */
    grammarNotes?: string;
}

/**
 * Depth level for collocation chunk generation.
 */
export type CollocationChunkDepth = 'shallow' | 'medium' | 'deep';

// ─── jp-collocations integration types ───────────────────────────────────────

/** Matches the PartOfSpeech enum used in jp-collocations */
export type PartOfSpeech =
    | 'noun'
    | 'verb'
    | 'adjective'
    | 'adverb'
    | 'particle'
    | 'auxiliary_verb'
    | 'conjunction'
    | 'expression'
    | 'other';

/** Source classification for auto-created entries */
export type CollocationSource = 'classified' | 'manual' | 'imported' | 'seed';

/**
 * CollocationEntry shape expected by the jp-collocations sister plugin.
 */
export interface CollocationEntry {
    id: string;
    headword: string;
    headwordReading: string;
    collocate: string;
    fullPhrase: string;
    headwordPOS: PartOfSpeech;
    collocatePOS: PartOfSpeech;
    pattern: string;
    exampleSentences: string[];
    source: CollocationSource;
    tags: string[];
    notes: string;
    frequency: number;
    createdAt: number;
    updatedAt: number;
}
