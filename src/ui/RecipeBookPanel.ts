import type { RecipeDefinition } from '../inventory/RecipeRegistry';
import type { RecipeBookSelectionView } from '../inventory/RecipeBookView';

export interface RecipeBookPanelDeps {
  getQuery(): string;
  setQuery(query: string): void;
  listRecipes(): RecipeDefinition[];
  getSelected(): RecipeBookSelectionView | null;
  getSelectedKey(): string | null;
  selectRecipe(key: string | null): boolean;
  craftSelected(): boolean;
  onChanged(): void;
  onClose(): void;
}

/**
 * DOM controller for the recipe book dialog (262): a pure view over the
 * Game-owned known set. The panel owns no book state — only the status line
 * is local. Search input, result list, selection detail (laid-out ingredient
 * grid + have/missing), craft action, and close all delegate to `deps`.
 *
 * The Craft button stays enabled even when the selection is unaffordable so
 * the no-op path (status-surfaced, inventory untouched) remains reachable by
 * real clicks and browser E2E; the sibling-panel disabled-button convention
 * is deliberately not followed here for falsifiability.
 */
export class RecipeBookPanel {
  private readonly el: HTMLElement;
  private readonly searchEl: HTMLInputElement;
  private readonly listEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly missingEl: HTMLElement;
  private readonly craftButton: HTMLButtonElement;
  private readonly statusEl: HTMLElement;
  private readonly deps: RecipeBookPanelDeps;
  private lastSignature = '';

  constructor(el: HTMLElement, deps: RecipeBookPanelDeps) {
    this.el = el;
    this.deps = deps;
    this.searchEl = this.requireElement<HTMLInputElement>('recipebook-search');
    this.listEl = this.requireElement('recipebook-list');
    this.detailEl = this.requireElement('recipebook-detail');
    this.gridEl = this.requireElement('recipebook-grid');
    this.missingEl = this.requireElement('recipebook-missing');
    this.craftButton = this.requireElement<HTMLButtonElement>('recipebook-craft');
    this.statusEl = this.requireElement('recipebook-status');
    const closeButton = el.querySelector<HTMLButtonElement>('#recipebook-close');
    closeButton?.addEventListener('click', () => this.deps.onClose());

    this.searchEl.addEventListener('input', () => {
      this.deps.setQuery(this.searchEl.value);
      this.render();
    });
    this.craftButton.addEventListener('click', () => {
      const selected = this.deps.getSelected();
      if (selected === null) {
        this.setStatus('Select a recipe first.');
        return;
      }
      if (this.deps.craftSelected()) {
        this.setStatus(`Crafted ${selected.name}.`);
      } else {
        this.setStatus(`Missing ingredients: ${this.describeMissing(selected)}.`);
      }
      this.deps.onChanged();
      this.render();
    });
    this.render();
  }

  show(): void {
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /** Narrate an outcome on the status line (aria-live=polite). */
  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  render(): void {
    const query = this.deps.getQuery();
    if (this.searchEl.value !== query) this.searchEl.value = query;
    const entries = this.deps.listRecipes();
    const selected = this.deps.getSelected();
    const signature = this.signature(query, entries, selected);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.renderList(entries);
    this.renderDetail(selected);
  }

  private signature(
    query: string,
    entries: RecipeDefinition[],
    selected: RecipeBookSelectionView | null,
  ): string {
    const detail = selected === null
      ? 'none'
      : `${selected.key}|${selected.cells.map((c) => (c === null ? '_' : `${c.have}/${c.need}`)).join(',')}|${selected.canCraft}`;
    return `${query}|${entries.map((e) => e.key).join(',')}|${detail}`;
  }

  private renderList(entries: RecipeDefinition[]): void {
    this.listEl.textContent = '';
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'recipebook-empty';
      empty.textContent = 'No known recipes match.';
      this.listEl.appendChild(empty);
      return;
    }
    const selectedKey = this.deps.getSelectedKey();
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recipebook-recipe';
      button.setAttribute('data-recipebook-recipe', entry.key);
      button.setAttribute('aria-pressed', entry.key === selectedKey ? 'true' : 'false');
      const title = document.createElement('span');
      title.className = 'recipebook-recipe-title';
      title.textContent = entry.name;
      button.appendChild(title);
      button.addEventListener('click', () => {
        if (!this.deps.selectRecipe(entry.key)) {
          this.setStatus('Recipe no longer available.');
        }
        this.deps.onChanged();
        this.render();
      });
      this.listEl.appendChild(button);
    }
  }

  private renderDetail(selected: RecipeBookSelectionView | null): void {
    this.gridEl.textContent = '';
    if (selected === null) {
      this.detailEl.classList.add('hidden');
      this.missingEl.textContent = '';
      this.craftButton.disabled = false;
      return;
    }
    this.detailEl.classList.remove('hidden');
    const title = this.detailEl.querySelector('.recipebook-detail-title');
    if (title) title.textContent = `${selected.name} → ${selected.outputLabel}`;
    for (const cell of selected.cells) {
      const cellEl = document.createElement('div');
      cellEl.className = 'recipebook-cell';
      if (cell === null) {
        cellEl.classList.add('empty');
      } else {
        cellEl.textContent = `${cell.label} ${cell.have}/${cell.need}`;
        cellEl.classList.toggle('missing', cell.missing);
      }
      this.gridEl.appendChild(cellEl);
    }
    this.missingEl.textContent = selected.missingCount === 0
      ? 'All ingredients available.'
      : `Missing ingredients: ${this.describeMissing(selected)}.`;
    this.craftButton.disabled = false;
  }

  private describeMissing(selected: RecipeBookSelectionView): string {
    const parts: string[] = [];
    for (const cell of selected.cells) {
      if (cell !== null && cell.missing) parts.push(`${cell.label} ×${cell.need - cell.have}`);
    }
    return parts.join(', ');
  }

  private requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = this.el.querySelector<T>(`#${id}`);
    if (!found) {
      throw new Error(`Recipebook element missing: #${id}`);
    }
    return found;
  }
}
