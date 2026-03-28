import { App, PluginSettingTab, Setting } from 'obsidian';
import JpSentenceSurferPlugin from './main';
import { JpSentenceSurferSettings } from './types';
import { JP_SENTENCE_REGEX } from './constants';

export const DEFAULT_SETTINGS: JpSentenceSurferSettings = {
    sentenceRegex: JP_SENTENCE_REGEX.source,
    useBoldBoundaries: true,
    stripTimestampsOnSelect: true,
    clozeFormat: '{{c1::$BOLD}}',
    showFloatingToolbar: true,
    toolbarPosition: 'bottom',
    highlightCurrentSentence: true,
    highlightColor: 'rgba(255, 208, 0, 0.15)',
    discourse: {
        defaultGranularity: 4,
        enableOverlayByDefault: false,
        categoryColors: {
            A: '#e57373',
            B: '#ff9800',
            C: '#fdd835',
            D: '#66bb6a',
            E: '#26c6da',
            F: '#42a5f5',
            G: '#7e57c2',
            H: '#ec407a',
        },
        autoCaptureOnNavigation: false,
        coOccurrenceDepth: 2,
    },
    dictionary: {
        dictFolderPath: 'dictionaries',
        loadedDictionaries: {},
        defaultSearchMode: 'prefix',
        autoLookupOnSelection: false,
        saveToCollocationsTemplate: '{{expression}} [{{reading}}]: {{definition}}',
    },
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

        // ── Discourse Settings ────────────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Discourse Analysis' });

        new Setting(containerEl)
            .setName('Default granularity level')
            .setDesc('Default discourse unit level (1=morpheme … 7=topic segment).')
            .addSlider(slider =>
                slider
                    .setLimits(1, 7, 1)
                    .setValue(this.plugin.settings.discourse.defaultGranularity)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.defaultGranularity = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Enable overlay by default')
            .setDesc('Show discourse marker overlay when opening notes.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.discourse.enableOverlayByDefault)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.enableOverlayByDefault = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-capture on navigation')
            .setDesc('Automatically capture discourse chunks when navigating between sentences.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.discourse.autoCaptureOnNavigation)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.autoCaptureOnNavigation = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Co-occurrence context depth')
            .setDesc('Number of sentences to consider when detecting co-occurring patterns.')
            .addSlider(slider =>
                slider
                    .setLimits(1, 10, 1)
                    .setValue(this.plugin.settings.discourse.coOccurrenceDepth)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.coOccurrenceDepth = value;
                        await this.plugin.saveSettings();
                    })
            );

        // ── Dictionary Settings ───────────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Dictionary' });

        new Setting(containerEl)
            .setName('Dictionary folder path')
            .setDesc('Vault-relative path to the folder containing Yomitan dictionary JSON files.')
            .addText(text =>
                text
                    .setPlaceholder('dictionaries')
                    .setValue(this.plugin.settings.dictionary.dictFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.dictFolderPath = value || 'dictionaries';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Default search mode')
            .setDesc('How dictionary searches are performed by default.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('exact', 'Exact')
                    .addOption('prefix', 'Prefix')
                    .addOption('substring', 'Substring')
                    .setValue(this.plugin.settings.dictionary.defaultSearchMode)
                    .onChange(async (value: string) => {
                        this.plugin.settings.dictionary.defaultSearchMode =
                            value as 'exact' | 'prefix' | 'substring';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-lookup on selection')
            .setDesc('Automatically open dictionary lookup when text is selected.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.dictionary.autoLookupOnSelection)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.autoLookupOnSelection = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
