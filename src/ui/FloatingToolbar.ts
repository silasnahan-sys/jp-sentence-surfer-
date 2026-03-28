import JpSentenceSurferPlugin from '../main';
import { DISCOURSE_GRANULARITY_LABELS } from '../types';

/** Minimal interface for the Obsidian App commands object */
interface AppWithCommands {
    commands: {
        executeCommandById(id: string): void;
    };
}

/**
 * Floating toolbar for mobile sentence surfing.
 * Shows a bottom (or top) bar with surf, discourse, and dictionary controls.
 */
export class FloatingToolbar {
    private plugin: JpSentenceSurferPlugin;
    private toolbarEl: HTMLElement | null = null;
    private granBtnEl: HTMLButtonElement | null = null;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
    }

    mount(): void {
        if (this.toolbarEl) this.unmount();
        if (!this.plugin.settings.showFloatingToolbar) return;

        const toolbar = document.createElement('div');
        toolbar.classList.add('jp-surfer-toolbar');
        toolbar.setAttribute('data-position', this.plugin.settings.toolbarPosition);

        // ── Core surf buttons ──────────────────────────────────────────────────
        const coreButtons: { label: string; title: string; commandId: string }[] = [
            { label: '◀', title: 'Previous sentence', commandId: 'surf-prev-sentence' },
            { label: '✂', title: 'Select sentence', commandId: 'surf-select-sentence' },
            { label: '🃏', title: 'Save as cloze', commandId: 'surf-save-cloze' },
            { label: '▶', title: 'Next sentence', commandId: 'surf-next-sentence' },
        ];

        for (const btn of coreButtons) {
            toolbar.appendChild(this.makeBtn(btn.label, btn.title, () => this.runCommand(btn.commandId)));
        }

        // ── Separator ─────────────────────────────────────────────────────────
        const sep1 = document.createElement('div');
        sep1.classList.add('jp-surfer-toolbar-sep');
        toolbar.appendChild(sep1);

        // ── Discourse buttons ──────────────────────────────────────────────────
        // Granularity indicator (tappable — cycles through levels)
        const granLabel = DISCOURSE_GRANULARITY_LABELS[this.plugin.settings.discourseGranularity];
        const granBtn = this.makeBtn(granLabel, 'Cycle discourse granularity', () => {
            this.runCommand('discourse-cycle-granularity');
        });
        granBtn.classList.add('jp-surfer-toolbar-btn--gran');
        this.granBtnEl = granBtn as HTMLButtonElement;
        toolbar.appendChild(granBtn);

        // Prev / Next at discourse level
        toolbar.appendChild(this.makeBtn('←', 'Discourse: previous', () => this.runCommand('discourse-surf-prev')));
        toolbar.appendChild(this.makeBtn('→', 'Discourse: next', () => this.runCommand('discourse-surf-next')));

        // Capture chunk
        toolbar.appendChild(this.makeBtn('⊕', 'Capture discourse chunk', () => this.runCommand('discourse-capture-chunk')));

        // Toggle overlay
        toolbar.appendChild(this.makeBtn('🎨', 'Toggle discourse overlay', () => this.runCommand('discourse-toggle-overlay')));

        // Open index browser
        toolbar.appendChild(this.makeBtn('📚', 'Open discourse index', () => this.runCommand('discourse-show-index')));

        // ── Dictionary button ──────────────────────────────────────────────────
        if (this.plugin.settings.showDictInToolbar && this.plugin.settings.enableDictLookup) {
            const sep2 = document.createElement('div');
            sep2.classList.add('jp-surfer-toolbar-sep');
            toolbar.appendChild(sep2);

            toolbar.appendChild(this.makeBtn('📖', 'Dictionary lookup', () => this.runCommand('dict-lookup')));
        }

        document.body.appendChild(toolbar);
        this.toolbarEl = toolbar;

        // Swipe gesture support
        this.attachSwipeListeners(toolbar);
    }

    unmount(): void {
        if (this.toolbarEl) {
            this.toolbarEl.remove();
            this.toolbarEl = null;
        }
        this.granBtnEl = null;
    }

    /** Update the granularity button label after cycling */
    updateGranularityLabel(): void {
        if (this.granBtnEl) {
            this.granBtnEl.textContent =
                DISCOURSE_GRANULARITY_LABELS[this.plugin.settings.discourseGranularity];
        }
    }

    private makeBtn(
        label: string,
        title: string,
        onClick: () => void,
    ): HTMLButtonElement {
        const el = document.createElement('button');
        el.classList.add('jp-surfer-toolbar-btn');
        el.textContent = label;
        el.title = title;
        el.setAttribute('aria-label', title);
        el.addEventListener('click', onClick);
        return el;
    }

    private runCommand(id: string): void {
        const fullId = `jp-sentence-surfer:${id}`;
        (this.plugin.app as unknown as AppWithCommands).commands.executeCommandById(fullId);
    }

    private attachSwipeListeners(el: HTMLElement): void {
        let startX = 0;
        let startY = 0;

        el.addEventListener('touchstart', (e: TouchEvent) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });

        el.addEventListener('touchend', (e: TouchEvent) => {
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                if (dx < 0) {
                    this.runCommand('surf-next-sentence');
                } else {
                    this.runCommand('surf-prev-sentence');
                }
            }
        }, { passive: true });
    }
}
