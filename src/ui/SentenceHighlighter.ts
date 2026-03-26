import { Editor, MarkdownView } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { parseSentences, findSentenceAt } from '../jp-sentence-parser';

/**
 * SentenceHighlighter adds a CSS variable to the editor container
 * whenever the cursor moves to a new sentence, providing a subtle
 * background color that can be referenced in styles.css.
 *
 * Uses the Obsidian workspace 'active-leaf-change' and editor
 * 'editor-change' events rather than polling.
 */
export class SentenceHighlighter {
    private plugin: JpSentenceSurferPlugin;
    private lastOffset = -1;
    private boundUpdate: () => void;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
        this.boundUpdate = this.updateHighlight.bind(this);
    }

    start(): void {
        if (!this.plugin.settings.highlightCurrentSentence) return;
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', this.boundUpdate)
        );
        this.plugin.registerEvent(
            (this.plugin.app.workspace as any).on('editor-change', this.boundUpdate)
        );
        // Also trigger on codemirror cursor activity via DOM events
        this.plugin.registerDomEvent(document, 'keyup', this.boundUpdate);
        this.plugin.registerDomEvent(document, 'mouseup', this.boundUpdate);
    }

    stop(): void {
        this.clearHighlight();
    }

    private updateHighlight(): void {
        if (!this.plugin.settings.highlightCurrentSentence) return;

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            this.clearHighlight();
            return;
        }

        const editor: Editor = view.editor;
        const offset = editor.posToOffset(editor.getCursor());

        if (offset === this.lastOffset) return;
        this.lastOffset = offset;

        const content = editor.getValue();
        const sentences = parseSentences(content, this.plugin.settings);
        const sentence = findSentenceAt(sentences, offset);

        this.clearHighlight();

        if (!sentence) return;

        this.applyHighlight(editor);
    }

    private applyHighlight(editor: Editor): void {
        const editorEl = (editor as any).containerEl as HTMLElement | undefined;
        if (!editorEl) return;
        editorEl.style.setProperty(
            '--jp-surfer-highlight-color',
            this.plugin.settings.highlightColor
        );
    }

    private clearHighlight(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editorEl = (view.editor as any).containerEl as HTMLElement | undefined;
        if (editorEl) {
            editorEl.style.removeProperty('--jp-surfer-highlight-color');
        }
    }
}
