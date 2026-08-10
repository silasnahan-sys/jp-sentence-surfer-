import { App, PluginSettingTab, Setting } from 'obsidian';
import JpSentenceSurferPlugin from './main';
import { JpSentenceSurferSettings, SurfAction, ComboPreset } from './types';
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
    enableMonkeyScroller: true,
    hapticFeedback: true,
    toolbarAutoHideMs: 4000,
    directionalActions: {
        swipeUp: 'bold',
        swipeDown: 'highlight',
        swipeLeft: 'copy',
        swipeRight: 'select',
    },
    trackballSizePx: 138,
    trackballBottomOffsetPx: 92,
    comboWindowMs: 950,
    lateralSteerStrength: 1,
    verticalScrollGain: 0.8,
    steeringPreset: 'balanced',
    customCommands: [],
    disabledComboActions: [],
    comboPreset: 'default',
    showRelationOverlay: true,
    customRelationTypes: [],
    customMarkerTypes: [],
    customLayerTypes: [],
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

        containerEl.createEl('h3', { text: 'Sentence Monkey Scroller' });

        new Setting(containerEl)
            .setName('Enable Monkey Scroller')
            .setDesc('Super Monkey Ball-style sentence navigator with momentum scrolling and haptic feedback.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableMonkeyScroller)
                    .onChange(async (value) => {
                        this.plugin.settings.enableMonkeyScroller = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshScroller();
                    })
            );

        new Setting(containerEl)
            .setName('Haptic feedback')
            .setDesc('Vibration pulses when crossing sentence boundaries (iOS).')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.hapticFeedback)
                    .onChange(async (value) => {
                        this.plugin.settings.hapticFeedback = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Toolbar auto-hide (ms)')
            .setDesc('Auto-hide the toolbar after this many milliseconds of inactivity. 0 = never hide.')
            .addText(text =>
                text
                    .setPlaceholder('4000')
                    .setValue(String(this.plugin.settings.toolbarAutoHideMs))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        this.plugin.settings.toolbarAutoHideMs = isNaN(parsed) ? 4000 : Math.max(0, parsed);
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl('h3', { text: 'Directional Swipe Actions' });

        const actionOptions: Record<string, string> = {
            none: 'None',
            select: 'Select',
            bold: 'Bold',
            highlight: 'Highlight',
            spoiler: 'Spoiler',
            cloze: 'Cloze',
            copy: 'Copy',
        };
        const dirLabels: [keyof typeof this.plugin.settings.directionalActions, string][] = [
            ['swipeUp', 'Swipe Up'],
            ['swipeDown', 'Swipe Down'],
            ['swipeLeft', 'Swipe Left'],
            ['swipeRight', 'Swipe Right'],
        ];

        for (const [key, label] of dirLabels) {
            new Setting(containerEl)
                .setName(`${label} action`)
                .setDesc(`Action triggered when swiping ${label.toLowerCase().replace('swipe ', '')} on the trackball.`)
                .addDropdown(dropdown =>
                    dropdown
                        .addOptions(actionOptions)
                        .setValue(this.plugin.settings.directionalActions[key])
                        .onChange(async (value: string) => {
                            this.plugin.settings.directionalActions[key] = value as SurfAction;
                            await this.plugin.saveSettings();
                            this.plugin.refreshScroller();
                        })
                );
        }

        containerEl.createEl('h3', { text: 'Scroller Feel Tuning' });

        new Setting(containerEl)
            .setName('Steering preset')
            .setDesc('Switch between balanced, steering-focused, and extreme steering feel.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('balanced', 'Balanced')
                    .addOption('steering', 'Steering')
                    .addOption('extreme-steering', 'Extreme Steering')
                    .setValue(this.plugin.settings.steeringPreset)
                    .onChange(async (value: string) => {
                        this.plugin.settings.steeringPreset = value as 'balanced' | 'steering' | 'extreme-steering';
                        await this.plugin.saveSettings();
                        this.plugin.refreshScroller();
                    })
            );

        new Setting(containerEl)
            .setName('Trackball size (px)')
            .setDesc('Larger values are easier for thumb control. Recommended: 124-168.')
            .addText(text =>
                text
                    .setPlaceholder('138')
                    .setValue(String(this.plugin.settings.trackballSizePx))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        this.plugin.settings.trackballSizePx = isNaN(parsed) ? 138 : Math.max(110, Math.min(180, parsed));
                        await this.plugin.saveSettings();
                        this.plugin.refreshScroller();
                    })
            );

        new Setting(containerEl)
            .setName('Trackball bottom offset (px)')
            .setDesc('Raises/lowers the trackball to avoid overlap with other plugins and toolbars.')
            .addText(text =>
                text
                    .setPlaceholder('92')
                    .setValue(String(this.plugin.settings.trackballBottomOffsetPx))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        this.plugin.settings.trackballBottomOffsetPx = isNaN(parsed) ? 92 : Math.max(8, Math.min(260, parsed));
                        await this.plugin.saveSettings();
                        this.plugin.refreshScroller();
                    })
            );

        new Setting(containerEl)
            .setName('Combo window (ms)')
            .setDesc('Time allowed for chaining swipe actions rhythm-game style.')
            .addText(text =>
                text
                    .setPlaceholder('950')
                    .setValue(String(this.plugin.settings.comboWindowMs))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        this.plugin.settings.comboWindowMs = isNaN(parsed) ? 950 : Math.max(250, Math.min(2000, parsed));
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Horizontal steer strength')
            .setDesc('Higher values make left/right thumb movement switch nearby text faster.')
            .addText(text =>
                text
                    .setPlaceholder('1.0')
                    .setValue(String(this.plugin.settings.lateralSteerStrength))
                    .onChange(async (value) => {
                        const parsed = parseFloat(value);
                        this.plugin.settings.lateralSteerStrength = isNaN(parsed) ? 1 : Math.max(0.4, Math.min(2.5, parsed));
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Vertical scroll gain')
            .setDesc('Higher values increase vertical response speed during drag.')
            .addText(text =>
                text
                    .setPlaceholder('0.8')
                    .setValue(String(this.plugin.settings.verticalScrollGain))
                    .onChange(async (value) => {
                        const parsed = parseFloat(value);
                        this.plugin.settings.verticalScrollGain = isNaN(parsed) ? 0.8 : Math.max(0.35, Math.min(1.8, parsed));
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl('h3', { text: 'Combo Ring Customization' });

        new Setting(containerEl)
            .setName('Combo preset')
            .setDesc('Controls which actions appear in the combo ring at each depth level.')
            .addDropdown(drop =>
                drop
                    .addOption('default', 'Default — Full action set')
                    .addOption('speed-reader', 'Speed Reader — Navigate + Copy focus')
                    .addOption('editor', 'Editor — Edit actions prioritized')
                    .addOption('minimal', 'Minimal — Select + Navigate only')
                    .addOption('random', 'Random — Shuffle actions each time')
                    .addOption('discourse', 'Discourse — KCS-style mark + bulk edit')
                    .setValue(this.plugin.settings.comboPreset)
                    .onChange(async (value) => {
                        this.plugin.settings.comboPreset = value as ComboPreset;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Disabled combo actions')
            .setDesc('Comma-separated actions to hide from the combo ring (e.g. spoiler,search,bold).')
            .addText(text =>
                text
                    .setPlaceholder('spoiler,search')
                    .setValue((this.plugin.settings.disabledComboActions ?? []).join(','))
                    .onChange(async (value) => {
                        this.plugin.settings.disabledComboActions = value
                            .split(',')
                            .map(s => s.trim().toLowerCase())
                            .filter(s => s.length > 0);
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl('h3', { text: 'Discourse Relations' });

        new Setting(containerEl)
            .setName('Show relation arcs')
            .setDesc('Render typed source → target discourse-relation arcs over the editor. Relations are stored in a sidecar file, never in the note body.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.showRelationOverlay)
                    .onChange(async (value) => {
                        this.plugin.settings.showRelationOverlay = value;
                        await this.plugin.saveSettings();
                        this.plugin.relations?.attachAndRefresh();
                    })
            );

        new Setting(containerEl)
            .setName('Custom relation types')
            .setDesc('One per line, added to the built-in taxonomy. Format: label or label,#color,glyph (e.g. "Topic shift,#ff8a5c,話").')
            .addTextArea(text => {
                text
                    .setPlaceholder('Topic shift,#ff8a5c,話\nAside,#90caf9,余')
                    .setValue(
                        (this.plugin.settings.customRelationTypes ?? [])
                            .map(c => [c.label, c.color, c.glyph].filter(Boolean).join(','))
                            .join('\n')
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.customRelationTypes = value
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                            .map(line => {
                                const [label, color, glyph] = line.split(',').map(s => s.trim());
                                const def: { label: string; color?: string; glyph?: string } = { label };
                                if (color) def.color = color;
                                if (glyph) def.glyph = glyph;
                                return def;
                            });
                        await this.plugin.saveSettings();
                        this.plugin.relations?.refresh();
                    });
                text.inputEl.rows = 3;
            });

        new Setting(containerEl)
            .setName('Custom marker types')
            .setDesc('Span-tag categories added to the built-ins (フィラー / 接続 / 主題 …). Format: label or label,#color,glyph (e.g. "Backchannel,#80cbc4,相").')
            .addTextArea(text => {
                text
                    .setPlaceholder('Backchannel,#80cbc4,相\nEmphasis,#ff8a65,強')
                    .setValue(
                        (this.plugin.settings.customMarkerTypes ?? [])
                            .map(c => [c.label, c.color, c.glyph].filter(Boolean).join(','))
                            .join('\n')
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.customMarkerTypes = value
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                            .map(line => {
                                const [label, color, glyph] = line.split(',').map(s => s.trim());
                                const def: { label: string; color?: string; glyph?: string } = { label };
                                if (color) def.color = color;
                                if (glyph) def.glyph = glyph;
                                return def;
                            });
                        await this.plugin.saveSettings();
                        this.plugin.relations?.refresh();
                    });
                text.inputEl.rows = 3;
            });

        containerEl.createEl('h3', { text: 'Custom Command Presets' });
        containerEl.createEl('p', {
            text: 'Add Obsidian commands to the scroller action panel. Use the command ID (e.g. "editor:toggle-bold").',
            cls: 'setting-item-description',
        });

        const cmds = this.plugin.settings.customCommands;
        for (let i = 0; i < cmds.length; i++) {
            const cmd = cmds[i];
            new Setting(containerEl)
                .setName(`Preset ${i + 1}`)
                .addText(text =>
                    text
                        .setPlaceholder('Label')
                        .setValue(cmd.name)
                        .onChange(async (value) => {
                            this.plugin.settings.customCommands[i].name = value;
                            await this.plugin.saveSettings();
                        })
                )
                .addText(text =>
                    text
                        .setPlaceholder('command-id')
                        .setValue(cmd.commandId)
                        .onChange(async (value) => {
                            this.plugin.settings.customCommands[i].commandId = value;
                            await this.plugin.saveSettings();
                        })
                )
                .addButton(btn =>
                    btn
                        .setButtonText('✕')
                        .onClick(async () => {
                            this.plugin.settings.customCommands.splice(i, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );
        }

        new Setting(containerEl)
            .addButton(btn =>
                btn
                    .setButtonText('+ Add command preset')
                    .onClick(async () => {
                        this.plugin.settings.customCommands.push({ name: '', commandId: '' });
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );
    }
}
