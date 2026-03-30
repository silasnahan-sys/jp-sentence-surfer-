import { App, PluginSettingTab, Setting } from 'obsidian';
import JpSentenceSurferPlugin from './main';
import { JpSentenceSurferSettings, SurfMode } from './types';
import { JP_SENTENCE_REGEX } from './constants';

const DEFAULT_HIGHLIGHT_COLORS: Record<SurfMode, string> = {
    [SurfMode.Bunsetsu]:    'rgba(255, 208, 0, 0.15)',
    [SurfMode.Sentence]:    'rgba(0, 200, 120, 0.15)',
    [SurfMode.Clause]:      'rgba(100, 180, 255, 0.15)',
    [SurfMode.Particle]:    'rgba(255, 120, 180, 0.15)',
    [SurfMode.ContentWord]: 'rgba(180, 120, 255, 0.15)',
    [SurfMode.Collocation]: 'rgba(255, 160, 50, 0.20)',
    [SurfMode.Bold]:        'rgba(255, 80, 80, 0.15)',
};

export const DEFAULT_SETTINGS: JpSentenceSurferSettings = {
    sentenceRegex: JP_SENTENCE_REGEX.source,
    useBoldBoundaries: true,
    stripTimestampsOnSelect: true,
    clozeFormat: '{{c1::$BOLD}}',
    showFloatingToolbar: true,
    toolbarPosition: 'bottom',
    highlightCurrentSentence: true,
    highlightColor: 'rgba(255, 208, 0, 0.15)',
    // Physics
    surfEase: 0.14,
    surfFriction: 0.92,
    surfMomentumDecay: 0.85,
    // Mode
    defaultSurfMode: SurfMode.Bunsetsu,
    // Gestures & feedback
    enableTouchGestures: true,
    enableHapticFeedback: true,
    highlightWaveEnabled: true,
    highlightColors: DEFAULT_HIGHLIGHT_COLORS,
};

export class JpSentenceSurferSettingTab extends PluginSettingTab {
    plugin: JpSentenceSurferPlugin;

