import type { CreativeItemView } from '../simulation/CreativeInventory';

export interface CreativeMenuPanelDeps {
  getQuery(): string;
  setQuery(query: string): void;
  listItems(): CreativeItemView[];
  grantItem(itemId: number): boolean;
  onChanged(): void;
  onClose(): void;
}

/**
 * DOM controller for the creative menu dialog (265): a pure view over the
 * Game-owned mode + inventory. The panel owns no catalog state — only the
 * status line is local. Search input filters the placeable catalog; row
 * activation grants a full stack with no survival cost or gate.
 */
export class CreativeMenuPanel {
  private readonly el: HTMLElement;
  private readonly searchEl: HTMLInputElement;
  private readonly listEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly deps: CreativeMenuPanelDeps;
  private lastSignature = '';

  constructor(el: HTMLElement, deps: CreativeMenuPanelDeps) {
    this.el = el;
    this.deps = deps;
    this.searchEl = this.requireElement<HTMLInputElement>('creative-search');
    this.listEl = this.requireElement('creative-list');
    this.statusEl = this.requireElement('creative-status');
    const closeButton = el.querySelector<HTMLButtonElement>('#creative-close');
    closeButton?.addEventListener('click', () => this.deps.onClose());

    this.searchEl.addEventListener('input', () => {
      this.deps.setQuery(this.searchEl.value);
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
    const entries = this.deps.listItems();
    const signature = `${query}|${entries.map((e) => e.id).join(',')}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.listEl.textContent = '';
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'creative-empty';
      empty.textContent = 'No placeable blocks match.';
      this.listEl.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'creative-row';
      button.setAttribute('data-creative-row', String(entry.id));
      const title = document.createElement('span');
      title.className = 'creative-row-title';
      title.textContent = entry.name;
      const sub = document.createElement('span');
      sub.className = 'creative-row-key';
      sub.textContent = entry.key;
      button.append(title, sub);
      button.addEventListener('click', () => {
        if (this.deps.grantItem(entry.id)) {
          this.setStatus(`Granted ${entry.name} ×${entry.stackSize}.`);
        } else {
          this.setStatus(`Could not grant ${entry.name} (unknown item or full inventory).`);
        }
        this.deps.onChanged();
        this.render();
      });
      this.listEl.appendChild(button);
    }
  }

  private requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = this.el.querySelector<T>(`#${id}`);
    if (!found) {
      throw new Error(`Creative menu element missing: #${id}`);
    }
    return found;
  }
}
