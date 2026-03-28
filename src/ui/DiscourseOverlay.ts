/**
 * DiscourseOverlay.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders color-coded discourse pattern annotations as overlay chips on the
 * active MarkdownView.  Uses a DOM overlay div positioned over the editor.
 *
 * CSS classes: jp-surfer-discourse-overlay-*
 * Does NOT interfere with PR #4's collocation overlay classes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MarkdownView } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DiscourseMarker } from '../types';
import { detectAllPatterns, getPatternLabel, getMarkerColorClass } from '../discourse/discourse-grammar';

export class DiscourseOverlay {
    private plugin: JpSentenceSurferPlugin;
    private overlayEl: HTMLElement | null = null;
    private activeView: MarkdownView | null = null;
    private enabled = false;

    constructor(plugin: JpSentenceSurferPlugin) {
        this.plugin = plugin;
    }

    /** Enable / disable the overlay. */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.clearOverlay();
        } else {
            this.refresh();
        }
    }

    isEnabled(): boolean { return this.enabled; }

    /** Called when the active leaf changes or content changes. */
    refresh(): void {
        if (!this.enabled) return;
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) { this.clearOverlay(); return; }
        this.activeView = view;
        this.renderOverlay(view);
    }

    private renderOverlay(view: MarkdownView): void {
        this.clearOverlay();

        const text = view.editor.getValue();
        if (!text) return;

        const markers = detectAllPatterns(text);
        if (markers.length === 0) return;

        // Get editor DOM element
        const editorEl = (view as any).contentEl as HTMLElement | undefined;
        if (!editorEl) return;

        const cmContent = editorEl.querySelector('.cm-content') as HTMLElement | null;
        if (!cmContent) return;

        const overlay = document.createElement('div');
        overlay.classList.add('jp-surfer-discourse-overlay');

        for (const marker of markers) {
            this.appendChip(overlay, marker, view, cmContent);
        }

        editorEl.style.position = 'relative';
        editorEl.appendChild(overlay);
        this.overlayEl = overlay;
    }

    private appendChip(
        overlay: HTMLElement,
        marker: DiscourseMarker,
        view: MarkdownView,
        cmContent: HTMLElement,
    ): void {
        try {
            const startPos = view.editor.offsetToPos(marker.startInChunk);
            const coords = (view.editor as any).coordsAtPos?.(startPos);
            if (!coords) return;

            const colorClass = getMarkerColorClass(marker.category);
            const label = getPatternLabel(marker.patternType);

            const chip = document.createElement('span');
            chip.classList.add('jp-surfer-discourse-overlay-chip', colorClass);
            chip.style.position = 'absolute';
            chip.style.left = `${coords.left}px`;
            chip.style.top = `${coords.top - 20}px`;
            chip.textContent = label;
            chip.title = `${marker.surface} (${marker.patternType})`;

            chip.addEventListener('click', () => {
                view.editor.setCursor(view.editor.offsetToPos(marker.startInChunk));
            });

            overlay.appendChild(chip);
        } catch (_) { /* coords may not be available */ }
    }

    private clearOverlay(): void {
        if (this.overlayEl) {
            this.overlayEl.remove();
            this.overlayEl = null;
        }
    }

    destroy(): void {
        this.clearOverlay();
    }
}
