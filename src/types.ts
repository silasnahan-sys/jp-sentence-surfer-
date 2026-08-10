// All interfaces and types for JP Sentence Surfer

import type { CustomRelationTypeDef } from './discourse/RelationTypes';

export type SurfAction = 'select' | 'bold' | 'highlight' | 'spoiler' | 'cloze' | 'copy' | 'none';
export type SteeringPreset = 'balanced' | 'steering' | 'extreme-steering';
export type ComboPreset = 'default' | 'speed-reader' | 'editor' | 'minimal' | 'random' | 'discourse';

export interface DirectionalActions {
    swipeUp: SurfAction;
    swipeDown: SurfAction;
    swipeLeft: SurfAction;
    swipeRight: SurfAction;
}

export interface SurfUnit {
    text: string;
    start: number;
    end: number;
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
    /** Enable the Sentence Monkey Scroller */
    enableMonkeyScroller: boolean;
    /** Haptic feedback on sentence boundary crossing */
    hapticFeedback: boolean;
    /** Auto-hide toolbar after inactivity (ms, 0 = never) */
    toolbarAutoHideMs: number;
    /** Directional swipe actions for the scroller trackball */
    directionalActions: DirectionalActions;
    /** Trackball pad diameter in px */
    trackballSizePx: number;
    /** Extra bottom offset for thumb-zone placement in px */
    trackballBottomOffsetPx: number;
    /** Combo follow-up window in milliseconds */
    comboWindowMs: number;
    /** Horizontal steer sensitivity for adjacent-unit surfing */
    lateralSteerStrength: number;
    /** Vertical drag-to-scroll gain */
    verticalScrollGain: number;
    /** Steering profile for omni-direction thumb input */
    steeringPreset: SteeringPreset;
    /** Custom command presets for the action panel */
    customCommands: Array<{ name: string; commandId: string }>;
    /** Actions disabled in the combo ring (e.g. ['spoiler','search']) */
    disabledComboActions: string[];
    /** Combo ring preset — defines which actions appear at each combo depth */
    comboPreset: ComboPreset;
    /** Render discourse-relation arcs over the editor */
    showRelationOverlay: boolean;
    /** User-defined discourse relation types (added to the built-in taxonomy) */
    customRelationTypes: CustomRelationTypeDef[];
    /** User-defined discourse MARKER types for span tagging (added to built-ins) */
    customMarkerTypes: CustomRelationTypeDef[];
    /** User-defined annotation LAYERS (added to the built-in big-5) */
    customLayerTypes: CustomRelationTypeDef[];
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
