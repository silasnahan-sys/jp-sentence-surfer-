/**
 * SentenceMonkeyScroller v5 — JP Rhythm Ninja Monkey Ball Extravaganza.
 *
 * DESIGN: Elecom Huge PLUS Trackball-grade omni-scroll + rhythm game feel.
 * - Global touch capture: thumb can roam the entire screen
 * - VROOM physics: force × speed × momentum = distance (like real trackball)
 * - Live selection visible during drag (throttled to avoid jank)
 * - Reactive zoom lane that bounces and responds to velocity
 * - Bouncy spring release with overshoot for rhythm game snappiness
 * - Custom Obsidian command slots for action panel
 * - Built-in search panel for quick-find within surfable units
 */

import { Editor, MarkdownView, Notice } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { ScopeEngine, SCOPE_COUNT, SCOPE_BADGES, SCOPE_LABELS, SCOPE_COLORS } from '../scope-engine';
import { SurfUnit, SurfAction, ComboPreset } from '../types';

// ═══ Combo Preset Definitions ═══════════════════════════════
// Each preset defines which built-in actions appear in the combo ring.
// User can also disable individual actions via disabledComboActions.

const PRESET_ACTIONS: Record<Exclude<ComboPreset, 'random'>, ComboSegment[]> = {
    default: [
        { icon: '✦', label: 'Select', action: 'select', chainable: true },
        { icon: '→', label: 'Next', action: 'next-select', chainable: true },
        { icon: '↔', label: 'Extend', action: 'extend', chainable: false },
        { icon: '🔍', label: 'Search', action: 'search' },
        { icon: '⌖', label: 'Teleport', action: 'teleport', chainable: false },
        { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
    ],
    'speed-reader': [
        { icon: '→', label: 'Next', action: 'next-select', chainable: true },
        { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
        { icon: '⧉', label: 'Copy', action: 'copy', chainable: true },
        { icon: '✦', label: 'Select', action: 'select', chainable: true },
        { icon: '↔', label: 'Extend', action: 'extend', chainable: false },
        { icon: '🔍', label: 'Search', action: 'search' },
    ],
    editor: [
        { icon: '✦', label: 'Select', action: 'select', chainable: true },
        { icon: 'B', label: 'Bold', action: 'bold', chainable: true },
        { icon: '◆', label: 'Hi', action: 'highlight', chainable: true },
        { icon: '⎘', label: 'Cloze', action: 'cloze', chainable: true },
        { icon: '↔', label: 'Extend', action: 'extend', chainable: false },
        { icon: '⧉', label: 'Copy', action: 'copy', chainable: true },
    ],
    minimal: [
        { icon: '✦', label: 'Select', action: 'select', chainable: true },
        { icon: '→', label: 'Next', action: 'next-select', chainable: true },
        { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
    ],
    discourse: [
        { icon: '⊹', label: 'Mark', action: 'mark', chainable: true },
        { icon: '👆', label: 'Pick', action: 'mark-pick', chainable: false },
        { icon: '→', label: 'Next', action: 'next-select', chainable: true },
        { icon: '太', label: 'B×', action: 'bulk-bold', chainable: false },
        { icon: '穴', label: '穴×', action: 'bulk-cloze', chainable: false },
        { icon: '✓', label: 'Apply', action: 'mark-activate', chainable: false },
    ],
};
import { PhysicsEngine, PhysicsSnapshot } from './PhysicsEngine';
import { GestureHandler } from './GestureHandler';
import { HapticEngine } from './HapticEngine';

const UNIT_STEP = 50;
const TRAIL_LENGTH = 4;
const SWIPE_THRESHOLD = 24;
const QUICK_FLICK_MS = 350;

type ActionSlot = { id: SurfAction | 'command'; icon: string; label: string; commandId?: string };

const DEFAULT_ACTIONS: ActionSlot[] = [
    { id: 'select', icon: '✦', label: 'Select' },
    { id: 'bold', icon: 'B', label: 'Bold' },
    { id: 'highlight', icon: '◆', label: 'Highlight' },
    { id: 'spoiler', icon: '▓', label: 'Spoiler' },
    { id: 'cloze', icon: '⎘', label: 'Cloze' },
    { id: 'copy', icon: '⧉', label: 'Copy' },
];

// ═══ Combo Chain System — Osu! × Persona 5 × DMC ═══════════════
// Radial pie-menu with chainable actions. Japanese game design:
//   - osu!: approach circles, combo counter, timing windows
//   - Persona 5: radial menus with instant transitions
//   - DMC/Bayonetta: chain combos branch based on previous action
//   - Monster Hunter Rise: weapon combo trees

interface ComboSegment {
    icon: string;
    label: string;
    action: SurfAction | 'command' | 'next-select' | 'prev-select' | 'search' | 'extend' | 'teleport' | 'random-move' | 'copy' | 'maker' | 'mark' | 'mark-clear' | 'mark-activate' | 'mark-pick' | 'bulk-bold' | 'bulk-highlight' | 'bulk-cloze' | 'bulk-copy';
    commandId?: string;
    chainable?: boolean;
    angle?: number;  // optional radial angle override for graduated combos
}

const CHAIN_AFTER_SELECT: ComboSegment[] = [
    { icon: '→', label: 'Next', action: 'next-select', chainable: true },
    { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
    { icon: '⧉', label: 'Copy', action: 'copy', chainable: true },
    { icon: '↔', label: 'Extend', action: 'extend', chainable: false },
    { icon: '◆', label: 'Hi', action: 'highlight', chainable: true },
    { icon: '⎘', label: 'Cloze', action: 'cloze' },
];

const CHAIN_AFTER_EDIT: ComboSegment[] = [
    { icon: '→', label: 'Next', action: 'next-select', chainable: true },
    { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
    { icon: '⧉', label: 'Copy', action: 'copy' },
    { icon: '✦', label: 'Select', action: 'select' },
];

const CHAIN_AFTER_COPY: ComboSegment[] = [
    { icon: '→', label: 'Next', action: 'next-select', chainable: true },
    { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
    { icon: '✦', label: 'Select', action: 'select', chainable: true },
    { icon: 'B', label: 'Bold', action: 'bold' },
];

const CHAIN_AFTER_NEXT: ComboSegment[] = [
    { icon: '→', label: 'Next', action: 'next-select', chainable: true },
    { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
    { icon: '✦', label: 'Select', action: 'select', chainable: true },
    { icon: '⧉', label: 'Copy', action: 'copy', chainable: true },
    { icon: '◆', label: 'Hi', action: 'highlight', chainable: true },
];

function getChainForAction(action: string, customCommands?: Array<{name: string; commandId: string}>): ComboSegment[] | null {
    let base: ComboSegment[];
    switch (action) {
        case 'select': base = [...CHAIN_AFTER_SELECT]; break;
        case 'bold': case 'highlight': case 'spoiler': base = [...CHAIN_AFTER_EDIT]; break;
        case 'copy': base = [...CHAIN_AFTER_COPY]; break;
        case 'cloze': base = [...CHAIN_AFTER_EDIT]; break;
        case 'next-select': case 'prev-select': base = [...CHAIN_AFTER_NEXT]; break;
        case 'command': base = [...CHAIN_AFTER_NEXT]; break;
        case 'extend': return null; // extend opens its own mode, no chain
        case 'teleport': base = [...CHAIN_AFTER_SELECT]; break;
        case 'random-move': base = [...CHAIN_AFTER_NEXT]; break;
        default: return null;
    }
    // Inject custom commands into chain (up to 2, keeps ring manageable)
    const cmds = (customCommands ?? []).filter(c => c.commandId);
    for (let i = 0; i < Math.min(cmds.length, 2) && base.length < 6; i++) {
        base.push({
            icon: '⚡', label: cmds[i].name || 'Cmd',
            action: 'command', commandId: cmds[i].commandId, chainable: true
        });
    }
    return base.slice(0, 6);
}

// ═══ Cached Regexes for toDisplayText (compiled once, not per-call) ═══
const RE_HTML_TAGS = /<[^>]*>/g;
const RE_MD_MARKERS = /\*\*|==|%%|~~|`/g;
const RE_MD_IMAGES = /!\[[^\]]*\]\([^\)]*\)/g;
const RE_MD_LINKS = /\[([^\]]+)\]\([^\)]*\)/g;
const RE_TIMESTAMPS = /\[\d{1,2}:\d{2}(?::\d{2})?\]/g;
const RE_URLS = /https?:\/\/\S+/g;
const RE_WHITESPACE = /\s+/g;

const COMBO_SEG_RADIUS = 62;      // px from center to segment center
const COMBO_DECAY_MS = 2200;      // timeout before combo breaks
const COMBO_CHAIN_DECAY_MS = 1800; // shorter timeout for chain rings
// ── Three-tier combo system (Groove Coaster inspired) ──
const COMBO_TIER_CHAIN = 1;       // 連鎖 CHAIN: 1-4 actions — base glow
const COMBO_TIER_FEVER = 2;       // 熱狂 FEVER: 5-9 actions — pulsing flame
const COMBO_TIER_TRANCE = 3;      // 恍惚 TRANCE: 10+ actions — beam + speed bonus
const COMBO_FEVER_THRESHOLD = 5;
const COMBO_TRANCE_THRESHOLD = 10;

function buildPrimarySegments(
    customCommands: Array<{ name: string; commandId: string }>,
    disabledActions?: string[],
    preset?: ComboPreset
): ComboSegment[] {
    const disabled = new Set(disabledActions ?? []);
    const chosen = preset ?? 'default';

    // Random preset: pick from default pool, shuffle
    let allBuiltIn: ComboSegment[];
    if (chosen === 'random') {
        allBuiltIn = [...PRESET_ACTIONS['default']];
        // Fisher-Yates shuffle
        for (let i = allBuiltIn.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allBuiltIn[i], allBuiltIn[j]] = [allBuiltIn[j], allBuiltIn[i]];
        }
    } else {
        allBuiltIn = [...PRESET_ACTIONS[chosen]];
    }

    const candidates: ComboSegment[] = allBuiltIn.filter(s => !disabled.has(s.action));

    // Custom commands fill remaining slots (up to 6 total)
    const cmds = (customCommands ?? []).filter(c => c.commandId);
    for (let i = 0; i < cmds.length && candidates.length < 6; i++) {
        candidates.push({
            icon: '⚡',
            label: cmds[i].name || `Cmd ${i + 1}`,
            action: 'command',
            commandId: cmds[i].commandId,
            chainable: true
        });
    }
    return candidates.slice(0, 6);
}

export class SentenceMonkeyScroller {
    private plugin: JpSentenceSurferPlugin;
    private physics: PhysicsEngine;
    private haptics: HapticEngine;
    private gesture: GestureHandler | null = null;

    // DOM
    private containerEl: HTMLElement | null = null;
    private padEl: HTMLElement | null = null;
    private ballEl: HTMLElement | null = null;
    private ballGlowEl: HTMLElement | null = null;
    private trailEls: HTMLElement[] = [];
    private counterEl: HTMLElement | null = null;
    private previewEl: HTMLElement | null = null;
    private infoEl: HTMLElement | null = null;
    private actionPanelEl: HTMLElement | null = null;
    private ringEl: HTMLElement | null = null;
    private zoomEl: HTMLElement | null = null;
    private zoomPrevEl: HTMLElement | null = null;
    private zoomPrev2El: HTMLElement | null = null;
    private zoomCurrentEl: HTMLElement | null = null;
    private zoomNextEl: HTMLElement | null = null;
    private zoomNext2El: HTMLElement | null = null;
    private searchEl: HTMLElement | null = null;
    private searchInputEl: HTMLInputElement | null = null;
    private searchResultsEl: HTMLElement | null = null;
    private progressRibbonEl: HTMLElement | null = null; // spatial document progress bar

    // State
    private units: SurfUnit[] = [];
    private currentIndex = 0;
    private isVisible = false;
    private isActionPanelOpen = false;
    private isSearchOpen = false;
    private idleAnimId: number | null = null;
    private idleTime = 0;
    private editorChangeRafId: number | null = null;

    // ═══ Unified Animation Loop — single RAF replaces 4 concurrent loops ═══
    private animLoopId: number | null = null;
    private animActive = new Set<string>();     // 'idle' | 'inertia' | 'zoomBounce' | 'ballFree'
    private animLastTime = 0;
    // Inertia state (extracted from closure)
    private inertiaLastTime = 0;
    private inertiaStepAccum = 0;
    // Zoom bounce state (extracted from closure)
    private zoomBounceT = 0;
    private zoomBounceAmp = 0;
    // Idle frame throttle
    private lastIdleFrame = 0;
    // Auto-glide: sustained speed triggers holdNavigateMode (replaces short-hold timer)
    private autoGlideAccum = 0;  // accumulates when speed > threshold, decays otherwise
    private isDragging = false;
    private lateralOffset = 0;
    private lastCursorLightAt = 0;
    private lastZoomRenderAt = 0;
    private lastDisplayIndex = -1;
    private holdNavigateMode = false;
    private lastZoomIndex = -1;
    private editorInertiaId: number | null = null;
    private editorInertiaVy = 0;
    private holdScrollVelocity = 0;
    private dragActionAnchorIndex = 0;
    private lastManualScrollAt = 0;
    private lastStepHapticAt = 0;
    private lastDragPulseAt = 0;
    private lastTapAt = 0;

    // ═══ 着地 Landing System — Pachinko meets DJ Turntable ═══
    // Inertia braking, tap-to-settle, nudge taps, MA pause
    private inertiaIsCoasting = false;       // true while post-release inertia runs
    private inertiaBrakePhase = false;       // true when speed < brake threshold (heavy haptics)
    private settledPauseUntil = 0;           // MA pause: ignore input until this timestamp
    private nudgeCooldownAt = 0;             // prevent rapid nudge spam
    private lastInertiaHapticAt = 0;         // throttle inertia snap-point haptics
    private gestureCheatSheetEl: HTMLElement | null = null; // ghost overlay for gesture hints
    private cheatSheetTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private cheatSheetDismissHandler: (() => void) | null = null; // Issue #30: stored for explicit cleanup
    private cheatSheetSeenCount = 0; // gate: show only the first 8 times, then stop annoying power users

    // Fix S-9: Load persisted cheatSheetSeenCount from localStorage
    private loadCheatSheetCount(): void {
        try {
            const stored = localStorage.getItem('ms3-cheat-sheet-count');
            if (stored !== null) this.cheatSheetSeenCount = parseInt(stored, 10) || 0;
        } catch (_) {}
    }
    private saveCheatSheetCount(): void {
        try { localStorage.setItem('ms3-cheat-sheet-count', String(this.cheatSheetSeenCount)); } catch (_) {}
    }
    private landingHintTimeoutId: ReturnType<typeof setTimeout> | null = null; // post-landing ghost hint (#15)

    // ═══ Combo Undo — Roman Cancel (取り消し) ═══
    private comboLastReversibleAction: string | null = null;
    private comboLastReversibleIdx = -1;

    // ═══ ContextChunkScroller — 重力圏 Gravity Sphere ═══════════════
    // Precision chunk-level navigation inside a document context chunk.
    // Transition: scope swipe past sentence → chunk scope → swipe down → focus
    // Like Gravity Rush: momentum redirects from vertical scroll into chunk focus.
    private chunkMode: 'off' | 'overview' | 'focused' = 'off';
    private chunks: SurfUnit[] = [];           // all context chunks in document
    private currentChunkIdx = -1;              // current chunk index (overview mode)
    private chunkFocusedUnits: SurfUnit[] = []; // units within the focused chunk
    private chunkFocusedIndex = 0;             // index within focused chunk
    private chunkFocusScopeLevel = 0;          // Improvement #3: remembered scope level for chunk focus
    private chunkDimEls: HTMLElement[] = [];    // dim overlay elements for unfocused content
    private chunkBoundaryEls: HTMLElement[] = []; // chunk boundary markers in editor
    private chunkBoundaryScrollListener: (() => void) | null = null; // redraws markers on editor scroll
    private chunkBoundaryScrollDom: HTMLElement | null = null; // Fix B-9: store ref for reliable detach
    private chunkComboRingMode: 'bit' | 'navigate' | 'wide' = 'bit';
    private chunkLastBoundaryAt = 0;           // timestamp of last chunk boundary crossing
    private chunkListPanelEl: HTMLElement | null = null;   // chunk list overlay panel
    private chunkListItemEls: HTMLElement[] = [];          // individual chunk items in list
    private chunkPanelBtnEl: HTMLElement | null = null;    // persistent 区 button in HUD
    private chunkPanelRefMode = false;                     // panel open in reference mode (no mode change)

    // Vroom trackball state
    private vroomMomentum = 0;         // running momentum (decays, fed by drag)
    private dragNavAccumulatorY = 0;

    // Ball position in pad (px from center, unclamped for vroom feel)
    private ballLocalX = 0;
    private ballLocalY = 0;
    private trailHistory: Array<{ x: number; y: number; speed: number }> = [];

    // JP rhythm game state
    private ballStretch = 1;           // squash-stretch factor for ball
    private ballRot = 0;               // rolling rotation
    private ballPopScale = 1;          // hit-pop scale (approach circle effect)
    private ballPopDecay = 0;          // pop animation timer
    private circularAccum = 0;         // circular motion detector
    private lastDragAngle: number | null = null; // angle tracking for circular detection (null = no previous)
    private highlightOverlayEl: HTMLElement | null = null;  // visible selection overlay (= pool[0])
    private highlightSegmentPool: HTMLElement[] = [];       // per-line highlight segments
    private vvResizeListener: (() => void) | null = null;  // iOS keyboard avoidance listener

    // Zoom lane animation state
    private zoomVelocity = 0;
    private zoomBounceAnimId: number | null = null;
    private lastOverlayAt = 0;  // throttle overlay repositioning

    // Zoom lane gesture state — swipe on items for actions + reactive parallax
    private zoomTouchStartX = 0;
    private zoomTouchStartY = 0;
    private zoomTouchIdx = -1;
    private zoomSwipeActive = false;
    private zoomLongPressId: ReturnType<typeof setTimeout> | null = null;

    // Ball free-roam physics — true ragdoll
    private ballVelX = 0;            // ball velocity (px/s)
    private ballVelY = 0;
    private ballFreeAnimId: number | null = null;
    private ballLastFreeTime = 0;
    private ballDragDx = 0;          // last drag deltas for launch velocity
    private ballDragDy = 0;

    // ═══ Combo Chain System — Japanese game radial action ring ═══
    private comboState: 'idle' | 'ring' | 'chain' = 'idle';
    private comboCount = 0;
    private comboTargetIdx = -1;
    private comboHoveredSeg = -1;
    private comboCenterX = 0;
    private comboCenterY = 0;
    private comboDecayId: ReturnType<typeof setTimeout> | null = null;
    private comboSegments: ComboSegment[] = [];
    private comboRingEl: HTMLElement | null = null;
    private comboCenterEl: HTMLElement | null = null;
    private comboCountEl: HTMLElement | null = null;
    private comboApproachEl: HTMLElement | null = null;
    private comboSegEls: HTMLElement[] = [];
    private comboLabelEl: HTMLElement | null = null;
    private comboOverlayEl: HTMLElement | null = null;
    private comboCloseTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private comboOpenGeneration = 0; // rAF generation guard for open/close race
    private tranceOrbitOffset = 0;    // radians; advances in TRANCE tier so segments orbit the ring

    // ═══ Extend-Selection System — 弾幕 Danmaku Cursor ═══════════════
    // Direct proportional float movement. Your thumb controls everything.
    // Boundaries are haptic information (bumps you feel), not magnets that grab.
    // Slow drag = character precision. Fast drag = covers ground (power curve).
    // Mikiri slam (vertical flick) = optional decisive snap to nearest boundary.
    // No accumulator. No momentum. No streak. No forced jumps. Pure control.
    private extendMode: 'off' | 'extending' = 'off';
    private extendAnchorOffset = 0;    // document offset where extend started (fixed)
    private extendHeadOffset = 0;      // integer head of extended selection
    private extendHeadF = 0;           // floating-point head (sub-char precision for smoothness)
    private extendAnchorF = 0;         // floating-point anchor (mirrors extendHeadF for pivot path)
    private extendLevel = 0;           // display: last boundary scope+1 (0=char,1=節,2=連,3=句,4=文)
    private extendLastSnapScope = -1;  // scope of last boundary crossing (-1 = none)
    private extendBadgeEl: HTMLElement | null = null;
    private extendCachedContent: string | null = null; // cache editor content during extend
    private extendBeamPhase = 0;           // sinusoidal phase for beam glow animation
    private extendLastDx = 0;              // previous dx for angular velocity
    private extendLastDy = 0;              // previous dy for angular velocity
    private beamOverlayEl: HTMLElement | null = null; // beam line overlay element
    private pulseRingTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private extendPlainCharSteps = 0;      // consecutive steps without boundary crossing (badge decay)
    private extendLastMikiriAt = 0;        // timestamp of last mikiri slam (cooldown)
    private extendLastTapAt = 0;           // timestamp of last extend tap (for double-tap pivot)
    private extendLastBoundaryHapticAt = 0; // throttle boundary haptics (min 40ms)
    // Left-zone parallel scroll (second finger on left 42% of screen during extend)
    private extendLeftZoneListener: ((e: TouchEvent) => void) | null = null;
    private extendScrollZoneT: { id: number; lastY: number } | null = null;
    // Extend context hint overlay
    private extendHintEl: HTMLElement | null = null;
    private extendHintTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // ═══ Maker Mode — マリオメーカー × 墨 Sumi Brush ═══════════════
    // Horizontal bit-by-bit selection mode inspired by Mario Maker block placement.
    // Two-thumb: right = horizontal advance/retreat through units, left = precise vertical.
    // Batch selections: stamp units, keep them highlighted for bulk/individual actions.
    // Gesture actions: angle-based flicks (Okami brush strokes) instead of menus.
    private makerMode = false;                     // true when Maker Mode is active
    private makerSelections: Array<{start: number; end: number; text: string; acted?: boolean}> = []; // batch stamps
    private makerCurrentStart = 0;                 // current selection start (char offset)
    private makerCurrentEnd = 0;                   // current selection end (char offset)
    private makerAnchor = 0;                       // 書道 brush anchor point (where selection began)
    private makerCursor = 0;                       // 書道 brush cursor (flows forward/backward from anchor)
    private makerBrushAccum = 0;                   // sub-character accumulator for smooth brush flow
    private makerUnitIndex = 0;                    // index into current scope units
    private makerPreciseScrollAccum = 0;           // left-thumb precise vertical scroll accumulator
    private makerStampEls: HTMLElement[] = [];      // DOM overlay elements for stamped selections
    private makerScrollListener: (() => void) | null = null; // re-renders stamps when editor scrolls
    private makerScrollDom: HTMLElement | null = null; // Fix B-11: store ref for reliable detach
    private makerBadgeEl: HTMLElement | null = null; // mode badge element
    private makerPanelEl: HTMLElement | null = null;  // stamp count / status display
    private makerGestureStartX = 0;                // gesture start position for angle detection
    private makerGestureStartY = 0;
    private makerIsGesturing = false;               // true when angle gesture in progress
    private makerCachedContent: string | null = null; // cached editor content
    private makerLastAction: string | null = null;     // last formatting action for batch repeat

    // ═══ Combo Ring Graduation — three-tier system (Groove Coaster) ═══
    private comboTotalActions = 0;     // per-chain actions for graduation (resets each combo)
    private comboTier = 0;            // 0=idle, 1=CHAIN, 2=FEVER, 3=TRANCE
    private comboLastActionType = ''; // last action string for variety bonus (DMC style)

    // Search debounce
    private searchDebounceId: ReturnType<typeof setTimeout> | null = null;
    // Typed visualViewport cleanup
    private searchVvCleanup: (() => void) | null = null;
    // Zoom lane combo-ring open delay (fix: don't pop ring on quick navigation taps)
    private zoomComboDelayId: ReturnType<typeof setTimeout> | null = null;
    // Combo label hide delay (fix: prevent flickery instant-disappear on de-hover)
    private comboLabelHideId: ReturnType<typeof setTimeout> | null = null;

    // Cached state for performance
    private cachedPadRect: DOMRect | null = null;       // avoid forced reflow on every drag start
    private cachedScrollerEl: HTMLElement | null = null; // avoid querySelector on every scroll
    private cachedDragView: MarkdownView | null = null;  // cached during drag/inertia to avoid O(n) workspace lookup per frame
    private displayTextCache = new Map<string, string>();  // toDisplayText cache keyed by raw text
    private cachedPrimarySegs: ComboSegment[] | null = null; // rebuild only on settings change
    private comboCenterSet = false;                      // replaces comboCenterX===0 check
    private lastContentHash = '';                        // skip redundant re-analysis

    /** Fast stride-sampled DJB2 fingerprint — catches edits anywhere in the document.
     *  Fix S-6: XOR head/tail/mid windows into the hash for sub-stride edit detection. */
    private contentFingerprint(s: string): string {
        let h = 5381;
        const stride = Math.max(1, s.length >> 8); // ~256 samples regardless of doc size
        for (let i = 0; i < s.length; i += stride) {
            h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        }
        // Sample head, tail, and middle windows densely for sub-stride edit detection
        const WINDOW = 64;
        for (let i = 0; i < Math.min(WINDOW, s.length); i++) {
            h ^= s.charCodeAt(i) << (i & 15);
        }
        for (let i = Math.max(0, s.length - WINDOW); i < s.length; i++) {
            h ^= s.charCodeAt(i) << (i & 15);
        }
        const mid = (s.length >> 1) - (WINDOW >> 1);
        if (mid > WINDOW) { // don't overlap with head window
            for (let i = mid; i < mid + Math.min(WINDOW, s.length - mid); i++) {
                h ^= s.charCodeAt(i) << (i & 15);
            }
        }
        return s.length + ':' + h;
    }
    private layoutChangeDebounceId: ReturnType<typeof setTimeout> | null = null;
    private isDraggingSafetyId: ReturnType<typeof setTimeout> | null = null;
    private showTimestamp = 0;  // prevent auto-hide within grace period after show()

    // ═══ Thumper Boundary Brace — structural resistance at scope boundaries ═══
    // When VROOM crosses a sentence/clause boundary, the next 2 steps require
    // ~40% more drag force. Gives tactile structure awareness without stopping.
    private vroomBraceSteps = 0;           // remaining brace steps (decrements to 0)
    private vroomBraceMultiplier = 1.0;    // current step threshold multiplier

    // ═══ NecroDancer Streak Momentum — sustained navigation reward ═══
    // Unbroken VROOM navigation (< 600ms gap) builds a streak that lowers
    // step friction by up to 15%. Breaking the streak resets to baseline.
    private vroomStreakCount = 0;           // consecutive steps without pause
    private vroomLastStepAt = 0;           // timestamp of last navigation step
    private vroomStreakBadgeEl: HTMLElement | null = null;  // streak counter badge

    // ═══ Hi-Fi Rush Format Invite — call-and-response formatting ═══
    // After a combo format action auto-advances, the next zoom lane item
    // briefly glows to invite the user to format it too.
    private formatInviteTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // ═══ Mode Flash Label — Sayonara Wild Hearts × WarioWare ═══
    // Brief JP kanji label on mode transitions for instant orientation.
    private modeFlashEl: HTMLElement | null = null;
    private modeFlashTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // ═══ Scope Graduation — Pinch-to-Zoom Scope Levels ═══
    private scopeEngine = new ScopeEngine();
    private scopeLevel = 0;             // 0=bunsetsu, 1=ren, 2=clause, 3=sentence
    private scopePinchBase = 1;         // pinch scale at last level change
    private scopeBadgeEl: HTMLElement | null = null;
    private wasPinching = false;
    private scopeSwipeAccum = 0;        // horizontal drag accumulator for scope changes
    private scopeChangedDuringDrag = false; // suppress swipe actions when scope changed
    private ballStartOffsetX = 0;       // ball offset from pad center at drag start
    private ballStartOffsetY = 0;

    // ═══ Intent Classification — NieR: Automata read-ahead ═══════════════
    // First few frames of drag classify intent: navigate (vertical) vs select (horizontal).
    // Prevents VROOM from fighting the user when they clearly mean to select.
    private dragIntent: 'undecided' | 'navigate' | 'select' = 'undecided';
    private dragIntentSamples: Array<{dx: number; dy: number}> = [];

    // ═══ Taiko Drumroll Scan — 太鼓の達人 ═══════════════════════════════════
    // Triple-tap within 400ms → rapid unit scan (130ms per step, up to 25 steps).
    // Inspired by Taiko drumroll: sustained rapid tapping sustains the action.
    // Genuinely useful for text editing: quickly scan-preview many units in sequence.
    private isDrumScan = false;
    private drumScanTapHistory: number[] = [];  // recent tap timestamps
    private drumScanLastAt = 0;                 // last step timestamp
    private drumScanStepCount = 0;              // steps taken in current scan
    private drumScanDirection = 1;              // 1=forward, -1=backward (based on last drag)
    private lastDragDirectionY = 1;             // tracks last vertical drag direction for drum scan

    // ═══ パラッパラッパー Auto-Repeat — PaRappa the Rapper ═══════════════════
    // Same formatting action 3+ times in a row → auto-apply to next N units.
    // Like hitting the rhythm in PaRappa — stay on beat and the game rewards you.
    // Genuine text editing value: batch-format series of similar content units.
    private autoRepeatAction = '';              // last formatting action type
    private autoRepeatCount = 0;               // consecutive same-action count
    private autoRepeatBadgeEl: HTMLElement | null = null;

    // ═══ 音ゲー Combo Memory — Project Diva Custom Charts ═══════════════════
    // Remembers your most-used combo sequences (last 3 actions) and offers
    // them as a quick-recall macro in subsequent combo rings.
    // Like Project Diva's note patterns — your editing rhythm becomes muscle memory.
    private comboMemory: Array<{sequence: string[]; count: number}> = [];
    private comboCurrentSequence: string[] = [];  // actions in current combo chain

    // ═══ DJMAX Timing Quality — 完璧 PERFECT / 良 GOOD ═══════════════════════
    // Rewards acting on the approach circle early: < 600ms = 完璧!, < 1200ms = 良!
    // Purely motivational — no gameplay penalty. Adds satisfying rhythm game feel.
    private comboRingOpenTime = 0;              // performance.now() when ring opened

    // ═══ Pop'n Full Format — 全拍子 ZEN BYŌSHI ══════════════════════════════
    // TRANCE tier + all 4 formatting types in one combo = full-format fanfare.
    // Inspired by Pop'n Music's Full Combo bonus. Encourages varied text editing.
    private comboActionsUsed = new Set<string>(); // unique action types in current combo

    // ═══ Position Stack — 巻き戻し Rewind (Katamari Damacy style) ═══════════
    // Before search-jump, teleport, or scope change, push current position.
    // "↩ Back" in combo ring pops to previous position.
    // Like Katamari's stage replay: you can always roll back to where you were.
    private positionStack: Array<{index: number; scopeLevel: number; chunkMode: string}> = [];
    private static readonly POSITION_STACK_MAX = 12;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
        this.physics = new PhysicsEngine({
            friction: 0.010,         // lower friction = longer natural coast (YANG)
            springStiffness: 200,    // lower than 260 = natural overshoot in settle
            springDamping: 0.38,     // under-damped = slight pleasing spring bounce
            mass: 0.55,
            maxVelocity: 18000,
        });
        this.haptics = new HapticEngine();

        this.physics.setOnUpdate(this.onPhysicsUpdate.bind(this));
        this.physics.setOnSnap(this.onPhysicsSnap.bind(this));
        this.physics.setOnBoundaryCross(this.onBoundaryCross.bind(this));
        this.loadCheatSheetCount();
    }

    mount(): void {
        if (this.containerEl) this.unmount();
        this.buildDOM();
        this.attachGestures();
        this.attachEditorListeners();
    }

    unmount(): void {
        this.hide();
        if (this.editorChangeRafId !== null) {
            cancelAnimationFrame(this.editorChangeRafId);
            this.editorChangeRafId = null;
        }
        if (this.comboCloseTimeoutId !== null) {
            clearTimeout(this.comboCloseTimeoutId);
            this.comboCloseTimeoutId = null;
        }
        if (this.layoutChangeDebounceId !== null) {
            clearTimeout(this.layoutChangeDebounceId);
            this.layoutChangeDebounceId = null;
        }
        if (this.isDraggingSafetyId !== null) {
            clearTimeout(this.isDraggingSafetyId);
            this.isDraggingSafetyId = null;
        }
        if (this.pulseRingTimeoutId !== null) {
            clearTimeout(this.pulseRingTimeoutId);
            this.pulseRingTimeoutId = null;
        }
        if (this.landingHintTimeoutId !== null) {
            clearTimeout(this.landingHintTimeoutId);
            this.landingHintTimeoutId = null;
        }
        // Clean up new feature timeouts
        if (this.formatInviteTimeoutId !== null) { clearTimeout(this.formatInviteTimeoutId); this.formatInviteTimeoutId = null; }
        if (this.modeFlashTimeoutId !== null) { clearTimeout(this.modeFlashTimeoutId); this.modeFlashTimeoutId = null; }
        if (this.modeFlashEl) { this.modeFlashEl.remove(); this.modeFlashEl = null; }
        if (this.vroomStreakBadgeEl) { this.vroomStreakBadgeEl.remove(); this.vroomStreakBadgeEl = null; }
        this.haptics.destroy();
        this.gesture?.destroy();
        this.gesture = null;
        this.physics.destroy();
        for (const el of this.highlightSegmentPool) el.remove();
        this.highlightSegmentPool = [];
        this.highlightOverlayEl = null;
        if (this.beamOverlayEl) { this.beamOverlayEl.remove(); this.beamOverlayEl = null; }
        if (this.containerEl) { this.containerEl.remove(); this.containerEl = null; }
        this.trailEls = [];
        this.cachedPadRect = null;
        this.cachedScrollerEl = null;
        this.cachedPrimarySegs = null;
        if (this.extendBadgeEl) { this.extendBadgeEl.remove(); this.extendBadgeEl = null; }
        // Fix #8: close search properly to remove visualViewport listeners before teardown
        this.closeSearch();
        if (this.zoomComboDelayId !== null) { clearTimeout(this.zoomComboDelayId); this.zoomComboDelayId = null; }
        if (this.comboLabelHideId !== null) { clearTimeout(this.comboLabelHideId); this.comboLabelHideId = null; }
        this.detachExtendScrollZone();
        this.hideExtendHint();
    }

    show(): void {
        if (!this.containerEl) return;
        // Suppress SentenceHighlighter while scroller is active (both compete for CM6 selection)
        this.plugin.highlighter.pause();
        // ── Restore preferred scope level from last session (instrument memory) ──
        try {
            const saved = localStorage.getItem('ms3-scope-level');
            if (saved !== null) {
                const lvl = parseInt(saved, 10);
                if (!isNaN(lvl) && lvl >= 0 && lvl < SCOPE_COUNT) this.scopeLevel = lvl;
            }
        } catch { /* localStorage unavailable in some sandboxes */ }
        this.rebuildUnits();
        this.containerEl.classList.add('ms3-visible');
        this.isVisible = true;
        this.showTimestamp = performance.now();
        // Reset stale state from previous session
        this.cachedPadRect = null;
        this.cachedScrollerEl = null;
        this.cachedPrimarySegs = null;
        this.comboCenterSet = false;
        this.extendMode = 'off';
        this.extendLevel = 0;
        this.scopeSwipeAccum = 0;  // clear leftover horizontal accumulator from last session
        // Reset chunk state on fresh show (in case hide() was skipped)
        this.chunkMode = 'off';
        this.currentChunkIdx = -1;
        this.chunkFocusedUnits = [];
        this.chunkFocusedIndex = 0;
        this.haptics.fire('zoom');
        this.startIdleAnim();
        this.updateHighlight();
        this.updateZoomLane();
        this.updateScopeBadge();
        // Gesture cheat sheet (#18): brief flash on first open
        this.showGestureCheatSheet();
        // Lift pad above iOS virtual keyboard
        this.attachKeyboardAvoidance();
    }

    hide(): void {
        if (!this.containerEl) return;
        this.containerEl.classList.remove('ms3-visible');
        this.isVisible = false;
        this.detachKeyboardAvoidance();
        this.holdNavigateMode = false;
        this.isDragging = false;
        this.plugin.isScrollerCapturing = false;
        if (this.isDraggingSafetyId !== null) {
            clearTimeout(this.isDraggingSafetyId);
            this.isDraggingSafetyId = null;
        }
        this.lateralOffset = 0;
        if (this.ballEl) this.ballEl.classList.remove('ms3-ball--glide');
        this.closeActionPanel();
        this.closeSearch();
        this.stopExtendSelection();
        this.hideHighlightOverlay();
        this.haptics.stopRoll();
        this.physics.stop();
        this.stopAllAnims();  // unified: stops idle, inertia, zoomBounce, ballFree
        this.clearZoomLongPress();
        this.cancelLandingHint();
        // Force-close combo ring even during close timeout
        if (this.comboCloseTimeoutId !== null) {
            clearTimeout(this.comboCloseTimeoutId);
            this.comboCloseTimeoutId = null;
        }
        this.cancelComboDecay();
        if (this.comboState !== 'idle') {
            this.comboState = 'idle';
            this.comboRingEl?.classList.remove('ms3-combo-ring--open', 'ms3-combo-ring--chain', 'ms3-combo-ring--tier-chain', 'ms3-combo-ring--tier-fever', 'ms3-combo-ring--tier-trance');
            this.comboOverlayEl?.classList.remove('ms3-combo-overlay--open', 'ms3-combo-overlay--chain');
            if (this.ballEl) this.ballEl.classList.remove('ms3-ball--combo-wait');
        }
        this.comboCenterSet = false;
        // Preserve comboTotalActions across hide/show for session graduation
        this.hideGestureCheatSheet();
        // Maker mode cleanup
        if (this.makerMode) this.exitMakerMode();
        // Chunk cleanup
        if (this.chunkMode !== 'off') {
            this.clearChunkSpotlight();
            this.clearChunkBoundaries();
            this.chunkMode = 'off';
            this.chunks = [];
            this.currentChunkIdx = -1;
            this.chunkFocusedUnits = [];
            this.chunkFocusedIndex = 0;
            if (this.ballEl) this.ballEl.classList.remove('ms3-ball--chunk');
        }
        // Re-enable SentenceHighlighter now that scroller is gone
        this.plugin.highlighter.resume();
    }

    toggle(): void { if (this.isVisible) this.hide(); else this.show(); }

    /** Lift all pad UI above the iOS virtual keyboard using visualViewport tracking. */
    private attachKeyboardAvoidance(): void {
        if (!window.visualViewport || this.vvResizeListener) return;
        const base = this.getBottomOffsetPx();
        const update = () => {
            if (!this.containerEl) return;
            const vv = window.visualViewport!;
            const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            this.containerEl.style.setProperty('--ms3-bottom', `${base + keyboardHeight}px`);
        };
        this.vvResizeListener = update;
        window.visualViewport.addEventListener('resize', update, { passive: true } as AddEventListenerOptions);
        window.visualViewport.addEventListener('scroll', update, { passive: true } as AddEventListenerOptions);
    }

    private detachKeyboardAvoidance(): void {
        if (this.vvResizeListener && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this.vvResizeListener);
            window.visualViewport.removeEventListener('scroll', this.vvResizeListener);
        }
        this.vvResizeListener = null;
        if (this.containerEl) {
            this.containerEl.style.setProperty('--ms3-bottom', `${this.getBottomOffsetPx()}px`);
        }
    }

    // ═══ Unified Animation Loop ═════════════════════════════════
    // Single rAF drives ALL animation subsystems. Each subsystem is a named
    // entry in animActive. The loop self-terminates when all subsystems stop.
    // This eliminates 4 concurrent rAF loops that caused frame drops on mobile.

    private activateAnim(name: string): void {
        this.animActive.add(name);
        if (this.animLoopId === null) {
            this.animLastTime = performance.now();
            this.animLoopId = requestAnimationFrame(this.animTick);
        }
    }

    private deactivateAnim(name: string): void {
        this.animActive.delete(name);
        // Loop self-terminates when set is empty (checked in animTick)
    }

    private animTick = (now: number): void => {
        if (this.animActive.size === 0 || !this.isVisible) {
            this.animLoopId = null;
            return;
        }
        const dt = Math.min((now - this.animLastTime) / 1000, 0.032);
        this.animLastTime = now;

        if (this.animActive.has('idle')) this.tickIdle(now);
        if (this.animActive.has('inertia')) this.tickInertia(now, dt);
        if (this.animActive.has('zoomBounce')) this.tickZoomBounce(now);
        if (this.animActive.has('ballFree')) this.tickBallFree(now, dt);
        if (this.animActive.has('drumScan')) this.tickDrumScan(now);

        // ── TRANCE orbit: rotate combo segments when ring is open at TRANCE tier ──
        if (this.comboState !== 'idle' && this.comboTier >= COMBO_TIER_TRANCE) {
            this.tranceOrbitOffset += dt * 0.314; // ~20 seconds per full revolution
            this.refreshTranceSegmentPositions();
        }

        this.animLoopId = requestAnimationFrame(this.animTick);
    };

    private stopAllAnims(): void {
        if (this.animLoopId !== null) {
            cancelAnimationFrame(this.animLoopId);
            this.animLoopId = null;
        }
        this.animActive.clear();
    }

    // ═══ Idle Animation ═══════════════════════════════════════

    private startIdleAnim(): void {
        this.stopIdleAnim();
        this.idleTime = performance.now();
        this.lastIdleFrame = 0;
        this.activateAnim('idle');
    }

    private stopIdleAnim(): void {
        this.deactivateAnim('idle');
    }

    /** Idle tick — runs at ~30fps within unified loop */
    private tickIdle(now: number): void {
        // Throttle idle visuals to ~30fps (33ms) — saves battery on idle
        if (now - this.lastIdleFrame < 33) return;
        this.lastIdleFrame = now;
        // Auto-hide when settings pane is the active view.
        if (now - this.showTimestamp > 1500) {
            const activeEl = document.activeElement;
            if (activeEl?.closest('.mod-settings')) {
                this.hide();
                return;
            }
        }
        if (!this.physics.isRunning()) {
            this.updateIdleVisuals();
        }
    }

    private updateIdleVisuals(): void {
        if (!this.ballEl || !this.ballGlowEl) return;
        // Yield to active drag or spring-back animation to avoid transform fighting
        if (this.isDragging || this.animActive.has('ballFree')) return;
        const t = (performance.now() - this.idleTime) / 1000;

        // Bigger, more dynamic idle: ball wanders freely like it's alive
        const ix = Math.sin(t * 0.7) * 28 + Math.sin(t * 1.4) * 14 + Math.cos(t * 2.1) * 6;
        const iy = Math.cos(t * 0.5) * 24 + Math.sin(t * 1.1) * 12 + Math.sin(t * 1.8) * 5;
        const irot = Math.sin(t * 0.4) * 25 + Math.cos(t * 0.9) * 15;
        const iPulse = 1 + Math.sin(t * 1.3) * 0.08 + Math.sin(t * 2.6) * 0.04;

        this.ballEl.style.transform = `translate3d(${ix}px, ${iy}px, 0) scale(${iPulse}) rotate(${irot}deg)`;
        this.ballGlowEl.style.transform = `translate3d(${ix}px, ${iy}px, 0) scale(${1 + Math.sin(t * 1.0) * 0.25})`;
        this.ballGlowEl.style.opacity = String(0.15 + Math.sin(t * 0.8) * 0.05);

        for (let i = 0; i < this.trailEls.length; i++) {
            const lag = (i + 1) * 0.2;
            const tx = Math.sin((t - lag) * 0.7) * 12;
            const ty = Math.cos((t - lag) * 0.5) * 10;
            const s = Math.max(0.2, 0.5 - i * 0.1);
            this.trailEls[i].style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
            this.trailEls[i].style.opacity = String(Math.max(0.01, 0.1 - i * 0.02));
        }

        if (this.ringEl) {
            const ringScale = 1 + Math.sin(t * 0.6) * 0.02;
            this.ringEl.style.transform = `scale(${ringScale})`;
            this.ringEl.style.opacity = String(0.3 + Math.sin(t * 0.8) * 0.1);
        }
    }

    // ═══ DOM ══════════════════════════════════════════════════

    private buildDOM(): void {
        const c = document.createElement('div');
        c.className = 'ms3';
        c.style.setProperty('--ms3-bottom', `${this.getBottomOffsetPx()}px`);
        c.style.setProperty('--ms3-pad-size', `${this.getPadSizePx()}px`);

        // Trackball pad
        const pad = document.createElement('div');
        pad.className = 'ms3-pad';

        // Directional hints
        const dirMap: [string, string][] = [['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '↔']];
        const dirActions = this.plugin.settings.directionalActions;
        for (const [dir, arrow] of dirMap) {
            const hint = document.createElement('span');
            hint.className = `ms3-dir-hint ms3-dir-hint--${dir}`;
            if (dir === 'right') {
                // Right always shows extend symbol
                hint.textContent = '↔';
            } else {
                const key = `swipe${dir.charAt(0).toUpperCase() + dir.slice(1)}` as keyof typeof dirActions;
                hint.textContent = dirActions[key] !== 'none' ? arrow : '';
            }
            pad.appendChild(hint);
        }

        // Ring
        const ring = document.createElement('div');
        ring.className = 'ms3-ring';
        pad.appendChild(ring);
        this.ringEl = ring;

        // Glow
        const glow = document.createElement('div');
        glow.className = 'ms3-ball-glow';
        pad.appendChild(glow);
        this.ballGlowEl = glow;

        // Trails
        for (let i = 0; i < TRAIL_LENGTH; i++) {
            const trail = document.createElement('div');
            trail.className = 'ms3-ball-trail';
            pad.appendChild(trail);
            this.trailEls.push(trail);
        }

        // Ball
        const ball = document.createElement('div');
        ball.className = 'ms3-ball';
        pad.appendChild(ball);
        this.ballEl = ball;

        c.appendChild(pad);
        this.padEl = pad;

        // Info bar
        const info = document.createElement('div');
        info.className = 'ms3-info';

        const counter = document.createElement('span');
        counter.className = 'ms3-counter';
        info.appendChild(counter);
        this.counterEl = counter;

        const preview = document.createElement('span');
        preview.className = 'ms3-preview';
        info.appendChild(preview);
        this.previewEl = preview;

        // Search icon in info bar (tap to open search)
        const searchIcon = document.createElement('span');
        searchIcon.className = 'ms3-search-icon';
        searchIcon.textContent = '🔍';
        info.appendChild(searchIcon);

        c.appendChild(info);
        this.infoEl = info;

        // Fix #6: only the search icon opens search; full bar can dismiss it but won't open accidentally
        info.style.pointerEvents = 'auto';
        info.style.minHeight = '36px';
        info.style.padding = '6px 14px';
        info.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isSearchOpen) this.closeSearch();
        });
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isSearchOpen) { this.closeSearch(); }
            else { this.openSearch(); }
        });

        // Zoomed rhythm-text lane — osu! note highway (5 items visible)
        const zoom = document.createElement('div');
        zoom.className = 'ms3-zoom';

        // Shared touch handler factory for zoom items (swipe = action, tap = navigate, hold = action panel)
        const makeZoomItem = (cls: string, offset: number): HTMLElement => {
            const el = document.createElement('span');
            el.className = cls;
            el.addEventListener('touchstart', (e) => { this.onZoomItemTouchStart(e, offset); }, { passive: true });
            el.addEventListener('touchmove', (e) => { this.onZoomItemTouchMove(e, offset); }, { passive: true });
            el.addEventListener('touchend', (e) => { this.onZoomItemTouchEnd(e, offset); }, { passive: true });
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.comboState !== 'idle') return;
                if (this.zoomSwipeActive) return;
                if (offset === 0) {
                    // Current item tap → open combo ring (osu! hit circle)
                    const rect = this.zoomCurrentEl?.getBoundingClientRect();
                    if (rect) {
                        this.comboCenterX = rect.left + rect.width / 2;
                        this.comboCenterY = rect.top + rect.height / 2;
                    }
                    this.comboCenterSet = true;
                    const segs = this.chunkMode === 'focused' ? this.getChunkBitSegments() : this.getPrimarySegments();
                    this.openComboRing(this.currentIndex, segs);
                    this.haptics.fire('snap');
                } else {
                    this.zoomTapNavigate(offset);
                }
            });
            zoom.appendChild(el);
            return el;
        };

        this.zoomPrev2El = makeZoomItem('ms3-zoom-far ms3-zoom-prev2', -2);
        this.zoomPrevEl = makeZoomItem('ms3-zoom-prev', -1);
        this.zoomCurrentEl = makeZoomItem('ms3-zoom-current', 0);
        this.zoomNextEl = makeZoomItem('ms3-zoom-next', 1);
        this.zoomNext2El = makeZoomItem('ms3-zoom-far ms3-zoom-next2', 2);

        // ── Zoom lane scroll gutter (left edge) — swipe vertically to browse units ──
        const zoomScroll = document.createElement('div');
        zoomScroll.className = 'ms3-zoom-scroll';
        let zoomScrollStartX = 0;
        let zoomScrollY = 0;
        let zoomScrollAccum = 0;
        let zoomScrollLocked: 'v' | 'h' | null = null;
        zoomScroll.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            zoomScrollY = e.touches[0]?.clientY ?? 0;
            zoomScrollStartX = e.touches[0]?.clientX ?? 0;
            zoomScrollAccum = 0;
            zoomScrollLocked = null;
        }, { passive: false });
        zoomScroll.addEventListener('touchmove', (e) => {
            e.stopPropagation();
            const touch = e.touches[0];
            if (!touch) return;
            const ty = touch.clientY;
            const tx = touch.clientX;
            const dty = ty - zoomScrollY;
            const totalDX = Math.abs(tx - zoomScrollStartX);
            const totalDY = Math.abs(zoomScrollAccum + dty);

            // Determine axis lock on first significant movement
            if (!zoomScrollLocked) {
                if (totalDX > 6 || totalDY > 6) {
                    zoomScrollLocked = totalDY >= totalDX ? 'v' : 'h';
                }
            }

            // Only capture vertical gestures — let horizontal pass through (no glitch)
            if (zoomScrollLocked === 'h') { zoomScrollY = ty; return; }
            e.preventDefault();
            zoomScrollY = ty;
            zoomScrollAccum += dty;
            const step = 28;
            while (Math.abs(zoomScrollAccum) >= step) {
                const dir = zoomScrollAccum < 0 ? 1 : -1; // swipe up = forward
                const target = Math.max(0, Math.min(this.units.length - 1, this.currentIndex + dir));
                if (target !== this.currentIndex) {
                    this.currentIndex = target;
                    this.physics.setPosition('y', target * UNIT_STEP);
                    this.lateralOffset = 0;
                    this.lastManualScrollAt = 0;
                    this.updateHighlight();
                    this.updateCounter();
                    this.updateZoomLane();
                    this.haptics.fire('tick');
                }
                zoomScrollAccum -= (zoomScrollAccum > 0 ? step : -step);
            }
        }, { passive: false });
        zoom.prepend(zoomScroll);
        // Reset scroll accumulator on touch end
        zoomScroll.addEventListener('touchend', () => { zoomScrollAccum = 0; zoomScrollLocked = null; }, { passive: true });
        zoomScroll.addEventListener('touchcancel', () => { zoomScrollAccum = 0; zoomScrollLocked = null; }, { passive: true });

        c.appendChild(zoom);
        this.zoomEl = zoom;

        // Scope graduation badge (JP game level indicator) — outside zoom to avoid overflow clip
        const scopeBadge = document.createElement('div');
        scopeBadge.className = 'ms3-scope-badge';
        scopeBadge.textContent = SCOPE_BADGES[0];
        scopeBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            // Tap to cycle scope: 0→1→2→3→0
            const next = (this.scopeLevel + 1) % SCOPE_COUNT;
            this.setScopeLevel(next, 1);
        });
        c.appendChild(scopeBadge);
        this.scopeBadgeEl = scopeBadge;

        // 区 Chunk panel button — always-visible shortcut to open/close the chunk list.
        // Appears when chunks exist. Tapping it toggles the chunk panel without mode change.
        const chunkPanelBtn = document.createElement('div');
        chunkPanelBtn.className = 'ms3-chunk-panel-btn';
        chunkPanelBtn.textContent = '区';
        chunkPanelBtn.title = 'Show context chunks';
        chunkPanelBtn.style.display = 'none';
        chunkPanelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleChunkPanel();
        });
        c.appendChild(chunkPanelBtn);
        this.chunkPanelBtnEl = chunkPanelBtn;

        // ── Document progress ribbon — thin spatial bar showing position in file ──
        // Uses --ms3-doc-progress CSS variable (0–1) updated by updateCounter().
        // Transforms with scaleX so it grows from left edge: fully spatial, not numeric.
        // TAP-TO-SCRUB: tapping the ribbon area jumps to that % position in the document.
        const progressRibbon = document.createElement('div');
        progressRibbon.className = 'ms3-progress-ribbon';
        // Expand tap target — the ribbon itself is thin, but the hit zone should be generous
        const ribbonHitZone = document.createElement('div');
        ribbonHitZone.className = 'ms3-progress-ribbon-hit';
        ribbonHitZone.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.units.length <= 1) return;
            const rect = ribbonHitZone.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const targetIdx = Math.round(pct * (this.units.length - 1));
            this.pushPositionStack();
            this.currentIndex = targetIdx;
            this.physics.setPosition('y', targetIdx * UNIT_STEP);
            this.lateralOffset = 0;
            this.lastManualScrollAt = 0;
            this.updateHighlight();
            this.updateCounter();
            this.updateZoomLane();
            this.teleportToCurrentUnit();
            this.haptics.fire('snap');
        });
        ribbonHitZone.appendChild(progressRibbon);
        c.appendChild(ribbonHitZone);
        this.progressRibbonEl = progressRibbon;

        // Extend-selection badge — shows current extend granularity level
        const extendBadge = document.createElement('div');
        extendBadge.className = 'ms3-extend-badge';
        extendBadge.style.display = 'none';
        extendBadge.style.pointerEvents = 'none';
        c.appendChild(extendBadge);
        this.extendBadgeEl = extendBadge;

        // ═══ Combo Ring (radial pie-menu, osu! × Persona 5) ══════════
        const comboOverlay = document.createElement('div');
        comboOverlay.className = 'ms3-combo-overlay';
        comboOverlay.addEventListener('touchstart', (e) => this.onComboOverlayTouch(e, 'start'), { passive: false, capture: false });
        comboOverlay.addEventListener('touchmove', (e) => this.onComboOverlayTouch(e, 'move'), { passive: false, capture: false });
        comboOverlay.addEventListener('touchend', (e) => this.onComboOverlayTouch(e, 'end'), { passive: false, capture: false });
        comboOverlay.addEventListener('click', (e) => { e.stopPropagation(); this.closeComboRing(); });

        const comboRingDiv = document.createElement('div');
        comboRingDiv.className = 'ms3-combo-ring';

        const comboApproach = document.createElement('div');
        comboApproach.className = 'ms3-combo-approach';
        comboRingDiv.appendChild(comboApproach);
        this.comboApproachEl = comboApproach;

        const comboCenterDiv = document.createElement('div');
        comboCenterDiv.className = 'ms3-combo-center';
        const comboCountSpan = document.createElement('span');
        comboCountSpan.className = 'ms3-combo-count';
        comboCenterDiv.appendChild(comboCountSpan);
        comboRingDiv.appendChild(comboCenterDiv);
        this.comboCenterEl = comboCenterDiv;
        this.comboCountEl = comboCountSpan;

        for (let i = 0; i < 6; i++) {
            const seg = document.createElement('div');
            seg.className = 'ms3-combo-seg';
            seg.dataset.idx = String(i);
            seg.setAttribute('role', 'button');
            comboRingDiv.appendChild(seg);
            this.comboSegEls.push(seg);
        }

        const comboLabel = document.createElement('div');
        comboLabel.className = 'ms3-combo-label';
        comboRingDiv.appendChild(comboLabel);
        this.comboLabelEl = comboLabel;

        comboOverlay.appendChild(comboRingDiv);
        c.appendChild(comboOverlay);
        this.comboOverlayEl = comboOverlay;
        this.comboRingEl = comboRingDiv;

        // Action panel
        const actionsEl = document.createElement('div');
        actionsEl.className = 'ms3-actions';
        for (const action of DEFAULT_ACTIONS) {
            const btn = document.createElement('button');
            btn.className = 'ms3-action-btn';
            btn.dataset.action = action.id;
            btn.textContent = `${action.icon} ${action.label}`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.executeAction(action.id as SurfAction);
            });
            actionsEl.appendChild(btn);
        }
        // Command runner slot 
        const cmdBtn = document.createElement('button');
        cmdBtn.className = 'ms3-action-btn ms3-action-btn--cmd';
        cmdBtn.textContent = '⌘ Command…';
        cmdBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openCommandPicker();
        });
        actionsEl.appendChild(cmdBtn);

        // Custom command presets from settings
        const customCmds = this.plugin.settings.customCommands ?? [];
        for (const cmd of customCmds) {
            if (!cmd.commandId) continue;
            const presetBtn = document.createElement('button');
            presetBtn.className = 'ms3-action-btn ms3-action-btn--preset';
            presetBtn.textContent = `⚡ ${cmd.name || cmd.commandId}`;
            presetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.executeCustomCommand(cmd.commandId);
            });
            actionsEl.appendChild(presetBtn);
        }

        c.appendChild(actionsEl);
        this.actionPanelEl = actionsEl;

        // Search panel
        const searchPanel = document.createElement('div');
        searchPanel.className = 'ms3-search';
        const searchInput = document.createElement('input');
        searchInput.className = 'ms3-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search units…';
        searchInput.inputMode = 'search';
        searchInput.enterKeyHint = 'search';
        searchInput.addEventListener('input', () => this.onSearchInput());
        searchPanel.appendChild(searchInput);
        this.searchInputEl = searchInput;

        const searchResults = document.createElement('div');
        searchResults.className = 'ms3-search-results';
        searchPanel.appendChild(searchResults);
        this.searchResultsEl = searchResults;

        c.appendChild(searchPanel);
        this.searchEl = searchPanel;

        document.body.appendChild(c);
        this.containerEl = c;
    }

    // ═══ Gestures ═════════════════════════════════════════════

    private attachGestures(): void {
        if (!this.padEl) return;
        this.gesture = new GestureHandler(this.padEl, {
            onDrag: this.onDrag.bind(this),
            onRelease: this.onRelease.bind(this),
            onTap: this.onTap.bind(this),
            onDragStart: this.onDragStart.bind(this),
            onPinch: this.onPinchScope.bind(this),
            onPinchEnd: this.onPinchScopeEnd.bind(this),
        });
    }

    private attachEditorListeners(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', () => {
                if (!this.isVisible) return;
                // Abort extend on file switch — offsets and cached content are stale
                if (this.extendMode === 'extending') this.stopExtendSelection();
                // Grace period: don't auto-hide within 1.5s of show()
                const inGrace = performance.now() - this.showTimestamp < 1500;
                const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view && !inGrace) {
                    // Navigated to non-editor (settings, graph, etc.) — hide HUD
                    this.hide();
                    return;
                }
                if (!view) return;
                // Invalidate caches for the new view
                this.cachedScrollerEl = null;
                this.cachedPadRect = null;
                this.rebuildUnits();
                // Maker mode uses a scroll listener on the old editor's scrollDOM;
                // exit so it gets re-attached to the new editor if re-entered.
                if (this.makerMode) this.exitMakerMode();
            })
        );
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                if (!this.isVisible) return;
                // Debounce 100ms — layout-change fires during split-pane re-parenting
                // where active view briefly becomes null before settling
                if (this.layoutChangeDebounceId !== null) clearTimeout(this.layoutChangeDebounceId);
                this.layoutChangeDebounceId = setTimeout(() => {
                    this.layoutChangeDebounceId = null;
                    if (!this.isVisible) return;
                    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                    const inGrace = performance.now() - this.showTimestamp < 1500;
                    if (!view && !inGrace) { this.hide(); }
                    else if (view) { this.cachedPadRect = null; this.cachedScrollerEl = null; }
                }, 100);
            })
        );
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('editor-change', () => {
                if (!this.isVisible) return;
                // Abort extend on editor-change: offsets are stale against new content.
                // (Same pattern as active-leaf-change cleanup.)
                if (this.extendMode === 'extending') {
                    this.stopExtendSelection();
                    return;
                }
                // Issue #1: Invalidate makerCachedContent — external edits make it stale
                if (this.makerMode) {
                    this.makerCachedContent = null;
                }
                if (this.isDragging) return;
                if (this.comboState !== 'idle') return;
                // Exit chunk focus on editor change — offsets are stale
                if (this.chunkMode === 'focused') {
                    this.exitChunkMode();
                }
                if (this.editorChangeRafId !== null) cancelAnimationFrame(this.editorChangeRafId);
                this.editorChangeRafId = requestAnimationFrame(() => {
                    this.editorChangeRafId = null;
                    const savedIdx = this.currentIndex;
                    this.rebuildUnits();
                    if (savedIdx < this.units.length) {
                        this.currentIndex = savedIdx;
                    }
                });
            })
        );
    }

    // ═══ Parsing ══════════════════════════════════════════════

    private rebuildUnits(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) { this.units = []; return; }
        this.displayTextCache.clear();

        const content = view.editor.getValue();
        this.lastContentHash = this.contentFingerprint(content);
        this.scopeEngine.analyze(content, this.plugin.settings.sentenceRegex);
        this.chunks = this.scopeEngine.getChunks();
        this.units = this.scopeEngine.getUnits(this.scopeLevel);
        // Show 区 button whenever the scroller is visible and there is content
        // (show even for single-chunk docs — useful for jumping to it / editing splits)
        if (this.chunkPanelBtnEl) {
            this.chunkPanelBtnEl.style.display = this.units.length > 0 ? 'flex' : 'none';
        }
        // If in chunk mode, re-enter to refresh unit list from new chunks
        if (this.chunkMode === 'overview' && this.chunks.length > 0) {
            this.units = this.chunks;
        } else if (this.chunkMode === 'focused' && this.currentChunkIdx >= 0 && this.currentChunkIdx < this.chunks.length) {
            this.chunkFocusedUnits = this.scopeEngine.getUnitsInChunk(this.scopeLevel, this.currentChunkIdx);
            this.units = this.chunkFocusedUnits;
        } else if (this.chunkMode !== 'off') {
            // Chunks disappeared — exit chunk mode
            this.chunkMode = 'off';
            this.currentChunkIdx = -1;
            this.chunkFocusedUnits = [];
        }
        // Invalidate cached scroller only when view likely changed (not on every rebuild)
        // cachedScrollerEl is invalidated separately by layout-change listener

        const yPositions = this.units.map((_, i) => i * UNIT_STEP);
        this.physics.setSnapPositions('y', yPositions);
        this.physics.setBounds('y', 0, Math.max(0, (this.units.length - 1) * UNIT_STEP));

        // Find current unit from cursor — use binary search via scope engine
        const offset = view.editor.posToOffset(view.editor.getCursor());
        const idx = this.scopeEngine.findUnitAt(this.scopeLevel, offset);
        if (idx >= 0 && idx < this.units.length) {
            this.currentIndex = idx;
            this.physics.setPosition('y', idx * UNIT_STEP);
        }

        this.updateCounter();
        this.updateZoomLane();
    }

    // ═══ Gesture Callbacks — VROOM TRACKBALL ════════════════

    // Elecom HUGE Plus constants — 陰陽 yin-yang: precision (slow) meets power (fast)
    private static readonly VROOM_DECAY   = 0.40;   // momentum retention per tick — tight control, no runaway
    private static readonly VROOM_GAIN    = 0.28;    // speed → momentum amplification
    private static readonly VROOM_STEP_LO = 7;       // step px at low speed — YIN: higher = more deliberate precision steps
    private static readonly VROOM_STEP_HI = 20;      // step px at high speed — YANG: needs deliberate speed
    private static readonly VROOM_MIN_SPEED = 1.5;   // minimum drag speed for stepping — tighter dead zone for precision
    private static readonly VROOM_HOLD_MULT = 2.0;   // hold-glide multiplier
    private static readonly VROOM_BASE_MULT = 0.90;  // normal scroll multiplier — direct and responsive
    private static readonly VROOM_INERTIA_CARRY = 0.22; // release → inertia velocity — controlled flings
    // Precision zone: slow moves get progressively dampened for single-line accuracy
    private static readonly PRECISION_SPEED_CEIL = 9;   // below this = precision mode kicks in (tight zone)
    private static readonly PRECISION_DAMPING = 0.65;   // accumulator multiplier in precision zone — more controlled

    private onDragStart(startX: number, startY: number): void {
        this.isDragging = true;
        this.plugin.isScrollerCapturing = true;
        this.cachedDragView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        this.holdNavigateMode = false;
        this.autoGlideAccum = 0;  // reset auto-glide detection
        this.cancelLandingHint();
        // Disable highlight overlay transition during drag (avoid 60ms lag)
        if (this.highlightOverlayEl) {
            this.highlightOverlayEl.style.transition = 'none';
        }
        this.dragNavAccumulatorY = 0;
        this.holdScrollVelocity = 0;
        this.vroomMomentum = 0;
        this.circularAccum = 0;
        this.lastDragAngle = null;
        this.ballPopScale = 1;
        this.ballPopDecay = 0;
        this.scopeSwipeAccum = 0;
        this.scopeChangedDuringDrag = false;
        this.dragIntent = 'undecided';
        this.dragIntentSamples = [];
        this.dragActionAnchorIndex = this.getDisplayIndex();
        // Reset streak if gap since last step exceeds threshold
        if (performance.now() - this.vroomLastStepAt > 600) {
            this.vroomStreakCount = 0;
            this.updateStreakBadge();
        }
        this.physics.stop();
        this.physics.setPosition('y', this.currentIndex * UNIT_STEP);
        this.stopEditorInertia();
        this.cancelBallFreeAnim();
        this.cancelZoomBounce();
        // Cache pad rect to avoid forced reflow on every subsequent drag frame
        if (this.padEl) {
            this.cachedPadRect = this.padEl.getBoundingClientRect();
            this.ballStartOffsetX = startX - (this.cachedPadRect.left + this.cachedPadRect.width / 2);
            this.ballStartOffsetY = startY - (this.cachedPadRect.top + this.cachedPadRect.height / 2);
        } else {
            this.ballStartOffsetX = 0;
            this.ballStartOffsetY = 0;
        }
        this.ballLocalX = this.ballStartOffsetX;
        this.ballLocalY = this.ballStartOffsetY;
        // Safety: if isDragging gets stuck (OS hijacks touch), auto-reset after timeout
        // Extend mode gets longer timeout since precision operations take time
        if (this.isDraggingSafetyId !== null) clearTimeout(this.isDraggingSafetyId);
        const safetyTimeout = this.extendMode === 'extending' ? 15000 : 5000;
        this.isDraggingSafetyId = setTimeout(() => {
            if (this.isDragging) {
                this.isDragging = false;
                this.plugin.isScrollerCapturing = false;
                this.stopExtendSelection();
                this.springBallToCenter();
            }
            this.isDraggingSafetyId = null;
        }, safetyTimeout);
        this.haptics.fire('light');
    }

    private onDrag(dx: number, dy: number, totalX: number, totalY: number, force: number): void {
        if (this.isActionPanelOpen || this.comboState !== 'idle') return;

        // ── INTENT CLASSIFICATION: first ~4 frames classify navigate vs select ──
        // Prevents VROOM from fighting the user when they clearly mean to select.
        if (this.dragIntent === 'undecided' && this.extendMode === 'off' && !this.makerMode) {
            this.dragIntentSamples.push({dx, dy});
            if (this.dragIntentSamples.length >= 4 || Math.abs(totalX) + Math.abs(totalY) > 15) {
                let sumAbsX = 0, sumAbsY = 0;
                for (const s of this.dragIntentSamples) {
                    sumAbsX += Math.abs(s.dx);
                    sumAbsY += Math.abs(s.dy);
                }
                this.dragIntent = sumAbsX > sumAbsY * 1.4 ? 'select' : 'navigate';
                this.dragIntentSamples = [];
            }
        }

        // ── STICKY EXTEND: horizontal drag past threshold enters extend mode live (SDVX knob — omnidirectional) ──
        // Either direction: drag left OR right IS the selection gesture.
        // Intent-adaptive thresholds: when intent is 'select', enter extend much sooner.
        const extendMinX = this.dragIntent === 'select' ? 18 : 50;
        const extendRatio = this.dragIntent === 'select' ? 1.2 : 2.0;
        if (this.extendMode === 'off' && !this.makerMode && this.chunkMode === 'off'
            && Math.abs(totalX) > extendMinX && Math.abs(totalX) > Math.abs(totalY) * extendRatio
            && this.units.length > 0) {
            this.currentIndex = this.getDisplayIndex();
            this.lateralOffset = 0;
            this.updateHighlight();
            this.startExtendSelection();
            this.haptics.fire('zoom');
            this.vroomMomentum = 0;
            // fall through into extending branch below
        }

        // ── EXTEND MODE: horizontal → extend advance, vertical → scroll document ──
        if (this.extendMode === 'extending') {
            const speed = Math.sqrt(dx * dx + dy * dy);

            // Scroll-extend bridge: vertical ALWAYS scrolls — no exclusion with horizontal extend.
            // Both axes are live simultaneously: H extends selection, V scrolls document.
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDy > 0.8) {
                const view = this.getView();
                if (view) {
                    const cmView = this.getCmView(view.editor);
                    if (cmView) cmView.scrollDOM.scrollTop += dy * 1.3;
                }
                // Throttled overlay reposition so highlight tracks the scroll
                const nowExtend = performance.now();
                if (nowExtend - this.lastOverlayAt > 16) {
                    this.lastOverlayAt = nowExtend;
                    this.showHighlightOverlay(this.currentIndex);
                }
            }

            this.updateExtendFromDrag(dx, dy, speed);
            this.updateBallJuice(dx, dy, speed);
            // Still track ball position for visual feedback — clamp ball to pad boundary
            this.ballLocalX = this.ballStartOffsetX + totalX;
            this.ballLocalY = this.ballStartOffsetY + totalY;
            const extMaxDist = this.getPadRadiusPx() - this.getBallRadiusPx();
            const extDist = Math.sqrt(this.ballLocalX ** 2 + this.ballLocalY ** 2);
            if (extDist > extMaxDist && extDist > 0) {
                const elastic = extMaxDist + (extDist - extMaxDist) * 0.2;
                const s = elastic / extDist;
                this.ballLocalX *= s;
                this.ballLocalY *= s;
            }
            // Keep zoom lane and counter live during extend
            this.updateCounter();
            this.updateZoomLane();
            return;
        }

        // ── MAKER MODE: simultaneous H=unit-advance + V=scroll ──
        // Both axes always active — horizontal brushes characters, vertical scrolls editor.
        if (this.makerMode) {
            const speed = Math.sqrt(dx * dx + dy * dy);
            this.ballLocalX = this.ballStartOffsetX + totalX;
            this.ballLocalY = this.ballStartOffsetY + totalY;
            const mkMaxDist = this.getPadRadiusPx() - this.getBallRadiusPx();
            const mkDist = Math.sqrt(this.ballLocalX ** 2 + this.ballLocalY ** 2);
            if (mkDist > mkMaxDist && mkDist > 0) {
                const elastic = mkMaxDist + (mkDist - mkMaxDist) * 0.2;
                const s = elastic / mkDist;
                this.ballLocalX *= s;
                this.ballLocalY *= s;
            }
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDy > 1.5) {
                const view = this.getView();
                if (view) {
                    const cmView = this.getCmView(view.editor);
                    if (cmView) cmView.scrollDOM.scrollTop += dy * 1.2;
                }
            }
            // Horizontal ALWAYS advances brush (simultaneous with scroll)
            if (absDx > 0.5) {
                this.updateMakerFromDrag(dx, dy, speed);
            }
            this.updateBallJuice(dx, dy, speed);
            return;
        }

        const speed = Math.sqrt(dx * dx + dy * dy);

        // ── BALL POSITION — true 1:1 finger tracking ──────────
        // Ball snaps to finger on drag start, then tracks displacement exactly.
        // No lag, no float — ball IS the thumb.
        const precisionZone = 4;
        const vroomZone = 15;
        const t = Math.max(0, Math.min(1, (speed - precisionZone) / (vroomZone - precisionZone)));
        const dynamicGain = t * t * (3 - 2 * t);

        // Pure 1:1: start offset + total displacement
        this.ballLocalX = this.ballStartOffsetX + totalX;
        this.ballLocalY = this.ballStartOffsetY + totalY;

        // Store last deltas for launch velocity on release
        this.ballDragDx = dx;
        this.ballDragDy = dy;

        // Elastic clamp to pad boundary — rubber-band feel past edge
        const maxDist = this.getPadRadiusPx() - this.getBallRadiusPx();
        const dist = Math.sqrt(this.ballLocalX ** 2 + this.ballLocalY ** 2);
        if (dist > maxDist && dist > 0) {
            // Allow 20% elastic overshoot then pull back
            const elastic = maxDist + (dist - maxDist) * 0.2;
            const scale = elastic / dist;
            this.ballLocalX *= scale;
            this.ballLocalY *= scale;
        }
        const forceMult = 1 + Math.max(0, (force - 0.15)) * 1.2;

        // ── DYNAMIC GAIN CURVE ─────────────────────────────────
        // (precisionZone, vroomZone, dynamicGain already computed above for ball tracking)
        // precision mode: ~0.6x, vroom mode: full VROOM_BASE_MULT
        const precisionMult = 0.65;
        const vroomMult = this.holdNavigateMode
            ? SentenceMonkeyScroller.VROOM_HOLD_MULT
            : SentenceMonkeyScroller.VROOM_BASE_MULT;
        const effectiveMult = precisionMult + dynamicGain * (vroomMult - precisionMult);

        // ── CIRCULAR MOTION DETECTION ───────────────────────────
        // Detect circular gestures → turbo scroll mode
        const dragAngle = Math.atan2(dy, dx);
        if (this.lastDragAngle !== null) {
            let angleDelta = dragAngle - this.lastDragAngle;
            // Normalize to [-PI, PI]
            if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
            if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
            this.circularAccum = this.circularAccum * 0.92 + angleDelta;
            // Cap to prevent extreme turbo multiplier
            this.circularAccum = Math.max(-6, Math.min(6, this.circularAccum));
        }
        this.lastDragAngle = dragAngle;
        // Circular boost: full circles accumulate → mild turbo multiplier
        const circularBoost = 1 + Math.min(Math.abs(this.circularAccum) / 4, 0.8);

        // ── ANGLE-DEPENDENT BEHAVIOR ───────────────────────────
        // vertical = navigate, horizontal = steer, diagonal = combined
        const safeRadius = Math.max(1, maxDist);
        const ny = this.ballLocalY / safeRadius;
        const rotational = ((this.ballLocalX * dy) - (this.ballLocalY * dx)) / safeRadius;

        // Angle between drag vector and vertical axis
        const absX = Math.abs(dx), absY = Math.abs(dy);
        const verticalness = absY / (absX + absY + 0.001); // 1 = pure vertical
        // More vertical = more translation gain, more horizontal = more rotation
        const adaptiveTranslation = this.getSteerTranslationGain() * (0.5 + verticalness * 0.8);
        const adaptiveRotation = this.getSteerRotationGain() * (0.3 + (1 - verticalness) * 1.2);

        const steerIntent =
            (dy * adaptiveTranslation) +
            (rotational * adaptiveRotation) +
            (ny * this.getSteerTiltGain());

        // Momentum accumulation: capped tightly to prevent runaway spaz
        this.vroomMomentum =
            this.vroomMomentum * SentenceMonkeyScroller.VROOM_DECAY +
            speed * SentenceMonkeyScroller.VROOM_GAIN;
        // Much tighter caps — precision zone barely builds momentum at all
        const momentumCap = speed < SentenceMonkeyScroller.PRECISION_SPEED_CEIL ? 4 : 30;
        this.vroomMomentum = Math.min(this.vroomMomentum, momentumCap);
        const momentumScale = 1 + Math.min(this.vroomMomentum / 150, 0.4);
        // PRECISION FIX: Neutralize circular boost in precision zone.
        // Slow careful movement ≠ circular gesture. Only apply boost at VROOM speeds.
        const effectiveCircularBoost = speed < SentenceMonkeyScroller.PRECISION_SPEED_CEIL ? 1.0 : circularBoost;

        const navDelta = steerIntent * forceMult * this.getVerticalScrollGain() * effectiveMult * momentumScale * effectiveCircularBoost
            // Intent suppression: when user clearly intends to select, dampen vertical VROOM
            // so they don't accidentally scroll away while trying to reach extend threshold.
            * (this.dragIntent === 'select' ? 0.12 : 1.0);

        // ── AUTO-GLIDE: NieR seamless mode transition ──────────
        // Sustained fast vertical drag auto-enters hold-navigate (glide) mode.
        // Replaces the old short-hold timer — mode is physics-determined, not timer-based.
        // Accumulate when speed > threshold and mostly vertical, decay otherwise.
        if (!this.holdNavigateMode && this.chunkMode !== 'focused') {
            const vertComponent = Math.abs(dy) / (Math.abs(dx) + Math.abs(dy) + 0.001);
            if (speed > 12 && vertComponent > 0.55 && this.vroomMomentum > 18) {
                this.autoGlideAccum += speed * 0.06;
                // Threshold: requires substantial sustained fast drag (~25+ frames of fast motion)
                if (this.autoGlideAccum > 65) {
                    this.holdNavigateMode = true;
                    this.haptics.fire('select');
                    this.showModeFlash('航行');
                    this.updateCounter();
                    this.autoGlideAccum = 0;
                    if (this.ballEl) this.ballEl.style.removeProperty('--ms3-glide-buildup');
                }
            } else {
                this.autoGlideAccum *= 0.85; // decay when slowing or going horizontal
            }
            // Auto-glide build-up visual: ball glows cyan proportionally as threshold approaches
            if (this.ballEl && this.autoGlideAccum > 5) {
                this.ballEl.style.setProperty('--ms3-glide-buildup', String(Math.min(1, this.autoGlideAccum / 65)));
            } else if (this.ballEl) {
                this.ballEl.style.removeProperty('--ms3-glide-buildup');
            }
        }

        if (this.holdNavigateMode) {
            // ── HOLD-GLIDE: pure free-scroll, no unit stepping ──
            // Scroll the editor at 2x speed for rapid repositioning
            this.scrollEditorDirect(navDelta * 2.0);
            // Ball turns blue/cyan during glide (visual feedback)
            if (this.ballEl) this.ballEl.classList.add('ms3-ball--glide');
            this.updateBallJuice(dx, dy, speed);
            return;
        } else {
            if (this.ballEl) this.ballEl.classList.remove('ms3-ball--glide');
        }

        this.physics.dragMove('y', navDelta);

        // ── VIEWPORT FOLLOWS SELECTION (no independent scroll-ahead) ──
        // Instead of scrollEditorDirect racing ahead, we let unit stepping
        // drive the viewport. Only apply a small scroll nudge to keep the
        // current unit visible — the actual jump happens in moveCursorLive.
        this.dragNavAccumulatorY += navDelta;
        this.holdScrollVelocity = 0; // killed: was causing desync

        // ── ADAPTIVE STEP: slow = tight (precision), fast = wide (vroom) ─
        // Min speed guard: below threshold, don't step at all (prevents accidental slips)
        const speedNorm = Math.min(speed / 30, 1);
        let stepThreshold = SentenceMonkeyScroller.VROOM_STEP_LO +
            speedNorm * (SentenceMonkeyScroller.VROOM_STEP_HI - SentenceMonkeyScroller.VROOM_STEP_LO);

        // ── Thumper Boundary Brace: structural resistance at scope boundaries ──
        // When active, step threshold increases by 40%, creating a "wall" sensation.
        if (this.vroomBraceSteps > 0) {
            stepThreshold *= this.vroomBraceMultiplier;
        }

        // ── NecroDancer Streak Momentum: sustained navigation lowers friction ──
        // 5+ consecutive steps without pausing → up to 15% threshold reduction.
        const now3 = performance.now();
        if (this.vroomStreakCount >= 5) {
            const streakBonus = Math.min(0.15, (this.vroomStreakCount - 5) * 0.025);
            stepThreshold *= (1 - streakBonus);
        }

        // Precision damping: slow drags get dampened accumulation for 1:1 line feel
        const precisionT = Math.max(0, Math.min(1, (speed - SentenceMonkeyScroller.VROOM_MIN_SPEED) /
            (SentenceMonkeyScroller.PRECISION_SPEED_CEIL - SentenceMonkeyScroller.VROOM_MIN_SPEED)));
        const precisionDamp = SentenceMonkeyScroller.PRECISION_DAMPING + precisionT * (1 - SentenceMonkeyScroller.PRECISION_DAMPING);

        let steppedCount = 0;
        const MAX_STEPS_PER_FRAME = 2; // Prevent burst-stepping that feels like skipping
        const prevIndexBeforeStep = this.currentIndex;
        if (speed < SentenceMonkeyScroller.VROOM_MIN_SPEED) {
            // Too slow — don't step. Aggressively decay residual so it doesn't cause
            // a phantom step when the user resumes. (0.5 = drains in ~4 frames)
            this.dragNavAccumulatorY *= 0.5;
        } else while (Math.abs(this.dragNavAccumulatorY * precisionDamp) >= stepThreshold && steppedCount < MAX_STEPS_PER_FRAME) {
            const stepDir = this.dragNavAccumulatorY > 0 ? 1 : -1;
            const nextIndex = Math.max(0, Math.min(this.units.length - 1, this.currentIndex + stepDir));
            if (nextIndex === this.currentIndex) {
                this.dragNavAccumulatorY = 0;
                break;
            }
            this.currentIndex = nextIndex;
            this.physics.setPosition('y', this.currentIndex * UNIT_STEP);
            this.dragNavAccumulatorY -= stepDir * stepThreshold;
            steppedCount += 1;
        }
        // PRECISION FIX: After stepping, bleed off excess residual to prevent
        // accumulated overshoot from triggering a bonus step on the next frame.
        // Keeps 25% — enough for momentum continuity, not enough to ghost-step.
        if (steppedCount > 0 && speed < SentenceMonkeyScroller.PRECISION_SPEED_CEIL) {
            this.dragNavAccumulatorY *= 0.25;
        }

        if (steppedCount > 0) {
            // ── NecroDancer Streak: track consecutive steps ──
            if (now3 - this.vroomLastStepAt < 600) {
                this.vroomStreakCount += steppedCount;
            } else {
                this.vroomStreakCount = steppedCount; // reset streak on pause
            }
            this.vroomLastStepAt = now3;
            // Streak badge: show after 5+ unbroken steps
            this.updateStreakBadge();

            // ── Thumper Boundary Brace: decay brace steps after stepping ──
            if (this.vroomBraceSteps > 0) {
                this.vroomBraceSteps = Math.max(0, this.vroomBraceSteps - steppedCount);
                if (this.vroomBraceSteps === 0) this.vroomBraceMultiplier = 1.0;
            }

            // JP rhythm game: subtle pop on each step (controlled, not spazy)
            this.ballPopScale = 1.15;
            this.ballPopDecay = 0;
            const now = performance.now();
            const minGap = steppedCount > 2 ? 22 : 30;
            if (now - this.lastStepHapticAt >= minGap) {
                this.lastStepHapticAt = now;
                // ── Wave-texture haptics: kanji-dense text = heavier haptic feel ──
                // Dense kanji sections feel like riding over gravel; hiragana like smooth water.
                const density = this.computeKanjiDensity(this.units[this.currentIndex]?.text ?? '');
                const stepHaptic = steppedCount > 2
                    ? (density > 0.55 ? 'impact' : 'roll')
                    : (density > 0.65 ? 'snap' : density > 0.35 ? 'tick' : 'light');
                this.haptics.fire(stepHaptic);
            }
            // Chunk boundary detection during VROOM
            if (this.chunkMode === 'off') {
                this.checkChunkBoundaryCrossing(prevIndexBeforeStep, this.currentIndex);
            }
            // Update spotlight when navigating inside a focused chunk
            if (this.chunkMode === 'focused') {
                this.chunkFocusedIndex = this.currentIndex;
                this.updateChunkSpotlight();
            }
            // Update active chunk marker during overview navigation
            if (this.chunkMode === 'overview') {
                this.currentChunkIdx = this.currentIndex;
                this.updateChunkBoundaryActive();
            }
        }

        // Horizontal steering across nearby collocations.
        const steerUnit = Math.max(10, 18 / this.getLateralSteerStrength());
        this.lateralOffset = this.holdNavigateMode
            ? 0
            : Math.max(-2, Math.min(2, Math.round(this.ballLocalX / steerUnit)));

        // ── HORIZONTAL SCOPE SWIPE — right = expand, left = narrow ──
        // Diagonal-friendly: gradual blending instead of hard axis lock (VOEZ flow)
        // horizontalness is inverse of verticalness — contributes proportionally
        const horizontalness = 1 - verticalness;
        const scopeSwipeWeight = horizontalness > 0.5 ? 1.0 : horizontalness > 0.3 ? (horizontalness - 0.3) / 0.2 : 0;
        if (scopeSwipeWeight > 0 && !this.holdNavigateMode && speed > 3) {
            this.scopeSwipeAccum += dx * scopeSwipeWeight;
            // Soft lateral suppression proportional to swipe weight (not hard zero)
            if (scopeSwipeWeight > 0.7) this.lateralOffset = 0;
            // Decay circular boost during scope swipe to prevent scroll confusion
            this.circularAccum *= 0.5;
            const dprScale = window.devicePixelRatio > 2 ? 1.4 : 1;
            // Speed-responsive threshold: faster swipes trigger sooner
            const speedFactor = Math.max(0.72, 1.0 - (speed - 12) * 0.025);
            const scopeThreshold = 28 * dprScale * speedFactor;
            if (this.scopeSwipeAccum > scopeThreshold) {
                // ── CHUNK GATEWAY: right swipe past max scope → chunk mode ──
                if (this.scopeLevel >= SCOPE_COUNT - 1 || this.chunkMode === 'overview') {
                    if (this.handleChunkScopeTransition(1)) {
                        this.scopeSwipeAccum = 0;
                        this.scopeChangedDuringDrag = true;
                        return; // chunk mode entered, skip rest of drag
                    }
                }
                if (this.scopeLevel < SCOPE_COUNT - 1 && this.chunkMode === 'off') {
                    this.setScopeLevel(this.scopeLevel + 1, 1);
                }
                this.scopeSwipeAccum = 0;
                this.scopeChangedDuringDrag = true;
            } else if (this.scopeSwipeAccum < -scopeThreshold) {
                // ── CHUNK GATEWAY: left swipe in chunk mode → focus/exit ──
                if (this.chunkMode !== 'off') {
                    if (this.handleChunkScopeTransition(-1)) {
                        this.scopeSwipeAccum = 0;
                        this.scopeChangedDuringDrag = true;
                        return;
                    }
                }
                if (this.scopeLevel > 0 && this.chunkMode === 'off') {
                    this.setScopeLevel(this.scopeLevel - 1, -1);
                }
                this.scopeSwipeAccum = 0;
                this.scopeChangedDuringDrag = true;
            }
        } else {
            // Gentle decay when not scope-swiping (was 0.7 — too aggressive)
            this.scopeSwipeAccum *= 0.85;
        }

        // ── LIVE SELECTION + CURSOR (visible during drag) ─────
        // Track last drag direction for drum scan direction detection
        if (Math.abs(dy) > 2) this.lastDragDirectionY = dy > 0 ? 1 : -1;
        const hovered = this.getDisplayIndex();
        if (hovered !== this.lastDisplayIndex) {
            this.lastDisplayIndex = hovered;
            this.moveCursorLive(hovered);
            this.updateCounter();
            this.showHighlightOverlay(hovered);
        } else if (this.highlightOverlayEl?.style.display === 'block') {
            // Tighter overlay repositioning during scroll (16ms = ~60fps)
            // Fixes highlight overlay offset during horizontal scroll / momentum
            const now2 = performance.now();
            if (now2 - this.lastOverlayAt > 16) {
                this.lastOverlayAt = now2;
                this.showHighlightOverlay(this.lastDisplayIndex);
            }
        }
        this.updateZoomLane();
        this.updateBallJuice(dx, dy, speed);

        // Momentum haptic pulse for vroom feel
        const now = performance.now();
        if (speed > 10 && now - this.lastDragPulseAt > 60) {
            this.lastDragPulseAt = now;
            this.haptics.fireScaled(Math.min(0.6, this.vroomMomentum / 250));
        }
    }

    private onRelease(vx: number, vy: number, totalX: number, totalY: number, durationMs: number): void {
        if (this.isActionPanelOpen) return;
        this.isDragging = false;
        this.plugin.isScrollerCapturing = false;
        this.cachedDragView = null;

        // ── EXTEND MODE: release finishes extension ──
        if (this.extendMode === 'extending') {
            if (this.isDraggingSafetyId !== null) {
                clearTimeout(this.isDraggingSafetyId);
                this.isDraggingSafetyId = null;
            }
            // Release ALWAYS keeps the selection and exits extend mode.
            // Selection is yours — you worked for it. No revert, ever.
            this.stopExtendSelection();
            this.haptics.fire('snap');
            // Re-enable highlight overlay transition after extend drag
            if (this.highlightOverlayEl) {
                this.highlightOverlayEl.style.transition = '';
            }
            // Give ball a minimum directional launch so it coasts rather than snapping abruptly
            const extDir = this.extendHeadOffset >= this.extendAnchorOffset ? 1 : -1;
            if (Math.abs(this.ballDragDx) < 3) this.ballDragDx = extDir * 4;
            this.springBallToCenter();
            return;
        }
        // ── MAKER MODE: release = unified directional slide interpretation ──
        // Everything in maker mode is a directional gesture — same organic feel as horizontal selector.
        // │  Horizontal drag (any dist)  = brush selection character-by-character (onDrag path)
        // │  Short push any dir (6-40px) = STAMP — physically push toward text to mark it
        // │  Long decisive flick (>40px)  = 8-direction Okami action (bold/hi/cloze/undo/etc)
        // Zero-movement presses are ignored: every action requires body/direction.
        if (this.makerMode) {
            this.isDragging = false;
            if (this.isDraggingSafetyId !== null) {
                clearTimeout(this.isDraggingSafetyId);
                this.isDraggingSafetyId = null;
            }
            const totalDist = Math.sqrt(totalX * totalX + totalY * totalY);
            const speed = Math.sqrt(vx * vx + vy * vy);
            // Short directional push (any angle) = STAMP
            // Range: must have moved (intentional) but not a full flick (directionless intent)
            if (totalDist >= 6 && totalDist < 40 && durationMs < 500) {
                this.makerStamp();
                // Directional ball spring — ball launches the same direction as the push then returns
                this.springBallToCenter();
                return;
            }
            // Decisive long flick = directional action (8-direction compass)
            // Lower speed threshold slightly so it doesn’t require a fast snap
            if (totalDist >= 40 && speed > 120 && durationMs > 40 && durationMs < 800) {
                this.executeMakerGesture(totalX, totalY);
            }
            this.springBallToCenter();
            return;
        }
        if (this.isDraggingSafetyId !== null) {
            clearTimeout(this.isDraggingSafetyId);
            this.isDraggingSafetyId = null;
        }
        // Re-enable highlight overlay transition after drag
        if (this.highlightOverlayEl) {
            this.highlightOverlayEl.style.transition = '';
        }
        this.dragNavAccumulatorY = 0;
        this.holdScrollVelocity = 0;
        // S-1 FIX: Capture display index BEFORE zeroing lateralOffset so flick
        // actions operate on the unit the user was looking at, not the base index.
        const displayIdxAtRelease = this.getDisplayIndex();
        this.lateralOffset = 0;

        if (this.holdNavigateMode) {
            if (this.ballEl) this.ballEl.classList.remove('ms3-ball--glide');
            this.syncIndexFromCursor();
            this.selectCurrentUnit();
            this.springBallToCenter();
            this.haptics.fire('light');
            this.updateZoomLane();
            this.holdNavigateMode = false;
            this.vroomMomentum = 0;
            return;
        }

        // Quick flick = action. Hold = navigation only. Skip horizontal flicks if scope changed during this drag.
        const absTX = Math.abs(totalX);
        const absTY = Math.abs(totalY);
        const actions = this.plugin.settings.directionalActions;
        const isQuickFlick = durationMs <= QUICK_FLICK_MS;
        const isHorizontalFlick = absTX > SWIPE_THRESHOLD && absTX > absTY * 1.1;
        const canAction = isQuickFlick && !this.holdNavigateMode && !(isHorizontalFlick && this.scopeChangedDuringDrag);
        if (canAction && isHorizontalFlick) {
            // ── RIGHT FLICK → Extend Selection mode (fluid both-direction extend) ──
            // Only if swipeRight is 'select' (default) or 'none'. If user configured
            // something else (bold, copy, etc.), respect their setting.
            const rightAction = actions.swipeRight;
            if (totalX > 0 && this.units.length > 0 && this.extendMode === 'off'
                && this.chunkMode === 'off' // #5: block extend in chunk modes
                && (rightAction === 'select' || rightAction === 'none')) {
                this.stopEditorInertia();
                this.physics.stop();
                this.holdNavigateMode = false; // clear hold-glide before entering extend
                // S-1: Use captured display index (before lateralOffset was zeroed)
                this.currentIndex = displayIdxAtRelease;
                this.updateHighlight();
                // Start extend from the freshly-selected unit (no teleport race)
                this.startExtendSelection();
                this.haptics.fire('zoom');
                this.springBallToCenter();
                this.vroomMomentum = 0;
                return;
            }
            // ── RIGHT FLICK → configured action (if user set bold/highlight/etc.) ──
            if (totalX > 0 && rightAction !== 'none' && rightAction !== 'select') {
                this.stopEditorInertia();
                this.physics.stop();
                const actionIdx = displayIdxAtRelease;
                this.currentIndex = actionIdx;
                this.executeAction(rightAction, actionIdx);
                this.haptics.fire('snap');
                this.updateCounter();
                this.updateZoomLane();
                this.springBallToCenter();
                this.vroomMomentum = 0;
                return;
            }
            // ── LEFT FLICK → configured action (copy, etc.) ──
            // #7: In chunk focus, left-flick exits chunk instead of firing action
            if (totalX < 0 && this.chunkMode === 'focused') {
                this.exitChunkMode();
                this.springBallToCenter();
                this.vroomMomentum = 0;
                return;
            }
            const leftAction: SurfAction = actions.swipeLeft;
            // ── LEFT FLICK → Extend (omnidirectional SDVX knob) if not configured for something else ──
            if (totalX < 0 && this.units.length > 0 && this.extendMode === 'off'
                && this.chunkMode === 'off'
                && (leftAction === 'none' || leftAction === 'select')) {
                this.stopEditorInertia();
                this.physics.stop();
                this.holdNavigateMode = false;
                this.currentIndex = displayIdxAtRelease;
                this.updateHighlight();
                this.startExtendSelection();
                this.haptics.fire('zoom');
                this.springBallToCenter();
                this.vroomMomentum = 0;
                return;
            }
            if (totalX < 0 && leftAction !== 'none' && leftAction !== 'select' && this.chunkMode === 'off') {
                this.stopEditorInertia();
                this.physics.stop();
                const actionIdx = displayIdxAtRelease;
                this.currentIndex = actionIdx;
                this.executeAction(leftAction, actionIdx);
                this.haptics.fire('snap');
                this.updateCounter();
                this.updateZoomLane();
                this.springBallToCenter();
                this.vroomMomentum = 0;
                return;
            }
        }

        // ── VROOM INERTIA FLING ───────────────────────────────
        // Simplified carry: predictable fling distance (vy * 0.4)
        // User can learn "small flick = 3 sentences, big fling = 20" muscle memory
        // Lower carry factor + higher threshold = less accidental fling
        const inertiaVy = vy * SentenceMonkeyScroller.VROOM_INERTIA_CARRY;

        this.physics.stop();
        this.physics.setPosition('y', this.currentIndex * UNIT_STEP);
        if (Math.abs(inertiaVy) > 180) {
            this.startEditorInertia(inertiaVy);
        } else {
            // ── MA (間) PAUSE on gentle release too ──
            this.settledPauseUntil = performance.now() + 250;
            this.selectCurrentUnit();
            if (this.zoomCurrentEl) {
                this.zoomCurrentEl.classList.add('ms3-zoom-landed');
                setTimeout(() => this.zoomCurrentEl?.classList.remove('ms3-zoom-landed'), 400);
            }
            this.scheduleLandingHint();
        }

        this.startZoomBounce(Math.sign(vy) * Math.min(Math.abs(vy) / 400, 1));

        this.springBallToCenter();
        this.haptics.fire('light');
        this.updateZoomLane();
        this.holdNavigateMode = false;
        this.vroomMomentum = 0;
    }

    private onTap(x: number, y: number): void {
        // ═══ MOTION-ONLY DESIGN: tap is minimal — only contextual reactions ═══
        // All major mode entry and actions are via motion gestures (drag/flick/release).
        // Tap handles only: dismiss panels, mikiri snap, inertia catch, combo ring.

        // ── Maker Mode: no-op tap (all actions require directional slide) ──
        if (this.makerMode) {
            this.flashMakerGestureHint('');
            this.haptics.fire('light');
            return;
        }
        // ── Extend mode: single tap = 見切り MIKIRI SNAP, double-tap = 鏡面 ANCHOR PIVOT ──
        // Like Taiko mirror mode: rapid double-tap swaps which end you're extending from.
        if (this.extendMode === 'extending') {
            const tapNow = performance.now();
            if (tapNow - this.extendLastTapAt < 280) {
                // Double-tap → anchor pivot: swap anchor and head
                const oldAnchor = this.extendAnchorOffset;
                this.extendAnchorOffset = this.extendHeadOffset;
                this.extendAnchorF = this.extendHeadF;
                this.extendHeadOffset = oldAnchor;
                this.extendHeadF = oldAnchor;
                this.extendPlainCharSteps = 0;
                this.applyExtendSelection();
                this.updateBeamPosition();
                if (this.extendCachedContent) this.updateExtendZoomPreview(this.extendCachedContent);
                this.updateExtendBadge();
                // Distinctive haptic: two snaps in quick succession = "flip" feel
                this.haptics.fire('snap');
                setTimeout(() => this.haptics.fire('snap'), 50);
                // Ball flash to indicate direction change
                if (this.ballEl) {
                    this.ballEl.classList.add('ms3-ball--pivot');
                    setTimeout(() => this.ballEl?.classList.remove('ms3-ball--pivot'), 300);
                }
                this.extendLastTapAt = 0; // reset so triple-tap doesn't re-pivot
            } else {
                this.extendLastTapAt = tapNow;
                this.mikiriSnap();
            }
            return;
        }
        // ── Dismiss open panels ──
        if (this.isActionPanelOpen) {
            this.closeActionPanel();
            return;
        }
        if (this.isSearchOpen) {
            this.closeSearch();
            return;
        }

        // ── TAP-TO-SETTLE: during inertia, tap = instant stop + land ──
        if (this.inertiaIsCoasting) {
            this.stopEditorInertia();
            this.settledPauseUntil = performance.now() + 200;
            this.selectCurrentUnit();
            this.haptics.fire('impact');
            if (this.zoomCurrentEl) {
                this.zoomCurrentEl.classList.add('ms3-zoom-landed');
                setTimeout(() => this.zoomCurrentEl?.classList.remove('ms3-zoom-landed'), 400);
            }
            return;
        }

        // ── MA PAUSE GUARD ──
        if (performance.now() < this.settledPauseUntil) return;

        // ── Taiko Drumroll Scan: tap to stop if active; detect triple-tap to start ──
        // 太鼓の達人: rapid BAN BAN scanning through units one by one.
        if (this.isDrumScan) {
            this.stopDrumScan();
            return;
        }
        const tapNow = performance.now();
        this.drumScanTapHistory.push(tapNow);
        // Keep only taps within the last 400ms
        this.drumScanTapHistory = this.drumScanTapHistory.filter(t => tapNow - t < 400);
        if (this.drumScanTapHistory.length >= 3 && this.units.length > 1 && this.comboState === 'idle') {
            this.drumScanTapHistory = [];
            this.isDrumScan = true;
            this.drumScanLastAt = tapNow;
            this.drumScanStepCount = 0;
            // M-3: Use last drag direction — drag down then triple-tap = scan backward
            this.drumScanDirection = this.lastDragDirectionY;
            this.activateAnim('drumScan');
            if (this.ballEl) this.ballEl.classList.add('ms3-ball--drum-scan');
            if (this.ballEl && this.drumScanDirection < 0) this.ballEl.classList.add('ms3-ball--drum-scan-reverse');
            this.haptics.fire('impact');
            return; // don't open combo ring on the trigger tap
        }

        // ── TAP → Combo Ring (simplified: any tap opens combo for the current unit) ──
        // Replaces zone-based taps, double-tap action panel, and edge-tap combo ring.
        // The combo ring IS the action surface — no separate action panel needed.
        if (this.units.length > 0 && this.comboState === 'idle') {
            const padRect = this.padEl?.getBoundingClientRect();
            const padBounds = padRect ?? { left: 0, top: 0, width: 100, height: 100 };
            this.comboCenterX = padBounds.left + padBounds.width / 2;
            this.comboCenterY = Math.max(padBounds.top - 80, window.innerHeight * 0.4);
            this.comboCenterSet = true;
            const segs = this.chunkMode === 'focused' ? this.getChunkBitSegments() : this.getPrimarySegments();
            this.openComboRing(this.currentIndex, segs);
            this.haptics.fire('snap');
            return;
        }

        this.selectCurrentUnit();
    }

    // ═══ Physics Callbacks ════════════════════════════════════

    private onPhysicsUpdate(snap: PhysicsSnapshot): void {
        if (this.isDragging) return;
        this.updateBallFromPhysics(snap);
        const idx = this.physics.getNearestSnapIndex('y');
        if (idx >= 0 && idx < this.units.length && idx !== this.currentIndex) {
            this.currentIndex = idx;
            this.updateCounter();
            this.lastDisplayIndex = this.getDisplayIndex();
            this.moveCursorLive(this.getDisplayIndex());
            this.showHighlightOverlay(this.lastDisplayIndex);
            this.updateZoomLane();
        } else if (this.highlightOverlayEl?.style.display === 'block') {
            // Throttle overlay tracking during inertia coast (16ms = ~60fps)
            const now = performance.now();
            if (now - this.lastOverlayAt > 16) {
                this.lastOverlayAt = now;
                this.showHighlightOverlay(this.lastDisplayIndex);
            }
        }
    }

    private onPhysicsSnap(_axis: 'x' | 'y', index: number): void {
        if (this.isDragging) return;
        this.currentIndex = Math.max(0, Math.min(this.units.length - 1, index + this.lateralOffset));
        this.lateralOffset = 0;
        // Select the unit when movement settles.
        this.updateHighlight();
        this.updateCounter();
        this.lastDisplayIndex = this.getDisplayIndex();
        this.updateZoomLane();
        this.pulseRing();
    }

    private onBoundaryCross(_axis: 'x' | 'y', _prev: number, _next: number): void {
        this.haptics.fire('tick');
    }

    // ═══ Ball Visuals — JP RHYTHM GAME ══════════════════════

    /**
     * Juice-driven ball update during drag.
     * Squash/stretch along velocity axis, rotation from speed,
     * pop-scale on unit step (approach circle hit effect).
     */
    private updateBallJuice(dx: number, dy: number, speed: number): void {
        if (!this.ballEl || !this.ballGlowEl) return;

        // Rolling rotation accumulates with speed (constrained to prevent precision loss)
        this.ballRot = ((this.ballRot + dx * 1.2) % 720 + 720) % 720;

        // Squash-stretch along movement direction (minimal — was spazy)
        const targetStretch = 1 + Math.min(speed / 50, 0.15);
        this.ballStretch = this.ballStretch * 0.8 + targetStretch * 0.2;
        const stretch = this.ballStretch;
        const squash = 1 / Math.sqrt(stretch);

        // Pop-scale decays (approach circle hit effect) — faster decay
        this.ballPopDecay += 0.25;
        const popScale = 1 + (this.ballPopScale - 1) * Math.max(0, Math.exp(-this.ballPopDecay * 3.0));

        // Direction-aligned stretch: rotate squash/stretch toward velocity angle
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // Single transform write per frame (GPU composited)
        this.ballEl.style.transform =
            `translate3d(${this.ballLocalX}px, ${this.ballLocalY}px, 0) ` +
            `rotate(${angle}deg) scale(${stretch * popScale}, ${squash * popScale}) ` +
            `rotate(${-angle + this.ballRot}deg)`;

        // Glow expands with momentum + pop
        const glowScale = (1 + Math.min(this.vroomMomentum / 80, 1.5)) * popScale;
        this.ballGlowEl.style.transform = `translate3d(${this.ballLocalX}px, ${this.ballLocalY}px, 0) scale(${glowScale})`;
        this.ballGlowEl.style.opacity = String(0.15 + Math.min(speed / 40, 0.45));

        // Trail with speed-reactive sizing
        this.trailHistory.unshift({ x: this.ballLocalX, y: this.ballLocalY, speed: Math.min(speed / 20, 1) });
        if (this.trailHistory.length > TRAIL_LENGTH + 2) this.trailHistory.pop();

        for (let i = 0; i < this.trailEls.length; i++) {
            const histIdx = i + 1;
            if (histIdx < this.trailHistory.length) {
                const e = this.trailHistory[histIdx];
                const s = Math.max(0.15, (0.9 - i * 0.18) * (0.4 + e.speed * 0.9));
                this.trailEls[i].style.transform = `translate3d(${e.x}px, ${e.y}px, 0) scale(${s})`;
                this.trailEls[i].style.opacity = String(Math.max(0, (0.5 - i * 0.1) * (0.3 + e.speed)));
            }
        }

        // Ring reacts to momentum (approach circle expanding)
        if (this.ringEl) {
            const ringPulse = 1 + Math.min(this.vroomMomentum / 120, 0.2) + (popScale - 1) * 0.3;
            this.ringEl.style.transform = `scale(${ringPulse})`;
            this.ringEl.style.opacity = String(0.3 + Math.min(speed / 30, 0.4));
        }
    }

    private updateBallFromLocal(): void {
        if (!this.ballEl || !this.ballGlowEl) return;

        this.ballEl.style.transform = `translate3d(${this.ballLocalX}px, ${this.ballLocalY}px, 0)`;
        this.ballGlowEl.style.transform = `translate3d(${this.ballLocalX}px, ${this.ballLocalY}px, 0)`;
        this.ballGlowEl.style.opacity = '0.25';

        this.trailHistory.unshift({ x: this.ballLocalX, y: this.ballLocalY, speed: 0.3 });
        if (this.trailHistory.length > TRAIL_LENGTH + 2) this.trailHistory.pop();

        for (let i = 0; i < this.trailEls.length; i++) {
            const histIdx = i + 1;
            if (histIdx < this.trailHistory.length) {
                const e = this.trailHistory[histIdx];
                const s = Math.max(0.2, 0.8 - i * 0.15);
                this.trailEls[i].style.transform = `translate3d(${e.x}px, ${e.y}px, 0) scale(${s})`;
                this.trailEls[i].style.opacity = String(Math.max(0, 0.3 - i * 0.07));
            }
        }
    }

    private updateBallFromPhysics(snap: PhysicsSnapshot): void {
        if (!this.ballEl || !this.ballGlowEl) return;

        // Ball position: drift toward center naturally (smooth spring-like feel)
        // No position-sine warp — that was causing the "weird" feel
        const physX = this.ballLocalX * 0.92;
        const physY = this.ballLocalY * 0.92;
        this.ballLocalX = physX;
        this.ballLocalY = physY;

        const rot = snap.rotY;
        const speedNorm = snap.speedNorm;
        const stretch = 1 + Math.min(Math.abs(snap.vy) / 4000, 0.25);
        const squash = 1 / Math.sqrt(stretch);

        this.ballEl.style.transform =
            `translate3d(${physX}px, ${physY}px, 0) scale(${squash}, ${stretch}) rotate(${rot}deg)`;

        const glowScale = 1 + speedNorm * 2;
        this.ballGlowEl.style.transform = `translate3d(${physX}px, ${physY}px, 0) scale(${glowScale})`;
        this.ballGlowEl.style.opacity = String(0.1 + speedNorm * 0.4);

        this.trailHistory.unshift({ x: physX, y: physY, speed: speedNorm });
        if (this.trailHistory.length > TRAIL_LENGTH + 2) this.trailHistory.pop();

        for (let i = 0; i < this.trailEls.length; i++) {
            const histIdx = i + 1;
            if (histIdx < this.trailHistory.length) {
                const e = this.trailHistory[histIdx];
                const s = Math.max(0.2, 1 - i * 0.2) * (0.3 + e.speed * 1.2);
                this.trailEls[i].style.transform = `translate3d(${e.x}px, ${e.y}px, 0) scale(${s})`;
                this.trailEls[i].style.opacity = String(Math.max(0, (1 - i / TRAIL_LENGTH) * Math.max(0.1, e.speed * 1.5)));
            }
        }
    }

    /**
     * Launch ball with velocity from drag, then free-roam with gravity + wall bounce.
     * Eventually settles to center via friction.
     */
    private springBallToCenter(): void {
        this.cancelBallFreeAnim();

        // Launch — enough kinetic energy for the ball to feel alive (Monkey Ball)
        this.ballVelX = this.ballDragDx * 6;
        this.ballVelY = this.ballDragDy * 6;
        this.ballDragDx = 0;
        this.ballDragDy = 0;

        // If ball already near center and no velocity, skip
        const startDist = Math.sqrt(this.ballLocalX ** 2 + this.ballLocalY ** 2);
        const startSpeed = Math.sqrt(this.ballVelX ** 2 + this.ballVelY ** 2);
        if (startDist < 3 && startSpeed < 30) {
            this.ballLocalX = 0;
            this.ballLocalY = 0;
            this.updateBallFromLocal();
            return;
        }

        this.ballLastFreeTime = performance.now();
        this.activateAnim('ballFree');
    }

    /** Ball free-roam tick — spring-dampened return to center with wall bouncing */
    private tickBallFree(_now: number, dt: number): void {
        const maxR = this.getPadRadiusPx() - this.getBallRadiusPx();
        const FRICTION = 4;
        const BOUNCE = 0.3;
        const CENTER_PULL = 65;
        const CENTER_DAMP = 8;

        // Gentle center-seeking spring
        this.ballVelX += (-CENTER_PULL * this.ballLocalX - CENTER_DAMP * this.ballVelX) * dt;
        this.ballVelY += (-CENTER_PULL * this.ballLocalY - CENTER_DAMP * this.ballVelY) * dt;
        // Friction
        this.ballVelX *= Math.exp(-FRICTION * dt);
        this.ballVelY *= Math.exp(-FRICTION * dt);

        this.ballLocalX += this.ballVelX * dt;
        this.ballLocalY += this.ballVelY * dt;

        // Wall bounce
        const dist = Math.sqrt(this.ballLocalX ** 2 + this.ballLocalY ** 2);
        if (dist > maxR) {
            const nx = this.ballLocalX / dist;
            const ny = this.ballLocalY / dist;
            this.ballLocalX = nx * maxR * 0.98;
            this.ballLocalY = ny * maxR * 0.98;
            const dot = this.ballVelX * nx + this.ballVelY * ny;
            this.ballVelX -= 2 * dot * nx;
            this.ballVelY -= 2 * dot * ny;
            this.ballVelX *= BOUNCE;
            this.ballVelY *= BOUNCE;
            this.haptics.fire('light');
        }

        // Update ball visuals with rolling rotation
        this.ballRot = (this.ballRot + this.ballVelX * dt * 3) % 360;
        const speed = Math.sqrt(this.ballVelX ** 2 + this.ballVelY ** 2);
        const stretch = 1 + Math.min(speed / 300, 0.3);
        const squash = 1 / Math.sqrt(stretch);
        const angle = Math.atan2(this.ballVelY, this.ballVelX) * (180 / Math.PI);

        if (this.ballEl) {
            this.ballEl.style.transform =
                `translate3d(${this.ballLocalX}px, ${this.ballLocalY}px, 0) ` +
                `rotate(${angle}deg) scale(${stretch}, ${squash}) ` +
                `rotate(${-angle + this.ballRot}deg)`;
        }
        if (this.ballGlowEl) {
            const gs = 1 + Math.min(speed / 200, 0.8);
            this.ballGlowEl.style.transform = `translate3d(${this.ballLocalX}px, ${this.ballLocalY}px, 0) scale(${gs})`;
            this.ballGlowEl.style.opacity = String(0.15 + Math.min(speed / 300, 0.3));
        }

        // Trail
        this.trailHistory.unshift({ x: this.ballLocalX, y: this.ballLocalY, speed: Math.min(speed / 200, 1) });
        if (this.trailHistory.length > TRAIL_LENGTH + 2) this.trailHistory.pop();
        for (let i = 0; i < this.trailEls.length; i++) {
            const histIdx = i + 1;
            if (histIdx < this.trailHistory.length) {
                const e = this.trailHistory[histIdx];
                const s = Math.max(0.2, (0.8 - i * 0.15) * (0.4 + e.speed));
                this.trailEls[i].style.transform = `translate3d(${e.x}px, ${e.y}px, 0) scale(${s})`;
                this.trailEls[i].style.opacity = String(Math.max(0, (0.4 - i * 0.08) * (0.3 + e.speed)));
            }
        }

        // Settle check (NaN guard prevents infinite loop)
        const posDist = Math.sqrt(this.ballLocalX ** 2 + this.ballLocalY ** 2);
        if (isNaN(posDist) || isNaN(this.ballVelX) || isNaN(this.ballVelY) || (posDist < 1.5 && speed < 15)) {
            this.ballLocalX = 0;
            this.ballLocalY = 0;
            this.ballVelX = 0;
            this.ballVelY = 0;
            this.updateBallFromLocal();
            this.cancelBallFreeAnim();
            return;
        }
    }

    private cancelBallFreeAnim(): void {
        this.deactivateAnim('ballFree');
    }

    // ═══ Taiko Drumroll Scan — auto-advance tick ══════════════════════════════
    // 太鼓の達人 DRUMROLL: sustained rapid tapping scans through units.
    // Tick runs every 130ms inside the unified RAF loop while isDrumScan is active.
    private tickDrumScan(now: number): void {
        const STEP_INTERVAL = 130; // ms between unit advances
        const MAX_STEPS = 25;      // auto-stop after 25 units (prevents runaway)
        if (now - this.drumScanLastAt < STEP_INTERVAL) return;
        this.drumScanLastAt = now;
        this.drumScanStepCount++;
        // B-3 fix: respect scan direction (forward or backward based on last drag)
        const dir = this.drumScanDirection;
        const atEnd = dir > 0 ? this.currentIndex >= this.units.length - 1 : this.currentIndex <= 0;
        if (this.drumScanStepCount > MAX_STEPS || atEnd) {
            this.stopDrumScan();
            return;
        }
        const nextIdx = Math.max(0, Math.min(this.currentIndex + dir, this.units.length - 1));
        this.currentIndex = nextIdx;
        this.physics.setPosition('y', nextIdx * UNIT_STEP);
        this.updateHighlight();
        this.updateCounter();
        this.updateZoomLane();
        this.moveCursorLive(nextIdx);
        // Light haptic pulse on each step — the "BAN" of the drum
        this.haptics.fire('light');
    }

    private stopDrumScan(): void {
        if (!this.isDrumScan) return;
        this.isDrumScan = false;
        this.drumScanStepCount = 0;
        this.deactivateAnim('drumScan');
        if (this.ballEl) {
            this.ballEl.classList.remove('ms3-ball--drum-scan', 'ms3-ball--drum-scan-reverse');
        }
        this.selectCurrentUnit();
        this.haptics.fire('snap');
    }

    private pulseRing(): void {
        if (!this.ringEl) return;
        this.ringEl.style.transform = 'scale(1.15)';
        this.ringEl.style.opacity = '0.6';
        if (this.pulseRingTimeoutId !== null) clearTimeout(this.pulseRingTimeoutId);
        this.pulseRingTimeoutId = setTimeout(() => {
            this.pulseRingTimeoutId = null;
            if (this.ringEl) {
                this.ringEl.style.transform = 'scale(1)';
                this.ringEl.style.opacity = '0.3';
            }
        }, 150);
    }

    // ═══ Editor Integration — LIVE selection + cursor + overlay ═══

    private updateHighlight(): void {
        if (this.currentIndex < 0 || this.currentIndex >= this.units.length) return;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const unit = this.units[this.currentIndex];
        if (!unit) return;

        // Use CM dispatch for cursor-at-start (consistent with moveCursorLive)
        try {
            const cmView = this.getCmView(view.editor);
            if (cmView?.dispatch) {
                const docLen = cmView.state?.doc?.length ?? 0;
                const safeStart = Math.max(0, Math.min(docLen, unit.start));
                const safeEnd = Math.max(0, Math.min(docLen, unit.end));
                cmView.dispatch({
                    selection: { anchor: safeEnd, head: safeStart },
                    scrollIntoView: false
                });
            } else {
                // Issue #3: Fallback must also place cursor at start (endPos, startPos)
                const content = view.editor.getValue();
                const cs = Math.max(0, Math.min(content.length, unit.start));
                const ce = Math.max(0, Math.min(content.length, unit.end));
                const startPos = view.editor.offsetToPos(cs);
                const endPos = view.editor.offsetToPos(ce);
                view.editor.setSelection(endPos, startPos);
            }
        } catch (_) {
            try {
                const content = view.editor.getValue();
                const cs = Math.max(0, Math.min(content.length, unit.start));
                const ce = Math.max(0, Math.min(content.length, unit.end));
                const startPos = view.editor.offsetToPos(cs);
                const endPos = view.editor.offsetToPos(ce);
                view.editor.setSelection(endPos, startPos);
            } catch (_) {}
        }
        this.showHighlightOverlay(this.currentIndex);

        // Auto-scroll handled by teleportToCurrentUnit() for explicit selections.
        // During physics snap/inertia, do a non-aggressive scroll-if-needed.
        if (!this.isDragging && (performance.now() - this.lastManualScrollAt > 100)) {
            try {
                const content = view.editor.getValue();
                const cs = Math.max(0, Math.min(content.length, unit.start));
                const ce = Math.max(0, Math.min(content.length, unit.end));
                const from = view.editor.offsetToPos(cs);
                const to = view.editor.offsetToPos(ce);
                requestAnimationFrame(() => {
                    try {
                        // false = don't force center, only scroll if out of view
                        view.editor.scrollIntoView({ from, to }, false);
                    } catch (_) {}
                });
            } catch (_) {}
        }
    }

    /**
     * Live selection + cursor during drag.
     * Sets VISIBLE selection AND cursor position so the user sees both
     * the highlighted text and cursor caret while navigating.
     * Also drives a DOM overlay highlight for mobile visibility.
     */
    private moveCursorLive(index: number): void {
        if (index < 0 || index >= this.units.length) return;
        const now = performance.now();
        // 12ms inner guard (~83fps). CM dispatch is expensive; visual updates
        // (ball/zoom/overlay) run at full framerate independently.
        if (now - this.lastCursorLightAt < 12) return;
        this.lastCursorLightAt = now;

        const view = this.getView();
        if (!view) return;

        const unit = this.units[index];
        // Prefer CM dispatch (single transaction, cursor at selection start).
        // Fall back to Obsidian setSelection if CM unavailable.
        try {
            const editorAny = view.editor as any;
            const cmView = editorAny?.cm;
            if (cmView?.dispatch) {
                // Clamp to doc bounds — stale offsets from pre-edit units can crash CM dispatch
                const docLen = cmView.state?.doc?.length ?? 0;
                const safeStart = Math.max(0, Math.min(docLen, unit.start));
                const safeEnd = Math.max(0, Math.min(docLen, unit.end));
                cmView.dispatch({
                    selection: { anchor: safeEnd, head: safeStart },
                    scrollIntoView: false
                });
                // ── VIEWPORT FOLLOW: soft scroll if unit is near edge ──
                // Instead of scroll-ahead desync, we keep the current unit
                // within the middle 60% of the viewport. Only scrolls when
                // the unit is about to leave the visible area.
                const coords = cmView.coordsAtPos(safeStart, 1);
                if (coords) {
                    const vh = window.innerHeight;
                    const margin = vh * 0.2; // 20% top/bottom margin
                    if (coords.top < margin) {
                        cmView.scrollDOM.scrollTop += coords.top - margin;
                    } else if (coords.bottom > vh - margin) {
                        cmView.scrollDOM.scrollTop += coords.bottom - (vh - margin);
                    }
                }
                return;
            }
        } catch (_) {}
        // Fallback: Obsidian API — clamp offsets to content length
        try {
            const content = view.editor.getValue();
            const clampedStart = Math.max(0, Math.min(content.length, unit.start));
            const clampedEnd = Math.max(0, Math.min(content.length, unit.end));
            const startPos = view.editor.offsetToPos(clampedStart);
            const endPos = view.editor.offsetToPos(clampedEnd);
            view.editor.setSelection(startPos, endPos);
        } catch (_) {}
    }

    /**
     * DOM overlay highlight — guaranteed visible on iOS mobile.
     * CodeMirror selection can be invisible during rapid touch updates,
     * so we inject our own absolutely-positioned highlight box.
     */
    private showHighlightOverlay(index: number): void {
        if (index < 0 || index >= this.units.length) return;
        const view = this.getView();
        if (!view) { this.hideHighlightOverlay(); return; }
        const cmView = this.getCmView(view.editor);
        if (!cmView) { this.hideHighlightOverlay(); return; }

        let rangeStart: number;
        let rangeEnd: number;
        let isExtend = false;

        if (this.extendMode === 'extending') {
            rangeStart = Math.min(this.extendAnchorOffset, this.extendHeadOffset);
            rangeEnd = Math.max(this.extendAnchorOffset, this.extendHeadOffset);
            isExtend = true;
        } else {
            const unit = this.units[index];
            rangeStart = unit.start;
            rangeEnd = unit.end;
        }

        this.renderHighlightSegments(cmView, rangeStart, rangeEnd, isExtend);
    }

    /**
     * Render per-line highlight segments so the overlay literally shows the
     * selected text shape — not a bounding box covering blank space.
     * First line: anchored at the character's left edge.
     * Middle lines: full content width (like a browser text selection).
     * Last line: ends at the character's right edge.
     */
    private renderHighlightSegments(cmView: any, start: number, end: number, isExtend: boolean): void {
        if (start >= end) { this.hideHighlightOverlay(); return; }
        try {
            const doc = cmView.state?.doc;
            if (!doc) { this.hideHighlightOverlay(); return; }
            const vh = window.innerHeight;
            const vw = window.innerWidth;
            const contentEl = cmView.dom?.querySelector('.cm-content') as HTMLElement | null;
            const contentRect = contentEl?.getBoundingClientRect();
            const contentLeft = contentRect ? contentRect.left : 0;
            const contentRight = contentRect ? contentRect.right : vw * 0.9;

            const safeStart = Math.max(0, Math.min(start, doc.length));
            const safeEnd = Math.max(0, Math.min(end, doc.length));
            const startLineDoc = doc.lineAt(safeStart);
            const endLineDoc = doc.lineAt(safeEnd);

            let segIdx = 0;
            for (let lineNum = startLineDoc.number; lineNum <= endLineDoc.number; lineNum++) {
                const line = doc.line(lineNum);
                const segStart = lineNum === startLineDoc.number ? safeStart : line.from;
                const segEnd   = lineNum === endLineDoc.number   ? safeEnd   : line.to;
                if (segStart >= segEnd) continue;

                const sc = cmView.coordsAtPos(segStart, 1);
                const ec = cmView.coordsAtPos(segEnd, -1);
                if (!sc || !ec) continue;
                if (ec.bottom < 0 || sc.top > vh) continue;

                const t = Math.max(0, sc.top);
                const b = Math.min(vh, ec.bottom);
                const isFirst = lineNum === startLineDoc.number;
                const isLast  = lineNum === endLineDoc.number;
                const l = Math.max(0, isFirst ? sc.left : contentLeft);
                const r = Math.min(vw, isLast  ? (ec.right || ec.left + 8) : contentRight);
                if (b - t < 1 || r - l < 1) continue;

                // Pool cap: don't wrap segments (would clobber already-positioned segments).
                // Silently stop once we've used all 30 pool slots.
                if (segIdx >= 30) { this.hideExcessHighlightSegs(30); break; }

                const seg = this.getOrCreateHighlightSeg(segIdx);
                seg.className = isExtend
                    ? 'ms3-highlight-overlay ms3-highlight-overlay--extend'
                    : 'ms3-highlight-overlay';
                seg.style.top    = `${t}px`;
                seg.style.left   = `${l}px`;
                seg.style.width  = `${r - l}px`;
                seg.style.height = `${b - t}px`;
                seg.style.display = 'block';
                segIdx++;
            }
            this.hideExcessHighlightSegs(segIdx);
        } catch (_) {
            this.hideHighlightOverlay();
        }
    }

    private getOrCreateHighlightSeg(i: number): HTMLElement {
        // Pool is capped at 30 — renderHighlightSegments guards against i >= 30 at the call site.
        // Defensive clamp: return last slot rather than wrapping / hiding earlier segments.
        if (i >= 30) return this.highlightSegmentPool[29];
        if (i < this.highlightSegmentPool.length) return this.highlightSegmentPool[i];
        const el = document.createElement('div');
        el.className = 'ms3-highlight-overlay';
        el.style.display = 'none';
        document.body.appendChild(el);
        this.highlightSegmentPool.push(el);
        if (i === 0) this.highlightOverlayEl = el;
        return el;
    }

    private hideExcessHighlightSegs(fromIdx: number): void {
        for (let i = fromIdx; i < this.highlightSegmentPool.length; i++) {
            this.highlightSegmentPool[i].style.display = 'none';
        }
    }

    private hideHighlightOverlay(): void {
        for (const el of this.highlightSegmentPool) el.style.display = 'none';
        if (this.highlightOverlayEl) this.highlightOverlayEl.style.display = 'none';
    }

    // ═══ Gesture Cheat Sheet — ghost overlay showing available gestures (#18) ═══

    private showGestureCheatSheet(): void {
        this.hideGestureCheatSheet();
        if (!this.containerEl) return;
        // Cap at 8 shows — power users know the gestures and don't need the overlay every time
        if (this.cheatSheetSeenCount >= 8) return;
        this.cheatSheetSeenCount++;
        this.saveCheatSheetCount();

        const el = document.createElement('div');
        el.className = 'ms3-cheat-sheet';
        el.innerHTML = [
            '<div class="ms3-cheat-sheet-row">↕ <b>スクロール</b> — ドラッグ上下</div>',
            '<div class="ms3-cheat-sheet-row">↔ <b>スコープ</b> — スワイプ左右</div>',
            '<div class="ms3-cheat-sheet-row">▶ <b>選択</b> — 右タップ or 右フリック</div>',
            '<div class="ms3-cheat-sheet-row">⬆⬇ <b>微調整</b> — 上下タップ (±1)</div>',
            '<div class="ms3-cheat-sheet-row">◉ <b>アクション</b> — タップ</div>',
            '<div class="ms3-cheat-sheet-row">🤏 <b>ズーム</b> — ピンチ</div>',
            '<div class="ms3-cheat-sheet-row">📄 <b>区切り</b> — 右スワイプ×3 (文→区)</div>',
        ].join('');
        this.containerEl.appendChild(el);
        this.gestureCheatSheetEl = el;

        // Fix #7: 3.5 s gives enough time to actually read the hints
        this.cheatSheetTimeoutId = setTimeout(() => this.hideGestureCheatSheet(), 3500);
        // Issue #30: Store dismiss handler reference for explicit cleanup
        const dismiss = () => {
            this.hideGestureCheatSheet();
            this.cheatSheetDismissHandler = null;
        };
        this.cheatSheetDismissHandler = dismiss;
        document.addEventListener('touchstart', dismiss, { once: true, capture: true } as AddEventListenerOptions);
    }

    private hideGestureCheatSheet(): void {
        if (this.cheatSheetTimeoutId !== null) {
            clearTimeout(this.cheatSheetTimeoutId);
            this.cheatSheetTimeoutId = null;
        }
        // Issue #30: Remove dismiss handler if it hasn't fired yet
        if (this.cheatSheetDismissHandler) {
            document.removeEventListener('touchstart', this.cheatSheetDismissHandler, true);
            this.cheatSheetDismissHandler = null;
        }
        if (this.gestureCheatSheetEl) {
            this.gestureCheatSheetEl.remove();
            this.gestureCheatSheetEl = null;
        }
    }

    // ═══ Post-Landing Intent Hint (#15) — パチンコ Capture Moment ═══
    // After settling, if the user doesn't act for 1.2s, briefly pulse the
    // right directional hint (↔) and the ring — teaching extend and combo
    // like MH Rise's wirefall ghost-prompt. No new DOM, purely visual.

    private scheduleLandingHint(): void {
        this.cancelLandingHint();
        this.landingHintTimeoutId = setTimeout(() => {
            this.landingHintTimeoutId = null;
            if (!this.isVisible || this.isDragging || this.comboState !== 'idle'
                || this.extendMode !== 'off' || this.inertiaIsCoasting) return;

            // Pulse the right dir-hint to teach extend
            const rightHint = this.padEl?.querySelector('.ms3-dir-hint--right') as HTMLElement | null;
            if (rightHint) {
                rightHint.classList.add('ms3-dir-hint--pulse');
                setTimeout(() => rightHint.classList.remove('ms3-dir-hint--pulse'), 1800);
            }
            // Ring approach-circle ghost pulse
            if (this.ringEl) {
                this.ringEl.classList.add('ms3-ring--landing-hint');
                setTimeout(() => this.ringEl?.classList.remove('ms3-ring--landing-hint'), 1800);
            }
            // If the unit is extend-rich, also flash the ball purple briefly (#16)
            if (this.isUnitExtendRich()) {
                if (this.ballGlowEl) {
                    this.ballGlowEl.classList.add('ms3-ball-glow--extend-hint');
                    setTimeout(() => this.ballGlowEl?.classList.remove('ms3-ball-glow--extend-hint'), 1200);
                }
            }
        }, 1200);
    }

    private cancelLandingHint(): void {
        if (this.landingHintTimeoutId !== null) {
            clearTimeout(this.landingHintTimeoutId);
            this.landingHintTimeoutId = null;
        }
    }

    // ═══ Extend Richness Check (#16) — 刀鍛冶 Edge Awareness ═══
    // Like Sekiro's deflect sparks: a unit with many internal boundaries
    // is "rich" for extend. Purple glow whispers "you could extend here."
    private isUnitExtendRich(): boolean {
        if (this.currentIndex < 0 || this.currentIndex >= this.units.length) return false;
        const unit = this.units[this.currentIndex];
        if (!unit) return false;
        // Check if this unit at current scope contains 3+ sub-units at any finer scope
        for (let s = this.scopeLevel - 1; s >= 0; s--) {
            const startIdx = this.scopeEngine.findUnitAt(s, unit.start);
            const endIdx = this.scopeEngine.findUnitAt(s, unit.end > unit.start ? unit.end - 1 : unit.end);
            if (startIdx >= 0 && endIdx >= 0 && endIdx - startIdx >= 2) return true;
        }
        return false;
    }

    private syncIndexFromCursor(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || this.units.length === 0) return;
        const offset = view.editor.posToOffset(view.editor.getCursor());
        // Use binary search O(log n) instead of linear scan
        const idx = this.scopeEngine.findUnitAt(this.scopeLevel, offset);
        if (idx >= 0 && idx < this.units.length) {
            this.currentIndex = idx;
            this.physics.setPosition('y', idx * UNIT_STEP);
        }
    }

    private selectCurrentUnit(): void {
        this.currentIndex = this.getDisplayIndex();
        this.lateralOffset = 0;
        // Force scroll into view when selecting (cursor must be visible for editing)
        this.lastManualScrollAt = 0;
        // Skip updateHighlight's CM dispatch — teleport will handle scroll + visual
        this.showHighlightOverlay(this.currentIndex);
        this.haptics.fire('select');
        // Always teleport editor to show the selected unit (cursor never lost)
        this.teleportToCurrentUnit();
    }

    /** Aggressively scroll editor to show current unit + flash beacon + set selection */
    private teleportToCurrentUnit(): void {
        if (this.currentIndex < 0 || this.currentIndex >= this.units.length) return;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const unit = this.units[this.currentIndex];

        // Compute clamped offsets once
        let safeStart: number;
        let safeEnd: number;
        try {
            const cmView = this.getCmView(view.editor);
            if (cmView?.dispatch) {
                const docLen = cmView.state?.doc?.length ?? 0;
                safeStart = Math.max(0, Math.min(docLen, unit.start));
                safeEnd = Math.max(0, Math.min(docLen, unit.end));
                cmView.dispatch({
                    selection: { anchor: safeEnd, head: safeStart },
                    scrollIntoView: false
                });
            } else {
                const content = view.editor.getValue();
                safeStart = Math.max(0, Math.min(content.length, unit.start));
                safeEnd = Math.max(0, Math.min(content.length, unit.end));
                const startPos = view.editor.offsetToPos(safeStart);
                const endPos = view.editor.offsetToPos(safeEnd);
                view.editor.setSelection(endPos, startPos);
            }
        } catch (_) {
            try {
                const content = view.editor.getValue();
                safeStart = Math.max(0, Math.min(content.length, unit.start));
                safeEnd = Math.max(0, Math.min(content.length, unit.end));
                const startPos = view.editor.offsetToPos(safeStart);
                const endPos = view.editor.offsetToPos(safeEnd);
                view.editor.setSelection(endPos, startPos);
            } catch (_) { return; /* cannot set selection at all */ }
        }

        // Scroll into view in next frame
        try {
            const from = view.editor.offsetToPos(safeStart!);
            const to = view.editor.offsetToPos(safeEnd!);
            requestAnimationFrame(() => {
                try { view.editor.scrollIntoView({ from, to }, true); } catch (_) {}
            });
        } catch (_) {}

        // Flash beacon animation so user always sees where cursor landed
        if (this.highlightOverlayEl) {
            this.highlightOverlayEl.classList.remove('ms3-hl-teleport');
            void this.highlightOverlayEl.offsetWidth;
            this.highlightOverlayEl.classList.add('ms3-hl-teleport');
            this.highlightOverlayEl.addEventListener('animationend', () => {
                this.highlightOverlayEl?.classList.remove('ms3-hl-teleport');
            }, { once: true });
        }
    }

    // ═══ Actions — ALWAYS re-read fresh offsets ═══════════════

    private getFreshUnit(idx: number): { unit: SurfUnit; editor: Editor; view: MarkdownView } | null {
        if (idx < 0) return null;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return null;
        // Re-analyze only if document content changed (skip redundant O(n) parses).
        // Hash matches rebuildUnits: length + head64 + mid64 + tail64 so mid-document edits
        // (e.g. editing line 500 of 1000) are caught rather than silently cached stale.
        const content = view.editor.getValue();
        const hash = this.contentFingerprint(content);
        if (hash !== this.lastContentHash) {
            this.lastContentHash = hash;
            this.scopeEngine.analyze(content, this.plugin.settings.sentenceRegex);
            // Refresh chunks when content changes so chunk boundaries stay accurate
            this.chunks = this.scopeEngine.getChunks();
        }
        const freshUnits = this.scopeEngine.getUnits(this.scopeLevel);
        // Only sync this.units when NOT in chunk modes that maintain their own unit view
        // (chunkFocusedUnits or chunkOverview units). Overwriting would cause executeAction
        // to look up the wrong sentence when the user acts on a chunk-focused selection.
        if (this.chunkMode === 'off') {
            this.units = freshUnits;
        }
        if (idx >= freshUnits.length) return null;
        // In chunk-focused mode currentIndex is relative to chunkFocusedUnits, not freshUnits.
        // Return the unit from the ACTIVE unit list so callers get the right sentence.
        const activeUnits = this.chunkMode === 'off' ? freshUnits : this.units;
        if (idx >= activeUnits.length) return null;
        return { unit: activeUnits[idx], editor: view.editor, view };
    }

    private executeAction(action: SurfAction, targetIndex: number = this.currentIndex): void {
        if (action === 'none') return;
        const fresh = this.getFreshUnit(targetIndex);
        if (!fresh) return;

        const { unit, editor } = fresh;
        const startPos = editor.offsetToPos(unit.start);
        const endPos = editor.offsetToPos(unit.end);

        this.haptics.fire('impact');

        switch (action) {
            case 'select':
                editor.setSelection(startPos, endPos);
                break;

            case 'bold': {
                const text = editor.getRange(startPos, endPos);
                if (text.startsWith('**') && text.endsWith('**')) {
                    editor.replaceRange(text.slice(2, -2), startPos, endPos);
                } else {
                    editor.replaceRange(`**${text}**`, startPos, endPos);
                }
                this.rebuildAfterEdit();
                break;
            }

            case 'highlight': {
                const text = editor.getRange(startPos, endPos);
                if (text.startsWith('==') && text.endsWith('==')) {
                    editor.replaceRange(text.slice(2, -2), startPos, endPos);
                } else {
                    editor.replaceRange(`==${text}==`, startPos, endPos);
                }
                this.rebuildAfterEdit();
                break;
            }

            case 'spoiler': {
                const text = editor.getRange(startPos, endPos);
                if (text.startsWith('%%') && text.endsWith('%%')) {
                    editor.replaceRange(text.slice(2, -2), startPos, endPos);
                } else {
                    editor.replaceRange(`%%${text}%%`, startPos, endPos);
                }
                this.rebuildAfterEdit();
                break;
            }

            case 'cloze':
                editor.setSelection(startPos, endPos);
                (this.plugin.app as any).commands.executeCommandById('jp-sentence-surfer:surf-save-cloze');
                break;

            case 'copy': {
                const text = unit.text;
                try {
                    navigator.clipboard.writeText(text).then(() => new Notice('Copied')).catch(() => {
                        new Notice('Clipboard permission denied');
                    });
                } catch (_) {
                    new Notice('Clipboard not available');
                }
                break;
            }
        }

        this.closeActionPanel();
        this.triggerZoomActionAnim(action);
        this.triggerHighlightActionAnim(action);
        this.haptics.fire('success');
    }

    /** JP game animation on the EDITOR highlight overlay when an action fires */
    private triggerHighlightActionAnim(action: string): void {
        if (!this.highlightOverlayEl) return;
        const cls = `ms3-hl-action-${action}`;
        this.highlightOverlayEl.classList.remove(cls);
        requestAnimationFrame(() => {
            this.highlightOverlayEl?.classList.add(cls);
            this.highlightOverlayEl?.addEventListener('animationend', () => {
                this.highlightOverlayEl?.classList.remove(cls);
            }, { once: true });
        });
    }

    /** JP game animation on zoom lane text when an action fires */
    private triggerZoomActionAnim(action: string): void {
        if (!this.zoomCurrentEl) return;
        const cls = `ms3-zoom-action-${action}`;
        this.zoomCurrentEl.classList.remove(cls);
        requestAnimationFrame(() => {
            this.zoomCurrentEl?.classList.add(cls);
            this.zoomCurrentEl?.addEventListener('animationend', () => {
                this.zoomCurrentEl?.classList.remove(cls);
            }, { once: true });
        });
    }

    private rebuildAfterEdit(): void {
        // Invalidate content hash so getFreshUnit re-analyzes on next call
        this.lastContentHash = '';
        // Invalidate cached content in extend/maker so boundary detection stays fresh
        this.extendCachedContent = null;
        this.makerCachedContent = null;
        requestAnimationFrame(() => {
            // Preserve cursor offset, not just index, since edit changes text length
            const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            let savedOffset = 0;
            if (view) {
                try { savedOffset = view.editor.posToOffset(view.editor.getCursor()); } catch (_) {}
            }
            this.rebuildUnits();
            // Map offset to nearest unit at current scope level
            const newIdx = this.scopeEngine.findUnitAt(this.scopeLevel, savedOffset);
            if (newIdx >= 0 && newIdx < this.units.length) {
                this.currentIndex = newIdx;
                this.physics.snapToIndex('y', newIdx);
            }
        });
    }

    // ═══ Position Stack — 巻き戻し Rewind ═══════════════════════════════════

    /** Push current position onto the stack (call before jumps/search/teleport) */
    private pushPositionStack(): void {
        const entry = {
            index: this.currentIndex,
            scopeLevel: this.scopeLevel,
            chunkMode: this.chunkMode,
        };
        // Deduplicate: don't push if top of stack is the same position
        const top = this.positionStack[this.positionStack.length - 1];
        if (top && top.index === entry.index && top.scopeLevel === entry.scopeLevel) return;
        this.positionStack.push(entry);
        if (this.positionStack.length > SentenceMonkeyScroller.POSITION_STACK_MAX) {
            this.positionStack.shift();
        }
    }

    /** Pop and navigate to previous position */
    private popPositionStack(): void {
        const entry = this.positionStack.pop();
        if (!entry) return;
        // Restore scope if different
        if (entry.scopeLevel !== this.scopeLevel) {
            this.setScopeLevel(entry.scopeLevel, entry.scopeLevel > this.scopeLevel ? 1 : -1);
        }
        // Navigate to the stored index
        const safeIdx = Math.min(entry.index, this.units.length - 1);
        this.currentIndex = Math.max(0, safeIdx);
        this.physics.setPosition('y', this.currentIndex * UNIT_STEP);
        this.lateralOffset = 0;
        this.lastManualScrollAt = 0;
        this.updateHighlight();
        this.updateCounter();
        this.updateZoomLane();
        this.teleportToCurrentUnit();
        this.haptics.fire('snap');
    }

    // ═══ Action Panel ═════════════════════════════════════════

    private openActionPanel(): void {
        if (!this.actionPanelEl) return;
        this.isActionPanelOpen = true;
        this.actionPanelEl.classList.add('ms3-actions--open');
        const btns = this.actionPanelEl.querySelectorAll('.ms3-action-btn');
        btns.forEach((btn, i) => {
            (btn as HTMLElement).style.transitionDelay = `${i * 30}ms`;
            (btn as HTMLElement).classList.add('ms3-action-btn--visible');
        });
    }

    private closeActionPanel(): void {
        if (!this.actionPanelEl) return;
        this.isActionPanelOpen = false;
        this.actionPanelEl.classList.remove('ms3-actions--open');
        const btns = this.actionPanelEl.querySelectorAll('.ms3-action-btn');
        btns.forEach((btn) => {
            (btn as HTMLElement).classList.remove('ms3-action-btn--visible');
            (btn as HTMLElement).style.transitionDelay = '0ms';
        });
    }

    // ═══ Counter ══════════════════════════════════════════════

    private updateCounter(): void {
        const displayIndex = this.getDisplayIndex();
        if (this.counterEl) {
            if (this.makerMode) {
                const charCount = this.makerCurrentEnd - this.makerCurrentStart;
                const stampCount = this.makerSelections.length;
                this.counterEl.textContent = `筆 ${charCount}字${stampCount > 0 ? ` +${stampCount}` : ''}`;
            } else if (this.chunkMode === 'overview') {
                this.counterEl.textContent = `区 ${displayIndex + 1}/${this.units.length}`;
            } else if (this.chunkMode === 'focused') {
                this.counterEl.textContent = `集 ${displayIndex + 1}/${this.units.length}`;
            } else {
                const mode = this.holdNavigateMode ? ' 滑' : '';
                const scopeTag = SCOPE_LABELS[this.scopeLevel];
                this.counterEl.textContent = `${displayIndex + 1}/${this.units.length} ${scopeTag}${mode}`;
            }
        }
        if (this.previewEl) {
            if (this.makerMode && this.makerCurrentStart < this.makerCurrentEnd) {
                const view = this.getView();
                if (view) {
                    const selText = view.editor.getRange(
                        view.editor.offsetToPos(this.makerCurrentStart),
                        view.editor.offsetToPos(this.makerCurrentEnd)
                    );
                    const clean = this.toDisplayText(selText);
                    this.previewEl.textContent = ` ${clean.length > 32 ? clean.slice(0, 30) + '…' : clean}`;
                }
            } else if (displayIndex >= 0 && displayIndex < this.units.length) {
                // Fix #10: wider preview gives more reading context
                const text = this.toDisplayText(this.units[displayIndex].text);
                this.previewEl.textContent = ` ${text.length > 28 ? text.slice(0, 26) + '…' : text}`;
            }
        }
        // ── 北斗 Progress Compass (#17): ring hue shifts with document position ──
        const progress = this.units.length > 1 ? displayIndex / (this.units.length - 1) : 0;
        if (this.containerEl) {
            this.containerEl.style.setProperty('--ms3-doc-progress', String(progress));
        }
        // ── Spatial progress ribbon: scaleX tracks position visually ──
        if (this.progressRibbonEl) {
            this.progressRibbonEl.style.transform = `scaleX(${progress})`;
        }
        // ── Plugin API: emit unit-change event for inter-plugin hooks ──
        // Other plugins can listen: document.querySelector('.ms3')?.addEventListener('ms3-unit-change', ...)
        if (this.containerEl && this.units.length > 0) {
            const unit = this.units[displayIndex];
            if (unit) {
                this.containerEl.dispatchEvent(new CustomEvent('ms3-unit-change', {
                    detail: { unit, index: displayIndex, scopeLevel: this.scopeLevel },
                    bubbles: true, composed: true
                }));
            }
        }
    }

    private toDisplayText(input: string): string {
        const cached = this.displayTextCache.get(input);
        if (cached !== undefined) return cached;
        // Issue #16: Cap input length before regex processing (mobile perf on large chunks)
        const capped = input.length > 200 ? input.slice(0, 200) : input;
        const result = capped
            .replace(RE_HTML_TAGS, '')
            .replace(RE_MD_MARKERS, '')
            .replace(RE_MD_IMAGES, '')
            .replace(RE_MD_LINKS, '$1')
            .replace(RE_TIMESTAMPS, '')
            .replace(RE_URLS, '')
            .replace(RE_WHITESPACE, ' ')
            .trim();
        // Cap cache at 500 entries — evict oldest half instead of clearing all (Fix I-2)
        if (this.displayTextCache.size > 500) {
            const half = this.displayTextCache.size >> 1;
            let count = 0;
            for (const key of this.displayTextCache.keys()) {
                if (count++ >= half) break;
                this.displayTextCache.delete(key);
            }
        }
        this.displayTextCache.set(input, result);
        return result;
    }

    // ═══ Mode Flash Label — Sayonara Wild Hearts × WarioWare ═════════
    // Brief JP kanji flashes on mode transitions for instant visual orientation.
    // One-word labels: 「航行」「拡張」「筆」「区」「集」
    private showModeFlash(label: string): void {
        if (this.modeFlashTimeoutId !== null) { clearTimeout(this.modeFlashTimeoutId); this.modeFlashTimeoutId = null; }
        if (this.modeFlashEl) { this.modeFlashEl.remove(); this.modeFlashEl = null; }
        const el = document.createElement('div');
        el.className = 'ms3-mode-flash';
        el.textContent = label;
        if (this.containerEl) {
            this.containerEl.appendChild(el);
        } else {
            document.body.appendChild(el);
        }
        this.modeFlashEl = el;
        requestAnimationFrame(() => el.classList.add('ms3-mode-flash--visible'));
        this.modeFlashTimeoutId = setTimeout(() => {
            el.classList.remove('ms3-mode-flash--visible');
            el.classList.add('ms3-mode-flash--fade');
            setTimeout(() => { el.remove(); if (this.modeFlashEl === el) this.modeFlashEl = null; }, 300);
            this.modeFlashTimeoutId = null;
        }, 500);
    }

    // ═══ NecroDancer Streak Badge — sustained navigation indicator ═══
    private updateStreakBadge(): void {
        if (this.vroomStreakCount >= 5) {
            if (!this.vroomStreakBadgeEl && this.containerEl) {
                const badge = document.createElement('div');
                badge.className = 'ms3-streak-badge';
                this.containerEl.appendChild(badge);
                this.vroomStreakBadgeEl = badge;
            }
            if (this.vroomStreakBadgeEl) {
                const streakLevel = Math.min(3, Math.floor((this.vroomStreakCount - 5) / 5)); // 0-3
                this.vroomStreakBadgeEl.textContent = `${'⚡'.repeat(streakLevel + 1)} ${this.vroomStreakCount}`;
                this.vroomStreakBadgeEl.style.display = '';
            }
        } else if (this.vroomStreakBadgeEl) {
            this.vroomStreakBadgeEl.style.display = 'none';
        }
    }

    // ═══ Hi-Fi Rush Format Invite — call-and-response glow ═══
    private showFormatInvite(): void {
        if (this.formatInviteTimeoutId !== null) { clearTimeout(this.formatInviteTimeoutId); this.formatInviteTimeoutId = null; }
        // Pulse the next zoom lane item to invite continuing the format chain
        if (this.zoomNextEl) {
            this.zoomNextEl.classList.add('ms3-zoom-invite');
            this.formatInviteTimeoutId = setTimeout(() => {
                this.zoomNextEl?.classList.remove('ms3-zoom-invite');
                this.formatInviteTimeoutId = null;
            }, 800);
        }
    }

    private getDisplayIndex(): number {
        if (this.units.length === 0) return 0;
        return Math.max(0, Math.min(this.units.length - 1, this.currentIndex + this.lateralOffset));
    }

    private getPadSizePx(): number {
        return Math.max(110, Math.min(180, this.plugin.settings.trackballSizePx ?? 138));
    }

    /** TRANCE orbit: smoothly reposition all non-hovered segments around the ring.
     *  Called each animation frame when TRANCE tier combo ring is open.
     */
    private refreshTranceSegmentPositions(): void {
        const n = Math.min(this.comboSegments.length, 6);
        for (let i = 0; i < n; i++) {
            const el = this.comboSegEls[i];
            if (!el || el.style.display === 'none' || i === this.comboHoveredSeg) continue;
            const ang = ((i * 360 / n) - 90) * Math.PI / 180 + this.tranceOrbitOffset;
            const x = Math.cos(ang) * COMBO_SEG_RADIUS;
            const y = Math.sin(ang) * COMBO_SEG_RADIUS;
            el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
        }
    }

    /** Compute kanji character density of a text string (0=all kana, 1=all kanji).
     *  Used to give VROOM haptics a physical texture: dense kanji = heavier feel.
     */
    private computeKanjiDensity(text: string): number {
        if (!text) return 0;
        let kanji = 0;
        for (let i = 0; i < text.length; i++) {
            const cp = text.charCodeAt(i);
            if (cp >= 0x4E00 && cp <= 0x9FFF) kanji++;  // CJK Unified Ideographs
        }
        return kanji / text.length;
    }

    /** Hot-path view accessor: returns cached view during drag/inertia, else full workspace lookup */
    private getView(): MarkdownView | null {
        return this.cachedDragView ?? this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    /** Centralized CM6 EditorView accessor — single point of failure if Obsidian renames .cm */
    private getCmView(editor: Editor): any {
        return (editor as any).cm ?? null;
    }

    private getPadRadiusPx(): number {
        return this.getPadSizePx() / 2 - 5;
    }

    private getBallRadiusPx(): number {
        return 10;
    }

    private getBottomOffsetPx(): number {
        const base = this.plugin.settings.toolbarPosition === 'bottom' ? 92 : 16;
        const custom = this.plugin.settings.trackballBottomOffsetPx;
        if (typeof custom !== 'number') return base;
        return Math.max(8, Math.min(260, custom));
    }

    private getLateralSteerStrength(): number {
        const configured = this.plugin.settings.lateralSteerStrength;
        if (typeof configured !== 'number') return 1;
        return Math.max(0.4, Math.min(2.5, configured));
    }

    private getVerticalScrollGain(): number {
        const configured = this.plugin.settings.verticalScrollGain;
        if (typeof configured !== 'number') return 0.8;
        return Math.max(0.35, Math.min(1.8, configured));
    }

    private getSteeringPreset(): 'balanced' | 'steering' | 'extreme-steering' {
        const preset = this.plugin.settings.steeringPreset;
        if (preset === 'balanced' || preset === 'steering' || preset === 'extreme-steering') return preset;
        return 'balanced';
    }

    private getSteerRotationGain(): number {
        switch (this.getSteeringPreset()) {
            case 'balanced': return 0.95;
            case 'extreme-steering': return 1.95;
            default: return 1.35;
        }
    }

    private getSteerTranslationGain(): number {
        switch (this.getSteeringPreset()) {
            case 'balanced': return 0.42;
            case 'extreme-steering': return 0.12;
            default: return 0.24;
        }
    }

    private getSteerTiltGain(): number {
        switch (this.getSteeringPreset()) {
            case 'balanced': return 5.5;
            case 'extreme-steering': return 4.6;
            default: return 5.1;
        }
    }

    private getEditorScrollerEl(): HTMLElement | null {
        // Use cached scroller element, invalidated on view change / show
        if (this.cachedScrollerEl && this.cachedScrollerEl.isConnected) {
            return this.cachedScrollerEl;
        }
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return null;
        const cmScroller = view.contentEl.querySelector('.cm-scroller') as HTMLElement | null;
        if (cmScroller) { this.cachedScrollerEl = cmScroller; return cmScroller; }
        const previewScroller = view.contentEl.querySelector('.markdown-preview-view') as HTMLElement | null;
        if (previewScroller) { this.cachedScrollerEl = previewScroller; return previewScroller; }
        return null;
    }

    /**
     * DIRECT SCROLL — zero lag, no spring follower. Writes immediately.
     * This is the Elecom trackball feel: finger moves → screen moves.
     */
    private scrollEditorDirect(deltaY: number): void {
        this.lastManualScrollAt = performance.now();
        const top = this.getCurrentEditorScrollTop();
        if (top === null) return;
        this.setEditorScrollTop(top + deltaY);
    }

    private startEditorInertia(initialVy: number): void {
        this.stopEditorInertia();
        this.editorInertiaVy = initialVy;
        this.inertiaIsCoasting = true;
        this.inertiaBrakePhase = false;
        this.inertiaLastTime = performance.now();
        this.inertiaStepAccum = 0;

        // Soft re-anchor: scroll the current unit into view WITHOUT hard teleport.
        {
            const view = this.getView();
            if (view) {
                const cmView = this.getCmView(view.editor);
                const unit = this.units[this.currentIndex];
                if (cmView && unit) {
                    const coords = cmView.coordsAtPos(unit.start, 1);
                    if (coords) {
                        const vh = window.innerHeight;
                        const margin = vh * 0.25;
                        if (coords.top < margin) {
                            cmView.scrollDOM.scrollTop += coords.top - margin;
                        } else if (coords.bottom > vh - margin) {
                            cmView.scrollDOM.scrollTop += coords.bottom - (vh - margin);
                        }
                    }
                }
            }
        }

        // IKI (粋) ball: pulse in inertia direction while coasting
        if (this.ballEl) this.ballEl.classList.add('ms3-ball--coasting');
        // 釣り Tsuri: zoom items become catchable during coast
        if (this.zoomEl) this.zoomEl.classList.add('ms3-zoom--coasting');

        this.activateAnim('inertia');
    }

    /** Inertia tick — extracted from closure for unified loop */
    private tickInertia(_now: number, dt: number): void {
        if (this.units.length === 0) { this.stopEditorInertia(); return; }
        const speed = Math.abs(this.editorInertiaVy);

        // ── BRAKE CURVE (IIDX turntable feel — continuous blend) ──
        const BRAKE_THRESHOLD = 160;
        const COAST_DECAY = 3.5;
        const BRAKE_DECAY = 12.0;
        if (speed < BRAKE_THRESHOLD && !this.inertiaBrakePhase) {
            this.inertiaBrakePhase = true;
            this.haptics.fire('snap');
        }
        // Continuous exponential ramp instead of hard binary switch
        const brakeFactor = Math.max(0, 1 - speed / BRAKE_THRESHOLD);
        const decay = COAST_DECAY + (BRAKE_DECAY - COAST_DECAY) * brakeFactor * brakeFactor;

        if (speed < 20 || this.isDragging || !this.isVisible) {
            this.stopEditorInertia();
            this.settledPauseUntil = performance.now() + 250;
            this.selectCurrentUnit();
            if (this.zoomCurrentEl) {
                this.zoomCurrentEl.classList.add('ms3-zoom-landed');
                setTimeout(() => this.zoomCurrentEl?.classList.remove('ms3-zoom-landed'), 400);
            }
            this.scheduleLandingHint();
            return;
        }
        const scrollPx = this.editorInertiaVy * dt;
        if (!this.inertiaBrakePhase) {
            this.scrollEditorDirect(scrollPx * 0.18);
        }

        // Step through units during inertia
        this.inertiaStepAccum += scrollPx;
        this.inertiaStepAccum = Math.max(-150, Math.min(150, this.inertiaStepAccum));
        const stepSize = Math.max(22, 40 - speed * 0.03);
        let inertiaSteps = 0;
        while (Math.abs(this.inertiaStepAccum) >= stepSize && inertiaSteps < 2) {
            const dir = this.inertiaStepAccum > 0 ? 1 : -1;
            const nextIdx = Math.max(0, Math.min(this.units.length - 1, this.currentIndex + dir));
            if (nextIdx === this.currentIndex) { this.inertiaStepAccum = 0; break; }
            this.currentIndex = nextIdx;
            this.inertiaStepAccum -= dir * stepSize;
            inertiaSteps++;

            // ── TATAMI GRID HAPTICS (畳) ──
            const nowMs = performance.now();
            const minGap = this.inertiaBrakePhase ? 35 : 55;
            if (nowMs - this.lastInertiaHapticAt >= minGap) {
                this.lastInertiaHapticAt = nowMs;
                if (this.chunkMode === 'overview') {
                    this.haptics.fire(this.inertiaBrakePhase ? 'impact' : 'snap');
                    this.currentChunkIdx = this.currentIndex;
                    this.updateChunkBoundaryActive();
                } else if (this.inertiaBrakePhase) {
                    const unit = this.units[nextIdx];
                    let hitScope = 0;
                    for (let s = SCOPE_COUNT - 1; s >= 0; s--) {
                        const scopeUnits = this.scopeEngine.getUnits(s);
                        if (scopeUnits.length === 0) continue;
                        const si = this.scopeEngine.findUnitAt(s, unit.start);
                        if (si >= 0 && si < scopeUnits.length &&
                            (scopeUnits[si].start === unit.start || scopeUnits[si].end === unit.start)) {
                            hitScope = s;
                            break;
                        }
                    }
                    const hapticMap = ['tick', 'tick', 'snap', 'impact'] as const;
                    this.haptics.fire(hapticMap[Math.min(hitScope, 3)]);
                } else {
                    this.haptics.fire('light');
                }
            }
        }
        // Update visuals
        const displayIdx = this.getDisplayIndex();
        if (displayIdx !== this.lastDisplayIndex) {
            this.lastDisplayIndex = displayIdx;
            this.moveCursorLive(displayIdx);
            this.updateCounter();
            this.showHighlightOverlay(displayIdx);
            this.updateZoomLane();
        }

        this.editorInertiaVy *= Math.exp(-decay * dt);
    }

    private stopEditorInertia(): void {
        this.deactivateAnim('inertia');
        this.editorInertiaVy = 0;
        this.inertiaIsCoasting = false;
        this.inertiaBrakePhase = false;
        if (this.ballEl) this.ballEl.classList.remove('ms3-ball--coasting');
        if (this.zoomEl) this.zoomEl.classList.remove('ms3-zoom--coasting');
        this.lastManualScrollAt = 0;
    }

    private getCurrentEditorScrollTop(): number | null {
        const scroller = this.getEditorScrollerEl();
        if (!scroller) return null;
        return scroller.scrollTop;
    }

    private setEditorScrollTop(top: number): void {
        const clampedTop = Math.max(0, top);
        const scroller = this.getEditorScrollerEl();
        if (scroller) scroller.scrollTop = clampedTop;
    }


    private updateZoomLane(): void {
        // Fix #2: show empty state when document has no parseable units
        if (!this.zoomEl || !this.zoomPrevEl || !this.zoomCurrentEl || !this.zoomNextEl) return;
        if (this.units.length === 0) {
            if (this.zoomPrev2El) this.zoomPrev2El.textContent = '';
            this.zoomPrevEl.textContent = '';
            if (this.zoomCurrentEl.textContent !== '— —') this.zoomCurrentEl.textContent = '— —';
            this.zoomNextEl.textContent = '';
            if (this.zoomNext2El) this.zoomNext2El.textContent = '';
            return;
        }
        const center = this.getDisplayIndex();

        const now = performance.now();
        // Fast-path: during drag, skip full update if same index and within 24ms (42Hz is plenty for text lane)
        if (this.isDragging && now - this.lastZoomRenderAt < 24 && center === this.lastZoomIndex) {
            // Only update vertical parallax sway — no text/DOM writes, no horizontal shift
            if (this.zoomEl) {
                const speedPulse = Math.min(Math.abs(this.vroomMomentum) / 80, 1);
                const parallaxY = this.ballLocalY * 0.08;
                const bounceY = Math.sin(now / 70) * speedPulse * 4;
                this.zoomEl.style.transform = `translate3d(0px, ${bounceY + this.zoomVelocity + parallaxY}px, 0) scale(${1 + speedPulse * 0.08})`;
                this.zoomVelocity *= 0.82;
            }
            this.zoomEl.classList.toggle('ms3-zoom--active', this.isDragging || this.isVisible);
            return;
        }
        this.lastZoomRenderAt = now;

        const prev2 = center > 1 ? this.toDisplayText(this.units[center - 2].text) : '';
        const prev = center > 0 ? this.toDisplayText(this.units[center - 1].text) : '';
        const curr = this.toDisplayText(this.units[center].text);
        const next = center + 1 < this.units.length ? this.toDisplayText(this.units[center + 1].text) : '';
        const next2 = center + 2 < this.units.length ? this.toDisplayText(this.units[center + 2].text) : '';

        // ── OSU! RHYTHM LANE ───────────────────────────────────
        // Notes slide in from the conveyor belt, approach circles pulse,
        // hit flash on unit change, 5-item highway

        const speedPulse = Math.min(Math.abs(this.vroomMomentum) / 80, 1);
        const bounceY = Math.sin(now / 70) * speedPulse * 4;
        const scaleBoost = 1 + speedPulse * 0.08;

        const changed = center !== this.lastZoomIndex;
        const dir = center > this.lastZoomIndex ? 1 : -1;

        if (changed) {
            // Hit! bounce the lane + slide animation
            this.zoomVelocity = dir * -10;

            // Slide current text in from direction of travel
            // Use a single rAF for all zoom item transitions (batch DOM writes)
            this.zoomCurrentEl.style.transition = 'none';
            this.zoomCurrentEl.style.transform = `translateX(${dir * 40}px) scale(0.7)`;
            this.zoomCurrentEl.style.opacity = '0.3';

            const cascadeEls = [this.zoomPrevEl, this.zoomNextEl, this.zoomPrev2El, this.zoomNext2El];
            cascadeEls.forEach((el, i) => {
                if (!el) return;
                const offset = dir * (20 - i * 5);
                el.style.transition = 'none';
                el.style.transform = `translateX(${offset}px)`;
                el.style.opacity = '0.4';
            });

            // Single rAF for all transition starts (avoids multiple reflow triggers)
            requestAnimationFrame(() => {
                if (!this.zoomCurrentEl) return;
                this.zoomCurrentEl.style.transition = 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease';
                this.zoomCurrentEl.style.transform = 'translateX(0) scale(1)';
                this.zoomCurrentEl.style.opacity = '1';

                // Approach circle hit flash
                this.zoomCurrentEl.classList.remove('ms3-zoom-hit');
                this.zoomCurrentEl.classList.add('ms3-zoom-hit');
                this.zoomCurrentEl.addEventListener('animationend', () => {
                    this.zoomCurrentEl?.classList.remove('ms3-zoom-hit');
                }, { once: true });

                cascadeEls.forEach((el, i) => {
                    if (!el) return;
                    const delay = (i + 1) * 0.02;
                    el.style.transition = `transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s, opacity 0.15s ease ${delay}s`;
                    el.style.transform = 'translateX(0)';
                    el.style.opacity = '';
                });
            });
        }
        this.lastZoomIndex = center;

        // Guard textContent writes — skip if text unchanged (avoids DOM churn)
        if (this.zoomPrev2El && this.zoomPrev2El.textContent !== prev2) this.zoomPrev2El.textContent = prev2;
        if (this.zoomPrevEl.textContent !== prev) this.zoomPrevEl.textContent = prev;
        const currDisplay = `◉ ${curr}`;
        if (this.zoomCurrentEl.textContent !== currDisplay) this.zoomCurrentEl.textContent = currDisplay;
        if (this.zoomNextEl.textContent !== next) this.zoomNextEl.textContent = next;
        if (this.zoomNext2El && this.zoomNext2El.textContent !== next2) this.zoomNext2El.textContent = next2;

        // Container bounce from velocity + momentum vibration
        // Horizontal parallax removed: it made scope-swipe gestures feel wrong
        // (items drifting horizontally while trying to navigate = confusing)
        const parallaxY = this.isDragging ? this.ballLocalY * 0.08 : 0;
        this.zoomEl.style.transform = `translate3d(0px, ${bounceY + this.zoomVelocity + parallaxY}px, 0) scale(${scaleBoost})`;
        this.zoomVelocity *= 0.82; // spring decay
        this.zoomEl.classList.toggle('ms3-zoom--active', this.isDragging || this.isVisible);

        // Cursor position indicator (#15): thin progress bar via CSS custom property
        const progress = this.units.length > 1 ? center / (this.units.length - 1) : 0;
        this.zoomEl.style.setProperty('--ms3-progress', String(progress));

        // Per-item vertical-only parallax: items sway slightly on Y with ball position
        // (horizontal parallax removed — it conflicts with overflow:hidden clipping and
        // makes scope-swipe feel muddy since items drift as you try to navigate)
        if (this.isDragging) {
            const by = this.ballLocalY;
            if (this.zoomPrev2El) this.zoomPrev2El.style.transform = `translateY(${by * 0.04}px)`;
            if (this.zoomPrevEl) this.zoomPrevEl.style.transform = `translateY(${by * 0.06}px)`;
            if (this.zoomCurrentEl && !changed) this.zoomCurrentEl.style.transform = `translateY(${by * 0.03}px)`;
            if (this.zoomNextEl) this.zoomNextEl.style.transform = `translateY(${by * 0.06}px)`;
            if (this.zoomNext2El) this.zoomNext2El.style.transform = `translateY(${by * 0.04}px)`;
        } else if (!changed) {
            // Reset parallax when not dragging
            if (this.zoomPrev2El) this.zoomPrev2El.style.transform = '';
            if (this.zoomPrevEl) this.zoomPrevEl.style.transform = '';
            if (this.zoomNextEl) this.zoomNextEl.style.transform = '';
            if (this.zoomNext2El) this.zoomNext2El.style.transform = '';
        }
    }

    /** Tap on a zoom lane item to navigate relative to current */
    private zoomTapNavigate(offset: number): void {
        // ── 釣り TSURI CATCH (#20) — catch a passing item during inertia ──
        // Like Rhythm Heaven's fishing minigame: items fly by, tap to catch one.
        // Stops inertia at THAT item specifically, not wherever you happen to be.
        if (this.inertiaIsCoasting) {
            const target = this.getDisplayIndex() + offset;
            if (target < 0 || target >= this.units.length) return;
            this.stopEditorInertia();
            this.currentIndex = target;
            this.physics.setPosition('y', target * UNIT_STEP);
            this.lateralOffset = 0;
            this.settledPauseUntil = performance.now() + 200;
            this.selectCurrentUnit();
            this.haptics.fire('impact');
            if (this.zoomCurrentEl) {
                this.zoomCurrentEl.classList.add('ms3-zoom-landed');
                setTimeout(() => this.zoomCurrentEl?.classList.remove('ms3-zoom-landed'), 400);
            }
            this.updateCounter();
            this.updateZoomLane();
            this.scheduleLandingHint();
            return;
        }

        const target = this.getDisplayIndex() + offset;
        if (target < 0 || target >= this.units.length) return;
        this.currentIndex = target;
        this.physics.setPosition('y', target * UNIT_STEP);
        this.lateralOffset = 0;
        this.lastManualScrollAt = 0;
        this.selectCurrentUnit();
        this.updateCounter();
        this.updateZoomLane();
        this.haptics.fire('snap');

        // Explicitly scroll editor so the tapped unit is visible + selected
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && target < this.units.length) {
            const unit = this.units[target];
            const from = view.editor.offsetToPos(unit.start);
            const to = view.editor.offsetToPos(unit.end);
            requestAnimationFrame(() => {
                try { view.editor.scrollIntoView({ from, to }, true); } catch (_) {}
            });
        }

        // ── COMBO FROM ZOOM LANE TAP (#12) ──
        // Fix #1: delay ring by 280 ms — rapid sequential taps = navigation intent, not combo.
        // Cancel any pending ring before scheduling a fresh one so rapid nav stays clean.
        if (this.zoomComboDelayId !== null) { clearTimeout(this.zoomComboDelayId); this.zoomComboDelayId = null; }
        if (offset !== 0 && this.comboState === 'idle') {
            const padRect = this.padEl?.getBoundingClientRect();
            if (padRect) {
                const cx = padRect.left + padRect.width / 2;
                const cy = Math.max(padRect.top - 80, window.innerHeight * 0.4);
                this.zoomComboDelayId = setTimeout(() => {
                    this.zoomComboDelayId = null;
                    if (this.comboState !== 'idle' || !this.isVisible) return;
                    this.comboCenterX = cx;
                    this.comboCenterY = cy;
                    this.comboCenterSet = true;
                    this.openComboRing(target, this.getPrimarySegments());
                }, 280);
            }
        }
    }

    // ═══ Zoom Lane Gestures — swipe/hold on items for actions ═══

    private onZoomItemTouchStart(e: TouchEvent, offset: number): void {
        const touch = e.touches[0];
        if (!touch) return;
        this.zoomTouchStartX = touch.clientX;
        this.zoomTouchStartY = touch.clientY;
        this.zoomTouchIdx = this.getDisplayIndex() + offset;
        this.zoomSwipeActive = false;
        this.clearZoomLongPress();
        // Long-press on zoom item → open combo ring (replaces old action panel)
        this.zoomLongPressId = setTimeout(() => {
            if (this.zoomTouchIdx >= 0 && this.zoomTouchIdx < this.units.length) {
                this.currentIndex = this.zoomTouchIdx;
                this.lateralOffset = 0;
                this.lastManualScrollAt = 0;
                this.updateHighlight();
                this.updateCounter();
                this.updateZoomLane();
                // Position combo ring near thumb (bottom-half bias, #13)
                const padRect = this.padEl?.getBoundingClientRect();
                if (padRect) {
                    this.comboCenterX = padRect.left + padRect.width / 2;
                    this.comboCenterY = Math.max(padRect.top - 80, window.innerHeight * 0.4);
                } else {
                    this.comboCenterX = this.zoomTouchStartX;
                    this.comboCenterY = this.zoomTouchStartY;
                }
                this.comboCenterSet = true;
                this.openComboRing(this.zoomTouchIdx, this.getPrimarySegments());
                this.zoomSwipeActive = true;
            }
        }, 300);
    }

    private onZoomItemTouchMove(e: TouchEvent, _offset: number): void {
        const touch = e.touches[0];
        if (!touch) return;
        // Route to combo ring if active (hold-to-combo: finger still down)
        if (this.comboState !== 'idle') {
            this.updateComboHover(touch.clientX, touch.clientY);
            return;
        }
        const dx = touch.clientX - this.zoomTouchStartX;
        const dy = touch.clientY - this.zoomTouchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
            this.clearZoomLongPress();
        }
        if (dist > 5 && !this.zoomSwipeActive) {
            this.zoomSwipeActive = true;
        }
    }

    private onZoomItemTouchEnd(e: TouchEvent, offset: number): void {
        this.clearZoomLongPress();
        const touch = e.changedTouches[0];
        if (!touch) return;
        // Route to combo ring if active (hold-to-combo: finger releasing)
        if (this.comboState !== 'idle') {
            this.comboRelease(touch.clientX, touch.clientY);
            return;
        }
        const dx = touch.clientX - this.zoomTouchStartX;
        const dy = touch.clientY - this.zoomTouchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Horizontal swipe on zoom item → trigger directional action on that item
        if (absDx > 30 && absDx > absDy * 1.3) {
            const targetIdx = this.getDisplayIndex() + offset;
            if (targetIdx >= 0 && targetIdx < this.units.length) {
                // Right swipe on zoom item → extend (matching trackball behavior)
                const rightAction = this.plugin.settings.directionalActions.swipeRight;
                if (dx > 0 && this.extendMode === 'off'
                    && (rightAction === 'select' || rightAction === 'none')) {
                    this.currentIndex = targetIdx;
                    this.lateralOffset = 0;
                    this.updateHighlight();
                    this.startExtendSelection();
                    this.haptics.fire('zoom');
                    this.zoomSwipeActive = true;
                    return;
                }
                const actions = this.plugin.settings.directionalActions;
                const action: SurfAction = dx > 0 ? actions.swipeRight : actions.swipeLeft;
                if (action !== 'none') {
                    this.executeAction(action, targetIdx);
                    this.haptics.fire('snap');
                    this.zoomSwipeActive = true;
                    return;
                }
            }
        }

        // Vertical swipe on zoom item → up/down actions
        if (absDy > 30 && absDy > absDx * 1.3) {
            const targetIdx = this.getDisplayIndex() + offset;
            if (targetIdx >= 0 && targetIdx < this.units.length) {
                const actions = this.plugin.settings.directionalActions;
                const action: SurfAction = dy < 0 ? actions.swipeUp : actions.swipeDown;
                if (action !== 'none') {
                    this.executeAction(action, targetIdx);
                    this.haptics.fire('snap');
                    this.zoomSwipeActive = true;
                    return;
                }
            }
        }

        this.zoomTouchIdx = -1;
    }

    private clearZoomLongPress(): void {
        if (this.zoomLongPressId !== null) {
            clearTimeout(this.zoomLongPressId);
            this.zoomLongPressId = null;
        }
    }

    // ═══ Combo Ring — Osu! × Persona 5 × DMC Chain Actions ═══════

    /** Cached primary segments — rebuilt only when settings change or cache is cleared */
    private getPrimarySegments(): ComboSegment[] {
        if (!this.cachedPrimarySegs) {
            this.cachedPrimarySegs = buildPrimarySegments(
                this.plugin.settings.customCommands,
                this.plugin.settings.disabledComboActions,
                this.plugin.settings.comboPreset
            );
        }
        // Context-aware additions: Maker and Chunk always surfaced in combo ring
        const segs = [...this.cachedPrimarySegs];
        if (!segs.some(s => s.action === 'maker') && segs.length < 6) {
            segs.push({ icon: '墨', label: 'Maker', action: 'maker', chainable: false });
        }
        if (this.chunks.length > 0 && !segs.some(s => (s.action as string) === 'chunk-enter') && segs.length < 6) {
            segs.push({ icon: '区', label: 'Chunk', action: 'chunk-enter' as any, chainable: false });
        }
        // ── 巻き戻し Go-Back: show in primary ring when position stack is non-empty ──
        if (this.positionStack.length > 0 && !segs.some(s => (s.action as string) === 'go-back') && segs.length < 6) {
            segs.push({ icon: '⏪', label: '戻る', action: 'go-back' as any, chainable: false });
        }
        return segs.slice(0, 6);
    }

    /**
     * Opens the radial combo ring around target unit.
     * Segments fly out from center with staggered timing (Persona 5).
     * Approach circle shrinks inward (osu!).
     * Chain mode increments combo counter (DMC style meter).
     */
    private openComboRing(targetIdx: number, segments: ComboSegment[], isChain = false): void {
        if (targetIdx < 0 || targetIdx >= this.units.length) return;
        if (!this.comboRingEl || !this.comboOverlayEl) return;

        // Close search if open (prevent dual panel overlap)
        if (this.isSearchOpen) this.closeSearch();

        // Cancel any pending close timeout from a previous ring (M3 fix)
        if (this.comboCloseTimeoutId !== null) {
            clearTimeout(this.comboCloseTimeoutId);
            this.comboCloseTimeoutId = null;
            // Force-reset segment CSS from mid-scatter state to prevent
            // explosion-implosion glitch when re-opening within 250ms
            for (let i = 0; i < this.comboSegEls.length; i++) {
                const el = this.comboSegEls[i];
                el.style.transition = 'none';
                el.style.transform = 'translate(0, 0) scale(0)';
                el.style.opacity = '0';
            }
            // Also immediately clean up CSS classes from previous ring
            this.comboRingEl.classList.remove('ms3-combo-ring--open', 'ms3-combo-ring--chain', 'ms3-combo-ring--tier-chain', 'ms3-combo-ring--tier-fever', 'ms3-combo-ring--tier-trance');
            this.comboOverlayEl.classList.remove('ms3-combo-overlay--open', 'ms3-combo-overlay--chain');
        }

        this.comboTargetIdx = targetIdx;
        this.comboSegments = segments;
        this.comboHoveredSeg = -1;

        if (!isChain) {
            this.comboCount = 0;
            this.comboTotalActions = 0;
            this.comboTier = 0;
            this.comboLastActionType = '';
            this.comboState = 'ring';
            this.comboActionsUsed.clear(); // reset for Full Format tracking
        } else {
            this.comboState = 'chain';
        }
        // Record open time for DJMAX timing quality feedback
        this.comboRingOpenTime = performance.now();

        // ── Position ring ────────────────────────────────
        // For hold-to-combo, comboCenterX/Y already set at touch point.
        // For tap-on-current or chain, compute from zoom current element.
        // Always re-center on chain opens so ring tracks document position during scroll.
        if (!this.comboCenterSet || isChain) {
            const zRect = this.zoomCurrentEl?.getBoundingClientRect();
            if (zRect) {
                this.comboCenterX = zRect.left + zRect.width / 2;
                this.comboCenterY = zRect.top + zRect.height / 2;
            }
        }
        // Clamp to viewport with margin for segments
        const margin = COMBO_SEG_RADIUS + 24;
        this.comboCenterX = Math.max(margin, Math.min(window.innerWidth - margin, this.comboCenterX));
        this.comboCenterY = Math.max(margin, Math.min(window.innerHeight - margin, this.comboCenterY));

        this.comboRingEl.style.left = `${this.comboCenterX}px`;
        this.comboRingEl.style.top = `${this.comboCenterY}px`;

        // ── Position segments in circle ──────────────────
        this.comboOpenGeneration++;
        const n = Math.min(segments.length, 6);
        for (let i = 0; i < 6; i++) {
            const el = this.comboSegEls[i];
            if (i < n) {
                const seg = segments[i];
                el.textContent = seg.icon;
                el.title = seg.label;
                el.setAttribute('aria-label', seg.label);
                el.style.display = '';
                // In TRANCE tier, include the current orbit offset so segments animate in at their orbited position
                const ang = ((i * 360 / n) - 90) * Math.PI / 180 + this.tranceOrbitOffset;
                const x = Math.cos(ang) * COMBO_SEG_RADIUS;
                const y = Math.sin(ang) * COMBO_SEG_RADIUS;
                // Fly in from center with stagger (Persona 5 style)
                el.style.transition = 'none';
                el.style.transform = `translate(${x}px, ${y}px) scale(0)`;
                el.style.opacity = '0';
                el.classList.remove('ms3-combo-seg--hover', 'ms3-combo-seg--hit');
                const delay = i * 22;
                const gen = this.comboOpenGeneration;
                requestAnimationFrame(() => {
                    if (this.comboOpenGeneration !== gen) return; // superseded by close/reopen
                    el.style.transition = `transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms, opacity 0.1s ease ${delay}ms`;
                    el.style.transform = `translate(${x}px, ${y}px) scale(1)`;
                    el.style.opacity = '1';
                });
            } else {
                el.style.display = 'none';
            }
        }

        // ── Combo counter + tier label ───────────────────
        if (this.comboCountEl) {
            if (this.comboCount > 0) {
                // Tier label: 連鎖 / 熱狂 / 恍惚
                const tierLabel = this.comboTier >= COMBO_TIER_TRANCE ? '恍惚'
                    : this.comboTier >= COMBO_TIER_FEVER ? '熱狂' : '';
                this.comboCountEl.textContent = tierLabel
                    ? `${tierLabel} ${this.comboCount}×` : `${this.comboCount}×`;
                // Bounce animation on counter (DMC style meter)
                this.comboCountEl.style.transition = 'none';
                const bounceScale = this.comboTier >= COMBO_TIER_TRANCE ? 2.0
                    : this.comboTier >= COMBO_TIER_FEVER ? 1.7 : 1.5;
                this.comboCountEl.style.transform = `scale(${bounceScale})`;
                requestAnimationFrame(() => {
                    if (!this.comboCountEl) return;
                    this.comboCountEl.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.3, 0.64, 1)';
                    this.comboCountEl.style.transform = 'scale(1)';
                });
                // Three-tier color escalation
                const tierColors = this.comboTier >= COMBO_TIER_TRANCE
                    ? ['#ff2200', '#ff4400', '#ff0000'] // red-hot beam
                    : this.comboTier >= COMBO_TIER_FEVER
                    ? ['#ffaa00', '#ff6600', '#ff4400'] // orange flame
                    : ['#fff', '#ffe066', '#ffaa00', '#ff6600', '#ff2200']; // base escalation
                const ci = Math.min(this.comboCount - 1, tierColors.length - 1);
                this.comboCountEl.style.color = tierColors[ci];
                const glowSize = this.comboTier >= COMBO_TIER_TRANCE ? 20 + this.comboCount * 2
                    : this.comboTier >= COMBO_TIER_FEVER ? 12 + this.comboCount * 2
                    : 8 + this.comboCount * 3;
                this.comboCountEl.style.textShadow = `0 0 ${glowSize}px ${tierColors[ci]}80`;
            } else {
                this.comboCountEl.textContent = '';
            }
        }

        if (this.comboLabelEl) this.comboLabelEl.style.opacity = '0';

        // ── Show ring + approach circle ──────────────────
        // Compute combo tier (Groove Coaster three-tier)
        this.comboTier = this.comboTotalActions >= COMBO_TRANCE_THRESHOLD ? COMBO_TIER_TRANCE
            : this.comboTotalActions >= COMBO_FEVER_THRESHOLD ? COMBO_TIER_FEVER
            : this.comboTotalActions > 0 ? COMBO_TIER_CHAIN : 0;
        this.comboRingEl.classList.add('ms3-combo-ring--open');
        this.comboRingEl.classList.toggle('ms3-combo-ring--chain', isChain);
        // Three-tier visual escalation
        this.comboRingEl.classList.toggle('ms3-combo-ring--tier-chain', this.comboTier >= COMBO_TIER_CHAIN);
        this.comboRingEl.classList.toggle('ms3-combo-ring--tier-fever', this.comboTier >= COMBO_TIER_FEVER);
        this.comboRingEl.classList.toggle('ms3-combo-ring--tier-trance', this.comboTier >= COMBO_TIER_TRANCE);
        this.comboOverlayEl.classList.add('ms3-combo-overlay--open');
        // Chain mode: overlay captures subsequent touches
        this.comboOverlayEl.classList.toggle('ms3-combo-overlay--chain', isChain);

        // Restart approach circle CSS animation
        if (this.comboApproachEl) {
            this.comboApproachEl.classList.remove('ms3-combo-approach--active');
            // Force reflow to restart animation
            void this.comboApproachEl.offsetWidth;
            this.comboApproachEl.classList.add('ms3-combo-approach--active');
        }

        // ── Decay timer ──────────────────────────────────
        this.startComboDecay();

        // Ball enters "waiting" state — pulses to indicate combo ring is active
        if (this.ballEl) this.ballEl.classList.add('ms3-ball--combo-wait');

        this.haptics.fire(isChain ? 'tick' : 'zoom');
    }

    private closeComboRing(): void {
        if (!this.comboRingEl || !this.comboOverlayEl) return;
        if (this.comboState === 'idle') return;
        this.comboOpenGeneration++; // invalidate any pending open rAFs
        this.comboState = 'idle';
        this.comboHoveredSeg = -1;
        this.cancelComboDecay();

        // Remove combo-wait pulse from ball
        if (this.ballEl) this.ballEl.classList.remove('ms3-ball--combo-wait');

        // Scatter segments outward (break/close effect)
        const n = Math.min(this.comboSegments.length, 6);
        for (let i = 0; i < n; i++) {
            const el = this.comboSegEls[i];
            if (el.style.display === 'none') continue;
            const ang = ((i * 360 / n) - 90) * Math.PI / 180;
            const scatter = COMBO_SEG_RADIUS + 50;
            const tx = Math.cos(ang) * scatter;
            const ty = Math.sin(ang) * scatter;
            const rot = (Math.random() - 0.5) * 60;
            el.style.transition = 'transform 0.22s ease-in, opacity 0.14s ease-in';
            el.style.transform = `translate(${tx}px, ${ty}px) scale(0.3) rotate(${rot}deg)`;
            el.style.opacity = '0';
        }

        if (this.comboApproachEl) {
            this.comboApproachEl.classList.remove('ms3-combo-approach--active');
        }

        this.comboCloseTimeoutId = setTimeout(() => {
            this.comboCloseTimeoutId = null;
            this.comboRingEl?.classList.remove('ms3-combo-ring--open', 'ms3-combo-ring--chain', 'ms3-combo-ring--tier-chain', 'ms3-combo-ring--tier-fever', 'ms3-combo-ring--tier-trance');
            this.comboOverlayEl?.classList.remove('ms3-combo-overlay--open', 'ms3-combo-overlay--chain');
        }, 250);

        this.comboSegments = [];
        this.comboCenterX = 0;
        this.comboCenterY = 0;
        this.comboCenterSet = false;
        this.comboLastReversibleAction = null;
        this.comboLastReversibleIdx = -1;
    }

    /**
     * Execute the selected combo segment.
     * If chainable, immediately opens a chain ring with follow-up actions.
     * Combo counter increments for every chained action (DMC style).
     */
    private executeComboSegment(segIdx: number): void {
        if (segIdx < 0 || segIdx >= this.comboSegments.length) return;
        const seg = this.comboSegments[segIdx];
        this.cancelComboDecay();

        // Hit flash on segment (osu! 300 hit effect)
        this.comboSegEls[segIdx]?.classList.add('ms3-combo-seg--hit');

        // Increment combo counter with DMC variety bonus
        const isVariety = this.comboLastActionType !== '' && seg.action !== this.comboLastActionType;
        this.comboCount += isVariety ? 2 : 1;  // variety = double points
        this.comboTotalActions++;
        this.comboLastActionType = seg.action;
        // Recompute tier immediately so the NEXT openComboRing shows the correct tier
        this.comboTier = this.comboTotalActions >= COMBO_TRANCE_THRESHOLD ? COMBO_TIER_TRANCE
            : this.comboTotalActions >= COMBO_FEVER_THRESHOLD ? COMBO_TIER_FEVER
            : this.comboTotalActions > 0 ? COMBO_TIER_CHAIN : 0;
        // ── 妙 MYŌ: Variety bonus visual flash (DMC Stylish!) ──
        if (isVariety && this.comboCountEl) {
            const flash = document.createElement('span');
            flash.className = 'ms3-combo-variety-flash';
            flash.textContent = '妙';
            this.comboRingEl?.appendChild(flash);
            setTimeout(() => flash.remove(), 600);
            this.haptics.fire('select');
        }

        // ── DJMAX 完璧 / 良: Timing quality feedback ──────────────────────────
        // Rewards acting on the approach circle early (< 600ms = 完璧!, < 1200ms = 良!)
        // Chain continuations use a tighter window (fresh ring = 600ms, chain = 400ms).
        if (this.comboRingOpenTime > 0 && this.comboRingEl) {
            const elapsed = performance.now() - this.comboRingOpenTime;
            const perfectWindow = this.comboState === 'chain' ? 400 : 600;
            const goodWindow = this.comboState === 'chain' ? 800 : 1200;
            if (elapsed <= perfectWindow) {
                const qEl = document.createElement('span');
                qEl.className = 'ms3-timing-flash ms3-timing-flash--perfect';
                qEl.textContent = '完璧！';
                this.comboRingEl.appendChild(qEl);
                setTimeout(() => qEl.remove(), 700);
                this.haptics.fire('success');
            } else if (elapsed <= goodWindow) {
                const qEl = document.createElement('span');
                qEl.className = 'ms3-timing-flash ms3-timing-flash--good';
                qEl.textContent = '良！';
                this.comboRingEl.appendChild(qEl);
                setTimeout(() => qEl.remove(), 600);
            }
        }
        this.comboRingOpenTime = 0; // consume — only fires once per ring open

        // ── Track unique action types for Full Format detection ──
        const FORMAT_TYPES_SET = new Set(['bold', 'highlight', 'cloze', 'spoiler']);
        if (FORMAT_TYPES_SET.has(seg.action)) this.comboActionsUsed.add(seg.action);

        try {
            // ── Chunk combo intercept: handle chunk-specific actions first ──
            if (this.chunkMode !== 'off' && this.executeChunkComboSegment(seg)) {
                this.haptics.fire('snap');
                // Don't endCombo if chunk-wide opened a new combo ring
                if (this.comboState === 'idle') return;
                this.endCombo();
                return;
            }

            // Execute the action
        if (seg.action === 'next-select') {
            // Navigate to next unit + select (Monster Hunter combo continuation)
            const nextIdx = this.comboTargetIdx + 1;
            if (nextIdx < this.units.length) {
                this.comboTargetIdx = nextIdx;
                this.currentIndex = nextIdx;
                this.physics.setPosition('y', nextIdx * UNIT_STEP);
                this.lateralOffset = 0;
                this.lastManualScrollAt = 0;
                this.updateHighlight();
                this.updateCounter();
                this.updateZoomLane();
            } else {
                // Already at last unit — don't inflate combo counter
                this.comboCount--;
            }
        } else if (seg.action === 'prev-select') {
            // Navigate to previous unit (reverse chain)
            const prevIdx = this.comboTargetIdx - 1;
            if (prevIdx >= 0) {
                this.comboTargetIdx = prevIdx;
                this.currentIndex = prevIdx;
                this.physics.setPosition('y', prevIdx * UNIT_STEP);
                this.lateralOffset = 0;
                this.lastManualScrollAt = 0;
                this.updateHighlight();
                this.updateCounter();
                this.updateZoomLane();
            } else {
                this.comboCount--;
            }
        } else if (seg.action === 'extend') {
            // Open extend-selection mode: precision multi-level selection extension
            this.closeComboRing();
            this.startExtendSelection();
            return;
        } else if (seg.action === 'teleport') {
            // Teleport: jump to start of current context chunk — gives real navigational value.
            // If no chunks, jumps to document start (reliable landmark).
            this.pushPositionStack(); // save position before teleporting
            let targetIdx = 0;
            const allChunks = this.scopeEngine.getChunks();
            if (allChunks.length > 0) {
                const curOffset = this.units[this.comboTargetIdx]?.start ?? 0;
                const chunkIdx = this.scopeEngine.findChunkAt(curOffset);
                if (chunkIdx >= 0) {
                    const chunkStart = allChunks[chunkIdx].start;
                    const found = this.scopeEngine.findUnitAt(this.scopeLevel, chunkStart);
                    targetIdx = Math.max(0, found);
                }
            }
            this.comboTargetIdx = targetIdx;
            this.currentIndex = targetIdx;
            this.physics.setPosition('y', targetIdx * UNIT_STEP);
            this.lateralOffset = 0;
            this.lastManualScrollAt = 0;
            this.updateHighlight();
            this.updateCounter();
            this.updateZoomLane();
            this.teleportToCurrentUnit();
            this.haptics.fire('impact');
        } else if (seg.action === 'random-move') {
            // Random move: skip 3-8 units forward or backward
            const dir = Math.random() > 0.5 ? 1 : -1;
            const skip = 3 + Math.floor(Math.random() * 6);
            const randomTarget = Math.max(0, Math.min(this.units.length - 1, this.comboTargetIdx + dir * skip));
            this.comboTargetIdx = randomTarget;
            this.currentIndex = randomTarget;
            this.physics.setPosition('y', randomTarget * UNIT_STEP);
            this.lateralOffset = 0;
            this.lastManualScrollAt = 0;
            this.updateHighlight();
            this.updateCounter();
            this.updateZoomLane();
            this.teleportToCurrentUnit();
        } else if (seg.action === 'command') {
            if (seg.commandId) {
                // Custom command preset — ensure selection on COMBO TARGET + execute
                this.executeCustomCommand(seg.commandId, this.comboTargetIdx);
            } else {
                this.openCommandPicker();
            }
            this.closeComboRing();
            return;
        } else if (seg.action === 'search') {
            this.closeComboRing();
            this.openSearch();
            return;
        } else if (seg.action === 'maker') {
            // Improvement #2: Wire Maker Mode entry from combo ring
            this.closeComboRing();
            this.enterMakerMode();
            return;
        } else if ((seg.action as string) === 'mark') {
            // ── KCS-style inactive selection ─────────────────────────────
            // Toggle the CURRENT unit (exact on-screen highlight → no momentum
            // inaccuracy) into the persistent marked set, then auto-advance so
            // you can rapidly mark → next → mark → next, then bulk-apply.
            const u = this.units[this.comboTargetIdx];
            if (u) this.plugin.discourse?.toggleRange(u.start, u.end);
            this.haptics.fire('select');
            const markNextIdx = this.comboTargetIdx + 1;
            if (markNextIdx < this.units.length) {
                this.comboTargetIdx = markNextIdx;
                this.currentIndex = markNextIdx;
                this.physics.setPosition('y', markNextIdx * UNIT_STEP);
                this.lateralOffset = 0;
                this.lastManualScrollAt = 0;
                this.updateHighlight();
                this.updateCounter();
                this.updateZoomLane();
            }
            const markChain: ComboSegment[] = [
                { icon: '⊹', label: 'Mark', action: 'mark', chainable: true },
                { icon: '→', label: 'Next', action: 'next-select', chainable: true },
                { icon: '←', label: 'Prev', action: 'prev-select', chainable: true },
                { icon: '太', label: 'B×', action: 'bulk-bold', chainable: false },
                { icon: '穴', label: '穴×', action: 'bulk-cloze', chainable: false },
                { icon: '✓', label: 'Apply', action: 'mark-activate', chainable: false },
            ];
            setTimeout(() => {
                if (this.comboState === 'idle') return;
                this.openComboRing(this.comboTargetIdx, markChain, true);
            }, 70);
            return;
        } else if ((seg.action as string) === 'mark-clear') {
            this.plugin.discourse?.clear();
            this.haptics.fire('impact');
            this.closeComboRing();
            return;
        } else if ((seg.action as string) === 'mark-activate') {
            this.plugin.discourse?.activate();
            this.haptics.fire('success');
            this.closeComboRing();
            return;
        } else if ((seg.action as string) === 'mark-pick') {
            // Hand off to the direct-on-text, keyboard-free picker. Hide the
            // scroller so the capture overlay owns all touches.
            this.closeComboRing();
            this.hide();
            this.plugin.discoursePicker?.enter();
            return;
        } else if ((seg.action as string) === 'bulk-bold') {
            this.plugin.discourse?.bulkWrap('bold');
            this.rebuildAfterEdit();
            this.haptics.fire('success');
            this.closeComboRing();
            return;
        } else if ((seg.action as string) === 'bulk-highlight') {
            this.plugin.discourse?.bulkWrap('highlight');
            this.rebuildAfterEdit();
            this.haptics.fire('success');
            this.closeComboRing();
            return;
        } else if ((seg.action as string) === 'bulk-cloze') {
            this.plugin.discourse?.bulkWrap('cloze');
            this.rebuildAfterEdit();
            this.haptics.fire('success');
            this.closeComboRing();
            return;
        } else if ((seg.action as string) === 'bulk-copy') {
            this.plugin.discourse?.bulkCopy();
            this.haptics.fire('success');
            this.closeComboRing();
            return;
        } else if ((seg.action as string) === 'chunk-enter') {
            // Direct chunk overview entry — skip the 3+ swipe requirement
            this.closeComboRing();
            if (this.scopeLevel < SCOPE_COUNT - 1) this.setScopeLevel(SCOPE_COUNT - 1, 1);
            setTimeout(() => this.enterChunkOverview(), 60);
            return;
        } else if ((seg.action as string) === 'undo-last') {
            // ── 取り消し TORI-KESHI: Roman Cancel undo (#18) ──
            // Re-execute the last reversible action (toggle off) at the same index.
            // Costs 1 combo point — like Guilty Gear's meter spend.
            if (this.comboLastReversibleAction && this.comboLastReversibleIdx >= 0) {
                this.executeAction(this.comboLastReversibleAction as SurfAction, this.comboLastReversibleIdx);
                this.comboLastReversibleAction = null;
                this.comboLastReversibleIdx = -1;
                this.comboCount = Math.max(0, this.comboCount - 1); // costs a combo point
            }
        } else if ((seg.action as string) === 'go-back') {
            // ── 巻き戻し GO-BACK: pop position stack (Katamari rewind) ──
            this.closeComboRing();
            this.popPositionStack();
            return;
        } else if ((seg.action as string) === 'auto-repeat') {
            // ── PaRappa Auto-Repeat: batch-apply the repeated action to next N units ──
            // Like PaRappa's "U Rappin' COOL!" mode where the game takes over
            const repeatAction = this.autoRepeatAction as SurfAction;
            if (repeatAction) {
                const maxRepeat = Math.min(this.units.length - 1 - this.comboTargetIdx, 10);
                let applied = 0;
                for (let i = 1; i <= maxRepeat; i++) {
                    const idx = this.comboTargetIdx + i;
                    if (idx >= this.units.length) break;
                    this.executeAction(repeatAction, idx);
                    applied++;
                }
                // Advance to the last unit we touched
                if (applied > 0) {
                    this.comboTargetIdx = this.comboTargetIdx + applied;
                    this.currentIndex = this.comboTargetIdx;
                    this.physics.setPosition('y', this.comboTargetIdx * UNIT_STEP);
                    this.updateHighlight();
                    this.updateCounter();
                    this.updateZoomLane();
                    this.teleportToCurrentUnit();
                    // Flash auto-repeat badge
                    this.showAutoRepeatBadge(repeatAction, applied);
                }
                this.haptics.fire('success');
                // Reset streak after batch apply
                this.autoRepeatCount = 0;
                this.autoRepeatAction = '';
            }
            this.closeComboRing();
            return;
        } else {
            this.executeAction(seg.action as SurfAction, this.comboTargetIdx);
        }

        this.haptics.fire('snap');

        // ── Post-edit auto-advance: after formatting, advance to next unit ──
        // Core flow improvement: format → auto-step → chain ring on NEXT unit.
        // Like Taiko no Tatsujin's note highway: hit one, immediately ready for the next.
        const FORMAT_ADVANCE_SET = new Set(['bold', 'highlight', 'spoiler', 'cloze']);
        if (FORMAT_ADVANCE_SET.has(seg.action) && seg.chainable) {
            const nextIdx = this.comboTargetIdx + 1;
            if (nextIdx < this.units.length) {
                this.comboTargetIdx = nextIdx;
                this.currentIndex = nextIdx;
                this.physics.setPosition('y', nextIdx * UNIT_STEP);
                this.lateralOffset = 0;
                this.lastManualScrollAt = 0;
                this.updateHighlight();
                this.updateCounter();
                this.updateZoomLane();
                // ── Hi-Fi Rush Format Invite: glow on next zoom item ──
                this.showFormatInvite();
            }
        }

        // ── Track reversible actions for undo (#18) ──
        const REVERSIBLE = ['bold', 'highlight', 'spoiler', 'cloze'];
        if (REVERSIBLE.includes(seg.action)) {
            this.comboLastReversibleAction = seg.action;
            this.comboLastReversibleIdx = this.comboTargetIdx;
        }

        // ── PaRappa Auto-Repeat: track consecutive same-action streak ──
        const REPEATABLE = ['bold', 'highlight', 'spoiler', 'cloze', 'copy'];
        if (REPEATABLE.includes(seg.action)) {
            if (seg.action === this.autoRepeatAction) {
                this.autoRepeatCount++;
            } else {
                this.autoRepeatAction = seg.action;
                this.autoRepeatCount = 1;
            }
            // Track sequence for Combo Memory
            this.comboCurrentSequence.push(seg.action);
        }

        // Chain: if chainable, open next ring with follow-up actions
        if (seg.chainable) {
            // Combo graduation: after 3 chains inject advanced options,
            // after 6 chains inject master options (MH Rise weapon tree style)
            let chainSegs = getChainForAction(seg.action, this.plugin.settings.customCommands);
            if (chainSegs && chainSegs.length > 0) {
                const hasAction = (a: string) => chainSegs!.some(s => s.action === a);
                // ── PaRappa Auto-Repeat: 2+ same action in a row → offer batch repeat ──
                // Fix B-7: extracted outside undo guard so auto-repeat works independently
                if (this.autoRepeatCount >= 2 && chainSegs.length < 6 && !hasAction('auto-repeat')) {
                    const remaining = Math.min(this.units.length - 1 - this.comboTargetIdx, 10);
                    if (remaining > 0) {
                        chainSegs.push({
                            icon: '🔁', label: `×${remaining}`, action: 'auto-repeat' as any, chainable: false
                        });
                    }
                }
                // ── 取り消し Undo injection (#18): if last action was reversible, offer undo ──
                if (this.comboLastReversibleAction && chainSegs.length < 6) {
                    chainSegs.unshift({
                        icon: '↩', label: '取消', action: 'undo-last' as any, chainable: true
                    });
                    chainSegs = chainSegs.slice(0, 6);
                }
                // Graduate: FEVER tier unlocks teleport, TRANCE unlocks random-move
                if (this.comboTier >= COMBO_TIER_FEVER && chainSegs.length < 6 && !hasAction('teleport')) {
                    chainSegs.push({ icon: '⌖', label: 'Teleport', action: 'teleport', chainable: false });
                }
                if (this.comboTier >= COMBO_TIER_TRANCE && chainSegs.length < 6 && !hasAction('random-move')) {
                    chainSegs.push({ icon: '🎲', label: 'Random', action: 'random-move', chainable: true });
                }
                // ── 巻き戻し Go-Back: inject when position stack is non-empty ──
                if (this.positionStack.length > 0 && chainSegs.length < 6 && !hasAction('go-back')) {
                    chainSegs.push({ icon: '⏪', label: '戻る', action: 'go-back' as any, chainable: false });
                }
                chainSegs = chainSegs.slice(0, 6);
                // Brief delay for hit flash to register, then chain
                setTimeout(() => {
                    if (this.comboState === 'idle') return; // was closed
                    this.openComboRing(this.comboTargetIdx, chainSegs!, true);
                }, 70);
                return;
            }
        }

        // ── Combo Memory: record the action sequence if meaningful (3+ actions) ──
        // Fix S-5: moved outside chain branch so memory records on ALL combo endings
        if (this.comboCurrentSequence.length >= 3) {
            const key = this.comboCurrentSequence.join('→');
            const existing = this.comboMemory.find(m => m.sequence.join('→') === key);
            if (existing) {
                existing.count++;
            } else {
                this.comboMemory.push({ sequence: [...this.comboCurrentSequence], count: 1 });
                // Cap memory at 10 patterns (evict least-used)
                if (this.comboMemory.length > 10) {
                    this.comboMemory.sort((a, b) => b.count - a.count);
                    this.comboMemory = this.comboMemory.slice(0, 10);
                }
            }
        }
        // Reset auto-repeat and combo sequence on combo end
        this.autoRepeatCount = 0;
        this.autoRepeatAction = '';
        this.comboCurrentSequence = [];

        // No chain — end combo
        this.endCombo();
        } catch (e) {
            // Safety: if action throws, don't leave combo ring stuck open
            console.warn('Combo segment error:', e);
            this.comboCount = Math.max(0, this.comboCount - 1);
            this.comboTotalActions = Math.max(0, this.comboTotalActions - 1);
            this.closeComboRing();
        }
    }

    /** PaRappa Auto-Repeat badge: brief floating notification showing batch result */
    private showAutoRepeatBadge(action: string, count: number): void {
        if (this.autoRepeatBadgeEl) this.autoRepeatBadgeEl.remove();
        const badge = document.createElement('div');
        badge.className = 'ms3-auto-repeat-badge';
        const actionIcons: Record<string, string> = {
            bold: '太', highlight: '光', spoiler: '隠', cloze: '穴', copy: '写'
        };
        badge.textContent = `${actionIcons[action] ?? '●'} ×${count}`;
        document.body.appendChild(badge);
        this.autoRepeatBadgeEl = badge;
        setTimeout(() => { badge.classList.add('ms3-auto-repeat-badge--fade'); }, 50);
        setTimeout(() => { badge.remove(); if (this.autoRepeatBadgeEl === badge) this.autoRepeatBadgeEl = null; }, 1500);
    }

    private endCombo(): void {
        if (this.comboCount > 1 && this.comboCountEl) {
            // ── Tier-aware final flourish (higher tier = bigger celebration) ──
            const tierLabel = this.comboTier >= COMBO_TIER_TRANCE ? '恍惚'
                : this.comboTier >= COMBO_TIER_FEVER ? '熱狂' : '';
            const finalText = tierLabel
                ? `${tierLabel} ${this.comboCount}×✓`
                : `${this.comboCount}×✓`;
            this.comboCountEl.textContent = finalText;
            const peakScale = this.comboTier >= COMBO_TIER_TRANCE ? 2.5
                : this.comboTier >= COMBO_TIER_FEVER ? 2.0 : 1.7;
            this.comboCountEl.style.transition = 'none';
            this.comboCountEl.style.transform = `scale(${peakScale})`;
            requestAnimationFrame(() => {
                if (!this.comboCountEl) return;
                this.comboCountEl.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.3, 0.64, 1), opacity 0.4s ease-out 0.15s';
                this.comboCountEl.style.transform = 'scale(1)';
            });
        }

        // ── Pop'n 全拍子 FULL FORMAT: TRANCE + all 4 format types = fanfare ──
        // Inspired by Pop'n Music Full Combo. Rewards comprehensive text formatting.
        const ALL_FORMATS = ['bold', 'highlight', 'cloze', 'spoiler'];
        if (this.comboTier >= COMBO_TIER_TRANCE
            && ALL_FORMATS.every(t => this.comboActionsUsed.has(t))
            && this.comboRingEl) {
            const fanfare = document.createElement('div');
            fanfare.className = 'ms3-full-format-flash';
            fanfare.innerHTML =
                '<span class="ms3-full-format-title">全拍子！</span>' +
                '<span class="ms3-full-format-sub">FULL FORMAT</span>';
            this.comboRingEl.appendChild(fanfare);
            setTimeout(() => fanfare.remove(), 2200);
            this.haptics.fire('success');
            setTimeout(() => this.haptics.fire('impact'), 180);
        }
        this.comboActionsUsed.clear();

        // Emit combo-complete event for inter-plugin hooks (e.g., JP Collocations)
        if (this.containerEl) {
            this.containerEl.dispatchEvent(new CustomEvent('ms3-combo-complete', {
                detail: { count: this.comboCount, tier: this.comboTier, totalActions: this.comboTotalActions },
                bubbles: true, composed: true
            }));
        }
        this.haptics.fire('success');
        setTimeout(() => this.closeComboRing(), 180);
    }

    private breakCombo(): void {
        if (this.comboState === 'idle') return;
        // Fix #3: passive timeout should not jolt the user — use light haptic
        this.haptics.fire('light');
        if (this.comboCountEl && this.comboCount > 0) {
            this.comboCountEl.textContent = `${this.comboCount}× ✗`;
            this.comboCountEl.style.color = '#ff4444';
        }
        // Schedule color reset so next combo starts clean
        setTimeout(() => {
            if (this.comboCountEl) {
                this.comboCountEl.style.color = '';
                this.comboCountEl.style.textShadow = '';
            }
        }, 400);
        this.comboActionsUsed.clear();
        this.closeComboRing();
    }

    // ─── Combo ring touch handlers ─────────────────────────

    /** Overlay touch handler for chain continuations (new touch sequences) */
    private onComboOverlayTouch(e: TouchEvent, phase: 'start' | 'move' | 'end'): void {
        if (this.comboState === 'idle') return;
        e.preventDefault();
        e.stopPropagation();
        const t = phase === 'end' ? e.changedTouches[0] : e.touches[0];
        if (!t) return;
        if (phase === 'end') {
            this.comboRelease(t.clientX, t.clientY);
        } else {
            this.updateComboHover(t.clientX, t.clientY);
        }
    }

    /** Release handler shared by zoom-item-touchEnd and overlay-touchEnd */
    private comboRelease(clientX: number, clientY: number): void {
        const dx = clientX - this.comboCenterX;
        const dy = clientY - this.comboCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // H-3: Dead zone proportional to segment radius; no DPR scaling (CSS px are DPR-independent)
        const deadZone = COMBO_SEG_RADIUS * 0.35;
        if (dist < deadZone) {
            // Released in center dead zone → close combo
            this.closeComboRing();
            return;
        }

        if (this.comboHoveredSeg >= 0) {
            this.executeComboSegment(this.comboHoveredSeg);
        } else {
            this.closeComboRing();
        }
    }

    /** Update hovered segment based on finger position */
    private updateComboHover(clientX: number, clientY: number): void {
        const dx = clientX - this.comboCenterX;
        const dy = clientY - this.comboCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const hoverDeadZone = COMBO_SEG_RADIUS * 0.35;
        if (dist < hoverDeadZone) {
            this.setComboHover(-1);
            return;
        }

        // ── Proximity approach haptic: fire light tick as thumb enters the segment field ──
        // Gives a "magnetic field" feel before entering a segment (50% beyond dead zone is approach zone)
        const approachZone = COMBO_SEG_RADIUS * 0.7;
        if (dist < approachZone && this.comboHoveredSeg === -1) {
            this.haptics.fire('light');
        }

        // Angle from top, clockwise (0=top, 90=right, 180=bottom, 270=left)
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
        const n = Math.min(this.comboSegments.length, 6);
        const segSize = 360 / n;
        // In TRANCE tier, compensate for orbit rotation so angle maps to currently-rotated segments
        const orbitDeg = this.comboTier >= COMBO_TIER_TRANCE
            ? (this.tranceOrbitOffset * 180 / Math.PI) % 360
            : 0;
        const adjustedAngle = (angle - orbitDeg + 360) % 360;
        const segIdx = Math.floor(((adjustedAngle + segSize / 2) % 360) / segSize);
        this.setComboHover(segIdx < n ? segIdx : -1);
    }

    private setComboHover(idx: number): void {
        if (idx === this.comboHoveredSeg) return;
        // Remove old hover
        if (this.comboHoveredSeg >= 0 && this.comboHoveredSeg < this.comboSegEls.length) {
            const old = this.comboSegEls[this.comboHoveredSeg];
            old.classList.remove('ms3-combo-seg--hover');
            // Reset to circle position (includes TRANCE orbit offset)
            const n = Math.min(this.comboSegments.length, 6);
            const ang = ((this.comboHoveredSeg * 360 / n) - 90) * Math.PI / 180 + this.tranceOrbitOffset;
            const x = Math.cos(ang) * COMBO_SEG_RADIUS;
            const y = Math.sin(ang) * COMBO_SEG_RADIUS;
            old.style.transform = `translate(${x}px, ${y}px) scale(1)`;
        }
        this.comboHoveredSeg = idx;
        // Add new hover with scale-up (Persona 5 selection emphasis)
        if (idx >= 0 && idx < this.comboSegEls.length) {
            const el = this.comboSegEls[idx];
            el.classList.add('ms3-combo-seg--hover');
            const n = Math.min(this.comboSegments.length, 6);
            const ang = ((idx * 360 / n) - 90) * Math.PI / 180 + this.tranceOrbitOffset;
            const x = Math.cos(ang) * (COMBO_SEG_RADIUS + 6);
            const y = Math.sin(ang) * (COMBO_SEG_RADIUS + 6);
            el.style.transform = `translate(${x}px, ${y}px) scale(1.2)`;
            // Fix #5: cancel any pending label hide before showing
            if (this.comboLabelHideId !== null) { clearTimeout(this.comboLabelHideId); this.comboLabelHideId = null; }
            // Update label
            if (this.comboLabelEl && idx < this.comboSegments.length) {
                this.comboLabelEl.textContent = this.comboSegments[idx].label;
                this.comboLabelEl.style.opacity = '1';
            }
            this.haptics.fire('light');
        } else {
            // Fix #5: delay label hide 120ms to prevent flicker when sweeping between segments
            if (this.comboLabelHideId !== null) clearTimeout(this.comboLabelHideId);
            this.comboLabelHideId = setTimeout(() => {
                this.comboLabelHideId = null;
                if (this.comboHoveredSeg === -1 && this.comboLabelEl) {
                    this.comboLabelEl.style.opacity = '0';
                }
            }, 120);
        }
    }

    // ─── Combo decay timer ─────────────────────────────────

    private startComboDecay(): void {
        this.cancelComboDecay();
        const configuredMs = this.plugin.settings.comboWindowMs;
        const baseTimeout = typeof configuredMs === 'number' && configuredMs >= 250 ? configuredMs : COMBO_DECAY_MS;
        // Higher tiers get more time (TRANCE: +50%, FEVER: +25%)
        const tierBonus = this.comboTier >= COMBO_TIER_TRANCE ? 1.5
            : this.comboTier >= COMBO_TIER_FEVER ? 1.25 : 1.0;
        const timeout = this.comboState === 'chain'
            ? Math.round(COMBO_CHAIN_DECAY_MS * tierBonus)
            : Math.round(baseTimeout * tierBonus);
        this.comboDecayId = setTimeout(() => {
            this.breakCombo();
        }, timeout);
    }

    private cancelComboDecay(): void {
        if (this.comboDecayId !== null) {
            clearTimeout(this.comboDecayId);
            this.comboDecayId = null;
        }
    }

    // ═══ Zoom Bounce Animation ════════════════════════════════

    private startZoomBounce(intensity: number): void {
        this.cancelZoomBounce();
        if (!this.zoomEl) return;
        this.zoomBounceT = 0;
        this.zoomBounceAmp = intensity * 8;
        this.activateAnim('zoomBounce');
    }

    /** Zoom bounce tick — short spring bounce on zoom lane */
    private tickZoomBounce(_now: number): void {
        this.zoomBounceT += 16;
        if (this.zoomBounceT > 400 || !this.zoomEl) { this.cancelZoomBounce(); return; }
        const decay = Math.exp(-this.zoomBounceT / 120);
        const bounce = Math.sin(this.zoomBounceT / 40) * this.zoomBounceAmp * decay;
        this.zoomEl.style.transform = `translateY(${bounce}px)`;
    }

    private cancelZoomBounce(): void {
        this.deactivateAnim('zoomBounce');
    }

    // ═══ Search Panel ═════════════════════════════════════════

    openSearch(): void {
        if (!this.searchEl || !this.searchInputEl) return;
        this.isSearchOpen = true;
        this.searchEl.classList.add('ms3-search--open');
        this.searchInputEl.value = '';
        this.searchInputEl.focus();
        if (this.searchResultsEl) this.searchResultsEl.replaceChildren();

        // iOS keyboard fix: reposition search panel when virtual keyboard appears
        if (window.visualViewport) {
            // Issue #27: Clean up existing listeners before adding new ones (double-open guard)
            if (this.searchVvCleanup) {
                this.searchVvCleanup();
                this.searchVvCleanup = null;
            }
            const reposition = () => {
                if (!this.isSearchOpen || !this.searchEl) return;
                const vv = window.visualViewport!;
                const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
                if (keyboardHeight > 50) {
                    // Keyboard visible — move panel above keyboard instead of above pad
                    this.searchEl.style.bottom = `${keyboardHeight + 12}px`;
                } else {
                    this.searchEl.style.bottom = '';
                }
            };
            window.visualViewport.addEventListener('resize', reposition);
            window.visualViewport.addEventListener('scroll', reposition);
            // Store typed cleanup ref
            this.searchVvCleanup = () => {
                window.visualViewport?.removeEventListener('resize', reposition);
                window.visualViewport?.removeEventListener('scroll', reposition);
            };
            // Initial check
            reposition();
        }
    }

    closeSearch(): void {
        if (!this.searchEl) return;
        this.isSearchOpen = false;
        this.searchEl.classList.remove('ms3-search--open');
        if (this.searchInputEl) this.searchInputEl.blur();
        // iOS keyboard fix cleanup
        if (this.searchVvCleanup) {
            this.searchVvCleanup();
            this.searchVvCleanup = null;
        }
        if (this.searchEl) this.searchEl.style.bottom = '';
        if (this.searchDebounceId !== null) {
            clearTimeout(this.searchDebounceId);
            this.searchDebounceId = null;
        }
    }

    private onSearchInput(): void {
        // Debounce search to avoid O(n) scan on every keystroke
        if (this.searchDebounceId !== null) clearTimeout(this.searchDebounceId);
        this.searchDebounceId = setTimeout(() => {
            this.searchDebounceId = null;
            this.executeSearch();
        }, 80);
    }

    private executeSearch(): void {
        if (!this.searchInputEl || !this.searchResultsEl) return;
        const query = this.searchInputEl.value.toLowerCase().trim();
        this.searchResultsEl.replaceChildren();
        if (query.length === 0) return;

        // ── Cross-scope search: search ALL scope levels, not just current ──
        // Shows results grouped by scope badge so the user can find a word
        // even when browsing at the wrong granularity.
        // Clicking a result switches scope + navigates in one tap.
        type SearchHit = { scopeLevel: number; unitIdx: number; text: string };
        const hits: SearchHit[] = [];
        const MAX_HITS = 50;

        // Search current scope first (most relevant), then others
        const scopeOrder = [this.scopeLevel];
        for (let s = 0; s < SCOPE_COUNT; s++) {
            if (s !== this.scopeLevel) scopeOrder.push(s);
        }

        for (const s of scopeOrder) {
            if (hits.length >= MAX_HITS) break;
            const units = this.scopeEngine.getUnits(s);
            for (let i = 0; i < units.length && hits.length < MAX_HITS; i++) {
                const text = this.toDisplayText(units[i].text);
                if (text.toLowerCase().includes(query)) {
                    hits.push({ scopeLevel: s, unitIdx: i, text });
                }
            }
        }

        // Render hits with scope badge
        for (const hit of hits) {
            const row = document.createElement('div');
            row.className = 'ms3-search-result';
            const badge = hit.scopeLevel === this.scopeLevel
                ? '' : `[${SCOPE_BADGES[hit.scopeLevel]}] `;
            const display = hit.text.length > 38 ? hit.text.slice(0, 36) + '…' : hit.text;
            row.textContent = `${badge}${hit.unitIdx + 1}. ${display}`;
            if (hit.scopeLevel !== this.scopeLevel) {
                row.classList.add('ms3-search-result--other-scope');
            }
            const { scopeLevel, unitIdx } = hit;
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                // Push position stack before jumping (so user can go back)
                this.pushPositionStack();
                // Switch scope if needed
                if (scopeLevel !== this.scopeLevel) {
                    this.setScopeLevel(scopeLevel, scopeLevel > this.scopeLevel ? 1 : -1);
                }
                this.currentIndex = unitIdx;
                this.physics.setPosition('y', unitIdx * UNIT_STEP);
                this.selectCurrentUnit();
                this.closeSearch();
                this.haptics.fire('snap');
            });
            this.searchResultsEl.appendChild(row);
        }
        // Show empty state
        if (hits.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ms3-search-empty';
            empty.textContent = 'No results';
            this.searchResultsEl.appendChild(empty);
        }
    }

    // ═══ Command Picker ═══════════════════════════════════════

    private openCommandPicker(): void {
        this.closeActionPanel();
        // Use Obsidian's built-in command palette
        (this.plugin.app as any).commands.executeCommandById('command-palette:open');
    }

    private executeCustomCommand(commandId: string, targetIdx?: number): void {
        this.closeActionPanel();
        // CRITICAL: Set selection via CM dispatch for maximum compatibility.
        // Commander and other multi-action plugins read the CM selection state,
        // so we use dispatch() → rAF delay → executeCommandById() to ensure
        // the selection has been processed before external commands read it.
        const idx = targetIdx ?? this.getDisplayIndex();
        const fresh = this.getFreshUnit(idx);
        if (fresh) {
            const { unit, editor } = fresh;
            try {
                const cmView = this.getCmView(editor);
                if (cmView?.dispatch) {
                    cmView.dispatch({
                        selection: { anchor: unit.start, head: unit.end },
                        scrollIntoView: false
                    });
                } else {
                    const startPos = editor.offsetToPos(unit.start);
                    const endPos = editor.offsetToPos(unit.end);
                    editor.setSelection(startPos, endPos);
                }
            } catch (_) {
                const startPos = editor.offsetToPos(unit.start);
                const endPos = editor.offsetToPos(unit.end);
                editor.setSelection(startPos, endPos);
            }
        }
        // Delay command execution to next frame so CM processes the selection
        requestAnimationFrame(() => {
            try {
                (this.plugin.app as any).commands.executeCommandById(commandId);
                this.triggerZoomActionAnim('command');
                this.haptics.fire('success');
            } catch (_) {
                new Notice(`Command not found: ${commandId}`);
            }
        });
    }

    // ═══ Scope Graduation — Pinch-to-Zoom JP Game Scope ══════════

    private onPinchScope(scale: number, _cx: number, _cy: number): void {
        if (!this.isVisible) return;
        if (this.comboState !== 'idle') return;

        if (!this.wasPinching) {
            this.scopePinchBase = 1;
            this.wasPinching = true;
        }

        const delta = scale / this.scopePinchBase;

        // Pinch out → expand scope (bigger units)
        if (delta > 1.5 && this.scopeLevel < SCOPE_COUNT - 1) {
            this.setScopeLevel(this.scopeLevel + 1, 1);
            this.scopePinchBase = scale;
        }
        // Pinch in → narrow scope (smaller units)
        else if (delta < 0.65 && this.scopeLevel > 0) {
            this.setScopeLevel(this.scopeLevel - 1, -1);
            this.scopePinchBase = scale;
        }
    }

    private onPinchScopeEnd(): void {
        this.wasPinching = false;
    }

    private setScopeLevel(newLevel: number, direction: number = 0): void {
        if (newLevel < 0 || newLevel >= SCOPE_COUNT) return;
        if (newLevel === this.scopeLevel) return;

        // Preserve position in document
        const currentUnit = this.units[this.currentIndex];
        const offset = currentUnit ? currentUnit.start : 0;

        this.scopeLevel = newLevel;
        // Persist preferred scope level so re-opening the scroller starts at the same granularity
        try { localStorage.setItem('ms3-scope-level', String(newLevel)); } catch { /* noop */ }
        // Improvement #3: Remember scope level for chunk focus re-entry
        if (this.chunkMode === 'focused') {
            this.chunkFocusScopeLevel = newLevel;
        }
        this.units = this.scopeEngine.getUnits(newLevel);

        if (this.units.length === 0) return;

        // Map to corresponding unit at new scope level (defensive clamp)
        this.currentIndex = Math.min(this.scopeEngine.findUnitAt(newLevel, offset), this.units.length - 1);

        // Update physics snap grid
        const yPositions = this.units.map((_, i) => i * UNIT_STEP);
        this.physics.setSnapPositions('y', yPositions);
        this.physics.setBounds('y', 0, Math.max(0, (this.units.length - 1) * UNIT_STEP));
        this.physics.setPosition('y', this.currentIndex * UNIT_STEP);

        // ── JP Game Scope Transition ──
        this.updateScopeBadge(true);

        // Zoom lane: horizontal slide reform
        if (this.zoomEl) {
            this.zoomEl.style.setProperty('--ms3-scope-dir', `${direction * 30}px`);
            this.zoomEl.classList.remove('ms3-zoom--scope-change');
            void this.zoomEl.offsetWidth;
            this.zoomEl.classList.add('ms3-zoom--scope-change');
            this.zoomEl.addEventListener('animationend', () => {
                this.zoomEl?.classList.remove('ms3-zoom--scope-change');
            }, { once: true });
            this.zoomEl.dataset.scope = String(newLevel);
        }

        // Ball: brief scope-color flash
        if (this.ballEl) {
            this.ballEl.style.boxShadow = `0 0 16px ${SCOPE_COLORS[newLevel]}90`;
            setTimeout(() => {
                if (this.ballEl) this.ballEl.style.boxShadow = '';
            }, 400);
        }

        this.lastDisplayIndex = -1;
        this.lateralOffset = 0;
        this.dragNavAccumulatorY = 0;  // clear old-scope residue
        this.circularAccum = 0;        // prevent circular boost carrying across scopes
        this.updateHighlight();
        this.updateCounter();
        this.updateZoomLane();
        // ── SCOPE DETENT FEEL (#26) — distinct haptic per scope level ──
        // Like a rotary dial clicking into position. Higher = heavier.
        const detentHaptics: Array<'tick' | 'snap' | 'impact' | 'zoom'> = ['tick', 'snap', 'impact', 'zoom'];
        this.haptics.fire(detentHaptics[Math.min(newLevel, 3)]);
        // Second pulse for higher scopes (physical weight)
        if (newLevel >= 2) {
            setTimeout(() => this.haptics.fire('tick'), 30);
        }
    }

    private updateScopeBadge(animate = false): void {
        if (!this.scopeBadgeEl) return;
        const level = this.scopeLevel;
        this.scopeBadgeEl.textContent = SCOPE_BADGES[level];
        this.scopeBadgeEl.style.background = SCOPE_COLORS[level];
        this.scopeBadgeEl.style.boxShadow = `0 0 10px ${SCOPE_COLORS[level]}60`;

        // Chunk hint: when at max scope AND chunks exist, show "→区" hint on badge
        // so the user knows swiping right once more enters chunk mode
        if (level === SCOPE_COUNT - 1 && this.chunkMode === 'off' && this.chunks.length > 0) {
            this.scopeBadgeEl.textContent = SCOPE_BADGES[level] + '→区';
        }

        if (animate) {
            this.scopeBadgeEl.classList.remove('ms3-scope-badge--changing');
            void this.scopeBadgeEl.offsetWidth;
            this.scopeBadgeEl.classList.add('ms3-scope-badge--changing');
            this.scopeBadgeEl.addEventListener('animationend', () => {
                this.scopeBadgeEl?.classList.remove('ms3-scope-badge--changing');
            }, { once: true });
        }
    }

    // ═══ Public API ═══════════════════════════════════════════

    goToSentence(index: number): void {
        if (index < 0 || index >= this.units.length) return;
        this.physics.snapToIndex('y', index);
    }

    next(): void {
        this.physics.snapToIndex('y', Math.min(this.currentIndex + 1, this.units.length - 1));
    }

    prev(): void {
        this.physics.snapToIndex('y', Math.max(this.currentIndex - 1, 0));
    }

    getCurrentIndex(): number { return this.currentIndex; }
    getSentenceCount(): number { return this.units.length; }

    rebuildSentences(): void { this.rebuildUnits(); }

    // ═══ Extend-Selection System — "光線" (Beam) Selection  ═══════════
    // 弾幕 Danmaku Cursor:
    //   Direct proportional float movement — no accumulator, no momentum.
    //   Boundaries are haptic bumps (information, not control).
    //   Mikiri slam = optional snap to nearest boundary.
    //   Power curve: slow = precise, fast = covers ground.

    private startExtendSelection(): void {
        if (this.currentIndex < 0 || this.currentIndex >= this.units.length) return;
        const unit = this.units[this.currentIndex];
        if (!unit) return;

        this.extendMode = 'extending';
        // S-4: Clear residual scope swipe accumulator from pre-extend drag
        this.scopeSwipeAccum = 0;
        // Start with the current unit fully selected — anchor at start, head at end.
        // This gives immediate visual feedback and avoids the "dead zone" feeling
        // where first drag pixels seem to do nothing.
        this.extendAnchorOffset = unit.start;
        this.extendHeadOffset = unit.end;
        this.extendHeadF = unit.end;
        this.extendAnchorF = unit.start;
        this.extendLevel = Math.min(4, this.scopeLevel + 1);
        this.extendLastSnapScope = -1;
        this.extendBeamPhase = 0;
        this.extendLastDx = 0;
        this.extendLastDy = 0;
        this.extendPlainCharSteps = 0;
        this.extendLastMikiriAt = 0;
        this.extendLastBoundaryHapticAt = 0;
        this.extendLastTapAt = 0;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        this.extendCachedContent = view ? view.editor.getValue() : null;

        // Enable smooth overlay transitions during extend (Nier pod laser feel)
        if (this.highlightOverlayEl) {
            this.highlightOverlayEl.style.transition =
                'top 50ms ease-out, left 50ms ease-out, width 70ms ease-out, height 70ms ease-out';
        }

        // Show extend badge and beam overlay
        this.updateExtendBadge();
        this.showBeamOverlay();

        // ── 三味線 SHAMISEN PLUCK: decisive twang on extend entry ──
        // Ball pulses with extend glow, beam snaps outward then settles
        if (this.ballEl) {
            this.ballEl.classList.add('ms3-ball--extending');
        }
        if (this.beamOverlayEl) {
            this.beamOverlayEl.classList.add('ms3-beam--pluck');
            setTimeout(() => this.beamOverlayEl?.classList.remove('ms3-beam--pluck'), 300);
        }

        // Set initial selection
        this.applyExtendSelection();
        // Attach left-zone parallel scroll and show context hint
        this.attachExtendScrollZone();
        this.showExtendHint();
        // ── Sayonara Wild Hearts mode flash ──
        this.showModeFlash('拡張');
        // Fire pluck: two rapid haptics = twang (zoom + snap in quick succession)
        this.haptics.fire('zoom');
        setTimeout(() => this.haptics.fire('snap'), 40);
    }

    private stopExtendSelection(): void {
        if (this.extendMode === 'off') return;
        this.extendMode = 'off';
        this.extendLastSnapScope = -1;
        this.extendCachedContent = null;
        this.extendPlainCharSteps = 0;
        this.extendLastMikiriAt = 0;
        this.detachExtendScrollZone();
        this.hideExtendHint();
        if (this.extendBadgeEl) this.extendBadgeEl.style.display = 'none';
        // ── Smooth extend exit: beam fades out over 150ms, ball morphs color ──
        // Sekiro mikiri counter feel: hold the result briefly before returning to idle.
        if (this.beamOverlayEl) {
            this.beamOverlayEl.style.transition = 'opacity 0.15s ease-out';
            this.beamOverlayEl.style.opacity = '0';
            setTimeout(() => this.hideBeamOverlay(), 160);
        }
        // Ball color transitions smoothly back to gold (CSS transition already 0.2s)
        if (this.ballEl) this.ballEl.classList.remove('ms3-ball--extending');
        // Highlight overlay: flash-pulse once to confirm selection stuck, then restore
        if (this.highlightOverlayEl) {
            this.highlightOverlayEl.classList.add('ms3-hl-extend-seal');
            setTimeout(() => {
                this.highlightOverlayEl?.classList.remove('ms3-hl-extend-seal', 'ms3-highlight-overlay--extend');
                if (this.highlightOverlayEl) this.highlightOverlayEl.style.transition = '';
            }, 200);
        }
    }

    /**
     * 見切り Mikiri Snap — decisive precision commit.
     *
     * Snaps the extend head to the nearest scope boundary (highest scope wins)
     * and STAYS in extend mode. Like Sekiro mikiri counter: step into it.
     *
     * Use case: you're flowing forward, overshoot slightly.
     * Tap or vertical slam = head snaps to the nearest meaningful edge.
     * Now you have char precision to nudge ±1 from there.
     */
    private mikiriSnap(): void {
        if (this.extendMode !== 'extending') return;
        const content = this.extendCachedContent;
        if (content == null) return;

        const head = this.extendHeadOffset;
        const anchor = this.extendAnchorOffset;
        const selMin = Math.min(anchor, head);
        const selMax = Math.max(anchor, head);
        let bestSnap = head;
        let bestScope = -1;
        let bestDist = Infinity;

        // Check all scopes — highest scope boundary within range wins
        for (let scope = SCOPE_COUNT - 1; scope >= 0; scope--) {
            const units = this.scopeEngine.getUnits(scope);
            if (units.length === 0) continue;

            const idx = this.scopeEngine.findUnitAt(scope, head);
            if (idx < 0 || idx >= units.length) continue;

            // Check nearby unit edges (start/end of current + neighbors)
            const checkFrom = Math.max(0, idx - 1);
            const checkTo = Math.min(units.length - 1, idx + 1);

            for (let i = checkFrom; i <= checkTo; i++) {
                for (const edge of [units[i].start, units[i].end]) {
                    if (edge < 0 || edge > content.length) continue;
                    // Don't snap inside the selection (keep it at least as big)
                    if (edge > selMin && edge < selMax) continue;
                    const dist = Math.abs(edge - head);
                    // Higher scope always wins. On same scope, closer wins.
                    if (scope > bestScope || (scope === bestScope && dist < bestDist)) {
                        bestSnap = edge;
                        bestScope = scope;
                        bestDist = dist;
                    }
                }
            }
            // If we found something at this scope, don't check lower scopes
            if (bestScope === scope) break;
        }

        // Apply the snap — always move the HEAD (the floating end you control).
        // Anchor stays fixed: it's the reference point of the selection.
        this.extendHeadOffset = bestSnap;
        // Sync float head to integer snap position
        this.extendHeadF = this.extendHeadOffset;
        this.extendPlainCharSteps = 0;
        this.extendLevel = bestScope >= 0 ? bestScope + 1 : 0;
        this.updateExtendBadge();
        this.applyExtendSelection();
        this.updateBeamPosition();
        if (content) this.updateExtendZoomPreview(content);

        // Decisive haptic: scope-weighted impact
        if (bestScope >= 2) {
            this.haptics.fire('impact');  // clause/sentence = heavy
        } else {
            this.haptics.fire('snap');    // bunsetsu/ren = crisp
        }
    }

    /** Show the beam overlay element for extend mode visualization */
    private showBeamOverlay(): void {
        if (!this.beamOverlayEl) {
            const el = document.createElement('div');
            el.className = 'ms3-beam-overlay';
            document.body.appendChild(el);
            this.beamOverlayEl = el;
        }
        this.beamOverlayEl.style.display = 'block';
        this.beamOverlayEl.classList.add('ms3-beam--active');
    }

    private hideBeamOverlay(): void {
        if (this.beamOverlayEl) {
            this.beamOverlayEl.classList.remove('ms3-beam--active');
            this.beamOverlayEl.style.display = 'none';
        }
    }

    /** Update beam overlay position to track the extend head in the editor */
    private updateBeamPosition(): void {
        if (!this.beamOverlayEl) return;
        const view = this.getView();
        if (!view) return;
        const cmView = this.getCmView(view.editor);
        if (!cmView) return;
        try {
            const start = Math.min(this.extendAnchorOffset, this.extendHeadOffset);
            const end = Math.max(this.extendAnchorOffset, this.extendHeadOffset);
            const headCoords = cmView.coordsAtPos(end, -1);
            const anchorCoords = cmView.coordsAtPos(start, 1);
            if (headCoords && anchorCoords) {
                const el = this.beamOverlayEl;
                // Beam at the extend head — vertical indicator line
                const beamX = this.extendHeadOffset >= this.extendAnchorOffset
                    ? (headCoords.right || headCoords.left)
                    : headCoords.left;
                const beamTop = Math.min(headCoords.top, anchorCoords.top);
                const beamBottom = Math.max(headCoords.bottom, anchorCoords.bottom);
                el.style.left = `${beamX - 2}px`;
                el.style.top = `${beamTop}px`;
                el.style.height = `${Math.max(20, beamBottom - beamTop)}px`;
                // Beam direction indicator (#9): arrow shows extend direction
                const isForward = this.extendHeadOffset >= this.extendAnchorOffset;
                el.classList.toggle('ms3-beam--forward', isForward);
                el.classList.toggle('ms3-beam--backward', !isForward);
                // Phase-based glow intensity (sinusoidal pulse)
                const glowIntensity = 0.6 + Math.sin(this.extendBeamPhase) * 0.3;
                const levelColors = ['#4fc3f7', '#a78bfa', '#c084fc', '#f59e0b', '#ef4444'];
                el.style.setProperty('--beam-color', levelColors[Math.min(this.extendLevel, 4)]);
                el.style.setProperty('--beam-glow', String(glowIntensity));
            }
        } catch (_) {}
    }

    /**
     * 弾幕 Danmaku Cursor — Direct Proportional Selection.
     *
     * THE PRINCIPLE: INFORMATION, NOT CONTROL.
     *
     * In Touhou bullet-hell, you navigate freely through dense patterns.
     * Bullets graze your hitbox — you FEEL them pass — but nothing grabs you.
     * Your movement is 100% yours. The field gives you information
     * (graze sound, graze visual), never overrides your trajectory.
     *
     * Applied to text selection:
     *   - Your thumb controls a floating-point head position.
     *   - Each pixel of drag maps directly to character advancement (power curve).
     *   - Slow drag = sub-character precision. Fast drag = covers ground.
     *   - Linguistic boundaries fire scope-weighted haptic ticks as you cross them.
     *     You FEEL the text structure. But it never moves your cursor.
     *   - Mikiri slam (vertical flick) = OPTIONAL decisive snap to boundary.
     *   - No accumulator. No momentum. No streak. No forced jumps.
     *   - Anchor stays fixed. Head floats freely in both directions.
     *
     * Why this feels smooth:
     *   - Zero layers of indirection between thumb and selection.
     *   - Power curve gives natural slow→fast without mode switching.
     *   - No quantization stutter (float position, integer selection).
     *   - Boundaries are bumps on the road, not walls.
     */
    private updateExtendFromDrag(dx: number, dy: number, speed: number): void {
        if (this.extendMode !== 'extending') return;
        // Refresh cached content if it's grown stale (editor modified during long extend)
        const view0 = this.getView();
        if (!this.extendCachedContent && view0) this.extendCachedContent = view0.editor.getValue();
        const content = this.extendCachedContent;
        if (content == null) return;

        // Mikiri slam: VERY fast vertical flick snaps head to nearest linguistic boundary.
        // Raised thresholds prevent accidental trigger during normal extend + scroll combos.
        // Must be a decisive, sharp, isolated vertical spike — not just scrolling fast.
        if (Math.abs(dy) > 38 && speed > 40 && Math.abs(dy) > Math.abs(dx) * 5
            && Math.abs(dy) > Math.abs(this.extendLastDy) * 1.8) {
            const now = performance.now();
            if (now - this.extendLastMikiriAt > 500) {
                this.extendLastMikiriAt = now;
                this.mikiriSnap();
                return;
            }
        }

        // SIMPLIFIED: No angular decomposition — angular noise was causing "selection seems off."
        // Pure horizontal dx drives extend head. Vertical dy is already handled
        // as scroll-extend bridge above. Clean signal, clean result.
        this.extendLastDx = dx;
        this.extendLastDy = dy;
        const effectiveDx = dx; // pure, no angular pollution

        this.extendBeamPhase = (this.extendBeamPhase + speed * 0.08) % (2 * Math.PI);

        // Dead zone — wider to prevent micro-jitter from stealing characters
        if (Math.abs(effectiveDx) < 0.5) return;

        // Smooth power curve: concave (square-root-ish) — responsive at low speeds,
        // gracefully fast at high speeds with no hard wall.
        // Omnidirectional: horizontal dominates, vertical adds 30% for diagonal feel (SDVX knob).
        // mag=1→≈0.5char, mag=5→≈2chars, mag=10→≈3.5chars, mag=30→≈8chars, mag=80→≈20chars
        const sign = effectiveDx >= 0 ? 1 : -1;
        const baseMag = Math.abs(effectiveDx);
        const omniMag = baseMag + Math.abs(dy) * 0.3;
        const advance = sign * Math.min(Math.pow(omniMag, 0.60) * 0.70, 30);

        // Simple head-follows-drag: anchor is fixed at the position extend was started.
        // HEAD always moves in the direction of drag — no rubber-band, no walls.
        // Drag right → head moves right (selection grows rightward past anchor, or retracts leftward).
        // Drag left  → head moves left  (selection grows leftward past anchor, or retracts rightward).
        // Selection naturally reverses direction when head crosses the anchor. No "retracting first."
        const prevHead = this.extendHeadOffset;
        this.extendHeadF = Math.max(0, Math.min(content.length, this.extendHeadF + advance));
        let newHead = Math.round(this.extendHeadF);
        if (newHead > 0 && newHead < content.length) {
            const code = content.charCodeAt(newHead);
            if (code >= 0xDC00 && code <= 0xDFFF) newHead--;
            else if (code >= 0xD800 && code <= 0xDBFF) newHead++;
        }
        if (newHead !== prevHead) {
            this.extendHeadOffset = newHead;
            if (newHead <= 0 || newHead >= content.length) this.haptics.fire('tick');
            this.detectBoundaryCrossings(content, prevHead, newHead);
            this.applyExtendSelection();
            this.updateBeamPosition();
            this.updateExtendZoomPreview(content);
            this.autoScrollExtendEdge();
        }
    }

    /** Edge auto-scroll during extend: keeps selection head visible.
     *  Fix I-3: account for pad height in bottom threshold. */
    private autoScrollExtendEdge(): void {
        const view = this.getView();
        if (!view) return;
        const cmView = this.getCmView(view.editor);
        if (!cmView) return;
        try {
            const headCoords = cmView.coordsAtPos(this.extendHeadOffset, -1);
            if (!headCoords) return;
            const vh = window.innerHeight;
            const padHeight = this.getPadSizePx() + this.getBottomOffsetPx();
            const EDGE_TOP = vh * 0.18;
            const bot = vh - Math.max(vh * 0.18, padHeight + 16);
            let scroll = 0;
            if (headCoords.bottom > bot) {
                scroll = Math.round(((headCoords.bottom - bot) / EDGE_TOP) * 14);
            } else if (headCoords.top < EDGE_TOP) {
                scroll = -Math.round(((EDGE_TOP - headCoords.top) / EDGE_TOP) * 14);
            }
            if (scroll !== 0) cmView.scrollDOM.scrollTop += scroll;
        } catch (_) {}
    }

    /**
     * Left-zone parallel scroll: second finger on the left 42% of screen
     * independently scrolls the document while the right pad controls selection.
     * Enables: left thumb scrolls to reveal offscreen text while right thumb
     * advances the selection head — the key to selecting across paragraph breaks.
     */
    private attachExtendScrollZone(): void {
        if (this.extendLeftZoneListener) return;
        // Show left-zone visual indicator
        if (!document.querySelector('.ms3-extend-lz')) {
            const lz = document.createElement('div');
            lz.className = 'ms3-extend-lz';
            document.body.appendChild(lz);
        }
        requestAnimationFrame(() => document.querySelector('.ms3-extend-lz')?.classList.add('ms3-extend-lz--active'));
        const onStart = (e: TouchEvent) => {
            if (this.extendMode !== 'extending') { this.detachExtendScrollZone(); return; }
            const t = e.changedTouches[0];
            if (!t || t.clientX > window.innerWidth * 0.42) return;
            if (this.extendScrollZoneT !== null) return; // already tracking one touch
            e.preventDefault();
            this.extendScrollZoneT = { id: t.identifier, lastY: t.clientY };
            const onMove = (me: TouchEvent) => {
                if (!this.extendScrollZoneT) return;
                for (let i = 0; i < me.changedTouches.length; i++) {
                    if (me.changedTouches[i].identifier !== this.extendScrollZoneT.id) continue;
                    me.preventDefault();
                    const dy = me.changedTouches[i].clientY - this.extendScrollZoneT.lastY;
                    this.extendScrollZoneT.lastY = me.changedTouches[i].clientY;
                    const v = this.getView();
                    if (v) { const cv = this.getCmView(v.editor); if (cv) cv.scrollDOM.scrollTop += dy * 2.0; }
                }
            };
            const cleanup = () => {
                this.extendScrollZoneT = null;
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
                document.removeEventListener('touchcancel', onCancel);
            };
            const onEnd = (ee: TouchEvent) => {
                if (!this.extendScrollZoneT) return;
                for (let i = 0; i < ee.changedTouches.length; i++) {
                    if (ee.changedTouches[i].identifier === this.extendScrollZoneT.id) {
                        cleanup();
                        break;
                    }
                }
            };
            const onCancel = () => { cleanup(); };
            document.addEventListener('touchmove', onMove, { passive: false } as AddEventListenerOptions);
            document.addEventListener('touchend', onEnd, { passive: true } as AddEventListenerOptions);
            document.addEventListener('touchcancel', onCancel, { passive: true } as AddEventListenerOptions);
        };
        this.extendLeftZoneListener = onStart;
        document.addEventListener('touchstart', onStart, { passive: false } as AddEventListenerOptions);
    }

    private detachExtendScrollZone(): void {
        if (this.extendLeftZoneListener) {
            document.removeEventListener('touchstart', this.extendLeftZoneListener);
            this.extendLeftZoneListener = null;
        }
        this.extendScrollZoneT = null;
        // Remove left-zone visual indicator from DOM (avoid leak)
        const lz = document.querySelector('.ms3-extend-lz');
        if (lz) lz.remove();
    }

    /** Brief context hint near extend badge: shows available gestures in extend mode. */
    private showExtendHint(): void {
        this.hideExtendHint();
        const el = document.createElement('div');
        el.className = 'ms3-extend-hint';
        el.innerHTML = '<span>↔ select</span><span>↕ scroll</span><span>◁ left finger scrolls</span><span>↑↓ flick: snap</span>';
        document.body.appendChild(el);
        this.extendHintEl = el;
        this.extendHintTimeoutId = setTimeout(() => this.hideExtendHint(), 4000);
    }

    private hideExtendHint(): void {
        if (this.extendHintTimeoutId !== null) { clearTimeout(this.extendHintTimeoutId); this.extendHintTimeoutId = null; }
        if (this.extendHintEl) { this.extendHintEl.remove(); this.extendHintEl = null; }
    }

    /** Update zoom lane during extend to show the selected text range */
    private updateExtendZoomPreview(content: string): void {
        if (!this.zoomCurrentEl || !this.zoomPrevEl || !this.zoomNextEl) return;
        const start = Math.min(this.extendAnchorOffset, this.extendHeadOffset);
        const end = Math.max(this.extendAnchorOffset, this.extendHeadOffset);
        // Limit slice to display needs (avoid allocating huge strings for long selections)
        // Improvement #7: Clean display text FIRST, then truncate (avoids broken == markers)
        const selectedRaw = content.slice(start, Math.min(end, start + 120));
        const selected = this.toDisplayText(selectedRaw);
        const truncated = selected.length > 60 ? selected.slice(0, 58) + '…' : selected;
        const currDisplay = `◉ ${truncated}`;
        if (this.zoomCurrentEl.textContent !== currDisplay) {
            this.zoomCurrentEl.textContent = currDisplay;
        }
        // Context before/after the selection
        const beforeText = this.toDisplayText(content.slice(Math.max(0, start - 50), start));
        const afterText = this.toDisplayText(content.slice(end, Math.min(content.length, end + 50)));
        if (this.zoomPrevEl.textContent !== beforeText) this.zoomPrevEl.textContent = beforeText;
        if (this.zoomNextEl.textContent !== afterText) this.zoomNextEl.textContent = afterText;
    }

    /** Detect linguistic boundary crossings between prevHead and newHead.
     *  Fires scope-weighted haptic (information, not control) and updates badge.
     *  Highest-scope boundary crossed wins.
     */

    private detectBoundaryCrossings(_content: string, prevHead: number, newHead: number): void {
        const from = Math.min(prevHead, newHead);
        const to = Math.max(prevHead, newHead);
        let highestCrossedScope = -1;

        for (let scope = SCOPE_COUNT - 1; scope >= 0; scope--) {
            const units = this.scopeEngine.getUnits(scope);
            if (units.length === 0) continue;
            // Search from the unit containing 'from' to the unit containing 'to'
            // to avoid missing boundaries when advance > 1 char/frame
            const idxFrom = this.scopeEngine.findUnitAt(scope, from);
            const idxTo = this.scopeEngine.findUnitAt(scope, to);
            if (idxFrom < 0 && idxTo < 0) continue;
            const checkFrom = Math.max(0, Math.min(idxFrom, idxTo) - 1);
            const checkTo = Math.min(units.length - 1, Math.max(idxFrom, idxTo) + 1);
            for (let i = checkFrom; i <= checkTo; i++) {
                for (const edge of [units[i].start, units[i].end]) {
                    if (edge > from && edge <= to && scope > highestCrossedScope) {
                        highestCrossedScope = scope;
                    }
                }
            }
            if (highestCrossedScope === scope) break; // found at this scope, skip lower
        }

        if (highestCrossedScope >= 0) {
            // Throttle haptics: max ~25/sec to avoid vibration motor feel
            const now = performance.now();
            if (now - this.extendLastBoundaryHapticAt >= 40) {
                this.extendLastBoundaryHapticAt = now;
                const hapticMap = ['tick', 'tick', 'snap', 'impact'] as const;
                this.haptics.fire(hapticMap[Math.min(highestCrossedScope, 3)]);
            }
            const newLevel = highestCrossedScope + 1;
            if (newLevel !== this.extendLevel) {
                this.extendLevel = newLevel;
                this.updateExtendBadge();
            }
            this.extendPlainCharSteps = 0;
        } else {
            this.extendPlainCharSteps++;
            // Decay threshold scales with last scope level: higher boundary = stickier badge
            const decayThreshold = this.extendLevel <= 1 ? 5 : this.extendLevel <= 3 ? 10 : 15;
            if (this.extendPlainCharSteps >= decayThreshold && this.extendLevel > 0) {
                this.extendLevel = 0;
                this.updateExtendBadge();
            }
        }
    }

    /** Apply the current extend selection to the editor. */
    private applyExtendSelection(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const start = Math.min(this.extendAnchorOffset, this.extendHeadOffset);
        const end = Math.max(this.extendAnchorOffset, this.extendHeadOffset);
        // Track the moving end (head or anchor depending on extend direction)
        const movingEnd = this.extendHeadOffset >= this.extendAnchorOffset
            ? this.extendHeadOffset : this.extendAnchorOffset;

        // Set selection. Use scrollIntoView only when the moving end is near viewport edges
        // to avoid janky scroll on every char-level step.
        try {
            const cmView = this.getCmView(view.editor);
            if (cmView?.dispatch) {
                // Check if MOVING END is near viewport edge (top/bottom 15%)
                // Suppress during active drag — scroll-extend bridge handles it (#3 fix)
                let needsScroll = false;
                if (!this.isDragging) {
                    const headCoords = cmView.coordsAtPos(movingEnd, -1);
                    if (headCoords) {
                        const vh = window.innerHeight;
                        needsScroll = headCoords.top < vh * 0.15 || headCoords.bottom > vh * 0.85;
                    }
                }
                // Clamp to document bounds before dispatch — prevents RangeError on stale offsets
                const docLen = cmView.state?.doc?.length ?? 0;
                const safeAnchor = Math.max(0, Math.min(docLen, this.extendAnchorOffset));
                const safeHead = Math.max(0, Math.min(docLen, this.extendHeadOffset));
                // Dispatch with actual anchor/head so cursor tracks the extend direction
                cmView.dispatch({
                    selection: { anchor: safeAnchor, head: safeHead },
                    scrollIntoView: needsScroll
                });
            } else {
                const startPos = view.editor.offsetToPos(start);
                const endPos = view.editor.offsetToPos(end);
                view.editor.setSelection(startPos, endPos);
            }
        } catch (_) {
            const startPos = view.editor.offsetToPos(start);
            const endPos = view.editor.offsetToPos(end);
            view.editor.setSelection(startPos, endPos);
        }

        // Update overlay — per-line segments so it shows the actual selected text shape
        const cmViewOverlay = this.getCmView(view.editor);
        if (cmViewOverlay) this.renderHighlightSegments(cmViewOverlay, start, end, true);
    }

    private updateExtendBadge(): void {
        if (!this.extendBadgeEl) return;
        const colors = ['#4fc3f7', '#a78bfa', '#c084fc', '#f59e0b', '#ef4444'];
        const levelNames = ['字', '節', '連', '句', '文'];
        // Show character count alongside scope name: "47字 句" = 47 chars at clause level
        const charCount = Math.abs(this.extendHeadOffset - this.extendAnchorOffset);
        const scopeName = levelNames[this.extendLevel];
        this.extendBadgeEl.textContent = charCount > 0
            ? `${charCount}${scopeName}`
            : scopeName;
        this.extendBadgeEl.style.background = colors[this.extendLevel];
        this.extendBadgeEl.style.display = 'flex';
    }

    // ═══ Maker Mode — マリオメーカー × 墨 Sumi Brush ═══════════════════
    //
    // JP DESIGN INSPIRATION:
    //   - Super Mario Maker: horizontal drag = place/remove blocks. Each unit
    //     is a "block" you stamp. Precise, tactile, immediate visual feedback.
    //   - Okami 大神: brush strokes = angle-based gesture actions. Flick at
    //     specific angles to trigger bold/highlight/copy/undo. No menus.
    //   - Taiko no Tatsujin: BAN BAN BA! Each stamp lands with rhythmic precision.
    //     The haptic on each unit placement = drum hit.
    //   - Splatoon: paint territory. Stamped selections are your "ink" — visible,
    //     persistent, and you act on them later (individually or in bulk).
    //
    // TWO-THUMB SETUP:
    //   - Right thumb on trackball: horizontal drag = advance/retreat through units
    //   - Left thumb (touch anywhere on left 40% of screen): precise vertical scroll
    //   - Tap trackball = stamp current unit (add to batch)
    //   - Angle flick from trackball = gesture action on current/batch
    //
    // ACTIONS (angle-based, Okami brush style):
    //   Up-flick (270°±30°) = Bold current selection
    //   Down-flick (90°±30°) = Highlight current selection
    //   Right-flick (0°±30°) = Copy (single or batch)
    //   Left-flick (180°±30°) = Undo last stamp
    //   Up-right (315°±30°) = Cloze
    //   Down-right (45°±30°) = Spoiler
    //   Up-left (225°±30°) = Batch action (apply last gesture to ALL stamps)
    //   Down-left (135°±30°) = Exit Maker Mode

    private enterMakerMode(): void {
        if (this.makerMode) return;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        this.makerMode = true;
        this.makerSelections = [];
        this.makerCachedContent = view.editor.getValue();
        this.makerPreciseScrollAccum = 0;
        this.makerIsGesturing = false;

        // Start at current unit — anchor at start, cursor at end
        const unit = this.units[this.currentIndex];
        if (unit) {
            this.makerAnchor = unit.start;
            this.makerCursor = unit.end;
            this.makerCurrentStart = unit.start;
            this.makerCurrentEnd = unit.end;
            this.makerUnitIndex = this.currentIndex;
            this.makerBrushAccum = 0;
        }

        // Show maker badge
        if (!this.makerBadgeEl && this.containerEl) {
            this.makerBadgeEl = document.createElement('div');
            this.makerBadgeEl.className = 'ms3-maker-badge';
            this.containerEl.appendChild(this.makerBadgeEl);
        }
        if (this.makerBadgeEl) {
            this.makerBadgeEl.textContent = '筆';
            this.makerBadgeEl.style.display = 'flex';
        }

        // Show maker panel
        this.showMakerPanel();

        // Ball visual — maker glow
        if (this.ballEl) this.ballEl.classList.add('ms3-ball--maker');

        // Apply initial selection highlight
        this.applyMakerHighlight();
        this.showModeFlash('筆');

        // Re-render stamp overlays on editor scroll (rAF-throttled — Fix S-7b)
        const scrollDom = (view.editor as any)?.cm?.scrollDOM as HTMLElement | undefined;
        if (scrollDom) {
            let rafPending = false;
            this.makerScrollListener = () => {
                if (rafPending) return;
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    this.renderMakerStamps();
                });
            };
            scrollDom.addEventListener('scroll', this.makerScrollListener, { passive: true });
            this.makerScrollDom = scrollDom; // Fix B-11: store for reliable detach
        }

        this.haptics.fire('zoom');
        setTimeout(() => this.haptics.fire('snap'), 50);
    }

    private exitMakerMode(): void {
        if (!this.makerMode) return;
        this.makerMode = false;

        // Remove scroll listener before clearing stamps
        if (this.makerScrollListener) {
            // Fix B-11: use stored scrollDOM ref instead of current active view
            if (this.makerScrollDom) {
                this.makerScrollDom.removeEventListener('scroll', this.makerScrollListener);
                this.makerScrollDom = null;
            }
            this.makerScrollListener = null;
        }

        this.clearMakerStamps();
        this.makerSelections = [];
        this.makerCachedContent = null;
        if (this.makerBadgeEl) this.makerBadgeEl.style.display = 'none';
        if (this.makerPanelEl) { this.makerPanelEl.remove(); this.makerPanelEl = null; }
        if (this.ballEl) this.ballEl.classList.remove('ms3-ball--maker');
        this.haptics.fire('impact');
    }

    /** 書道 Shodō Brush: horizontal drag flows selection character-by-character.
     *  Right = extend forward, left = retract (or extend backward past anchor).
     *  The selection FLOWS like ink — smooth, continuous, controlled. */
    private updateMakerFromDrag(dx: number, dy: number, speed: number): void {
        if (!this.makerMode) return;

        // Dead zone for jitter
        if (Math.abs(dx) < 1.0 && Math.abs(dy) < 1.0) return;

        // Get editor content for character-level brush
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;
        // Re-cache when external edit cleared the cache (avoid getValue() every frame)
        if (!this.makerCachedContent) this.makerCachedContent = editor.getValue();
        const content = this.makerCachedContent;

        // ── BRUSH FLOW: accumulate horizontal movement, step per character ──
        // Use horizontal speed (abs dx), not total speed — vertical scroll shouldn't
        // inflate brush advance rate. Prevents glitchy fast-advance during V+H drag.
        const hSpeed = Math.abs(dx);
        const charThreshold = hSpeed < 3 ? 9 : hSpeed < 6 ? 6 : 4;
        this.makerBrushAccum += dx;

        if (Math.abs(this.makerBrushAccum) < charThreshold) return;

        const charSteps = Math.floor(Math.abs(this.makerBrushAccum) / charThreshold);
        const stepDir = this.makerBrushAccum > 0 ? 1 : -1;
        this.makerBrushAccum -= stepDir * charSteps * charThreshold;

        // Move cursor character by character (skip \n as a single step)
        let newCursor = this.makerCursor;
        for (let i = 0; i < Math.min(charSteps, 10); i++) {
            const next = newCursor + stepDir;
            if (next < 0 || next > content.length) break;
            newCursor = next;
            // Skip over newlines in one step
            if (content[newCursor - (stepDir > 0 ? 1 : 0)] === '\n') {
                const nn = newCursor + stepDir;
                if (nn >= 0 && nn <= content.length) newCursor = nn;
            }
        }

        if (newCursor === this.makerCursor) return;
        this.makerCursor = newCursor;

        // Selection range: always anchor → cursor, direction doesn't matter
        this.makerCurrentStart = Math.min(this.makerAnchor, this.makerCursor);
        this.makerCurrentEnd = Math.max(this.makerAnchor, this.makerCursor);

        // Apply CM selection so user sees native editor selection (not a floating box)
        try {
            const cmView = this.getCmView(editor);
            if (cmView?.dispatch) {
                cmView.dispatch({
                    selection: { anchor: this.makerAnchor, head: this.makerCursor },
                    scrollIntoView: false
                });
                // Soft viewport follow
                const coords = cmView.coordsAtPos(this.makerCursor, 1);
                if (coords) {
                    const vh = window.innerHeight;
                    const margin = vh * 0.2;
                    if (coords.top < margin) {
                        cmView.scrollDOM.scrollTop += coords.top - margin;
                    } else if (coords.bottom > vh - margin) {
                        cmView.scrollDOM.scrollTop += coords.bottom - (vh - margin);
                    }
                }
            }
        } catch (_) {}

        // Track which unit we're on (for counter display)
        const cursorUnit = this.scopeEngine.findUnitAt(this.scopeLevel, this.makerCursor);
        if (cursorUnit >= 0) this.makerUnitIndex = cursorUnit;
        this.currentIndex = this.makerUnitIndex;

        // Light haptic per character — like brush touching paper grain
        const now = performance.now();
        if (now - this.lastStepHapticAt >= 40) {
            this.lastStepHapticAt = now;
            this.haptics.fire('light');
        }

        // Update visuals
        this.updateCounter();
        this.updateZoomLane();
        this.updateMakerPanel();
    }

    /** Stamp (place) the current brush selection as a batch item. */
    private makerStamp(): void {
        if (!this.makerMode) return;
        if (this.makerCurrentStart >= this.makerCurrentEnd) return;

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const text = view.editor.getRange(
            view.editor.offsetToPos(this.makerCurrentStart),
            view.editor.offsetToPos(this.makerCurrentEnd)
        );
        if (!text.trim()) return;

        // Check if already stamped at same range (toggle off if so)
        const existingIdx = this.makerSelections.findIndex(
            s => s.start === this.makerCurrentStart && s.end === this.makerCurrentEnd
        );
        if (existingIdx >= 0) {
            // Unstamp — remove from batch
            this.makerSelections.splice(existingIdx, 1);
            this.haptics.fire('light');
        } else {
            // Stamp — add to batch
            this.makerSelections.push({
                start: this.makerCurrentStart,
                end: this.makerCurrentEnd,
                text,
            });
            // BAN! Heavy stamp haptic
            this.haptics.fire('impact');
        }

        // After stamping, reset anchor to cursor position for next selection
        this.makerAnchor = this.makerCursor;
        this.makerBrushAccum = 0;

        this.renderMakerStamps();
        this.updateMakerPanel();
        this.flashMakerGestureHint('');
    }
    private executeMakerGesture(totalX: number, totalY: number): void {
        const angle = Math.atan2(totalY, totalX) * (180 / Math.PI);
        // Normalize to 0-360
        const a = ((angle % 360) + 360) % 360;

        // Determine action from angle sector (8 directions, 45° each)
        let action: string | null = null;
        if (a >= 345 || a < 15) action = 'copy';          // Right → Copy
        else if (a >= 15 && a < 75) action = 'spoiler';   // Down-right → Spoiler
        else if (a >= 75 && a < 105) action = 'highlight'; // Down → Highlight
        else if (a >= 105 && a < 165) action = 'exit';    // Down-left → Exit
        else if (a >= 165 && a < 195) action = 'undo';    // Left → Undo last
        else if (a >= 195 && a < 255) action = 'batch';   // Up-left → Batch action
        else if (a >= 255 && a < 285) action = 'bold';    // Up → Bold
        else if (a >= 285 && a < 345) action = 'cloze';   // Up-right → Cloze

        if (!action) return;

        // Flash the compass cell so user sees what was recognized
        this.flashMakerGestureHint(action);

        if (action === 'exit') {
            this.exitMakerMode();
            return;
        }
        if (action === 'undo') {
            if (this.makerSelections.length > 0) {
                this.makerSelections.pop();
                this.renderMakerStamps();
                this.updateMakerPanel();
                this.haptics.fire('snap');
            }
            return;
        }
        if (action === 'copy') {
            // Copy current brush selection + all stamped text
            const texts: string[] = [];
            for (const sel of this.makerSelections) texts.push(sel.text);
            // Add current brush selection if not already stamped
            if (this.makerCurrentStart < this.makerCurrentEnd) {
                const alreadyStamped = this.makerSelections.some(
                    s => s.start === this.makerCurrentStart && s.end === this.makerCurrentEnd
                );
                if (!alreadyStamped) {
                    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                    if (view) {
                        texts.push(view.editor.getRange(
                            view.editor.offsetToPos(this.makerCurrentStart),
                            view.editor.offsetToPos(this.makerCurrentEnd)
                        ));
                    }
                }
            }
            if (texts.length > 0) {
                navigator.clipboard.writeText(texts.join('\n'));
                this.haptics.fire('success');
            }
            return;
        }
        if (action === 'batch') {
            // Apply last-used formatting to ALL stamps
            this.executeMakerBatchAction(this.makerLastAction ?? 'highlight');
            return;
        }

        // Formatting action — apply to current brush selection
        this.executeMakerFormatAction(action);
        this.makerLastAction = action;
    }

    /** Apply a formatting action to the current brush selection range. */
    private executeMakerFormatAction(action: string): void {
        if (this.makerCurrentStart >= this.makerCurrentEnd) return;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;
        const startPos = editor.offsetToPos(this.makerCurrentStart);
        const endPos = editor.offsetToPos(this.makerCurrentEnd);
        const text = editor.getRange(startPos, endPos);

        let replacement: string;
        switch (action) {
            case 'bold':
                replacement = text.startsWith('**') && text.endsWith('**')
                    ? text.slice(2, -2) : `**${text}**`;
                break;
            case 'highlight':
                replacement = text.startsWith('==') && text.endsWith('==')
                    ? text.slice(2, -2) : `==${text}==`;
                break;
            case 'cloze':
                // Issue #23: Toggle cloze off if already wrapped
                replacement = /^\{\{c\d+::(.+?)\}\}$/.test(text)
                    ? text.replace(/^\{\{c\d+::(.+?)\}\}$/, '$1')
                    : `{{c1::${text}}}`;
                break;
            case 'spoiler':
                replacement = text.startsWith('%%') && text.endsWith('%%')
                    ? text.slice(2, -2) : `%%${text}%%`;
                break;
            default: return;
        }

        editor.replaceRange(replacement, startPos, endPos);
        this.haptics.fire('snap');

        // Rebuild and re-anchor brush after edit
        this.lastContentHash = '';
        this.rebuildUnits();
        this.makerCachedContent = editor.getValue();
        // Re-anchor at end of replacement
        const newEnd = this.makerCurrentStart + replacement.length;
        this.makerAnchor = newEnd;
        this.makerCursor = newEnd;
        this.makerCurrentEnd = newEnd;
        this.makerBrushAccum = 0;
    }

    /** Apply a formatting action to ALL stamped selections (batch). */
    private executeMakerBatchAction(action: string): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;

        // Apply in REVERSE offset order so earlier offsets aren't shifted
        const sorted = [...this.makerSelections].sort((a, b) => b.start - a.start);
        for (const sel of sorted) {
            const startPos = editor.offsetToPos(sel.start);
            const endPos = editor.offsetToPos(sel.end);
            const text = editor.getRange(startPos, endPos);

            let replacement: string;
            switch (action) {
                case 'bold':
                    replacement = text.startsWith('**') && text.endsWith('**')
                        ? text.slice(2, -2) : `**${text}**`;
                    break;
                case 'highlight':
                    replacement = text.startsWith('==') && text.endsWith('==')
                        ? text.slice(2, -2) : `==${text}==`;
                    break;
                case 'cloze':
                    // Issue #23: Toggle cloze off if already wrapped
                    replacement = /^\{\{c\d+::(.+?)\}\}$/.test(text)
                        ? text.replace(/^\{\{c\d+::(.+?)\}\}$/, '$1')
                        : `{{c1::${text}}}`;
                    break;
                case 'spoiler':
                    replacement = text.startsWith('%%') && text.endsWith('%%')
                        ? text.slice(2, -2) : `%%${text}%%`;
                    break;
                default: continue;
            }
            editor.replaceRange(replacement, startPos, endPos);
        }

        this.haptics.fire('success');
        this.makerSelections = [];
        this.clearMakerStamps();
        this.updateMakerPanel();

        // Rebuild and re-anchor
        this.lastContentHash = '';
        this.rebuildUnits();
        this.makerCachedContent = editor.getValue();
        this.makerBrushAccum = 0;
    }

    /** Render stamp overlay elements for all batch selections. */
    private renderMakerStamps(): void {
        this.clearMakerStamps();
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cmView = this.getCmView(view.editor);
        if (!cmView) return;

        for (const sel of this.makerSelections) {
            try {
                const startCoords = cmView.coordsAtPos(sel.start, 1);
                const endCoords = cmView.coordsAtPos(sel.end, -1);
                if (!startCoords || !endCoords) continue;

                const el = document.createElement('div');
                el.className = 'ms3-maker-stamp';
                const top = startCoords.top;
                const left = Math.min(startCoords.left, endCoords.left);
                const right = Math.max(
                    startCoords.right || startCoords.left + 50,
                    endCoords.right || endCoords.left + 50
                );
                const bottom = endCoords.bottom;

                el.style.top = `${top}px`;
                el.style.left = `${left}px`;
                el.style.width = `${right - left}px`;
                el.style.height = `${Math.min(bottom - top, window.innerHeight * 0.25)}px`;
                document.body.appendChild(el);
                this.makerStampEls.push(el);
            } catch (_) {}
        }
    }

    private clearMakerStamps(): void {
        for (const el of this.makerStampEls) el.remove();
        this.makerStampEls = [];
    }

    /** Apply current highlight in Maker Mode (the "active block" you're on). */
    private applyMakerHighlight(): void {
        this.showHighlightOverlay(this.makerUnitIndex);
    }

    /** Show the Maker Mode gesture compass — read-only hint panel, no buttons.
     *  Horizontal drag = brush selection. Short press / still press = stamp. Flick = action. */
    private showMakerPanel(): void {
        if (this.makerPanelEl) this.makerPanelEl.remove();
        const panel = document.createElement('div');
        panel.className = 'ms3-maker-panel';

        // ── Status row ──
        const statusRow = document.createElement('div');
        statusRow.className = 'ms3-maker-panel-status';
        statusRow.innerHTML =
            `<span class="ms3-maker-panel-icon">筆</span>` +
            `<span class="ms3-maker-panel-count">0字</span>`;
        panel.appendChild(statusRow);

        // ── Gesture compass (3×3 grid, 8 directions + center label) ──
        // Layout matches flick directions on screen:
        //   ↖ batch  ↑ bold   ↗ cloze
        //   ← undo   [◎]     → copy
        //   ↙ exit   ↓ hi    ↘ ··· (spoiler)
        const compass = document.createElement('div');
        compass.className = 'ms3-maker-compass';

        const dirs: Array<{ label: string; icon: string; action: string }> = [
            { label: '↖', icon: 'batch', action: 'batch' },
            { label: '↑',  icon: 'bold',  action: 'bold'  },
            { label: '↗', icon: 'cloze', action: 'cloze' },
            { label: '←', icon: 'undo',  action: 'undo'  },
            { label: '◎',  icon: 'push',  action: ''      },  // center — short push any dir = stamp
            { label: '→', icon: 'copy',  action: 'copy'  },
            { label: '↙', icon: 'exit',  action: 'exit'  },
            { label: '↓',  icon: 'hi',    action: 'highlight' },
            { label: '↘', icon: '···',   action: 'spoiler' },
        ];

        for (const d of dirs) {
            const cell = document.createElement('span');
            if (d.action === '') {
                cell.className = 'ms3-maker-compass-center';
                cell.innerHTML = `<span class="ms3-maker-compass-press-icon">${d.label}</span><span class="ms3-maker-compass-press-label">${d.icon}</span>`;
            } else {
                cell.className = 'ms3-maker-compass-dir';
                cell.dataset.action = d.action;
                cell.innerHTML = `<span class="ms3-maker-compass-arrow">${d.label}</span><span class="ms3-maker-compass-name">${d.icon}</span>`;
            }
            compass.appendChild(cell);
        }
        panel.appendChild(compass);

        document.body.appendChild(panel);
        this.makerPanelEl = panel;
    }

    private updateMakerPanel(): void {
        if (!this.makerPanelEl) return;
        const stampCount = this.makerSelections.length;
        const charCount = this.makerCurrentEnd - this.makerCurrentStart;

        const countEl = this.makerPanelEl.querySelector('.ms3-maker-panel-count');
        if (countEl) {
            countEl.textContent = stampCount > 0
                ? `${charCount}字 · ${stampCount}✕`
                : `${charCount}字`;
        }

        // Dim batch/undo hints when no stamps exist
        const batchCell = this.makerPanelEl.querySelector('[data-action="batch"]') as HTMLElement | null;
        const undoCell  = this.makerPanelEl.querySelector('[data-action="undo"]')  as HTMLElement | null;
        const dimCls = 'ms3-maker-compass-dir--dim';
        if (batchCell) batchCell.classList.toggle(dimCls, stampCount === 0);
        if (undoCell)  undoCell.classList.toggle(dimCls,  stampCount === 0);
    }

    /** Flash the compass cell matching the recognized gesture — visual confirmation.
     *  Pass '' to flash the center (press/stamp) cell. */
    private flashMakerGestureHint(action: string): void {
        if (!this.makerPanelEl) return;
        // '' = flash the center cell
        const cell = action === ''
            ? this.makerPanelEl.querySelector('.ms3-maker-compass-center') as HTMLElement | null
            : this.makerPanelEl.querySelector(`[data-action="${action}"]`) as HTMLElement | null;
        if (!cell) return;
        const flashCls = action === '' ? 'ms3-maker-compass-center--flash' : 'ms3-maker-compass-dir--flash';
        cell.classList.add(flashCls);
        setTimeout(() => cell.classList.remove(flashCls), 320);
    }

    // ═══ ContextChunkScroller — 重力圏 (Gravity Sphere) ═══════════════
    //
    // JP DESIGN INSPIRATION:
    //   - Gravity Rush/Daze (重力的眩暈): Kat's gravity shift redirects momentum mid-flight.
    //     Vertical VROOM momentum transforms into horizontal chunk-focus energy.
    //   - Rhythm Heaven (リズム天国) See-Saw: alternating rhythm naturally flows
    //     between different interaction modes without breaking tempo.
    //   - Katamari Damacy: rolling through = absorb. Chunks absorb you when you
    //     match their rhythm during deceleration.
    //   - Okami (大神): celestial brush - the world pauses for precision input,
    //     then resumes. Chunk focus = precision mode within the VROOM world.
    //
    // TRANSITION: Scope swipe past sentence (level 3) → chunk overview (level 4).
    // At chunk scope, VROOM navigates between chunks. Scope swipe back down →
    // chunk focus activates. Momentum carries into the chunk's internal navigation.
    //
    // INSIDE CHUNK:
    //   - Editor spotlight: dim everything outside, focus the chunk
    //   - Trackball bounded to chunk-internal units
    //   - Combo ring: bit-level edits + nav arrows with visible preview
    //   - Exit ring: chunk-wide actions (highlight, callout, blockquote, finish)

    /** Enter chunk overview mode: units become chunks. */
    private enterChunkOverview(): void {
        this.chunks = this.scopeEngine.getChunks();
        if (this.chunks.length === 0) {
            this.haptics.fire('tick');
            return;
        }

        this.chunkMode = 'overview';

        // Map current position to chunk
        const currentUnit = this.units[this.currentIndex];
        const offset = currentUnit ? currentUnit.start : 0;
        this.currentChunkIdx = this.scopeEngine.findChunkAt(offset);

        // Replace units with chunks for VROOM navigation
        this.units = this.chunks;
        this.currentIndex = Math.max(0, Math.min(this.currentChunkIdx, this.units.length - 1));

        // Update physics for chunk-level steps
        const yPositions = this.units.map((_, i) => i * UNIT_STEP);
        this.physics.setSnapPositions('y', yPositions);
        this.physics.setBounds('y', 0, Math.max(0, (this.units.length - 1) * UNIT_STEP));
        this.physics.setPosition('y', this.currentIndex * UNIT_STEP);

        // Visual update — set chunk badge directly (skip updateScopeBadge to avoid animation race)
        if (this.scopeBadgeEl) {
            this.scopeBadgeEl.textContent = '区';
            this.scopeBadgeEl.style.background = '#10b981';
            this.scopeBadgeEl.style.boxShadow = '0 0 10px #10b98160';
            this.scopeBadgeEl.classList.remove('ms3-scope-badge--changing');
            void this.scopeBadgeEl.offsetWidth;
            this.scopeBadgeEl.classList.add('ms3-scope-badge--changing');
            this.scopeBadgeEl.addEventListener('animationend', () => {
                this.scopeBadgeEl?.classList.remove('ms3-scope-badge--changing');
            }, { once: true });
        }
        this.updateCounter();
        this.updateZoomLane();
        this.updateHighlight();
        this.showChunkBoundaries();
        this.showChunkListPanel();
        this.teleportToCurrentUnit();
        // Ball color: emerald for chunk overview
        if (this.ballEl) this.ballEl.classList.add('ms3-ball--chunk');

        this.showModeFlash('区');
        this.haptics.fire('zoom');
    }

    /** Enter chunk focused mode: precision navigation inside one chunk. */
    private enterChunkFocus(chunkIdx?: number): void {
        const idx = chunkIdx ?? this.currentChunkIdx;
        if (idx < 0) return;
        const allChunks = this.scopeEngine.getChunks();
        if (idx >= allChunks.length) return;

        this.clearChunkListPanel();
        this.chunkMode = 'focused';
        this.currentChunkIdx = idx;

        // Get units within this chunk — use remembered scope level (Improvement #3),
        // default to bunsetsu (level 0) for max granularity.
        this.chunkFocusedUnits = this.scopeEngine.getUnitsInChunk(this.chunkFocusScopeLevel, idx);
        if (this.chunkFocusedUnits.length === 0) {
            // Fallback: try all levels except the one already tried
            for (let lv = 0; lv < SCOPE_COUNT; lv++) {
                if (lv === this.chunkFocusScopeLevel) continue;
                this.chunkFocusedUnits = this.scopeEngine.getUnitsInChunk(lv, idx);
                if (this.chunkFocusedUnits.length > 0) break;
            }
        }
        if (this.chunkFocusedUnits.length === 0) {
            this.exitChunkMode();
            return;
        }

        // Replace global units with chunk-internal units (bounded navigation)
        this.units = this.chunkFocusedUnits;
        this.chunkFocusedIndex = 0;
        this.currentIndex = 0;

        // Update physics for chunk-internal steps
        const yPositions = this.units.map((_, i) => i * UNIT_STEP);
        this.physics.setSnapPositions('y', yPositions);
        this.physics.setBounds('y', 0, Math.max(0, (this.units.length - 1) * UNIT_STEP));
        this.physics.setPosition('y', 0);

        // ── OKAMI CELESTIAL BRUSH: dim the world, spotlight the chunk ──
        this.applyChunkSpotlight();

        // Scope badge shows focused state
        if (this.scopeBadgeEl) {
            this.scopeBadgeEl.textContent = '集';
            this.scopeBadgeEl.style.background = '#06b6d4';
            this.scopeBadgeEl.style.boxShadow = '0 0 12px #06b6d480';
        }

        // Animation: zoom lane does a radial-in transition
        if (this.zoomEl) {
            this.zoomEl.classList.add('ms3-zoom--chunk-enter');
            this.zoomEl.addEventListener('animationend', () => {
                this.zoomEl?.classList.remove('ms3-zoom--chunk-enter');
            }, { once: true });
        }

        // Teleport to start of chunk
        this.updateHighlight();
        this.updateCounter();
        this.updateZoomLane();
        this.teleportToCurrentUnit();

        // Fire decisive entry haptic (Gravity Rush shift)
        this.showModeFlash('集');
        this.haptics.fire('impact');
        setTimeout(() => this.haptics.fire('snap'), 50);
    }

    /** Exit chunk mode entirely: restore normal scope navigation. */
    private exitChunkMode(): void {
        if (this.chunkMode === 'off') return;

        // Remember position in document for re-entry at right spot
        const exitOffset = this.units[this.currentIndex]?.start ?? 0;

        this.chunkMode = 'off';
        this.currentChunkIdx = -1;
        this.chunkFocusedUnits = [];
        this.chunkFocusedIndex = 0;

        // #1: Fade out dim overlays before removing (Gravity Rush re-orientation moment)
        for (const el of this.chunkDimEls) {
            el.style.transition = 'opacity 0.25s ease-out';
            el.style.opacity = '0';
        }
        const dimEls = [...this.chunkDimEls];
        this.chunkDimEls = [];
        setTimeout(() => { for (const el of dimEls) el.remove(); }, 280);

        this.clearChunkBoundaries();
        this.clearChunkListPanel();

        // Exit animation on zoom lane (reverse of chunk-enter)
        if (this.zoomEl) {
            this.zoomEl.classList.add('ms3-zoom--chunk-exit');
            this.zoomEl.addEventListener('animationend', () => {
                this.zoomEl?.classList.remove('ms3-zoom--chunk-exit');
            }, { once: true });
        }

        // Restore normal scope units
        this.units = this.scopeEngine.getUnits(this.scopeLevel);
        if (this.units.length === 0) { this.rebuildUnits(); return; }

        // Map exit offset to nearest unit at current scope
        const idx = this.scopeEngine.findUnitAt(this.scopeLevel, exitOffset);
        this.currentIndex = Math.max(0, Math.min(idx, this.units.length - 1));

        // Restore physics
        const yPositions = this.units.map((_, i) => i * UNIT_STEP);
        this.physics.setSnapPositions('y', yPositions);
        this.physics.setBounds('y', 0, Math.max(0, (this.units.length - 1) * UNIT_STEP));
        this.physics.setPosition('y', this.currentIndex * UNIT_STEP);

        // Restore scope badge
        this.updateScopeBadge(true);
        this.updateHighlight();
        this.updateCounter();
        this.updateZoomLane();
        // Remove chunk ball color
        if (this.ballEl) this.ballEl.classList.remove('ms3-ball--chunk');

        this.haptics.fire('zoom');
    }

    /** Apply chunk spotlight: dim editor content outside the focused chunk. */
    private applyChunkSpotlight(): void {
        this.clearChunkSpotlight();
        const chunk = this.scopeEngine.getChunks()[this.currentChunkIdx];
        if (!chunk) return;

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cmView = this.getCmView(view.editor);
        if (!cmView) return;

        try {
            // Create dim overlays for content above and below the chunk
            const chunkStartCoords = cmView.coordsAtPos(chunk.start, 1);
            const chunkEndCoords = cmView.coordsAtPos(Math.max(chunk.start, chunk.end - 1), -1);
            if (!chunkStartCoords || !chunkEndCoords) return;

            const vh = window.innerHeight;
            const vw = window.innerWidth;

            // Top dim: from viewport top to chunk start
            if (chunkStartCoords.top > 0) {
                const topDim = document.createElement('div');
                topDim.className = 'ms3-chunk-dim ms3-chunk-dim--top';
                topDim.style.top = '0';
                topDim.style.left = '0';
                topDim.style.width = `${vw}px`;
                topDim.style.height = `${chunkStartCoords.top}px`;
                document.body.appendChild(topDim);
                this.chunkDimEls.push(topDim);
            }

            // Bottom dim: from chunk end to viewport bottom
            if (chunkEndCoords.bottom < vh) {
                const bottomDim = document.createElement('div');
                bottomDim.className = 'ms3-chunk-dim ms3-chunk-dim--bottom';
                bottomDim.style.top = `${chunkEndCoords.bottom}px`;
                bottomDim.style.left = '0';
                bottomDim.style.width = `${vw}px`;
                bottomDim.style.height = `${vh - chunkEndCoords.bottom}px`;
                document.body.appendChild(bottomDim);
                this.chunkDimEls.push(bottomDim);
            }

            // Chunk focus border (thin glowing line around the chunk)
            const focusBorder = document.createElement('div');
            focusBorder.className = 'ms3-chunk-focus-border';
            focusBorder.style.top = `${Math.max(0, chunkStartCoords.top - 2)}px`;
            focusBorder.style.left = `${Math.max(0, chunkStartCoords.left - 4)}px`;
            // #10: For multi-line chunks, .right is the *last line's* right edge — unreliable.
            // Use the editor content area width instead.
            const contentEl = cmView.dom?.querySelector('.cm-content') as HTMLElement | null;
            const contentWidth = contentEl ? contentEl.clientWidth : 600;
            const w = Math.min(vw - chunkStartCoords.left + 4, contentWidth + 8);
            focusBorder.style.width = `${w}px`;
            focusBorder.style.height = `${Math.min(vh, chunkEndCoords.bottom - chunkStartCoords.top + 4)}px`;
            document.body.appendChild(focusBorder);
            this.chunkDimEls.push(focusBorder);
        } catch (_) {}
    }

    /** Clear chunk spotlight overlays. */
    private clearChunkSpotlight(): void {
        for (const el of this.chunkDimEls) el.remove();
        this.chunkDimEls = [];
    }

    /** Update chunk spotlight position (call during scroll/navigation in focus mode). */
    private updateChunkSpotlight(): void {
        if (this.chunkMode !== 'focused') return;
        const chunk = this.scopeEngine.getChunks()[this.currentChunkIdx];
        if (!chunk || this.chunkDimEls.length === 0) {
            this.applyChunkSpotlight(); // no elements yet, create them
            return;
        }

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cmView = this.getCmView(view.editor);
        if (!cmView) return;

        try {
            const chunkStartCoords = cmView.coordsAtPos(chunk.start, 1);
            const chunkEndCoords = cmView.coordsAtPos(Math.max(chunk.start, chunk.end - 1), -1);
            if (!chunkStartCoords || !chunkEndCoords) return;

            const vh = window.innerHeight;
            // Reposition existing dim elements (indices: 0=top, 1=bottom, 2=border)
            for (const el of this.chunkDimEls) {
                if (el.classList.contains('ms3-chunk-dim--top')) {
                    el.style.height = `${Math.max(0, chunkStartCoords.top)}px`;
                } else if (el.classList.contains('ms3-chunk-dim--bottom')) {
                    el.style.top = `${chunkEndCoords.bottom}px`;
                    el.style.height = `${Math.max(0, vh - chunkEndCoords.bottom)}px`;
                } else if (el.classList.contains('ms3-chunk-focus-border')) {
                    el.style.top = `${Math.max(0, chunkStartCoords.top - 2)}px`;
                    el.style.height = `${Math.min(vh, chunkEndCoords.bottom - chunkStartCoords.top + 4)}px`;
                }
            }
        } catch (_) {}
    }

    /** Show chunk boundary markers in the editor during VROOM/overview.
     *  Fix S-7: Reposition existing elements instead of destroying/recreating on every scroll. */
    private showChunkBoundaries(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cmView = this.getCmView(view.editor);
        if (!cmView) return;

        const allChunks = this.scopeEngine.getChunks();

        // Pool: create elements once, reposition on update
        while (this.chunkBoundaryEls.length < allChunks.length) {
            const marker = document.createElement('div');
            marker.className = 'ms3-chunk-marker';
            marker.style.left = '0';
            document.body.appendChild(marker);
            this.chunkBoundaryEls.push(marker);
        }
        // Hide excess pool elements
        for (let i = allChunks.length; i < this.chunkBoundaryEls.length; i++) {
            this.chunkBoundaryEls[i].style.display = 'none';
        }

        for (let i = 0; i < allChunks.length; i++) {
            const marker = this.chunkBoundaryEls[i];
            try {
                const coords = cmView.coordsAtPos(allChunks[i].start, 1);
                if (!coords) { marker.style.display = 'none'; continue; }
                marker.style.display = '';
                marker.style.top = `${coords.top}px`;
                if (i === this.currentChunkIdx) {
                    marker.classList.add('ms3-chunk-marker--active');
                } else {
                    marker.classList.remove('ms3-chunk-marker--active');
                }
            } catch (_) { marker.style.display = 'none'; }
        }

        // Throttled scroll listener: rAF-gated to max once per frame
        if (!this.chunkBoundaryScrollListener) {
            let rafPending = false;
            this.chunkBoundaryScrollListener = () => {
                if (rafPending) return;
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    this.showChunkBoundaries();
                });
            };
            const scrollDom = (view.editor as any)?.cm?.scrollDOM as HTMLElement | undefined;
            if (scrollDom) {
                scrollDom.addEventListener('scroll', this.chunkBoundaryScrollListener, { passive: true });
                this.chunkBoundaryScrollDom = scrollDom; // Fix B-9: store for reliable detach
            }
        }
    }

    /** Clear chunk boundary markers and detach scroll listener. */
    private clearChunkBoundaries(): void {
        if (this.chunkBoundaryScrollListener) {
            // Fix B-9: use stored scrollDOM ref instead of current active view
            if (this.chunkBoundaryScrollDom) {
                this.chunkBoundaryScrollDom.removeEventListener('scroll', this.chunkBoundaryScrollListener);
                this.chunkBoundaryScrollDom = null;
            }
            this.chunkBoundaryScrollListener = null;
        }
        for (const el of this.chunkBoundaryEls) el.remove();
        this.chunkBoundaryEls = [];
    }

    /** Toggle the chunk panel as a reference overlay (no mode change).
     *  Tapping while in normal mode: shows all chunks, highlights the one the cursor is in.
     *  Tapping a chunk item jumps to its first unit in current navigation mode.
     */
    private toggleChunkPanel(): void {
        if (this.chunkListPanelEl) {
            // Panel is open — close it
            this.clearChunkListPanel();
            if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.remove('ms3-chunk-panel-btn--active');
            this.chunkPanelRefMode = false;
            // If in chunk mode, exit on second tap
            if (this.chunkMode !== 'off') this.exitChunkMode();
            return;
        }
        // Direct entry: tap 区 button → enter chunk overview (one-tap UX).
        // If already in chunk mode, show reference panel as overlay.
        if (this.chunkMode === 'off') {
            this.chunks = this.scopeEngine.getChunks();
            if (this.chunks.length > 0) {
                this.enterChunkOverview();
                if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.add('ms3-chunk-panel-btn--active');
                return;
            }
        }
        // Already in chunk mode or no chunks: show reference panel
        const currUnit = this.units[this.currentIndex];
        if (currUnit) {
            this.currentChunkIdx = this.scopeEngine.findChunkAt(currUnit.start);
        }
        this.chunkPanelRefMode = true;
        this.showChunkListPanelRef();
        if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.add('ms3-chunk-panel-btn--active');
    }

    /** Show chunk list panel in reference mode — items jump to chunk, with edit/split/merge controls. */
    private showChunkListPanelRef(): void {
        this.clearChunkListPanel();
        const allChunks = this.scopeEngine.getChunks();

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

        const panel = document.createElement('div');
        panel.className = 'ms3-chunk-list-panel ms3-chunk-list-panel--ref';

        // ── Header ──────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'ms3-chunk-list-header';

        const titleEl = document.createElement('span');
        titleEl.textContent = allChunks.length > 0 ? `区 ${allChunks.length} chunks` : '区 (no chunks yet)';
        header.appendChild(titleEl);

        const hintEl = document.createElement('span');
        hintEl.className = 'ms3-chunk-list-hint';
        hintEl.textContent = 'tap=jump ✏️=rename ✂️=split ⊕=merge';
        header.appendChild(hintEl);

        // "Split here" button — inserts \n\n at current cursor to create a new chunk boundary
        if (view) {
            const splitHereBtn = document.createElement('button');
            splitHereBtn.className = 'ms3-chunk-edit-btn ms3-chunk-edit-btn--split-here';
            splitHereBtn.textContent = '✂️ split here';
            splitHereBtn.title = 'Insert blank line at cursor to create a new chunk boundary';
            splitHereBtn.addEventListener('pointerdown', (e: PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                try {
                    const cursor = view.editor.getCursor();
                    // Insert blank line before cursor line
                    const pos = { line: cursor.line, ch: 0 };
                    view.editor.replaceRange('\n\n', pos, pos);
                    this.clearChunkListPanel();
                    if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.remove('ms3-chunk-panel-btn--active');
                    this.chunkPanelRefMode = false;
                    // Rebuild and reopen
                    setTimeout(() => {
                        this.rebuildUnits();
                        this.chunkPanelRefMode = true;
                        this.showChunkListPanelRef();
                        if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.add('ms3-chunk-panel-btn--active');
                        this.haptics.fire('snap');
                    }, 80);
                } catch (_) {}
            });
            header.appendChild(splitHereBtn);
        }

        panel.appendChild(header);

        // ── Chunk list ───────────────────────────────────────────────────────
        const list = document.createElement('div');
        list.className = 'ms3-chunk-list-items';

        if (allChunks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ms3-chunk-list-empty';
            empty.textContent = 'No chunks detected. Add blank lines between sections to create chunks, or use ✂️ split here above.';
            list.appendChild(empty);
        }

        for (let i = 0; i < allChunks.length; i++) {
            const chunk = allChunks[i];
            const item = document.createElement('div');
            item.className = 'ms3-chunk-list-item';
            if (i === this.currentChunkIdx) item.classList.add('ms3-chunk-list-item--active');

            // ── Index badge ──
            const idx = document.createElement('span');
            idx.className = 'ms3-chunk-list-idx';
            idx.textContent = `${i + 1}`;
            item.appendChild(idx);

            // ── Preview / editable label ──
            const preview = document.createElement('span');
            preview.className = 'ms3-chunk-list-preview';
            const rawText = chunk.text;
            const cleanText = this.toDisplayText(rawText);
            preview.textContent = cleanText.length > 50 ? cleanText.slice(0, 48) + '…' : cleanText;
            item.appendChild(preview);

            // ── Edit (rename) button ──
            const editBtn = document.createElement('button');
            editBtn.className = 'ms3-chunk-edit-btn ms3-chunk-edit-btn--rename';
            editBtn.textContent = '✏️';
            editBtn.title = 'Rename chunk (edits first line of chunk in document)';
            editBtn.addEventListener('pointerdown', (e: PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (!view) return;
                // Replace preview with an input field
                preview.style.display = 'none';
                editBtn.style.display = 'none';
                const input = document.createElement('input');
                input.className = 'ms3-chunk-label-input';
                input.type = 'text';
                input.value = cleanText.slice(0, 80).replace(/\n.*/s, ''); // first line only
                item.insertBefore(input, editBtn);
                input.focus();
                input.select();

                const commit = () => {
                    const newLabel = input.value.trim();
                    if (newLabel && view) {
                        try {
                            // Replace the first line of the chunk with the new label
                            const startPos = view.editor.offsetToPos(chunk.start);
                            const firstLineEnd = view.editor.offsetToPos(
                                chunk.start + rawText.indexOf('\n') > chunk.start
                                    ? chunk.start + rawText.indexOf('\n')
                                    : chunk.end
                            );
                            view.editor.replaceRange(newLabel, startPos, firstLineEnd);
                        } catch (_) {}
                    }
                    input.remove();
                    preview.style.display = '';
                    editBtn.style.display = '';
                    // Rebuild panel to refresh preview
                    setTimeout(() => {
                        this.clearChunkListPanel();
                        this.rebuildUnits();
                        if (this.chunkPanelRefMode) {
                            this.showChunkListPanelRef();
                            if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.add('ms3-chunk-panel-btn--active');
                        }
                    }, 80);
                };

                input.addEventListener('blur', commit);
                input.addEventListener('keydown', (ke: KeyboardEvent) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); commit(); }
                    if (ke.key === 'Escape') { input.remove(); preview.style.display = ''; editBtn.style.display = ''; }
                });
            });
            item.appendChild(editBtn);

            // ── Merge with next button (not on last chunk) ──
            if (i < allChunks.length - 1 && view) {
                const mergeBtn = document.createElement('button');
                mergeBtn.className = 'ms3-chunk-edit-btn ms3-chunk-edit-btn--merge';
                mergeBtn.textContent = '⊕';
                mergeBtn.title = 'Merge with next chunk (removes blank line boundary)';
                mergeBtn.addEventListener('pointerdown', (e: PointerEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    try {
                        // The boundary between chunk i and i+1 is the blank line(s) just before chunk[i+1].start
                        const nextChunkStart = allChunks[i + 1].start;
                        const boundaryEnd = view.editor.offsetToPos(nextChunkStart);
                        // Walk back through blank lines
                        const docText = view.editor.getValue();
                        let scanPos = nextChunkStart - 1;
                        while (scanPos > chunk.end && (docText[scanPos] === '\n' || docText[scanPos] === '\r' || docText[scanPos] === ' ')) {
                            scanPos--;
                        }
                        scanPos++; // step back into blank territory
                        const boundaryStart = view.editor.offsetToPos(scanPos);
                        view.editor.replaceRange('\n', boundaryStart, boundaryEnd);
                    } catch (_) {}
                    this.clearChunkListPanel();
                    if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.remove('ms3-chunk-panel-btn--active');
                    this.chunkPanelRefMode = false;
                    setTimeout(() => {
                        this.rebuildUnits();
                        this.chunkPanelRefMode = true;
                        this.showChunkListPanelRef();
                        if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.add('ms3-chunk-panel-btn--active');
                        this.haptics.fire('snap');
                    }, 80);
                });
                item.appendChild(mergeBtn);
            }

            // ── Tap to jump ──
            preview.addEventListener('pointerdown', (e: PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                const chunkStart = chunk.start;
                const targetIdx = this.scopeEngine.findUnitAt(this.scopeLevel, chunkStart);
                if (targetIdx >= 0 && targetIdx < this.scopeEngine.getUnits(this.scopeLevel).length) {
                    this.currentIndex = targetIdx;
                    this.physics.setPosition('y', targetIdx * UNIT_STEP);
                    this.lateralOffset = 0;
                    this.updateHighlight();
                    this.updateCounter();
                    this.updateZoomLane();
                    this.teleportToCurrentUnit();
                    this.haptics.fire('snap');
                }
                this.currentChunkIdx = i;
                this.clearChunkListPanel();
                if (this.chunkPanelBtnEl) this.chunkPanelBtnEl.classList.remove('ms3-chunk-panel-btn--active');
                this.chunkPanelRefMode = false;
            });

            list.appendChild(item);
            this.chunkListItemEls.push(item);
        }

        panel.appendChild(list);
        document.body.appendChild(panel);
        this.chunkListPanelEl = panel;

        // Scroll active into view
        this.scrollChunkListToActive();
    }

    /** Show chunk list panel — a text-based overview of all chunks the user can see/pick. */
    private showChunkListPanel(): void {
        this.clearChunkListPanel();
        const allChunks = this.scopeEngine.getChunks();
        if (allChunks.length === 0) return;

        const panel = document.createElement('div');
        panel.className = 'ms3-chunk-list-panel';

        const header = document.createElement('div');
        header.className = 'ms3-chunk-list-header';
        header.textContent = `区 ${allChunks.length} chunks`;
        panel.appendChild(header);

        const list = document.createElement('div');
        list.className = 'ms3-chunk-list-items';

        for (let i = 0; i < allChunks.length; i++) {
            const item = document.createElement('div');
            item.className = 'ms3-chunk-list-item';
            if (i === this.currentChunkIdx) {
                item.classList.add('ms3-chunk-list-item--active');
            }

            const idx = document.createElement('span');
            idx.className = 'ms3-chunk-list-idx';
            idx.textContent = `${i + 1}`;
            item.appendChild(idx);

            const preview = document.createElement('span');
            preview.className = 'ms3-chunk-list-preview';
            const rawText = allChunks[i].text;
            const cleanText = this.toDisplayText(rawText);
            preview.textContent = cleanText.length > 60 ? cleanText.slice(0, 58) + '…' : cleanText;
            item.appendChild(preview);

            // Tap a chunk item to enter focus on that chunk
            item.addEventListener('pointerdown', (e: PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                this.currentChunkIdx = i;
                this.currentIndex = i;
                this.physics.setPosition('y', i * UNIT_STEP);
                this.clearChunkBoundaries();
                this.clearChunkListPanel();
                this.enterChunkFocus(i);
            });

            list.appendChild(item);
            this.chunkListItemEls.push(item);
        }

        panel.appendChild(list);
        document.body.appendChild(panel);
        this.chunkListPanelEl = panel;

        // Scroll the active item into view
        this.scrollChunkListToActive();
    }

    /** Update which chunk is highlighted in the list panel. */
    private updateChunkListActive(): void {
        for (let i = 0; i < this.chunkListItemEls.length; i++) {
            const el = this.chunkListItemEls[i];
            if (i === this.currentChunkIdx) {
                el.classList.add('ms3-chunk-list-item--active');
            } else {
                el.classList.remove('ms3-chunk-list-item--active');
            }
        }
        this.scrollChunkListToActive();
    }

    /** Scroll the chunk list so the active item is visible. */
    private scrollChunkListToActive(): void {
        const active = this.chunkListItemEls[this.currentChunkIdx];
        if (active) {
            active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    /** Remove chunk list panel. */
    private clearChunkListPanel(): void {
        if (this.chunkListPanelEl) {
            this.chunkListPanelEl.remove();
            this.chunkListPanelEl = null;
        }
        this.chunkListItemEls = [];
    }

    /** Update which chunk boundary marker is active (lightweight — no DOM create/destroy). */
    private updateChunkBoundaryActive(): void {
        for (let i = 0; i < this.chunkBoundaryEls.length; i++) {
            const el = this.chunkBoundaryEls[i];
            if (i === this.currentChunkIdx) {
                el.classList.add('ms3-chunk-marker--active');
            } else {
                el.classList.remove('ms3-chunk-marker--active');
            }
        }
        this.updateChunkListActive();
    }

    /** Check if VROOM crossed a chunk boundary during navigation. */
    private checkChunkBoundaryCrossing(prevIndex: number, newIndex: number): void {
        if (this.chunkMode !== 'off' || this.chunks.length === 0) return;
        const allChunks = this.scopeEngine.getChunks();
        if (allChunks.length < 2) return;

        const prevUnit = this.units[prevIndex];
        const newUnit = this.units[newIndex];
        if (!prevUnit || !newUnit) return;

        const prevChunk = this.scopeEngine.findChunkAt(prevUnit.start);
        const newChunk = this.scopeEngine.findChunkAt(newUnit.start);

        if (prevChunk !== newChunk) {
            const now = performance.now();
            // Heavier haptic at chunk boundaries (vs normal unit step tick)
            if (now - this.chunkLastBoundaryAt > 60) {
                this.chunkLastBoundaryAt = now;
                this.haptics.fire('snap'); // chunk boundary = heavier than unit tick
            }
            // ── Thumper Boundary Brace: activate structural resistance ──
            // Next 2 steps require more drag force, creating a tactile "wall."
            this.vroomBraceSteps = 2;
            this.vroomBraceMultiplier = 1.4;
        }
    }

    /** Get chunk-specific combo segments for bit-level editing. */
    private getChunkBitSegments(): ComboSegment[] {
        const segs: ComboSegment[] = [
            { icon: 'B', label: 'Bold', action: 'bold', chainable: true },
            { icon: '◆', label: 'Hi', action: 'highlight', chainable: true },
            { icon: '▓', label: 'Spoiler', action: 'spoiler', chainable: true },
            { icon: '⎘', label: 'Cloze', action: 'cloze', chainable: true },
        ];
        // Add navigation arrows showing next/prev differentiated unit
        const prevDiff = this.findNextDifferentiatedUnit(-1);
        if (prevDiff >= 0) {
            const prevPreview = this.toDisplayText(this.units[prevDiff].text);
            segs.push({
                icon: '←', label: prevPreview.slice(0, 8) + (prevPreview.length > 8 ? '…' : ''),
                action: 'prev-select' as any, chainable: true,
            });
        }
        const nextDiff = this.findNextDifferentiatedUnit(1);
        if (nextDiff >= 0 && nextDiff < this.units.length) {
            const preview = this.toDisplayText(this.units[nextDiff].text);
            segs.push({
                icon: '→', label: preview.slice(0, 8) + (preview.length > 8 ? '…' : ''),
                action: 'next-select', chainable: true,
            });
        }
        // Bottom/exit → chunk-wide ring
        segs.push({ icon: '⬚', label: '区全体', action: 'chunk-wide' as any, chainable: false });
        return segs.slice(0, 7);
    }

    /** Get chunk-wide action segments (finishing ring). */
    private getChunkWideSegments(): ComboSegment[] {
        return [
            { icon: '◆', label: '== HL ==', action: 'chunk-highlight' as any },
            { icon: '❝', label: '> Quote', action: 'chunk-blockquote' as any },
            { icon: '📌', label: 'Callout', action: 'chunk-callout' as any },
            { icon: '⧉', label: 'Copy', action: 'chunk-copy' as any },
            { icon: '⚡', label: 'Command', action: 'command' },
            { icon: '✓', label: '完了', action: 'chunk-finish' as any },
        ];
    }

    /**
     * Find next unit that is DIFFERENTIATED from current — skip units where
     * different scope levels produce identical content (e.g., bunsetsu = sentence
     * for short single-bunsetsu sentences). Shows the NEXT unit that actually
     * differs in content coverage.
     */
    private findNextDifferentiatedUnit(direction: number): number {
        const curUnit = this.units[this.chunkFocusedIndex];
        if (!curUnit) return -1;

        const curText = curUnit.text.trim();
        let checkIdx = this.chunkFocusedIndex + direction;

        while (checkIdx >= 0 && checkIdx < this.units.length) {
            const candidate = this.units[checkIdx];
            if (candidate.text.trim() !== curText) return checkIdx;
            checkIdx += direction;
        }
        return -1;
    }

    /** Execute chunk-wide action (applies to entire chunk text). */
    private executeChunkWideAction(action: string): void {
        const chunk = this.scopeEngine.getChunks()[this.currentChunkIdx];
        if (!chunk) return;

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;
        const startPos = editor.offsetToPos(chunk.start);
        const endPos = editor.offsetToPos(chunk.end);
        const text = editor.getRange(startPos, endPos);

        switch (action) {
            case 'chunk-highlight': {
                // Per-line highlight — ==text== doesn't work across newlines in Obsidian
                // #12: Transcript-aware — skip [HH:MM:SS](url) prefix when wrapping
                const tsRe = /^(\[[\d:]+\]\([^)]*\)\s*)/;
                const hlLines = text.split('\n');
                const isHl = (l: string) => {
                    const t = l.trim();
                    if (!t) return true;
                    const m = t.match(tsRe);
                    const body = m ? t.slice(m[1].length) : t;
                    return body.startsWith('==') && body.endsWith('==');
                };
                const allHighlighted = hlLines.every(isHl);
                const hlResult = allHighlighted
                    ? hlLines.map(l => {
                        const t = l.trim();
                        const m = t.match(tsRe);
                        const prefix = m ? m[1] : '';
                        const body = m ? t.slice(prefix.length) : t;
                        return (body.startsWith('==') && body.endsWith('=='))
                            ? prefix + body.slice(2, -2)
                            : l;
                    }).join('\n')
                    : hlLines.map(l => {
                        if (!l.trim()) return l;
                        const m = l.match(tsRe);
                        if (m) return m[1] + `==${l.slice(m[1].length)}==`;
                        return `==${l}==`;
                    }).join('\n');
                editor.replaceRange(hlResult, startPos, endPos);
                this.haptics.fire('impact');
                break;
            }
            case 'chunk-blockquote': {
                // Prepend > to each line
                const lines = text.split('\n');
                const isQuoted = lines.every(l => l.startsWith('> ') || l.trim() === '');
                const newText = isQuoted
                    ? lines.map(l => l.startsWith('> ') ? l.slice(2) : l).join('\n')
                    : lines.map(l => l.trim() ? `> ${l}` : l).join('\n');
                editor.replaceRange(newText, startPos, endPos);
                this.haptics.fire('impact');
                break;
            }
            case 'chunk-callout': {
                const lines = text.split('\n');
                const isCallout = lines[0]?.startsWith('> [!');
                if (isCallout) {
                    // Remove callout wrapping
                    const unwrapped = lines
                        .slice(1) // remove header
                        .map(l => l.startsWith('> ') ? l.slice(2) : l)
                        .join('\n');
                    editor.replaceRange(unwrapped, startPos, endPos);
                } else {
                    const wrapped = `> [!note]\n${lines.map(l => `> ${l}`).join('\n')}`;
                    editor.replaceRange(wrapped, startPos, endPos);
                }
                this.haptics.fire('impact');
                break;
            }
            case 'chunk-finish': {
                // Exit chunk mode entirely
                this.exitChunkMode();
                return;
            }
            default: return;
        }

        // Rebuild after chunk-wide edit and re-enter chunk focus at same chunk
        this.lastContentHash = '';
        const savedChunkIdx = this.currentChunkIdx;
        this.chunkMode = 'off'; // temporarily exit so rebuildUnits doesn't fight
        this.rebuildUnits();
        // Re-enter focused mode on the same chunk (offsets have shifted)
        if (savedChunkIdx >= 0 && savedChunkIdx < this.chunks.length) {
            this.enterChunkFocus(savedChunkIdx);
        }
        this.haptics.fire('success');
    }

    /** Handle scope swipe past max level: enter/exit chunk mode. */
    private handleChunkScopeTransition(direction: number): boolean {
        if (direction > 0) {
            // Swipe RIGHT past max scope → enter chunk overview
            if (this.chunkMode === 'off' && this.scopeLevel === SCOPE_COUNT - 1) {
                this.enterChunkOverview();
                return true;
            }
            // Right-swipe in overview → dive into focused chunk
            if (this.chunkMode === 'overview') {
                this.clearChunkBoundaries();
                this.enterChunkFocus();
                return true;
            }
        } else if (direction < 0) {
            // Swipe LEFT from chunk overview → exit back to sentence scope
            if (this.chunkMode === 'overview') {
                this.exitChunkMode();
                return true;
            }
            // Swipe LEFT from chunk focus → exit chunk mode
            if (this.chunkMode === 'focused') {
                this.exitChunkMode();
                return true;
            }
        }
        return false;
    }

    /** Handle combo segment execution in chunk mode. */
    private executeChunkComboSegment(seg: ComboSegment): boolean {
        const action = seg.action as string;

        // next-select / prev-select in chunk focus: jump to next DIFFERENTIATED unit
        if ((action === 'next-select' || action === 'prev-select') && this.chunkMode === 'focused') {
            const dir = action === 'next-select' ? 1 : -1;
            const nextDiff = this.findNextDifferentiatedUnit(dir);
            if (nextDiff >= 0 && nextDiff < this.units.length) {
                this.currentIndex = nextDiff;
                this.chunkFocusedIndex = nextDiff;
                this.physics.setPosition('y', nextDiff * UNIT_STEP);
                this.updateHighlight();
                this.updateCounter();
                this.updateZoomLane();
                this.updateChunkSpotlight();
            }
            return true;
        }

        if (action === 'chunk-wide') {
            // Open chunk-wide action ring
            this.closeComboRing();
            setTimeout(() => {
                const padRect = this.padEl?.getBoundingClientRect();
                if (padRect) {
                    this.comboCenterX = padRect.left + padRect.width / 2;
                    this.comboCenterY = Math.max(padRect.top - 80, window.innerHeight * 0.4);
                }
                this.comboCenterSet = true;
                this.openComboRing(this.currentIndex, this.getChunkWideSegments());
            }, 100);
            return true;
        }

        if (action === 'chunk-copy') {
            const chunk = this.scopeEngine.getChunks()[this.currentChunkIdx];
            if (chunk) {
                const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    const editor = view.editor;
                    const text = editor.getRange(
                        editor.offsetToPos(chunk.start),
                        editor.offsetToPos(chunk.end)
                    );
                    navigator.clipboard.writeText(text);
                    this.haptics.fire('success');
                }
            }
            this.closeComboRing();
            return true;
        }

        if (action === 'chunk-highlight' || action === 'chunk-blockquote'
            || action === 'chunk-callout' || action === 'chunk-finish') {
            this.executeChunkWideAction(action);
            this.closeComboRing();
            return true;
        }

        return false; // not a chunk action, fall through to normal handling
    }
}
