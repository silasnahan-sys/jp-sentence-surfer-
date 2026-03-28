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

    // Discourse
    discourseGranularity: 'bunsetsu',
    showDiscourseOverlay: false,
    discourseIndexPath: '.obsidian/plugins/jp-sentence-surfer/discourse-index.json',
    autoDetectPatterns: true,
    contextExpansionMode: 'smart',
    fixedContextChars: 50,

    // Dictionary
    dictionaryFolderPath: 'Dictionaries/Yomitan',
    enableDeconjugation: true,
    autoSearchOnSelect: false,
    savedSentencesFolder: 'SavedSentences',
    savedCollocationFormat: 'plugin',
    dictSearchDebounceMs: 300,
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

        // ─── 談話文法 (Discourse Grammar) Settings ────────────────────────────
        containerEl.createEl('h3', { text: '談話文法 (Discourse Grammar)' });

        new Setting(containerEl)
            .setName('Discourse granularity')
            .setDesc('Default granularity level for discourse surfing.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('morpheme', '形態素 (morpheme)')
                    .addOption('bunsetsu', '文節 (bunsetsu)')
                    .addOption('clause', '節 (clause)')
                    .addOption('utterance', '発話 (utterance)')
                    .addOption('turn', 'ターン (turn)')
                    .addOption('exchange', '交換 (exchange)')
                    .addOption('episode', 'エピソード (episode)')
                    .setValue(this.plugin.settings.discourseGranularity)
                    .onChange(async (value: string) => {
                        this.plugin.settings.discourseGranularity = value as JpSentenceSurferSettings['discourseGranularity'];
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Show discourse overlay')
            .setDesc('Highlight discourse patterns in the active editor.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.showDiscourseOverlay)
                    .onChange(async (value) => {
                        this.plugin.settings.showDiscourseOverlay = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-detect patterns')
            .setDesc('Automatically detect discourse patterns in the current chunk.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.autoDetectPatterns)
                    .onChange(async (value) => {
                        this.plugin.settings.autoDetectPatterns = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Discourse index path')
            .setDesc('Vault-relative path to persist the discourse index JSON file.')
            .addText(text =>
                text
                    .setPlaceholder('.obsidian/plugins/jp-sentence-surfer/discourse-index.json')
                    .setValue(this.plugin.settings.discourseIndexPath)
                    .onChange(async (value) => {
                        this.plugin.settings.discourseIndexPath = value || '.obsidian/plugins/jp-sentence-surfer/discourse-index.json';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Context expansion mode')
            .setDesc('How to expand context when capturing a discourse chunk.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('none', 'None')
                    .addOption('smart', 'Smart (auto)')
                    .addOption('fixed', 'Fixed chars')
                    .setValue(this.plugin.settings.contextExpansionMode)
                    .onChange(async (value: string) => {
                        this.plugin.settings.contextExpansionMode = value as 'none' | 'smart' | 'fixed';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Fixed context chars')
            .setDesc('Number of characters to include as context in fixed expansion mode.')
            .addText(text =>
                text
                    .setPlaceholder('50')
                    .setValue(String(this.plugin.settings.fixedContextChars))
                    .onChange(async (value) => {
                        const n = parseInt(value, 10);
                        this.plugin.settings.fixedContextChars = isNaN(n) ? 50 : n;
                        await this.plugin.saveSettings();
                    })
            );

        // ─── Dictionary Settings ──────────────────────────────────────────────
        containerEl.createEl('h3', { text: '辞書 (Dictionary)' });

        new Setting(containerEl)
            .setName('Dictionary folder')
            .setDesc('Vault-relative path to folder containing Yomitan term_bank_*.json files.')
            .addText(text =>
                text
                    .setPlaceholder('Dictionaries/Yomitan')
                    .setValue(this.plugin.settings.dictionaryFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.dictionaryFolderPath = value || 'Dictionaries/Yomitan';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Enable deconjugation')
            .setDesc('Match conjugated verb/adjective forms during dictionary search.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableDeconjugation)
                    .onChange(async (value) => {
                        this.plugin.settings.enableDeconjugation = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Auto-search on select')
            .setDesc('Automatically open dictionary search when text is selected in the editor.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.autoSearchOnSelect)
                    .onChange(async (value) => {
                        this.plugin.settings.autoSearchOnSelect = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Saved sentences folder')
            .setDesc('Vault folder where saved example sentences are stored.')
            .addText(text =>
                text
                    .setPlaceholder('SavedSentences')
                    .setValue(this.plugin.settings.savedSentencesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.savedSentencesFolder = value || 'SavedSentences';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Collocation save format')
            .setDesc('How to save collocations: via jp-collocations plugin or as plain markdown.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('plugin', 'jp-collocations plugin')
                    .addOption('markdown', 'Markdown file')
                    .setValue(this.plugin.settings.savedCollocationFormat)
                    .onChange(async (value: string) => {
                        this.plugin.settings.savedCollocationFormat = value as 'plugin' | 'markdown';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Dictionary search debounce (ms)')
            .setDesc('Milliseconds to wait before triggering auto-search as you type.')
            .addText(text =>
                text
                    .setPlaceholder('300')
                    .setValue(String(this.plugin.settings.dictSearchDebounceMs))
                    .onChange(async (value) => {
                        const n = parseInt(value, 10);
                        this.plugin.settings.dictSearchDebounceMs = isNaN(n) ? 300 : n;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
