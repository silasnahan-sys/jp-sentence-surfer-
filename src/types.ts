// All interfaces and types for JP Sentence Surfer

// ─── Discourse Granularity ────────────────────────────────────────────────────

/**
 * Seven levels of discourse granularity, from smallest to largest unit.
 */
export type DiscourseGranularity =
    | 'morpheme'    // 1 – Individual morpheme token
    | 'bunsetsu'    // 2 – Bunsetsu phrase chunk (existing system)
    | 'clause'      // 3 – Clause bounded by conjunctive particles
    | 'utterance'   // 4 – Full utterance / sentence
    | 'turn'        // 5 – Speaker turn (multiple utterances)
    | 'exchange'    // 6 – Adjacent turn pair (Q+A)
    | 'episode';    // 7 – Topic-bounded discourse episode

export const DISCOURSE_GRANULARITY_LEVELS: DiscourseGranularity[] = [
    'morpheme', 'bunsetsu', 'clause', 'utterance', 'turn', 'exchange', 'episode',
];

export const DISCOURSE_GRANULARITY_LABELS: Record<DiscourseGranularity, string> = {
    morpheme:  '形態素',
    bunsetsu:  '文節',
    clause:    '節',
    utterance: '発話',
    turn:      'ターン',
    exchange:  '交換',
    episode:   'エピソード',
};

// ─── Discourse Marker Types ───────────────────────────────────────────────────

export type DiscourseMarkerCategory =
    | 'opening'        // 発話冒頭表現
    | 'closing'        // 発話末表現
    | 'boundary'       // 談話境界標識
    | 'connective'     // 論理展開パターン
    | 'interactional'; // 相互行為的表現

export type DiscoursePatternType =
    | 'cause-result'
    | 'contrast'
    | 'elaboration'
    | 'concession'
    | 'topic-shift'
    | 'topic-return'
    | 'summary'
    | 'confirmation-seeking'
    | 'hearsay'
    | 'evidential'
    | 'emphasis'
    | 'softening'
    | 'hedge'
    | 'topic-setter';

export interface DiscourseMarker {
    surface: string;               // The matched surface form
    category: DiscourseMarkerCategory;
    patternType: DiscoursePatternType;
    startInChunk: number;          // Offset within the chunk text
    endInChunk: number;
}

export interface DiscourseAnalysis {
    openingMarkers: DiscourseMarker[];
    closingMarkers: DiscourseMarker[];
    internalMarkers: DiscourseMarker[];
    boundaryMarkers: DiscourseMarker[];
    discoursePatternTags: DiscoursePatternType[];
}

// ─── Discourse Chunk Entry (for indexing) ────────────────────────────────────

export interface DiscourseChunkEntry {
    id: string;
    text: string;
    granularityLevel: DiscourseGranularity;
    sourceFile: string;
    sourceOffset: { start: number; end: number };
    openingMarkers: DiscourseMarker[];
    closingMarkers: DiscourseMarker[];
    internalMarkers: DiscourseMarker[];
    boundaryMarkers: DiscourseMarker[];
    collocationsFound: string[];
    discoursePatternTags: DiscoursePatternType[];
    timestamp?: string;
    context: {
        before: string;
        after: string;
    };
    capturedAt: string; // ISO date
}

// ─── Discourse Unit (generic surfable unit) ───────────────────────────────────

export interface DiscourseUnit {
    text: string;
    start: number;
    end: number;
    granularity: DiscourseGranularity;
    analysis?: DiscourseAnalysis;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

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
    /** Current discourse granularity level */
    discourseGranularity: DiscourseGranularity;
    /** Show discourse pattern overlay in editor */
    showDiscourseOverlay: boolean;
    /** Path to discourse index JSON file (relative to vault root) */
    discourseIndexPath: string;
    /** Automatically detect discourse patterns on load */
    autoDetectPatterns: boolean;
    /** Context expansion mode around captured chunks */
    contextExpansionMode: 'smart' | 'fixed';
    /** Context size in chars when mode is 'fixed' */
    fixedContextChars: number;

