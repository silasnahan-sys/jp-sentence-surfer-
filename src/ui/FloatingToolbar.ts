import JpSentenceSurferPlugin from '../main';

/** Minimal interface for the Obsidian App commands object */
interface AppWithCommands {
    commands: {
        executeCommandById(id: string): void;
    };
}

/** Labels for discourse granularity levels */
const GRANULARITY_LABELS: Record<string, string> = {
    morpheme: '形態素',
    bunsetsu: '文節',
    clause: '節',
    utterance: '発話',
    turn: 'ターン',
    exchange: '交換',
    episode: 'エピソード',
};

/**
 * Floating toolbar for mobile sentence surfing.
 * Shows a bottom (or top) bar with:
 *   ◀ Prev | Select | Cloze | Next ▶ | [粒度] | ⊕ | 🎨 | 📚 | 📖
 */
export class FloatingToolbar {
    private plugin: JpSentenceSurferPlugin;
    private toolbarEl: HTMLElement | null = null;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
    }

    mount(): void {
        if (this.toolbarEl) this.unmount();
        if (!this.plugin.settings.showFloatingToolbar) return;

        const toolbar = document.createElement('div');
        toolbar.classList.add('jp-surfer-toolbar');
        toolbar.setAttribute('data-position', this.plugin.settings.toolbarPosition);

        // ─── Sentence surfing buttons ─────────────────────────────────────────
        const sentenceButtons: { label: string; title: string; commandId: string }[] = [
            { label: '◀', title: 'Previous sentence', commandId: 'surf-prev-sentence' },
            { label: '✂', title: 'Select sentence', commandId: 'surf-select-sentence' },
            { label: '🃏', title: 'Save as cloze', commandId: 'surf-save-cloze' },
            { label: '▶', title: 'Next sentence', commandId: 'surf-next-sentence' },
        ];

        for (const btn of sentenceButtons) {
            toolbar.appendChild(this.makeButton(btn.label, btn.title, btn.commandId));
        }

        // ─── Divider ──────────────────────────────────────────────────────────
        const divider = document.createElement('span');
        divider.classList.add('jp-surfer-toolbar-divider');
        divider.textContent = '│';
        toolbar.appendChild(divider);

        // ─── Granularity indicator (tappable, cycles through levels) ─────────
        const granLabel = document.createElement('button');
        granLabel.classList.add('jp-surfer-toolbar-btn', 'jp-surfer-granularity-btn');
        granLabel.title = 'Cycle discourse granularity';
        granLabel.setAttribute('aria-label', 'Cycle discourse granularity');
        this.updateGranularityLabel(granLabel);
        granLabel.addEventListener('click', () => {
            this.runCommand('discourse-cycle-granularity');
            // Update label after a short delay to allow settings to update
            setTimeout(() => this.updateGranularityLabel(granLabel), 100);
        });
        toolbar.appendChild(granLabel);

        // ─── Discourse surf buttons ───────────────────────────────────────────
        toolbar.appendChild(this.makeButton('《', 'Discourse: Previous unit', 'discourse-surf-prev'));
        toolbar.appendChild(this.makeButton('》', 'Discourse: Next unit', 'discourse-surf-next'));

        // ─── Capture button ───────────────────────────────────────────────────
        toolbar.appendChild(this.makeButton('⊕', 'Discourse: Capture chunk', 'discourse-capture'));

        // ─── Overlay toggle ───────────────────────────────────────────────────
        toolbar.appendChild(this.makeButton('🎨', 'Discourse: Toggle overlay', 'discourse-toggle-overlay'));

        // ─── Index browser button ─────────────────────────────────────────────
        toolbar.appendChild(this.makeButton('📚', 'Discourse: Open index', 'discourse-open-index'));

        // ─── Dictionary lookup button ─────────────────────────────────────────
        toolbar.appendChild(this.makeButton('📖', 'Dictionary: Lookup', 'dict-lookup'));

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
    }

    private makeButton(label: string, title: string, commandId: string): HTMLButtonElement {
        const el = document.createElement('button');
        el.classList.add('jp-surfer-toolbar-btn');
        el.textContent = label;
        el.title = title;
        el.setAttribute('aria-label', title);
        el.addEventListener('click', () => {
            this.runCommand(commandId);
        });
        return el;
    }

    private updateGranularityLabel(el: HTMLElement): void {
        const g = this.plugin.settings.discourseGranularity;
        el.textContent = `[${GRANULARITY_LABELS[g] ?? g}]`;
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
