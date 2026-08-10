# JP Game Mechanics → Plugin Subsystem Mapping

_Research synthesis for JP Sentence Surfer gesture/interaction overhaul._
_~25 games analyzed. Mechanics evaluated for touch-screen text editing applicability._

---

## Methodology

Each game is evaluated on:
1. **Input paradigm** — what physical gesture does it require?
2. **Feedback loop** — how does the game communicate state changes?
3. **Applicable subsystem** — which plugin module benefits from this mechanic?
4. **Adaptation notes** — concrete implementation sketch

Games already referenced in the codebase are marked with ★.
Games newly researched are marked with ◆.

---

## Part 1: Games Analyzed — Extracted Mechanics

### 1. ★ osu! — Approach Circles + Cursor Momentum

**Input**: Click/tap circles as approach ring contracts to target. Sliders = drag along path. Spinners = circular motion.

**Key Mechanics**:
- **Approach Circle timing** — visual cue that contracts to indicate "act now". The shrinking ring gives anticipation without requiring static waiting.
- **Sliders** — drag along a defined curved path at a specific speed. The path is visible, the player follows it.
- **Spinner** — circular motion to fill a gauge. Speed of rotation = fill rate. 
- **Combo counter** — increments on hits, resets on miss, multiplies score.

**Plugin Mapping**:
- **Zoom Lane / VROOM** — approach circle = unit highlight pulsing as you approach it during VROOM navigation. No tap needed — the unit "activates" when your momentum carries you through it.
- **Extend Selection** — slider mechanic = extend path is visible (the sentence/clause), you drag along it. The path IS the text.
- **Combo Ring** — direct inspiration already used. Keep the radial layout but make segments appear/disappear based on context (not static).

---

### 2. ★ Persona 5 — Radial Menus + All-Out Attack

**Input**: Radial menu appears contextually. Selecting an option triggers it instantly. All-Out Attack = bulk action when conditions met.

**Key Mechanics**:
- **Contextual radial menu** — only appears when useful, options change based on enemy weakness/status.
- **All-Out Attack** — when ALL enemies are down, a single input triggers a devastating group attack. Conditions must be met first.
- **1 More** — getting a critical hit gives you an immediate bonus turn. Momentum rewards.

**Plugin Mapping**:
- **Combo Ring** — already used. But should adopt the **contextual appearance**: combo ring segments should change based on what you've selected (noun → different actions than verb, single bunsetsu → different than full sentence). Currently uses static `CHAIN_AFTER` trees.
- **All-Out Attack → Bulk Action** — when maker mode has multiple stamps placed, a "sweep" gesture triggers bulk processing (all stamps applied at once). The stamps are the "downed enemies."
- **1 More → Chain Bonus** — completing an action (e.g., cloze creation) should automatically offer the likely next action rather than returning to neutral.

---

### 3. ★ Devil May Cry / Bayonetta — Style Meter + Combo Variety

**Input**: Attack combos with timing variation. Style rank escalates with variety, decays with repetition/inactivity.

**Key Mechanics**:
- **Style Meter (D→C→B→A→S→SS→SSS)** — rewards VARIETY of actions, not repetition. Using the same move drops style. Mixing moves raises it.
- **Witch Time (Bayonetta)** — dodging at the last moment slows time, giving precision window.
- **Wicked Weaves** — combo finishers summon powerful attacks. The finisher is automatic after the combo chain.

**Plugin Mapping**:
- **Combo Graduation** — already has 3+/5+ graduation. Should additionally reward ACTION VARIETY: selecting→editing→coping→navigating in sequence should build faster than selecting→selecting→selecting.
- **Witch Time → Precision Mode** — releasing a fast VROOM scroll near a target triggers a brief slowdown (reduced physics damping) for precise landing. Already partially there with `mikiriSnap()`.
- **Wicked Weaves → Auto-Finisher** — after a chain of actions (e.g., stamp 3+ items in maker mode), the system automatically offers a "finisher" action (e.g., "apply all + create deck").

---

### 4. ★ Monster Hunter Rise — Wirebug + Weapon Combos

**Input**: Directional attacks with weapon-specific combo trees. Wirebugs = mid-action repositioning.

**Key Mechanics**:
- **Wirebug** — mid-combo, launch yourself in a direction to reposition without breaking flow. Costs a resource that regenerates.
- **Weapon Combo Trees** — each weapon has branching combo paths (Great Sword: charge→tackle→true charge; Dual Blades: demon mode→archdemon). Input timing matters.
- **Switch Skill Swap** — mid-combat, switch between two skill loadouts with a single input.

**Plugin Mapping**:
- **Wirebug → Scope Jump** — mid-selection, a quick directional gesture "wirebugs" you to the next scope level without losing your current selection start point. E.g., extending through a bunsetsu, flick up to jump to clause-level, continue extending.
- **Combo Trees → Action Chains** — the `CHAIN_AFTER` system maps here. But should be dynamic: the chain tree changes based on what TYPE of text you've selected (particle → different chain than noun phrase).
- **Switch Skill Swap → Mode Toggle** — a specific gesture (e.g., two-finger twist) swaps between VROOM and Precision without leaving the current position.

---

### 5. ★ Sekiro — Deflect + Mikiri Counter

**Input**: Precisely-timed directional counter. Deflect = block at exact moment. Mikiri = forward-step into thrust.

