import { App, PluginSettingTab, Setting } from 'obsidian';
import JpSentenceSurferPlugin from './main';
import { JpSentenceSurferSettings } from './types';
import { JP_SENTENCE_REGEX } from './constants';

export const DEFAULT_SETTINGS: JpSentenceSurferSettings = {
    // Core
    sentenceRegex: JP_SENTENCE_REGEX.source,
    useBoldBoundaries: true,
    stripTimestampsOnSelect: true,
    clozeFormat: '{{c1::$BOLD}}',
    showFloatingToolbar: true,
    toolbarPosition: 'bottom',
    highlightCurrentSentence: true,
    highlightColor: 'rgba(255, 208, 0, 0.15)',
    // Discourse grammar
    discourseGranularity: 'clause',
    showDiscourseOverlay: true,
    discourseIndexPath: 'discourse-index.json',
    autoDetectPatterns: true,
    contextExpansionMode: 'smart',
    fixedContextChars: 200,
    // Dictionary
    dictionaryFolder: 'Dictionaries',
    enableDictLookup: true,
    savedSentencesFolder: 'Saved Sentences',
    savedCollocationFolder: 'JP Collocations',
    dictScanLength: 20,
    showDictInToolbar: true,
    // Scrape engine
    enableScrapeIndex: false,
    scrapeFolderPath: '',
    scrapeIndexPath: 'discourse-scrape-index.json',
    autoScrapeOnSave: false,
    scrapeBatchSize: 20,
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

        // ─── Discourse Grammar Settings ────────────────────────────────────────
        containerEl.createEl('h2', { text: '談話文法 (Discourse Grammar)' });

        new Setting(containerEl)
            .setName('Discourse granularity')
            .setDesc('Default granularity level for discourse surfing and visualization.')
            .addDropdown(dd =>
                dd
                    .addOption('morpheme',  '1 – 形態素 (Morpheme)')
                    .addOption('bunsetsu',  '2 – 文節 (Bunsetsu)')
                    .addOption('clause',    '3 – 節 (Clause)')
                    .addOption('utterance', '4 – 発話 (Utterance)')
                    .addOption('turn',      '5 – ターン (Turn)')
                    .addOption('exchange',  '6 – 交換 (Exchange)')
                    .addOption('episode',   '7 – エピソード (Episode)')
                    .setValue(this.plugin.settings.discourseGranularity)
                    .onChange(async (value: string) => {
                        this.plugin.settings.discourseGranularity = value as any;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Show discourse overlay')
            .setDesc('Show colored discourse pattern annotations on the text.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.showDiscourseOverlay)
                    .onChange(async (v) => {
                        this.plugin.settings.showDiscourseOverlay = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Discourse index path')
            .setDesc('Path for the discourse chunk index JSON file (relative to vault root).')
            .addText(text =>
                text
                    .setPlaceholder('discourse-index.json')
                    .setValue(this.plugin.settings.discourseIndexPath)
                    .onChange(async (value) => {
                        this.plugin.settings.discourseIndexPath = value || 'discourse-index.json';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-detect patterns')
            .setDesc('Automatically detect discourse patterns when a note is opened.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.autoDetectPatterns)
                    .onChange(async (v) => {
                        this.plugin.settings.autoDetectPatterns = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Context expansion mode')
            .setDesc('How to determine context around captured chunks.')
            .addDropdown(dd =>
                dd
                    .addOption('smart', 'Smart (discourse boundaries)')
                    .addOption('fixed', 'Fixed (N characters)')
                    .setValue(this.plugin.settings.contextExpansionMode)
                    .onChange(async (value: string) => {
                        this.plugin.settings.contextExpansionMode = value as 'smart' | 'fixed';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Fixed context characters')
            .setDesc('Number of characters of context when mode is "fixed".')
            .addText(text =>
                text
                    .setPlaceholder('200')
                    .setValue(String(this.plugin.settings.fixedContextChars))
                    .onChange(async (value) => {
                        const n = parseInt(value) || 200;
                        this.plugin.settings.fixedContextChars = n;
                        await this.plugin.saveSettings();
                    })
            );

        // ─── Dictionary Settings ───────────────────────────────────────────────
        containerEl.createEl('h2', { text: '辞書 (Dictionary)' });

        new Setting(containerEl)
            .setName('Enable dictionary lookup')
            .setDesc('Enable the Yomitan-style in-Obsidian dictionary lookup feature.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.enableDictLookup)
                    .onChange(async (v) => {
                        this.plugin.settings.enableDictLookup = v;
                        await this.plugin.saveSettings();
                        this.plugin.refreshToolbar();
                    })
            );

        new Setting(containerEl)
            .setName('Dictionary folder')
            .setDesc('Vault folder containing extracted Yomitan dictionaries (each in a sub-folder with index.json and term_bank_*.json).')
            .addText(text =>
                text
                    .setPlaceholder('Dictionaries')
                    .setValue(this.plugin.settings.dictionaryFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionaryFolder = value || 'Dictionaries';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Saved sentences folder')
            .setDesc('Vault folder where example sentences are saved.')
            .addText(text =>
                text
                    .setPlaceholder('Saved Sentences')
                    .setValue(this.plugin.settings.savedSentencesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.savedSentencesFolder = value || 'Saved Sentences';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Saved collocations folder')
            .setDesc('Vault folder where collocation entries are saved.')
            .addText(text =>
                text
                    .setPlaceholder('JP Collocations')
                    .setValue(this.plugin.settings.savedCollocationFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.savedCollocationFolder = value || 'JP Collocations';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Scan mode max characters')
            .setDesc('Maximum number of characters to scan in dictionary scan mode.')
            .addText(text =>
                text
                    .setPlaceholder('20')
                    .setValue(String(this.plugin.settings.dictScanLength))
                    .onChange(async (value) => {
                        this.plugin.settings.dictScanLength = parseInt(value) || 20;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Show dictionary button in toolbar')
            .setDesc('Show the 📖 dictionary lookup button in the floating toolbar.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.showDictInToolbar)
                    .onChange(async (v) => {
                        this.plugin.settings.showDictInToolbar = v;
                        await this.plugin.saveSettings();
                        this.plugin.refreshToolbar();
                    })
            );

        // ─── Scrape Engine Settings ─────────────────────────────────────────────

        containerEl.createEl('h3', { text: 'Vault Scrape Index (スクレープ索引)' });

        new Setting(containerEl)
            .setName('Enable vault-wide scrape index')
            .setDesc('Automatically scan vault notes to build a grammar occurrence index.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.enableScrapeIndex)
                    .onChange(async (v) => {
                        this.plugin.settings.enableScrapeIndex = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Scrape folder path')
            .setDesc('Vault folder to scrape (leave empty to scrape the entire vault).')
            .addText(text =>
                text
                    .setPlaceholder('(entire vault)')
                    .setValue(this.plugin.settings.scrapeFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.scrapeFolderPath = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Scrape index path')
            .setDesc('Path to the scrape index JSON file (relative to vault root).')
            .addText(text =>
                text
                    .setPlaceholder('discourse-scrape-index.json')
                    .setValue(this.plugin.settings.scrapeIndexPath)
                    .onChange(async (value) => {
                        this.plugin.settings.scrapeIndexPath = value || 'discourse-scrape-index.json';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-scrape on file save')
            .setDesc('Incrementally update the scrape index when a file is saved.')
            .addToggle(t =>
                t
                    .setValue(this.plugin.settings.autoScrapeOnSave)
                    .onChange(async (v) => {
                        this.plugin.settings.autoScrapeOnSave = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Scrape batch size')
            .setDesc('Number of files processed per async batch during a scrape.')
            .addText(text =>
                text
                    .setPlaceholder('20')
                    .setValue(String(this.plugin.settings.scrapeBatchSize))
                    .onChange(async (value) => {
                        this.plugin.settings.scrapeBatchSize = parseInt(value) || 20;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
