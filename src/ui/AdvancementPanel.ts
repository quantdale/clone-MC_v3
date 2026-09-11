import type { AdvancementRowView } from '../simulation/AdvancementView';

export interface AdvancementPanelDeps {
  listRows(): AdvancementRowView[];
  onClose(): void;
}

/**
 * DOM controller for the advancements dialog (263): a pure view over the
 * Game-owned progress store. The panel owns no progress state — only the
 * status line is local. One row per catalog definition (chain order from the
 * dep) with title, description, progress text, and a Completed badge; close
 * delegates to `deps`.
 */
export class AdvancementPanel {
  private readonly el: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly deps: AdvancementPanelDeps;
  private lastSignature: string | null = null;

  constructor(el: HTMLElement, deps: AdvancementPanelDeps) {
    this.el = el;
    this.deps = deps;
    this.listEl = this.requireElement('advancement-list');
    this.statusEl = this.requireElement('advancement-status');
    const closeButton = el.querySelector<HTMLButtonElement>('#advancements-close');
    closeButton?.addEventListener('click', () => this.deps.onClose());
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
    const rows = this.deps.listRows();
    const signature = rows
      .map((r) => `${r.key}|${r.achieved ? 1 : 0}|${r.achievedCount}/${r.totalCount}`)
      .join(';');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.listEl.textContent = '';
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'advancement-empty';
      empty.textContent = 'No advancements available.';
      this.listEl.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'advancement-row';
      rowEl.setAttribute('data-advancement-row', row.key);
      if (row.achieved) rowEl.classList.add('completed');
      const title = document.createElement('span');
      title.className = 'advancement-title';
      title.textContent = row.title;
      const description = document.createElement('p');
      description.className = 'advancement-description';
      description.textContent = row.description;
      const progress = document.createElement('span');
      progress.className = 'advancement-progress';
      progress.textContent = row.achieved
        ? 'Completed'
        : `${row.achievedCount}/${row.totalCount}`;
      rowEl.append(title, description, progress);
      this.listEl.appendChild(rowEl);
    }
  }

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!found) {
      throw new Error(`Advancement element missing: #${id}`);
    }
    return found;
  }
}