**Key Mechanics**:
- **Deflect** — timing-based. Perfect timing breaks posture. The game trains you to FEEL the rhythm of enemy attacks.
- **Mikiri Counter** — step INTO the danger (forward dodge into a thrust attack). Counterintuitive but rewarding.
- **Posture System** — attacks build posture damage. When posture breaks, a Deathblow opportunity appears. Sustained pressure > single big hits.

**Plugin Mapping**:
- **Mikiri → Already implemented** as `mikiriSnap()` — snapping to the nearest unit boundary when extending selection. Keep this.
- **Posture / Sustained Pressure → Selection Pressure** — sustained directional movement through text "builds pressure" on scope boundaries. Lingering at a clause boundary causes it to "break" (auto-scope-up). No explicit gesture needed — just sustained movement in one direction.
- **Deflect → Boundary Bounce** — when extending selection and hitting a sentence boundary, a brief resistance (spring stiffness increase) gives tactile feedback before crossing into the next sentence.

---

### 6. ★ Gravity Rush — Gravity Shift

**Input**: Aim + shift gravity. Entire physics frame of reference changes. Fall in any direction.

**Key Mechanics**:
- **Gravity Shift** — point in a direction, world rotates. You "fall" toward where you pointed. Seamless transition.
- **Stasis Field** — pick up objects while in shifted gravity, throw them.
- **Sliding** — gravity-powered surface movement. Touch the ground while shifted and slide.

**Plugin Mapping**:
- **Gravity Shift → Mode Transition** — entering Maker Mode or Chunk Edit doesn't feel like "opening a menu." Physics reference frame changes. In VROOM, momentum is horizontal (through text). In Maker Mode, momentum is vertical (through stamps). In Chunk Edit, there's no gravity (free float).
- **Stasis Field → Multi-select carry** — grab selections, carry them to a new context before releasing.
- **Sliding → Momentum Scroll** — touch surface + move = momentum-based scrolling, already the core mechanic. Gravity Rush validates this instinct.

---

### 7. ★ Rhythm Heaven / Rhythm Tengoku — Feel, Don't See

**Input**: Audio-timed gestures with minimal visual cues. The game teaches rhythm through practice, then removes visual aids.

**Key Mechanics**:
- **Audio-first design** — you learn the rhythm by hearing it, not watching a note highway. Visual cues are de-emphasized over time.
- **Micro-game variety** — each stage has completely different mechanics (flick, tap, hold, shake) but all based on rhythm.
- **Practice → Performance loop** — explicit practice mode, then performance. Separation of learning and doing.

**Plugin Mapping**:
- **Audio-first → Haptic-first** — the plugin can't use audio (reading context), but haptic pulses serve the same role. Rhythm Heaven validates the design of HapticEngine's contextual pulses. Each scope boundary type should have a distinct haptic pattern.
- **Micro-game variety → Mode-specific gestures** — each mode having different gesture meanings is fine (and desirable), as long as there's a clear "practice" phase. The cheat sheet system already exists for this.
- **Minimal visual cues** — advanced users should be able to navigate by haptic feel alone. The highlight overlay is training wheels. Consider a "zen mode" that dims visual feedback.

---

### 8. ★ Beatmania IIDX — Turntable + Keys

**Input**: 7 keys + 1 turntable (analog rotation). Turntable and keys are simultaneous.

**Key Mechanics**:
- **Turntable scratch** — continuous analog rotation, direction matters (clockwise vs counter-clockwise).
- **Charge Notes** — hold a key down, release on timing. The hold duration matters.
- **BPM changes** — note speed changes mid-song. Player must adapt scroll speed perception dynamically.

**Plugin Mapping**:
- **Turntable → Already the vertical scroll metaphor**. But should explicitly support bidirectional: clockwise = forward, counter-clockwise = backward. Currently the vertical drag direction handles this.
- **Charge Notes → Press-and-move** — start a gesture, duration of movement before release determines action type. Short drag = navigate, sustained drag = select.
- **BPM changes → Adaptive gain** — scroll sensitivity changes based on document content density. Dense kanji regions = slower scroll speed per pixel, sparse kana = faster. Already partially implemented with VROOM's dynamic gain curve.

---

### 9. ★ Touhou — Bullet Hell Precision

**Input**: Precise micro-movements through tiny gaps in massive bullet patterns.

**Key Mechanics**:
- **Hitbox focus** — holding focus key shows your exact hitbox (tiny) and slows movement. Precision mode.
- **Grazing** — moving close to bullets (without touching) gives bonus points. Near-miss rewards.
- **Bomb** — panic button that clears bullets. Limited uses.

**Plugin Mapping**:
- **Hitbox Focus → Precision Mode** — when in precision selection, movement speed drops and the selection cursor shows its exact position relative to character boundaries. This is the "focus" mode.
- **Grazing → Near-boundary haptics** — moving selection near but not past a scope boundary gives subtle haptic feedback. "Grazing" a sentence boundary without crossing it = bonus micro-feedback that orients you.
- **Bomb → Undo gesture** — a specific rapid gesture (sharp flick against current direction?) cancels the current action entirely. Nuclear undo.

---

### 10. ★ Okami — Celestial Brush

**Input**: Pause game, paint on the screen with a brush. Shape determines effect.

**Key Mechanics**:
- **Shape recognition** — circle = Bloom (restore), horizontal line = Power Slash (cut), loop = Galestorm (wind), dot = Cherry Bomb (explode).
- **Ink meter** — limited ink depletes as you draw, regenerates over time.
- **Draw on reality** — the brush affects the game world directly. Draw a circle around a dead tree → it blooms.

