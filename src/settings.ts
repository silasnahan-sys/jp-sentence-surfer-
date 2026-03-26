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
    }
}
