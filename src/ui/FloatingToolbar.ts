import JpSentenceSurferPlugin from '../main';
import { HapticEngine } from './HapticEngine';

interface AppWithCommands {
    commands: { executeCommandById(id: string): void; };
}

interface ToolbarButton {
    icon: string;
    label: string;
    commandId: string;
    isScrollerToggle?: boolean;
}

/**
 * FloatingToolbar v2 — Completely redesigned.
 *
 * - Ultra-thin glassmorphic capsule
 * - Haptic on every press with spring-scale animation
 * - Drag to reposition vertically with momentum
 * - Auto-fades to near-invisible when idle, comes back on touch
 * - Never overlaps Obsidian native toolbar / keyboard
 * - Collapse/expand toggle (minimizes to a single dot)
 * - Scroller toggle with visual state indication
 */
export class FloatingToolbar {
    private plugin: JpSentenceSurferPlugin;
    private haptics: HapticEngine;
    private toolbarEl: HTMLElement | null = null;
    private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
    private isDragging = false;
    private dragStartY = 0;
    private toolbarStartY = 0;
    private currentY = 0;
    private isCollapsed = false;
    private onScrollerToggle: (() => void) | null = null;
    private scrollerActive = false;
    private boundDragMove: ((e: TouchEvent) => void) | null = null;
    private boundDragEnd: (() => void) | null = null;
    private boundResize: (() => void) | null = null;
    private mountAnimId: number | null = null;
    private exitTimerId: ReturnType<typeof setTimeout> | null = null;