    // ─── Dictionary Settings ──────────────────────────────────────────────────
    /** Vault folder containing extracted Yomitan dictionary JSON files */
    dictionaryFolder: string;
    /** Enable dictionary lookup feature */
    enableDictLookup: boolean;
    /** Vault folder to save example sentences */
    savedSentencesFolder: string;
    /** Vault folder to save collocation entries */
    savedCollocationFolder: string;
    /** Max chars to scan in scan mode */
    dictScanLength: number;
    /** Show dictionary button in floating toolbar */
    showDictInToolbar: boolean;

    // ─── Scrape Engine Settings ───────────────────────────────────────────────
    /** Enable vault-wide scrape index */
    enableScrapeIndex: boolean;
    /** Vault folder to scrape (empty = entire vault) */
    scrapeFolderPath: string;
    /** Path to scrape index JSON file */
    scrapeIndexPath: string;
    /** Automatically rescrape on file save */
    autoScrapeOnSave: boolean;
    /** Batch size for async scraping */
    scrapeBatchSize: number;
}

// ─── Existing interfaces ──────────────────────────────────────────────────────

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

// ─── Dictionary Types ─────────────────────────────────────────────────────────

export type DictGlossaryType = 'text' | 'structured-content' | 'image';

export interface DictGlossary {
    type: DictGlossaryType;
    content: string | object;
}

export interface DictEntry {
    term: string;
    reading: string;
    definitionTags: string[];
    rules: string[];
    score: number;
    glossary: DictGlossary[];
    sequence: number;
    dictionary: string;
}

export interface DictMeta {
    title: string;
    revision: string;
    sequenced: boolean;
    format: number;
}

export interface SavedSentence {
    japanese: string;
    reading: string;
    translation: string;
    sourceDict: string;
    term: string;
    savedAt: string;
    tags: string[];
}

// ─── Variation Tree System ────────────────────────────────────────────────────

export interface VariationNode {
    surface: string;
    morphemes: string[];
    additions: string[];
    nuanceShift: string;
    register: 'formal' | 'neutral' | 'casual' | 'rough';
    spokenFrequency: 'high' | 'medium' | 'low' | 'rare';
    parentVariation?: string;
}

export interface VariationTree {
    stem: string;
    familyName: string;
    variations: VariationNode[];
    functionDescription: string;
}

// ─── Co-occurrence Constellation System ──────────────────────────────────────

export interface GrammarBitInstance {
    id: string;
    surface: string;
    stemFamily: string;
    variationId: string;
    position: number;
    morphemeIndex: number;
    category: string;
    subcategory: string;
}

export interface GrammarBitRelationship {
    bitIds: string[];
    type: 'adjacent' | 'proximate' | 'distant' | 'framing' | 'modifying';
    morphemeDistance: number;
    combinedFunction: string;
    direction: 'a→b' | 'b→a' | 'mutual' | 'parallel';
}

export interface DiscourseTexture {
    stance: string[];
    move: string[];
    registerLevel: 'formal' | 'neutral' | 'casual' | 'rough';
    confidence: number;
}

export interface CoOccurrenceConstellation {
    id: string;
    chunkId: string;
    bits: GrammarBitInstance[];
    relationships: GrammarBitRelationship[];
    textureProfile: DiscourseTexture;
}

// ─── Occurrence Index ─────────────────────────────────────────────────────────

export interface GrammarBitOccurrence {
    id: string;
    stemFamily: string;
    variation: string;
    surfaceForm: string;
    chunkId: string;
    chunkText: string;
    positionInChunk: number;
    leftContext: string;
    rightContext: string;
    sentenceContext: string;
    coOccurringBits: string[];
    constellationId: string;
    sourceFile: string;
    sourceTitle: string;
    timestamp?: string;
    capturedAtGranularity: string;
    capturedAt: number;
    scraped?: boolean;
}

// ─── Co-operation Templates ───────────────────────────────────────────────────

export interface TemplateSlot {
    position: 'opening' | 'early' | 'mid' | 'late' | 'closing';
    acceptedStems: string[];
    required: boolean;
}

export interface CoOperationTemplate {
    name: string;
    nameJp: string;
    description: string;
    slots: TemplateSlot[];
    function: string;
    example: string;
}

export interface CoOperationMatch {
    templateName: string;
    chunkId: string;
    chunkText: string;
    filledSlots: Array<{ slot: TemplateSlot; matchedSurface: string; matchedStem: string }>;
    capturedAt: number;
    sourceFile: string;
    scraped?: boolean;
}