**Plugin Mapping**:
- **Shape recognition → Maker Mode gestures** — already partially implemented with 8-direction compass. Extend: circle gesture = scope the selection up one level, line gesture = cloze (slash), zigzag = toggle format. Shape-based is better than direction-based for complex actions.
- **Ink meter → Action budget** — maker mode stamps / combo actions have a soft limit. Not a hard gate, but visual dimming of the action budget encourages deliberate use.
- **Draw on reality → Brush-on-text** — maker stamps should feel like painting ON the text, not placing pins above it. The brush metaphor from Okami validates the Sumi Brush naming already used.

---

### 11. ★ Katamari Damacy — Roll + Accumulate

**Input**: Dual stick controls a sticky ball. Everything you touch gets absorbed. Ball grows, enabling larger objects.

**Key Mechanics**:
- **Accumulation** — start small, grow. Early objects are tiny, late objects are buildings. Scale progression.
- **Size gates** — can't pick up objects larger than your current size. Natural difficulty progression.
- **Dual-stick directional** — two parallel inputs control movement. Not a single point of contact.

**Plugin Mapping**:
- **Accumulation → Multi-stamp in Maker Mode** — each stamp you place grows your "katamari." The collection of stamps is your ball. At a certain count (size gate), you unlock bulk-action options that weren't available for fewer stamps.
- **Size gates → Scope graduation** — already implemented (3+/5+ combo graduation). Katamari validates this: you EARN the bigger scope by doing small precise work first.
- **Dual inputs** — on devices supporting multi-touch, two fingers could independently control scope and position. Left finger = scope level (pinch already does this), right finger = position. Simultaneous.

---

### 12. ◆ Sound Voltex (SDVX) — Analog Knobs + Laser Highway

**Input**: Two analog knobs (continuous bidirectional rotation) + 4 BT buttons + 2 FX buttons. Knobs control laser paths on screen.

**Key Mechanics**:
- **Analog Knobs** — smooth, continuous rotation. No discrete positions. Turn left, turn right, hold position. Two independent knobs = two independent analog inputs.
- **Laser Highway** — the knob's position maps to a horizontal laser on screen. Turn the knob = the laser moves left/right. The visual feedback is immediate and continuous.
- **FX effects** — buttons that modify the audio (filters, flangers). Additive modifiers on top of the base interaction.
- **EXCESSIVE rate** — beyond AAA, a perfect-plus tier for the highest accuracy.

**Plugin Mapping**:
- **Analog Knob → Horizontal Selection** — THIS is the missing metaphor for omnidirectional horizontal scrolling. The knob turns smoothly in either direction. Selection should extend left or right with equal fluidity, turning the "knob" (dragging horizontally) in either direction. No direction lock. No mode switch. Just turn.
- **Laser Highway → Selection Beam** — the highlight overlay should respond like SDVX's laser track: immediately visible, smoothly animated, continuously following the "knob" position.
- **FX Modifiers → Gesture modifiers** — a second finger down while extending selection could modify what kind of selection it is (word-level vs character-level), like pressing an FX button while turning a knob.
- **EXCESSIVE → Beyond-perfect tier** — for the combo system, add a tier above the current max graduation for sustained flawless chains.

**Verdict**: ⭐⭐⭐ HIGH RELEVANCE. The knob metaphor directly solves the omnidirectional horizontal extension problem. This should be the primary inspiration for the extend-selection rewrite.

---

### 13. ◆ Groove Coaster — Track Riding + Escalating Chains

**Input**: Tap, hold, slide, scratch (circular), flick on a single touch point. Avatar rides a rollercoaster track.

**Key Mechanics**:
- **Track Riding** — the avatar rides a pre-defined path with ups, downs, curves. The player doesn't control direction; they interact WITH the rhythm of the track.
- **CHAIN → FEVER → TRANCE** — combo escalation system. 10 chain = FEVER (visual explosion), 100 chain = TRANCE (everything transforms). Each tier has distinct visual identity.
- **Scratch Notes** — circular motion on the pad. Not a tap, not a slide — a rotation.
- **Ad-lib Notes** — hidden bonus notes that appear only in certain conditions. Contexual rewards.

**Plugin Mapping**:
- **Track Riding → VROOM Navigation** — VROOM should feel like riding a track through the text. You're ON the text, moving through it. The sentence structure IS the rollercoaster — clauses are ups, periods are drops, commas are gentle curves. The highlight overlay traces this "track."
- **CHAIN/FEVER/TRANCE → Combo Escalation** — three distinct combo tiers with increasingly dramatic visual transformations:
  - CHAIN (1-9): subtle glow on highlight
  - FEVER (10-29): highlight pulses, combo ring gets a flame effect
  - TRANCE (30+): full visual mode change — highlight becomes a beam, navigation gets smoother (reduced friction)