    constructor(app: App, plugin: JpSentenceSurferPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'JP Sentence Surfer Settings' });

        new Setting(containerEl)
            .setName('Sentence regex')
            .setDesc('Regular expression used to detect JP sentence boundaries (flags: gm).')
            .addText(text =>
                text
                    .setPlaceholder(JP_SENTENCE_REGEX.source)
                    .setValue(this.plugin.settings.sentenceRegex)
                    .onChange(async (value) => {
                        this.plugin.settings.sentenceRegex = value || JP_SENTENCE_REGEX.source;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Use bold boundaries')
            .setDesc('Treat **bold text** as sentence boundary markers when surfing.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.useBoldBoundaries)
                    .onChange(async (value) => {
                        this.plugin.settings.useBoldBoundaries = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Strip timestamps on select')
            .setDesc('Automatically remove YTranscript [timestamp](url) markers when selecting a sentence.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.stripTimestampsOnSelect)
                    .onChange(async (value) => {
                        this.plugin.settings.stripTimestampsOnSelect = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Cloze format')
            .setDesc('Template for cloze output. Use $BOLD for the bold text placeholder. e.g. {{c1::$BOLD}}')
            .addText(text =>
                text
                    .setPlaceholder('{{c1::$BOLD}}')
                    .setValue(this.plugin.settings.clozeFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.clozeFormat = value || '{{c1::$BOLD}}';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Show floating toolbar')
            .setDesc('Show a floating bottom/top toolbar for quick sentence surfing on mobile.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.showFloatingToolbar)
                    .onChange(async (value) => {
                        this.plugin.settings.showFloatingToolbar = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshToolbar();
                    })
            );

        new Setting(containerEl)
            .setName('Toolbar position')
            .setDesc('Position of the floating toolbar.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('bottom', 'Bottom')
                    .addOption('top', 'Top')
                    .setValue(this.plugin.settings.toolbarPosition)
                    .onChange(async (value: string) => {
                        this.plugin.settings.toolbarPosition = value as 'top' | 'bottom';
                        await this.plugin.saveSettings();
                        this.plugin.refreshToolbar();
                    })
            );

        new Setting(containerEl)
            .setName('Highlight current sentence')
            .setDesc('Visually highlight the sentence under the cursor.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.highlightCurrentSentence)
                    .onChange(async (value) => {
                        this.plugin.settings.highlightCurrentSentence = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Highlight color')
            .setDesc('CSS color for the sentence highlight (e.g. rgba(255, 208, 0, 0.15)).')
            .addText(text =>
                text
                    .setPlaceholder('rgba(255, 208, 0, 0.15)')
                    .setValue(this.plugin.settings.highlightColor)
                    .onChange(async (value) => {
                        this.plugin.settings.highlightColor = value || 'rgba(255, 208, 0, 0.15)';
                        await this.plugin.saveSettings();
                    })
            );

        // ── Surf Physics ──────────────────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Surf Physics (NHL-style animation)' });

        new Setting(containerEl)
            .setName('Scroll ease')
            .setDesc('Animation smoothness (lower = slower/smoother, higher = faster response). Default: 0.14')
            .addSlider(slider =>
                slider
                    .setLimits(0.01, 0.5, 0.01)
                    .setValue(this.plugin.settings.surfEase)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.surfEase = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAnimator();
                    })
            );

        new Setting(containerEl)
            .setName('Stagger friction')
            .setDesc('How much the wave echo effect fades on each step away from the active chunk (0.5 = fast fade, 0.99 = slow fade). Default: 0.92')
            .addSlider(slider =>
                slider
                    .setLimits(0.5, 0.99, 0.01)
                    .setValue(this.plugin.settings.surfFriction)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.surfFriction = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAnimator();
                    })
            );

        new Setting(containerEl)
            .setName('Momentum decay')
            .setDesc('How quickly fast-tap speed fades out (lower = stops quickly, higher = coasts longer). Default: 0.85')
            .addSlider(slider =>
                slider
                    .setLimits(0.5, 0.99, 0.01)
                    .setValue(this.plugin.settings.surfMomentumDecay)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.surfMomentumDecay = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAnimator();
                    })
            );

        // ── Surf Mode ─────────────────────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Surf Mode' });

        new Setting(containerEl)
            .setName('Default surf mode')
            .setDesc('The boundary type to start with when the plugin loads.')
            .addDropdown(dropdown => {
                dropdown
                    .addOption(SurfMode.Bunsetsu,    'Bunsetsu (8-tier JP phrase)')
                    .addOption(SurfMode.Sentence,    'Sentence (。！？ boundaries)')
                    .addOption(SurfMode.Clause,      'Clause (て/から/けど/ので)')
                    .addOption(SurfMode.Particle,    'Particle (jump particle-to-particle)')
                    .addOption(SurfMode.ContentWord, 'Content word (skip particles)')
                    .addOption(SurfMode.Collocation, 'Collocation (jp-collocations spans)')
                    .addOption(SurfMode.Bold,        'Bold (**bold** markers)')
                    .setValue(this.plugin.settings.defaultSurfMode)
                    .onChange(async (value: string) => {
                        this.plugin.settings.defaultSurfMode = value as SurfMode;
                        await this.plugin.saveSettings();
                    });
            });

        // ── Gestures & Feedback ───────────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Touch Gestures & Feedback' });

        new Setting(containerEl)
            .setName('Enable touch gestures')
            .setDesc('Enable iOS swipe gestures on the editor (horizontal = select, vertical = scroll).')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableTouchGestures)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTouchGestures = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshToolbar();
                    })
            );

        new Setting(containerEl)
            .setName('Visual haptic feedback')
            .setDesc('Pulse/bounce toolbar buttons on each surf action for a haptic-style feel.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableHapticFeedback)
                    .onChange(async (value) => {
                        this.plugin.settings.enableHapticFeedback = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Highlight wave effect')
            .setDesc('NHL-style staggered wave on neighbouring chunks when surfing.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.highlightWaveEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.highlightWaveEnabled = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
