// All interfaces and types for JP Sentence Surfer

/**
 * Surf modes — each defines a different "surfable" unit from the same text.
 */
export enum SurfMode {
    Bunsetsu    = 'bunsetsu',      // Current 8-tier bunsetsu system
    Sentence    = 'sentence',      // Full sentences (。！？ boundaries)
    Clause      = 'clause',        // Clause-level (て/から/けど/ので boundaries)
    Particle    = 'particle',      // Jump particle-to-particle
    ContentWord = 'content-word',  // Skip particles, jump content words only
    Collocation = 'collocation',   // Jump between recognised collocation spans
    Bold        = 'bold',          // Jump between **bold** markers
}

/**
 * Animation state for the NHL-inspired lerp scroll engine.
 */
export interface SurfAnimationState {
    scrollY: number;
    targetScrollY: number;
    ease: number;
    targetEase: number;
    velocity: number;
    direction: 1 | -1;
    isAnimating: boolean;
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
    /** Lerp easing factor for scroll animation (0–1, default 0.14) */
    surfEase: number;
    /** Friction for staggered easing decay (0–1, default 0.92) */
    surfFriction: number;
    /** Momentum decay per frame (0–1, default 0.85) */
    surfMomentumDecay: number;
    /** Default surf mode */
    defaultSurfMode: SurfMode;
    /** Enable iOS touch gesture controller */
    enableTouchGestures: boolean;
    /** Enable visual haptic effects on button press */
    enableHapticFeedback: boolean;
    /** Enable the NHL-style wave highlight effect */
    highlightWaveEnabled: boolean;
    /** Per-mode highlight colors */
    highlightColors: Record<SurfMode, string>;
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