    private autoHideDelay = 3500;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
        this.haptics = new HapticEngine();
    }

    setScrollerToggle(cb: () => void): void { this.onScrollerToggle = cb; }
    setScrollerActive(active: boolean): void {
        this.scrollerActive = active;
        this.toolbarEl?.querySelector('[data-scroller-toggle]')
            ?.classList.toggle('ft2-btn--active', active);
    }

    mount(): void {
        if (this.toolbarEl) this.unmount();
        // Cancel any lingering exit animation from previous unmount
        if (this.exitTimerId !== null) { clearTimeout(this.exitTimerId); this.exitTimerId = null; }
        if (!this.plugin.settings.showFloatingToolbar) return;

        const tb = document.createElement('div');
        tb.className = 'ft2';

        // Handle
        const handle = document.createElement('div');
        handle.className = 'ft2-handle';
        tb.appendChild(handle);

        // Button row
        const row = document.createElement('div');
        row.className = 'ft2-row';

        const buttons: ToolbarButton[] = [
            { icon: '‹', label: 'Prev', commandId: 'surf-prev-sentence' },
            { icon: '✦', label: 'Select', commandId: 'surf-select-sentence' },
            { icon: 'B', label: 'Bold', commandId: 'surf-select-bold-target' },
            { icon: '⎘', label: 'Cloze', commandId: 'surf-save-cloze' },
            { icon: '›', label: 'Next', commandId: 'surf-next-sentence' },
            { icon: '🔮', label: 'Monkey Scroller', commandId: '', isScrollerToggle: true },
        ];

        for (const btn of buttons) {
            const el = document.createElement('button');
            el.className = 'ft2-btn';
            el.setAttribute('aria-label', btn.label);
            if (btn.isScrollerToggle) el.dataset.scrollerToggle = '1';

            el.innerHTML = `<span class="ft2-btn-icon">${btn.icon}</span>`;

            el.addEventListener('touchstart', () => {
                el.classList.add('ft2-btn--pressed');
                this.haptics.fire('light');
            }, { passive: true });

            el.addEventListener('touchend', () => {
                el.classList.remove('ft2-btn--pressed');
            }, { passive: true });

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                // Global capture lock: suppress clicks while scroller is dragging
                // (prevents accidental command execution if finger lifts over a button)
                if (this.plugin.isScrollerCapturing) return;
                if (btn.isScrollerToggle) {
                    this.onScrollerToggle?.();
                    this.scrollerActive = !this.scrollerActive;
                    el.classList.toggle('ft2-btn--active', this.scrollerActive);
                    this.haptics.fire('snap');
                } else {
                    this.runCommand(btn.commandId);
                    this.haptics.fire('tick');
                }
                this.resetAutoHide();
            });

            row.appendChild(el);
        }

        // Collapse toggle
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'ft2-collapse-btn';
        collapseBtn.innerHTML = '·';
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        });
        tb.appendChild(collapseBtn);

        tb.appendChild(row);
        this.setInitialPosition(tb);
        document.body.appendChild(tb);
        this.toolbarEl = tb;

        this.attachDragListeners(handle, tb);
        this.attachResizeListener(tb);
        this.resetAutoHide();

        tb.addEventListener('touchstart', () => {
            this.showToolbar();
            this.resetAutoHide();
        }, { passive: true });

        this.mountAnimId = requestAnimationFrame(() => {
            this.mountAnimId = null;
            // Guard: if unmount() raced ahead, don't touch detached element
            if (!this.toolbarEl) return;
            tb.classList.add('ft2--mounted');
        });
    }

    unmount(): void {
        if (this.mountAnimId !== null) { cancelAnimationFrame(this.mountAnimId); this.mountAnimId = null; }
        if (this.autoHideTimer) { clearTimeout(this.autoHideTimer); this.autoHideTimer = null; }
        this.removeGlobalListeners();
        this.haptics.destroy();
        if (this.toolbarEl) {
            this.toolbarEl.classList.add('ft2--exiting');
            const el = this.toolbarEl;
            this.toolbarEl = null; // null ref BEFORE timer so mount() doesn't see stale el
            // Cancel any previous exit timer to prevent stacking detached DOM refs
            if (this.exitTimerId !== null) clearTimeout(this.exitTimerId);
            this.exitTimerId = setTimeout(() => {
                this.exitTimerId = null;
                el.remove();
            }, 200);
        }
    }

    private removeGlobalListeners(): void {
        if (this.boundDragMove) { document.removeEventListener('touchmove', this.boundDragMove); this.boundDragMove = null; }
        if (this.boundDragEnd) { document.removeEventListener('touchend', this.boundDragEnd); this.boundDragEnd = null; }
        if (this.boundResize) { window.removeEventListener('resize', this.boundResize); this.boundResize = null; }
    }

    private toggleCollapse(): void {
        this.isCollapsed = !this.isCollapsed;
        this.toolbarEl?.classList.toggle('ft2--collapsed', this.isCollapsed);
        this.haptics.fire('tick');
    }

    private setInitialPosition(tb: HTMLElement): void {
        const pos = this.plugin.settings.toolbarPosition;
        this.currentY = pos === 'top' ? 60 : window.innerHeight - 130;
        tb.style.transform = `translate3d(-50%, ${this.currentY}px, 0)`;
    }

    private showToolbar(): void { this.toolbarEl?.classList.remove('ft2--hidden'); }
    private hideToolbar(): void { this.toolbarEl?.classList.add('ft2--hidden'); }

    private resetAutoHide(): void {
        if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
        this.showToolbar();
        const delay = this.plugin.settings.toolbarAutoHideMs || this.autoHideDelay;
        if (delay > 0) {
            this.autoHideTimer = setTimeout(() => this.hideToolbar(), delay);
        }
    }

    private runCommand(id: string): void {
        const fullId = `jp-sentence-surfer:${id}`;
        (this.plugin.app as unknown as AppWithCommands).commands.executeCommandById(fullId);
    }

    private dragTouchId: number | null = null;

    private attachDragListeners(handle: HTMLElement, toolbar: HTMLElement): void {
        this.boundDragMove = (e: TouchEvent) => {
            if (!this.isDragging || this.dragTouchId === null) return;
            // L-5: Match by touch identifier to avoid multi-touch jitter
            let touch: Touch | null = null;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.dragTouchId) { touch = e.touches[i]; break; }
            }
            if (!touch) return;
            const dy = touch.clientY - this.dragStartY;
            this.currentY = Math.max(40, Math.min(window.innerHeight - 70, this.toolbarStartY + dy));
            toolbar.style.transform = `translate3d(-50%, ${this.currentY}px, 0)`;
        };

        this.boundDragEnd = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.dragTouchId = null;
            toolbar.classList.remove('ft2--dragging');
            this.haptics.fire('light');
            if (this.boundDragMove) document.removeEventListener('touchmove', this.boundDragMove);
            if (this.boundDragEnd) document.removeEventListener('touchend', this.boundDragEnd);
        };

        handle.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            this.isDragging = true;
            this.dragTouchId = e.touches[0].identifier;
            this.dragStartY = e.touches[0].clientY;
            this.toolbarStartY = this.currentY;
            toolbar.classList.add('ft2--dragging');
            document.addEventListener('touchmove', this.boundDragMove!, { passive: true });
            document.addEventListener('touchend', this.boundDragEnd!, { passive: true });
        }, { passive: true });
    }

    private attachResizeListener(toolbar: HTMLElement): void {
        this.boundResize = () => {
            const maxY = window.innerHeight - 70;
            if (this.currentY > maxY) {
                this.currentY = maxY;
                toolbar.style.transform = `translate3d(-50%, ${this.currentY}px, 0)`;
            }
        };
        window.addEventListener('resize', this.boundResize, { passive: true });
    }
}