- **Scratch Notes → Scope Change** — circular gesture on the touch surface = scope rotation. This is better than pinch for single-finger operation.
- **Ad-lib Notes → Context Actions** — actions that appear only when specific text patterns are detected (e.g., "copy reading" only appears when you've selected kanji with furigana data).

**Verdict**: ⭐⭐⭐ HIGH RELEVANCE. Track-riding perfectly captures the VROOM feeling. The three-tier combo system (CHAIN/FEVER/TRANCE) is a significant upgrade over the current 3+/5+ binary graduation.

---

### 14. ◆ Cytus / Cytus II — Scan Line + Drag Notes

**Input**: Active scan line moves up/down. Tap when line crosses notes. Drag notes = slide finger along connected path. Flick notes.

**Key Mechanics**:
- **Active Scan Line** — a line sweeps up and down the screen. Notes activate when the line crosses them. The line is the clock, not the notes.
- **Drag Notes** — connected chain of small circles. Slide your finger along the trail. The path is predetermined.
- **Hold Notes** — press and hold until the scan line returns. Extended duration interaction.
- **Flick Notes (Cytus II)** — directional flick at exact timing. Brief, intentional.

**Plugin Mapping**:
- **Scan Line → Selection Cursor** — the cursor moving through text IS the scan line. Text units "activate" as the cursor passes them. What if the selection highlight didn't jump to the target — it SWEPT from current position through all intermediate text, like a scan line moving through the document?
- **Drag Notes → Extend Selection Path** — the extend selection should feel like following a Cytus drag path: the path (sentence text) is visible, you trace along it, each character highlights as your finger passes it. Not a jump, a continuous trace.
- **Flick Notes → Quick Actions** — on a selected unit, a flick in a specific direction triggers an instant action without entering the combo ring. Flick-right = next unit, flick-left = previous, flick-up = scope up, flick-down = scope down.
- **Hold Notes → Sustained Actions** — drag and hold at a position = enter maker mode at that position. Duration of hold = not a static "long press" but a "drag-to-position-and-hold" (motion, then stillness).

**Verdict**: ⭐⭐⭐ HIGH RELEVANCE. The scan-line sweep metaphor addresses the snap-back bug conceptually: selection should SWEEP through text, not teleport. Drag notes = the physical model for extend selection.

---

### 15. ◆ Wonderful 101 — Shape Drawing + Unite Morph

**Input**: Draw shapes on the touchscreen / with the analog stick. Shape determines the weapon summoned.

**Key Mechanics**:
- **Unite Morph shapes** — straight line = Unite Sword (slash), circle = Unite Hand (grab), L-shape = Unite Gun (ranged), wavy line = Unite Whip (area), triangle = Unite Bomb.
- **Recruitment** — hit civilians during gameplay, they join your squad. More squad members = bigger and more powerful morphs. 
- **Battery meter** — using Unite Morphs costs battery. Battery recharges from normal attacks. Resource management.
- **Multi-Morph** — divide your squad into groups to form multiple weapons simultaneously.

**Plugin Mapping**:
- **Shape → Action** — a dedicated gesture vocabulary: 
  - Line (horizontal) = cloze/cut
  - Circle = scope up (encompass more)
  - L-shape = search (gun = target at distance)
  - Zigzag = format toggle
  - Dot tap-tap-tap = multi-stamp
- **Recruitment → Selection Accumulation** — each bunsetsu you "pass through" during navigation joins your selection squad (like W101 citizens). More selected = more powerful bulk actions available.
- **Battery → Action cooldown** — this connects to Okami's ink meter. Performing complex actions (bulk apply, deck creation) depletes a resource that recharges through simpler actions (navigation, selection).
- **Multi-Morph → Split Context** — divide your attention: one selection active, one selection being extended. Parallel paths.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. Shape gestures are compelling but may conflict with the "motion-only, no static poses" principle. Best adapted as motion-path shapes (draw while moving, never while stationary).

---

### 16. ◆ Metal Gear Rising: Revengeance — Blade Mode + Zandatsu

**Input**: Enter Blade Mode → analog stick controls cutting angle → swing sword along that plane. Free-form cutting on any object.

**Key Mechanics**:
- **Blade Mode** — time slows dramatically. A targeting reticle appears as a transparent blue cutting plane. You rotate and angle the plane freely, then cut. ANY angle works.
- **Zandatsu** — after cutting, reach into the enemy's body and rip out their glowing spine/core. The reward for precise cutting.
- **Parry system** — instead of dodge, you attack INTO incoming attacks to deflect them. Aggressive defense.
- **S-rank grading** — performance graded on combo variety, damage taken, time.

**Plugin Mapping**:
- **Blade Mode → Precision Selection** — THIS is the ultimate precision-mode metaphor. When entering precision selection, time "slows" (haptic pulse rate decreases, scroll friction increases dramatically). A selection plane appears. You control the angle/extent of the selection with analog (finger drag) precision. The selection IS the cut.
- **Cutting Plane → Selection Angle** — instead of purely horizontal selection, the cutting plane metaphor suggests you could select at different "angles": horizontal drag = word selection, diagonal drag = clause selection, vertical drag = sentence selection. The angle of your initial drag determines what scope you're selecting at.
- **Zandatsu → Extract Action** — after making a precise selection (cut), an immediate action opportunity: rip out the content (create cloze, copy, extract). This is the "reward" for the precise cut. The action is fast and aggressive, not a gentle menu selection.
- **Parry → Block at boundary** — when extending selection and approaching a scope boundary you don't want to cross, a sharp gesture back (like a parry) locks the selection at exactly that boundary. Aggressive precision.

**Verdict**: ⭐⭐⭐ HIGH RELEVANCE. Blade Mode is arguably the single best metaphor for precision selection. The "time slows, you aim the cutting plane" concept should directly inform the precision mode redesign.

---

### 17. ◆ Theatrhythm Final Fantasy — Three Stage Types + Trace

**Input**: 3DS stylus touchscreen: tap, hold, slide direction, and **trace along a waving line**.

**Key Mechanics**:
- **FMS (Field Music Sequence)** — side-scrolling. Character walks. You must tap, slide, and TRACE along a waving path with the stylus. Following the wave requires smooth, continuous movement.
- **BMS (Battle Music Sequence)** — notes come from left. Tap/hold/slide in correct direction. Performance = attack power. Each hit IS an attack on an enemy.
- **EMS (Event Music Sequence)** — cursor moves around the screen freely. Follow it with stylus. Tracks cinematic scenes.
- **Leveling system** — characters level up based on rhythm performance. RPG stats affect gameplay outcomes.

**Plugin Mapping**:
- **FMS Trace → Extend Selection** — the waving trace mechanic directly maps to extending selection along a non-linear text path. Japanese text with its alternating bunsetsu patterns creates a natural "wave" of importance: content words (high) and particles (low). Tracing this wave = selecting with bunsetsu-awareness.
- **BMS = Attack → Edit Actions** — each combo ring action should feel like a BMS hit: directional, impactful, visual feedback shows the "damage" (text transformation). 
- **EMS Free Cursor → Chunk Edit Overview** — in chunk edit/overview mode, the cursor can move freely across the document, following text structure. This is the "event" mode — you're reviewing, not attacking.
- **Leveling → Persistent User Skill** — the plugin could track user proficiency over time. Faster gestures unlock smoother animations (less visual handholding needed). Not critical, but an interesting progression mechanic.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. The trace mechanic validates extend-selection-as-path-following. The three unique stage types validate having distinct interaction paradigms per mode.

---

### 18. ◆ Taiko no Tatsujin — Don/Ka + Drumroll

**Input**: Hit center of drum (Don) or rim (Ka). Drumroll = rapid sustained hits. Balloon = rapid hits to pop.

**Key Mechanics**:
- **Don (center) vs Ka (rim)** — two distinct zones on the same input surface. Context comes from WHERE you hit, not how.
- **Drumroll** — sustained rapid drumming. Not a single hit — continuous rhythmic input that sustains an ongoing action.
- **Notechart branching** — based on performance, the game dynamically switches to harder or easier note patterns mid-song.
- **Spirit gauge** — fill by hitting accurately. Must be above threshold by end of song. Sustained accuracy > burst accuracy.

**Plugin Mapping**:
- **Don/Ka zones** — the left half and right half of the screen already map to different action zones (left = action, right = extend in the current codebase). Taiko validates this spatial zone design. But suggests it should be TWO zones on the SAME gesture surface, not invisible boundaries.
- **Drumroll → Sustained Selection Extend** — extending selection continuously (not lifting finger) should feel like a drumroll: sustained rhythmic engagement. The haptic engine should pulse at a rhythm proportional to the speed of characters passing under the selection.
- **Notechart branching → Adaptive Difficulty** — if the user is making lots of precise selections quickly, the gesture sensitivity increases (higher difficulty = more control). If they're struggling, sensitivity decreases (easier = more forgiving snap zones).
- **Spirit gauge → Session Quality** — track accuracy over a reading session. High sustained accuracy = unlock optional power features.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. Don/Ka zone design validates the existing left/right zone system. Drumroll = sustained extend. Branching validates adaptive gesture sensitivity.

---

### 19. ◆ VOEZ — Dynamic Lane Movement

**Input**: Tap, hold, slide, swipe — but the lanes MOVE. They shift position, appear, disappear, resize dynamically.

**Key Mechanics**:
- **Dynamic lanes** — note lanes physically animate across the screen, splitting, merging, widening, narrowing. The playing field itself is in constant motion.
- **Lane animations tied to music** — calm sections have stable lanes, intense sections have rapidly shifting lanes. Difficulty scales with chaos.
- **Visual clarity despite motion** — despite all the movement, you can still read what's coming because the note-in-lane relationship is preserved.

**Plugin Mapping**:
- **Dynamic Lanes → Adaptive UI** — the combo ring, scope indicators, and highlight overlay should not be static positioned elements. They should smoothly animate based on context:
  - Entering maker mode: combo ring segments smoothly reposition around the current selection
  - Scope change: highlight overlay width smoothly animates to the new scope
  - Mode transition: UI elements flow to their new positions, they don't hard-cut
- **Lane merge/split → Scope visualization** — when bunsetsu merge into a clause (scope up), the individual bunsetsu highlights should visually MERGE like VOEZ lanes converging. When you scope down, they SPLIT apart.
- **Chaos scaling → Information density** — during complex operations (multi-select, deep combo chains), more UI elements appear. During simple navigation, the UI is minimal. The "visual chaos" scales with cognitive complexity.

**Verdict**: ⭐⭐⭐ HIGH RELEVANCE. Dynamic lane movement directly addresses the "boxed in" feeling of the current static layout. UI elements should FLOW, not snap.

---

### 20. ◆ Deemo — Falling Notes + Tree Growth

**Input**: Piano-key style touch. Notes fall from top, hit keyboard line at bottom.

**Key Mechanics**:
- **Falling approach** — notes approach from distance, getting larger/clearer as they arrive.
- **Tree growth** — performance makes a tree grow. The tree is the overall progress metaphor. It grows slowly and organically based on cumulative performance.
- **Charting slides** — notes can slide left/right, requiring the player to follow a continuous path.

**Plugin Mapping**:
- **Tree growth → Session progress** — a subtle visual indicator that grows as you make more selections/edits in a session. Not score, just a feeling of "I've been productive."
- **Falling approach → Zoom Lane** — units approaching in the zoom lane should have a Deemo-like quality: small and distant, growing as they approach the active position.

**Verdict**: ⭐ LOW-MEDIUM RELEVANCE. Aesthetic validation more than mechanical innovation.

---

### 21. ◆ Maimai — Circular Layout + Slide Paths

**Input**: Circular arcade cabinet with 8 zones. Buttons around the rim. Touchscreen in center. Slide notes trace paths around the circle.

**Key Mechanics**:
- **Circular input** — 8 directional zones arranged in a wheel. Notes arrive from the center and reach their zone on beat.
- **Slide notes** — a note arrives at one zone, and a slide path connects it to another zone. You slide your hand along the rim following the path.
- **Both-hands required** — notes appear at opposite ends simultaneously, requiring ambidextrous input.

**Plugin Mapping**:
- **Circular layout → Combo Ring** — directly validates the existing radial pie-menu design. But Maimai's version is more dynamic: segments light up in sequences, creating paths around the ring.
- **Slide paths → Combo Chains** — instead of discrete "chain-after" menus, combo transitions should be SLIDE PATHS: from one action segment, a visible path slides to the next natural action. You follow the path to chain.
- **8-directional** — Maimai's 8 zones match the maker mode's 8-direction compass exactly. Validates the 8-direction approach for gesture discrimination.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. Validates circular combo ring + 8-direction gestures. Slide paths improve combo chain UX.

---

### 22. ◆ Project Diva / Project Sekai — Linked Stars + Trace Notes

**Input**: Face buttons matched to on-screen icons. Analog stick flick for Star notes. Sustained analog rotation for Linked Stars.

**Key Mechanics**:
- **Linked Stars** — a sequence of star notes connected by a trail. Hold and rotate the analog stick to sweep through them. Continuous rotation = continuous scoring.
- **Chance Time** — a special section where performance unlocks a bonus scene/ending. Extra stakes for a limited window.
- **Trace Notes (Project Sekai)** — on mobile, drag your finger along a visible path. The path curves. Green trace = finger on screen, pink trace = finger on screen. Multiple simultaneous trace paths possible!

**Plugin Mapping**:
- **Linked Stars → Connected Selection Sweep** — sweep through multiple bunsetsu in sequence without lifting finger. Each bunsetsu IS a star in the linked chain. The trail connecting them = the text between them.
- **Chance Time → Critical Section** — when the user is about to hit a sentence boundary or paragraph boundary, signal "Chance Time" — an opportunity for a bigger action (scope up, page navigation, chunk-level operation).
- **Trace Notes (Sekai) → Multi-finger Extend** — two fingers tracing two paths simultaneously = two selections being built at once. Left finger selects, right finger indicates where the selection should go (move/copy destination). THIS solves the "where do I put this?" problem.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. Linked Stars = sweep navigation. Multi-trace paths = dual-selection.

---

### 23. ◆ Jubeat — Grid-Based Spatial Awareness

**Input**: 4x4 grid of touch-sensitive panels. Notes appear on specific panels at specific times. Spatial + temporal.

**Key Mechanics**:
- **Spatial memory** — you must track WHERE on the grid a note appears, not just WHEN. Requires spatial awareness of the entire playing field.
- **Simultaneous multi-touch** — multiple panels can require simultaneous presses. 
- **Pattern recognition** — notes often form visual patterns (diagonals, crosses, spirals) that the player learns to recognize as gestures.

**Plugin Mapping**:
- **Spatial awareness → Chunk Overview** — chunk overview mode should present text chunks in a grid-like spatial arrangement, not a linear list. Chunks spatially positioned = you develop spatial memory for where content is in the document.
- **Multi-touch → Simultaneous selections** — in chunk overview, touch two chunks simultaneously to establish a relationship (merge, swap, compare).
- **Pattern recognition → Gesture learning** — the user develops spatial intuition for where gesture zones are. After enough use, they don't need the cheat sheet.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. Grid layout for chunk overview. Spatial memory development.

---

### 24. ◆ NieR: Automata — Seamless Mode Transitions + Bullet Hell Integration

**Input**: Action RPG with seamless transitions between hack-and-slash, twin-stick shooter, side-scrolling, and top-down modes.

**Key Mechanics**:
- **Seamless transitions** — the game camera smoothly transitions between perspectives without pause or loading. One moment you're in 3D action, the next you're in 2D side-scrolling, then top-down bullet hell. No mode-select menu.
- **Pod Programs** — secondary weapons (ranged laser, shield, gravity bomb) that augment the primary melee. Always available, no mode switch needed.
- **Chip system** — fully customizable loadout of passive abilities. You can even remove the HUD elements as "chips" to free up capacity.

**Plugin Mapping**:
- **Seamless transitions → Mode blending** — MODE CHANGES SHOULD NOT BE DISCRETE EVENTS. Moving from VROOM to Precision to Extend should be a smooth physical transition. Started scrolling fast? You're in VROOM. Slowed down near a border? You've smoothly entered Precision. Started moving horizontally? You're now Extending. No button, no tap, no gesture to "enter" a mode. The physics determines the mode.
- **Pod Programs → Always-available secondary** — one-finger actions are primary (navigation, selection). Two-finger gestures are "pod programs" — always available regardless of mode: pinch = scope, two-finger drag = scroll without selecting.
- **Chip system → Customizable gesture mapping** — users can reassign what gestures do in settings. Don't lock to a fixed mapping.

**Verdict**: ⭐⭐⭐ HIGH RELEVANCE. Seamless mode transition is perhaps the single most important design principle for the overhaul. NieR proves it works in practice: context determines mode, not explicit switches.

---

### 25. ◆ Splatoon — Ink Territory + Gyro Aim

**Input**: Analog stick for movement + gyro aim for fine-tuning. Paint territory by shooting.

**Key Mechanics**:
- **Territory painting** — you claim territory by inking it. Ink is visible (your color vs theirs). The game IS the surface.
- **Gyro fine-tuning** — stick for broad aim, gyro for fine adjustment. Two-tier precision system.
- **Swim in ink** — move through your own ink at high speed. Your previous work accelerates future work.

**Plugin Mapping**:
- **Territory painting → Visual selection feedback** — selected text should be "inked." Visited text stays marked (dimly) even after deselection. You build a visual territory of "I've processed this" across the document.
- **Two-tier precision** — coarse (broad drag movement) + fine (subtle finger pressure/angle). If device supports force touch: light touch = VROOM, heavy touch = precision. Otherwise: speed of movement determines tier.
- **Swim in ink → Faster revisiting** — navigating through previously-selected text should be faster (lower friction). Your past work lubricates future navigation.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. Territory visualization ("inked" text) and two-tier precision input are strong ideas.

---

### 26. ◆ WarioWare — Instant Context Switches

**Input**: Different every 3-5 seconds. Each microgame has a unique one-sentence instruction and unique control scheme.

**Key Mechanics**:
- **Instant context switch** — every few seconds, the rules completely change. You must parse the new context and react within 3 seconds.
- **One-word instructions** — "Dodge!", "Cut!", "Balance!" — the instruction is a single verb.
- **Speed escalation** — as you chain wins, the speed increases. Games get shorter.

**Plugin Mapping**:
- **Instant context → Mode indicator** — when modes auto-switch (per NieR principle above), a brief flash of the mode name IN JAPANESE appears: 「航行」(VROOM), 「精密」(precision), 「拡張」(extend), 「創作」(maker). One word. Instant comprehension.
- **Speed escalation → Combo acceleration** — as combo chains build, the gesture response gets faster (lower latency, reduced animation duration). High combo = the plugin responds at "WarioWare speed."
- **Micro-game variety → Context-specific quick actions** — in different contexts, the "default action" for a flick changes. Selected a verb? Flick = conjugation lookup. Selected a noun? Flick = dictionary lookup.

**Verdict**: ⭐⭐ MEDIUM RELEVANCE. Mode labels and combo-acceleration are solid UX ideas.

---

## Part 2: Tier List Summary

### S-Tier — Directly reshapes plugin architecture
| Game | Key Mechanic | Plugin Target |
|------|-------------|---------------|
| **NieR: Automata** | Seamless mode transitions | Mode system: physics determines mode, not explicit gestures |
| **MGR: Revengeance** | Blade Mode (time slows + precision plane) | Precision selection: enters via slow-down, cutting plane = selection extent |
| **Sound Voltex** | Analog knob (continuous bidirectional) | Horizontal extend: omnidirectional, smooth, no direction lock |
| **Groove Coaster** | Track riding + CHAIN/FEVER/TRANCE | VROOM navigation + three-tier combo escalation |
| **Cytus** | Scan line sweep + drag notes | Selection cursor as sweep, extend as path-following |
| **VOEZ** | Dynamic lane movement | UI animation: elements flow, merge, split — never hard cut |

### A-Tier — Strong secondary influence
| Game | Key Mechanic | Plugin Target |
|------|-------------|---------------|
| **Wonderful 101** | Shape gestures + recruitment | Gesture vocabulary + selection accumulation |
| **Theatrhythm** | Trace along waving line | Extend selection path-following |
| **Taiko no Tatsujin** | Don/Ka zones + drumroll + notechart branching | Zone design + sustained extend + adaptive sensitivity |
| **Splatoon** | Territory paint + gyro fine-tune | Visual selection history + two-tier precision |
| **Project Diva/Sekai** | Linked stars + trace notes | Sweep navigation + dual-selection |
| **Maimai** | Circular slide paths | Combo chain visualization |

### B-Tier — Validates existing design choices
| Game | Key Mechanic | Plugin Target |
|------|-------------|---------------|
| **osu!** | Approach circles + combo counter | Zoom lane + combo ring (already used) |
| **Persona 5** | Contextual radial menu + All-Out Attack | Combo ring + bulk action triggers |
| **DMC/Bayonetta** | Style meter + Witch Time | Combo variety reward + precision window |
| **Monster Hunter Rise** | Wirebug + combo trees | Scope jump + dynamic chain trees |
| **Sekiro** | Deflect + mikiri + posture | Boundary haptics + sustained pressure |
| **Rhythm Heaven** | Audio-first / feel-first design | Haptic-first navigation |
| **Beatmania IIDX** | Turntable + charge notes | Scroll metaphor (already used) |
| **Touhou** | Hitbox focus + grazing | Precision mode + boundary proximity feedback |
| **WarioWare** | Instant context switch + one-word labels | Mode labels + combo acceleration |
| **Katamari** | Accumulate + size gates | Multi-stamp accumulation + scope graduation |
| **Okami** | Celestial brush shapes + ink | Maker mode brush + action budget |
| **Gravity Rush** | Gravity shift | Mode transition as physics change |
| **Jubeat** | Spatial grid + patterns | Chunk overview grid layout |
| **Deemo** | Falling approach + growth | Zoom lane styling + session progress |

---

## Part 3: Implementation Recommendations

### Recommendation 1: Physics-Determined Mode System (NieR + Gravity Rush)

**Current**: Modes activated by taps, holds, and explicit zone touches.
**Proposed**: Modes determined by gesture physics:

```
VROOM Mode: velocity > threshold (fast drag)
Precision Mode: velocity < threshold && within selection scope
Extend Mode: horizontal drag component > vertical (automatically)
Maker Mode: drag-to-position + hold-after-motion (Cytus hold note)
Chunk Overview: pinch-out gesture (existing) → gravity shift animation
```

No mode buttons. No taps. The user's motion IS the mode selector.

### Recommendation 2: Knob-Style Horizontal Extend (Sound Voltex)

**Current**: Extend starts from right-drag only, direction-locked.
**Proposed**: Horizontal drag is treated like a SDVX knob:
- Drag right → selection extends forward
- Drag left → selection extends backward
- Reverse direction at any time → selection retracts or extends other way
- Continuous, smooth, no dead zone for direction reversal
- Visual: highlight "laser" follows the knob position in real-time

### Recommendation 3: Three-Tier Combo Escalation (Groove Coaster)

**Current**: Binary graduation at 3+ and 5+.
**Proposed**: Three tiers with distinct visual and functional changes:

| Tier | Chain Count | Name | Visual | Functional Bonus |
|------|------------|------|--------|-----------------|
| CHAIN | 1-9 | 連鎖 | Subtle highlight glow | Basic combo ring |
| FEVER | 10-29 | 熱狂 | Pulsing highlight + ring flame | Expanded action ring + auto-chain |
| TRANCE | 30+ | 没入 | Beam highlight + reduced friction | Full action palette + speed bonus |

### Recommendation 4: Blade Mode Precision (MGR: Revengeance)

**Current**: Precision selection uses same physics as VROOM.
**Proposed**: Entering precision mode triggers "Blade Mode":
- Physics friction multiplied by 3x (time slows)
- Selection cursor becomes visible as a "cutting plane" indicator
- Haptic pulse rate decreases (slower, more deliberate)
- Drag angle determines scope:
  - Near-horizontal (0-20°) = character-level
  - Diagonal (20-50°) = bunsetsu-level
  - Near-vertical (50-90°) = clause/sentence-level
- On release = "Zandatsu" — immediate action opportunity pop-up

### Recommendation 5: Scan-Line Selection Sweep (Cytus)

**Current**: Selection jumps to target position.
**Proposed**: Selection SWEEPS through intermediate text:
- When navigating to a new position, the highlight doesn't teleport
- It sweeps forward/backward through all intervening text
- Sweep speed = gesture velocity
- This eliminates the snap-back bug: there's no "jump" to fight with CM

### Recommendation 6: Dynamic UI Animation (VOEZ)

**Current**: UI elements appear/disappear instantly.
**Proposed**: All UI transitions are animated:
- Combo ring: segments slide into position (150ms ease-out)
- Scope change: highlights smoothly expand/contract
- Mode transition: a brief mode label fades in (「航行」「精密」「拡張」)
- Chunk overview: text blocks animate into grid layout

### Recommendation 7: Variety-Rewarding Style System (DMC + Groove Coaster)

**Current**: Combo counts sequential actions of any type.
**Proposed**: Style points based on action VARIETY:
- Same action repeated: +1 point
- Different action from last: +3 points
- Action not used in current chain yet: +5 points
- Reaching variety threshold unlocks the next tier faster

### Recommendation 8: Gesture-Shape Vocabulary (Wonderful 101 + Okami)

**Current**: 8-direction compass in maker mode.
**Proposed**: Extend to shape recognition:
- Horizontal stroke = cloze (slash across text)
- Circle = scope up (encompass)
- L-shape = lookup/search (target at distance)
- Zigzag = toggle format
- V-shape = split/divide at point
- All shapes must be drawn in MOTION (not from stationary position)

---

## Part 4: Core Design Principles (Synthesized from All Games)

1. **Motion determines meaning** (NieR + Gravity Rush) — the user's physical gesture IS the command. No intermediary state.

2. **Continuous, not discrete** (Sound Voltex + Cytus) — all interactions should feel analog, smooth, bidirectional. No mode walls, no direction locks.

3. **Escalation rewards engagement** (Groove Coaster + DMC) — sustained, varied activity progressively unlocks more powerful tools.

4. **Precision is earned through deceleration** (MGR:R + Touhou) — going fast = broad navigation. Slowing down = fine control. The transition is physical, not modal.

5. **The text IS the game surface** (Groove Coaster + Splatoon + Okami) — text isn't something you look at while using a separate control interface. The text IS the track, the territory, the canvas.

6. **UI flows, never snaps** (VOEZ + NieR) — every visual state change is animated. Position changes sweep. Mode changes blend. Nothing teleports.

7. **Context surfaces actions** (Persona 5 + WarioWare) — available actions change based on what you've selected, not on a static menu. The interface adapts to you.

8. **Feel precedes sight** (Rhythm Heaven + Taiko) — haptic feedback is the primary information channel. Visual feedback confirms what haptics already told you.
