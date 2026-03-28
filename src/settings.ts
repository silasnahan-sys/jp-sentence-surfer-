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
        showCategories: {
            '話題開始': true,
            '理由・説明': true,
            '文末モダリティ': true,
            '接続・展開': true,
            '確認・同意要求': true,
            '言い換え・修正': true,
            'フィラー・ヘッジ': true,
            '引用・伝聞': true,
        },
        autoCaptureMode: false,
        coOccurrenceThreshold: 2,
    },
    dict: {
        dictionaryFolder: 'dictionaries',
        maxResults: 20,
        showFrequencyScores: true,
        enableDeconjugation: true,
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

        // ─── Discourse Grammar Settings ──────────────────────────────────────
        containerEl.createEl('h3', { text: 'Discourse Grammar Settings' });

        new Setting(containerEl)
            .setName('Default granularity')
            .setDesc('Default discourse level (1 = Morpheme … 7 = Topic Segment).')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('1', '1 – 形態素 (Morpheme)')
                    .addOption('2', '2 – 文節 (Bunsetsu)')
                    .addOption('3', '3 – 節 (Clause)')
                    .addOption('4', '4 – 発話 (Utterance)')
                    .addOption('5', '5 – 発話番 (Turn)')
                    .addOption('6', '6 – やりとり (Exchange)')
                    .addOption('7', '7 – 話題 (Topic Segment)')
                    .setValue(String(this.plugin.settings.discourse.defaultGranularity))
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.defaultGranularity = parseInt(value, 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-capture mode')
            .setDesc('Automatically capture chunks when navigating sentences.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.discourse.autoCaptureMode)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.autoCaptureMode = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Co-occurrence threshold')
            .setDesc('Minimum number of co-occurrences to highlight pattern pairs.')
            .addText(text =>
                text
                    .setPlaceholder('2')
                    .setValue(String(this.plugin.settings.discourse.coOccurrenceThreshold))
                    .onChange(async (value) => {
                        const n = parseInt(value, 10);
                        if (!isNaN(n) && n > 0) {
                            this.plugin.settings.discourse.coOccurrenceThreshold = n;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        // ─── Dictionary Settings ─────────────────────────────────────────────
        containerEl.createEl('h3', { text: 'Dictionary Settings' });

        new Setting(containerEl)
            .setName('Dictionary folder')
            .setDesc('Path in vault to folder containing Yomitan term_bank JSON files.')
            .addText(text =>
                text
                    .setPlaceholder('dictionaries')
                    .setValue(this.plugin.settings.dict.dictionaryFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dict.dictionaryFolder = value || 'dictionaries';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Max results')
            .setDesc('Maximum number of dictionary results to show.')
            .addText(text =>
                text
                    .setPlaceholder('20')
                    .setValue(String(this.plugin.settings.dict.maxResults))
                    .onChange(async (value) => {
                        const n = parseInt(value, 10);
                        if (!isNaN(n) && n > 0) {
                            this.plugin.settings.dict.maxResults = n;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        new Setting(containerEl)
            .setName('Show frequency scores')
            .setDesc('Display dictionary entry frequency/priority scores.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.dict.showFrequencyScores)
                    .onChange(async (value) => {
                        this.plugin.settings.dict.showFrequencyScores = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Enable deconjugation')
            .setDesc('Try to deconjugate verbs/adjectives when searching.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.dict.enableDeconjugation)
                    .onChange(async (value) => {
                        this.plugin.settings.dict.enableDeconjugation = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
