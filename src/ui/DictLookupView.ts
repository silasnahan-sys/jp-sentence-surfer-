import { Modal, App, Notice } from 'obsidian';
import JpSentenceSurferPlugin from '../main';
import { DictSearchResult } from '../dictionary/dict-engine';

interface JpCollocationsPlugin {
    addCollocation?: (expression: string) => void;
}

interface ObsidianPluginsInternal {
    plugins: Record<string, JpCollocationsPlugin>;
}

export class DictLookupView extends Modal {
    private plugin: JpSentenceSurferPlugin;
    private initialQuery: string | undefined;

    constructor(app: App, plugin: JpSentenceSurferPlugin, initialQuery?: string) {
        super(app);
        this.plugin = plugin;
        this.initialQuery = initialQuery;
    }

    onOpen(): void {
        this.modalEl.addClass('jp-surfer-dict-modal');

        const { contentEl } = this;
        contentEl.empty();

        const searchContainer = contentEl.createEl('div', { cls: 'jp-surfer-dict-search-bar' });

        const searchInput = searchContainer.createEl('input', {
            cls: 'jp-surfer-dict-search',
            attr: { type: 'text', placeholder: 'Search Japanese word or phrase...' },
        }) as HTMLInputElement;

        const modeSelect = searchContainer.createEl('select', {
            cls: 'jp-surfer-dict-mode',
        }) as HTMLSelectElement;
        for (const mode of ['exact', 'prefix', 'substring', 'deconjugated']) {
            modeSelect.createEl('option', { text: mode, attr: { value: mode } });
        }

        const searchBtn = searchContainer.createEl('button', {
            cls: 'jp-surfer-dict-search-btn',
            text: 'Search',
        });

        const resultsEl = contentEl.createEl('div', { cls: 'jp-surfer-dict-results' });

        const doSearch = (): void => {
            const query = searchInput.value.trim();
            if (!query) return;
            const mode = modeSelect.value;
            let results: DictSearchResult[];
            if (mode === 'deconjugated') {
                results = this.plugin.dictEngine.searchDeconjugated(query);
            } else {
                results = this.plugin.dictEngine.search(query, mode as 'exact' | 'prefix' | 'substring');
            }
            this.renderResults(resultsEl, results);
        };

        searchBtn.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') doSearch();
        });

        if (this.initialQuery) {
            searchInput.value = this.initialQuery;
            doSearch();
        } else {
            searchInput.focus();
        }
    }

    private renderResults(container: HTMLElement, results: DictSearchResult[]): void {
        container.empty();

        if (results.length === 0) {
            container.createEl('p', { text: 'No results found.' });
            return;
        }

        for (const result of results) {
            const card = container.createEl('div', { cls: 'jp-surfer-dict-result-card' });

            card.createEl('div', {
                cls: 'jp-surfer-dict-headword',
                text: result.entry.expression,
            });

            if (result.entry.reading && result.entry.reading !== result.entry.expression) {
                card.createEl('div', {
                    cls: 'jp-surfer-dict-reading',
                    text: `[${result.entry.reading}]`,
                });
            }

            const allTags = [...result.entry.definitionTags, ...result.entry.termTags].filter(
                t => t.length > 0
            );
            if (allTags.length > 0) {
                const tagsEl = card.createEl('div', { cls: 'jp-surfer-dict-tags' });
                for (const tag of allTags) {
                    tagsEl.createEl('span', { cls: 'jp-surfer-dict-tag', text: tag });
                }
            }

            const defsEl = card.createEl('div', { cls: 'jp-surfer-dict-definitions' });
            const ol = defsEl.createEl('ol');
            for (const def of result.entry.definitions) {
                const text = typeof def === 'string' ? def : JSON.stringify(def);
                ol.createEl('li', { text });
            }

            const actionsEl = card.createEl('div', { cls: 'jp-surfer-dict-actions' });

            const saveCollBtn = actionsEl.createEl('button', {
                cls: 'jp-surfer-dict-btn',
                text: 'Save as Collocation',
            });
            saveCollBtn.addEventListener('click', () => {
                const internalPlugins = (this.app as App & { plugins?: ObsidianPluginsInternal })
                    .plugins;
                const collPlugin = internalPlugins?.plugins?.['jp-collocations'];
                if (!collPlugin) {
                    new Notice('jp-collocations plugin not found. Expression copied to clipboard.');
                    navigator.clipboard.writeText(result.entry.expression);
                    return;
                }
                if (typeof collPlugin.addCollocation === 'function') {
                    collPlugin.addCollocation(result.entry.expression);
                } else {
                    navigator.clipboard.writeText(result.entry.expression);
                    new Notice('Expression copied to clipboard.');
                }
            });

            const saveExBtn = actionsEl.createEl('button', {
                cls: 'jp-surfer-dict-btn',
                text: 'Save Example',
            });
            saveExBtn.addEventListener('click', () => {
                const firstDef = result.entry.definitions[0];
                const text = typeof firstDef === 'string' ? firstDef : JSON.stringify(firstDef);
                navigator.clipboard.writeText(text);
                new Notice('Example saved to clipboard.');
            });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
