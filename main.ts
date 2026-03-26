/**
 * JP Sentence Surfer — Obsidian Plugin
 *
 * Surf through Japanese text at bunsetsu (文節) phrase-chunk level.
 * Uses TinySegmenter for morpheme tokenisation and a rule-based
 * bunsetsu grouper to produce natural phrase boundaries.
 *
 * Commands registered:
 *  - jp-surfer:surf-next     → move to next bunsetsu chunk
 *  - jp-surfer:surf-prev     → move to previous bunsetsu chunk
 *  - jp-surfer:surf-select   → select current bunsetsu chunk
 *  - jp-surfer:surf-cloze    → convert selection/chunk to cloze card
 *  - jp-surfer:reset         → clear surf state (re-parse on next surf)
 */

import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
} from "obsidian";

import { JpSurferSettings, DEFAULT_SETTINGS } from "./src/types";
import {
	surfNext,
	surfPrev,
	surfSelect,
	surfCloze,
	resetSurfState,
} from "./src/actions";

export default class JpSentenceSurferPlugin extends Plugin {
	settings!: JpSurferSettings;
	private toolbarEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		// ── Commands ──────────────────────────────────────────────────────────

		this.addCommand({
			id: "surf-next-sentence",
			name: "Surf: Next bunsetsu chunk",
			editorCallback: (editor: Editor) => {
				surfNext(editor, this.settings);
			},
			hotkeys: [{ modifiers: ["Alt"], key: "ArrowRight" }],
		});

		this.addCommand({
			id: "surf-prev-sentence",
			name: "Surf: Previous bunsetsu chunk",
			editorCallback: (editor: Editor) => {
				surfPrev(editor, this.settings);
			},
			hotkeys: [{ modifiers: ["Alt"], key: "ArrowLeft" }],
		});

		this.addCommand({
			id: "surf-select-sentence",
			name: "Surf: Select current bunsetsu chunk",
			editorCallback: (editor: Editor) => {
				surfSelect(editor, this.settings);
			},
			hotkeys: [{ modifiers: ["Alt"], key: "s" }],
		});

		this.addCommand({
			id: "surf-cloze",
			name: "Surf: Cloze current chunk / selection",
			editorCallback: (editor: Editor) => {
				surfCloze(editor, this.settings);
			},
			hotkeys: [{ modifiers: ["Alt"], key: "c" }],
		});

		this.addCommand({
			id: "surf-reset",
			name: "Surf: Reset (re-parse on next command)",
			callback: () => {
				resetSurfState();
			},
		});

		// ── Settings tab ──────────────────────────────────────────────────────
		this.addSettingTab(new JpSurferSettingTab(this.app, this));

		// ── Toolbar ───────────────────────────────────────────────────────────
		if (this.settings.toolbarEnabled) {
			this.createToolbar();
		}

		// Reset surf state when the active leaf changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (_leaf: WorkspaceLeaf | null) => {
				resetSurfState();
			})
		);

		// Reset surf state when the file is modified (content changed)
		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor: Editor) => {
				resetSurfState();
			})
		);
	}

	onunload() {
		this.removeToolbar();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Rebuild toolbar if needed
		this.removeToolbar();
		if (this.settings.toolbarEnabled) {
			this.createToolbar();
		}
	}

	// ── Toolbar ───────────────────────────────────────────────────────────────

	private createToolbar() {
		this.toolbarEl = document.createElement("div");
		this.toolbarEl.addClass("jp-surfer-toolbar");
		this.toolbarEl.setAttribute(
			"style",
			`position: fixed; ${this.settings.toolbarPosition === "bottom" ? "bottom: 16px" : "top: 60px"}; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; gap: 8px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 6px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);`
		);

		const buttons: Array<{ label: string; action: () => void }> = [
			{
				label: "◀ Prev",
				action: () => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view?.editor) surfPrev(view.editor, this.settings);
				},
			},
			{
				label: "Select",
				action: () => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view?.editor) surfSelect(view.editor, this.settings);
				},
			},
			{
				label: "Cloze",
				action: () => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view?.editor) surfCloze(view.editor, this.settings);
				},
			},
			{
				label: "Next ▶",
				action: () => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view?.editor) surfNext(view.editor, this.settings);
				},
			},
		];

		for (const { label, action } of buttons) {
			const btn = document.createElement("button");
			btn.textContent = label;
			btn.setAttribute(
				"style",
				"min-width: 64px; min-height: 44px; font-size: 14px; cursor: pointer; border: none; background: transparent; color: var(--text-normal); border-radius: 4px; padding: 4px 8px;"
			);
			btn.addEventListener("click", action);
			// Hover style via JS (no CSS file needed)
			btn.addEventListener("mouseenter", () => {
				btn.style.background = "var(--background-modifier-hover)";
			});
			btn.addEventListener("mouseleave", () => {
				btn.style.background = "transparent";
			});
			this.toolbarEl.appendChild(btn);
		}

		document.body.appendChild(this.toolbarEl);
	}

	private removeToolbar() {
		if (this.toolbarEl) {
			this.toolbarEl.remove();
			this.toolbarEl = null;
		}
	}
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

class JpSurferSettingTab extends PluginSettingTab {
	plugin: JpSentenceSurferPlugin;

	constructor(app: App, plugin: JpSentenceSurferPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "JP Sentence Surfer" });

		new Setting(containerEl)
			.setName("Strip YTranscript timestamps")
			.setDesc(
				"Automatically remove [MM:SS](url) timestamp prefixes from YTranscript output before parsing."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripTimestamps)
					.onChange(async (value) => {
						this.plugin.settings.stripTimestamps = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Strip bracket annotations")
			.setDesc(
				"Remove [笑い] [音楽] [拍手] and similar annotation markers from transcript text."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripAnnotations)
					.onChange(async (value) => {
						this.plugin.settings.stripAnnotations = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Cloze template")
			.setDesc(
				"Template for cloze cards. Use {text} as the placeholder for the chunk text. Example: {{c1::{text}}}"
			)
			.addText((text) =>
				text
					.setPlaceholder("{{c1::{text}}}")
					.setValue(this.plugin.settings.clozeTemplate)
					.onChange(async (value) => {
						this.plugin.settings.clozeTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show floating toolbar")
			.setDesc("Show a floating toolbar with Prev / Select / Cloze / Next buttons.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.toolbarEnabled)
					.onChange(async (value) => {
						this.plugin.settings.toolbarEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Toolbar position")
			.setDesc("Where to display the floating toolbar.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("bottom", "Bottom")
					.addOption("top", "Top")
					.setValue(this.plugin.settings.toolbarPosition)
					.onChange(async (value) => {
						this.plugin.settings.toolbarPosition = value as "bottom" | "top";
						await this.plugin.saveSettings();
					})
			);
	}
}
