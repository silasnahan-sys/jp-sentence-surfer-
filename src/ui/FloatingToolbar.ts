import JpSentenceSurferPlugin from '../main';

/** Minimal interface for the Obsidian App commands object */
interface AppWithCommands {
    commands: {
        executeCommandById(id: string): void;
    };
}

/**
 * Floating toolbar for mobile sentence surfing.
 * Shows a bottom (or top) bar with: ◀ Prev | Select | Cloze | Next ▶
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

        const buttons: { label: string; title: string; commandId: string }[] = [
            { label: '◀', title: 'Previous sentence', commandId: 'surf-prev-sentence' },
            { label: '✂', title: 'Select sentence', commandId: 'surf-select-sentence' },
            { label: '🃏', title: 'Save as cloze', commandId: 'surf-save-cloze' },
            { label: '▶', title: 'Next sentence', commandId: 'surf-next-sentence' },
            { label: '🔬', title: 'Discourse inspector', commandId: 'discourse-inspector-toggle' },
            { label: '📸', title: 'Capture chunk', commandId: 'discourse-capture-chunk' },
            { label: '📊', title: 'Index browser', commandId: 'discourse-index-browser' },
            { label: '🔄', title: 'Cycle granularity', commandId: 'discourse-cycle-level' },
            { label: '📖', title: 'Dictionary lookup', commandId: 'dict-lookup' },
        ];

        for (const btn of buttons) {
            const el = document.createElement('button');
            el.classList.add('jp-surfer-toolbar-btn');
            el.textContent = btn.label;
            el.title = btn.title;
            el.setAttribute('aria-label', btn.title);
            el.addEventListener('click', () => {
                this.runCommand(btn.commandId);
            });
            toolbar.appendChild(el);
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
    }

    private runCommand(id: string): void {
        // Use the Obsidian app to execute a command by its full plugin-prefixed ID
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
