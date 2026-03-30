import JpSentenceSurferPlugin from '../main';
import { SurfMode } from '../types';

/** Minimal interface for the Obsidian App commands object */
interface AppWithCommands {
    commands: {
        executeCommandById(id: string): void;
    };
}

const SURF_MODE_LABELS: Record<SurfMode, string> = {
    [SurfMode.Bunsetsu]:    '文',
    [SurfMode.Sentence]:    '句',
    [SurfMode.Clause]:      '節',
    [SurfMode.Particle]:    '助',
    [SurfMode.ContentWord]: '語',
    [SurfMode.Collocation]: '連',
    [SurfMode.Bold]:        '太',
};

/**
 * Floating toolbar for mobile sentence surfing.
 * Shows a bottom (or top) bar with: [mode] ◀ Prev | Select | Cloze | Next ▶
 * The mode badge cycles through surf modes on tap.
 */
export class FloatingToolbar {
    private plugin: JpSentenceSurferPlugin;
    private toolbarEl: HTMLElement | null = null;
    private modeBadgeEl: HTMLElement | null = null;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
    }

    mount(): void {
        if (this.toolbarEl) this.unmount();
        if (!this.plugin.settings.showFloatingToolbar) return;

        const toolbar = document.createElement('div');
        toolbar.classList.add('jp-surfer-toolbar');
        toolbar.setAttribute('data-position', this.plugin.settings.toolbarPosition);

        // Mode badge (cycles surf mode on tap)
        const badge = document.createElement('button');
        badge.classList.add('jp-surfer-toolbar-btn', 'jp-surfer-mode-badge');
        badge.title = 'Tap to cycle surf mode';
        badge.setAttribute('aria-label', 'Cycle surf mode');
        badge.textContent = SURF_MODE_LABELS[this.plugin.currentMode] ?? '文';
        badge.addEventListener('click', () => {
            this.plugin.cycleSurfMode();
        });
        toolbar.appendChild(badge);
        this.modeBadgeEl = badge;

        // Navigation buttons
        const buttons: { label: string; title: string; commandId: string }[] = [
            { label: '◀', title: 'Previous sentence', commandId: 'surf-prev-sentence' },
            { label: '✂', title: 'Select sentence',   commandId: 'surf-select-sentence' },
            { label: '🃏', title: 'Save as cloze',     commandId: 'surf-save-cloze' },
            { label: '▶', title: 'Next sentence',      commandId: 'surf-next-sentence' },
        ];

        for (const btn of buttons) {
            const el = document.createElement('button');
            el.classList.add('jp-surfer-toolbar-btn');
            el.textContent = btn.label;
            el.title = btn.title;
            el.setAttribute('aria-label', btn.title);
            el.addEventListener('click', () => {
                if (this.plugin.settings.enableHapticFeedback) {
                    this._triggerHaptic(el);
                }
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
            this.modeBadgeEl = null;
        }
    }

    /** Update the mode badge label when mode changes. */
    updateModeBadge(mode: SurfMode): void {
        if (this.modeBadgeEl) {
            this.modeBadgeEl.textContent = SURF_MODE_LABELS[mode] ?? '文';
            this.modeBadgeEl.setAttribute('data-mode', mode);
        }
    }

    private runCommand(id: string): void {
        const fullId = `jp-sentence-surfer:${id}`;
        (this.plugin.app as unknown as AppWithCommands).commands.executeCommandById(fullId);
    }

    /** Apply the haptic CSS animation to a button. */
    private _triggerHaptic(el: HTMLElement): void {
        el.classList.remove('jp-surfer-btn-haptic');
        // Force reflow so the animation restarts
        void el.offsetWidth;
        el.classList.add('jp-surfer-btn-haptic');
        el.addEventListener('animationend', () => {
            el.classList.remove('jp-surfer-btn-haptic');
        }, { once: true });
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
