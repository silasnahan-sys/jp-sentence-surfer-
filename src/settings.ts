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
        discourseGranularity: 'utterance',
        showDiscourseOverlay: false,
        discourseIndexPath: 'jp-discourse-index.json',
        autoDetectPatterns: true,
        contextExpansionMode: 'smart',
        fixedContextChars: 200,
    },
    dictionary: {
        dictionaryFolder: 'Dictionaries',
        enableDictLookup: true,
        savedSentencesFolder: 'Sentences',
        savedCollocationFolder: 'Collocations',
        dictScanLength: 10,
        showDictInToolbar: true,
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

        // ─── 談話文法 (Discourse Grammar) Settings ─────────────────────────────
        containerEl.createEl('h2', { text: '談話文法 (Discourse Grammar)' });

        new Setting(containerEl)
            .setName('Default granularity')
            .setDesc('Default discourse unit level when opening the 談話文法 panel.')
            .addDropdown(d =>
                d
                    .addOption('morpheme', '形態素 (Morpheme)')
                    .addOption('bunsetsu', '文節 (Bunsetsu)')
                    .addOption('clause', '節 (Clause)')
                    .addOption('utterance', '発話 (Utterance)')
                    .addOption('turn', 'ターン (Turn)')
                    .addOption('exchange', '交換 (Exchange)')
                    .addOption('episode', 'エピソード (Episode)')
                    .setValue(this.plugin.settings.discourse.discourseGranularity)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.discourseGranularity = value as any;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Show discourse overlay')
            .setDesc('Display color-coded discourse pattern chips over the editor text.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.discourse.showDiscourseOverlay)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.showDiscourseOverlay = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshDiscourseOverlay();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-detect patterns')
            .setDesc('Automatically scan for discourse patterns when the editor content changes.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.discourse.autoDetectPatterns)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.autoDetectPatterns = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Context expansion mode')
            .setDesc('How to expand context when capturing a chunk: "smart" uses discourse boundaries, "fixed" uses a fixed character count.')
            .addDropdown(d =>
                d
                    .addOption('smart', 'スマート (discourse boundaries)')
                    .addOption('fixed', '固定 (fixed chars)')
                    .setValue(this.plugin.settings.discourse.contextExpansionMode)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.contextExpansionMode = value as 'smart' | 'fixed';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Fixed context chars')
            .setDesc('Characters to include when context expansion mode is "fixed".')
            .addText(t =>
                t
                    .setPlaceholder('200')
                    .setValue(String(this.plugin.settings.discourse.fixedContextChars))
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.fixedContextChars = parseInt(value, 10) || 200;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Discourse index file path')
            .setDesc('Path in vault where the discourse index JSON is saved.')
            .addText(t =>
                t
                    .setPlaceholder('jp-discourse-index.json')
                    .setValue(this.plugin.settings.discourse.discourseIndexPath)
                    .onChange(async (value) => {
                        this.plugin.settings.discourse.discourseIndexPath = value || 'jp-discourse-index.json';
                        await this.plugin.saveSettings();
                    })
            );

        // ─── 辞書検索 (Dictionary Lookup) Settings ─────────────────────────────
        containerEl.createEl('h2', { text: '辞書検索 (Dictionary Lookup)' });

        new Setting(containerEl)
            .setName('Enable dictionary lookup')
            .setDesc('Enable the Yomitan-style dictionary lookup feature.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.dictionary.enableDictLookup)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.enableDictLookup = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Dictionary folder')
            .setDesc('Vault folder containing Yomitan-format dictionaries (extracted term_bank JSON files).')
            .addText(t =>
                t
                    .setPlaceholder('Dictionaries')
                    .setValue(this.plugin.settings.dictionary.dictionaryFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.dictionaryFolder = value || 'Dictionaries';
                        await this.plugin.saveSettings();
                        this.plugin.reloadDictionaries();
                    })
            );

        new Setting(containerEl)
            .setName('Show dictionary button in toolbar')
            .setDesc('Show the 📖 dictionary lookup button in the floating toolbar.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.dictionary.showDictInToolbar)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.showDictInToolbar = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshToolbar();
                    })
            );

        new Setting(containerEl)
            .setName('Scan length')
            .setDesc('Number of characters to scan from cursor when using the scan mode.')
            .addText(t =>
                t
                    .setPlaceholder('10')
                    .setValue(String(this.plugin.settings.dictionary.dictScanLength))
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.dictScanLength = parseInt(value, 10) || 10;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Saved sentences folder')
            .setDesc('Vault folder where saved example sentence notes are created.')
            .addText(t =>
                t
                    .setPlaceholder('Sentences')
                    .setValue(this.plugin.settings.dictionary.savedSentencesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.savedSentencesFolder = value || 'Sentences';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Saved collocations folder')
            .setDesc('Vault folder where saved collocation notes are created.')
            .addText(t =>
                t
                    .setPlaceholder('Collocations')
                    .setValue(this.plugin.settings.dictionary.savedCollocationFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionary.savedCollocationFolder = value || 'Collocations';
                        await this.plugin.saveSettings();
                    })
            );
    }
}
