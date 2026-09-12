import type { StatisticRowView } from '../simulation/StatisticsView';

export interface StatisticsPanelDeps {
  listRows(): StatisticRowView[];
  onClose(): void;
}

/**
 * DOM controller for the statistics dialog (271): a pure view over the
 * Game-owned statistic store. The panel owns no statistics state — only the
 * status line is local. One row per known key (catalog order from the dep)
 * with label and formatted value; close delegates to `deps`. Re-renders are
 * signature-gated so an open panel can refresh every frame without DOM churn.
 */
export class StatisticsPanel {
  private readonly el: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly deps: StatisticsPanelDeps;
  private lastSignature: string | null = null;

  constructor(el: HTMLElement, deps: StatisticsPanelDeps) {
    this.el = el;
    this.deps = deps;
    this.listEl = this.requireElement('statistics-list');
    this.statusEl = this.requireElement('statistics-status');
    const closeButton = el.querySelector<HTMLButtonElement>('#statistics-close');
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
    const signature = rows.map((r) => `${r.key}|${r.value}`).join(';');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.listEl.textContent = '';
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'statistic-empty';
      empty.textContent = 'No statistics available.';
      this.listEl.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'statistic-row';
      rowEl.setAttribute('data-statistic-row', row.key);
      const label = document.createElement('span');
      label.className = 'statistic-label';
      label.textContent = row.label;
      const value = document.createElement('span');
      value.className = 'statistic-value';
      value.textContent = row.valueText;
      rowEl.append(label, value);
      this.listEl.appendChild(rowEl);
    }
  }

  private requireElement(id: string): HTMLElement {
    const found = this.el.querySelector<HTMLElement>(`#${id}`);
    if (!found) {
      throw new Error(`Statistics element missing: #${id}`);
    }
    return found;
  }
}
