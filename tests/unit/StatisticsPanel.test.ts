import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StatisticsPanel, type StatisticsPanelDeps } from '../../src/ui/StatisticsPanel';
import {
  DEFAULT_STATISTIC_KEYS,
  createStatisticStore,
  incrementStatistic,
} from '../../src/simulation/StatisticsFramework';
import {
  describeStatistics,
  type StatisticRowView,
} from '../../src/simulation/StatisticsView';

/**
 * Production-wiring oracles for the statistics screen (271): skeleton,
 * catalog-order listing with label/value, render caching, and close
 * delegation — exercised through the real DOM controller over Game-shaped
 * deps backed by the real 187 store and view helpers. The vitest environment
 * is `node`, so this follows the 259–263 pattern of shimming just the
 * touched DOM APIs.
 */

class FakeElement {
  tagName: string;
  id = '';
  className = '';
  attributes = new Map<string, string>();
  classes = new Set<string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<(e: unknown) => void>>();
  private text = '';

  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
  }

  get textContent(): string {
    return this.text;
  }

  /** Mirrors real DOM semantics: assigning textContent clears children. */
  set textContent(value: string) {
    this.text = value ?? '';
    this.children = [];
  }

  get classList(): {
    toggle(name: string, force?: boolean): void;
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  } {
    const classes = this.classes;
    return {
      toggle(name: string, force?: boolean): void {
        const effective = force === undefined ? !classes.has(name) : force;
        if (effective) classes.add(name);
        else classes.delete(name);
      },
      add(name: string): void {
        classes.add(name);
      },
      remove(name: string): void {
        classes.delete(name);
      },
      contains(name: string): boolean {
        return classes.has(name);
      },
    };
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) this.children.push(child);
  }

  addEventListener(type: string, handler: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (selector.startsWith('#') && child.id === selector.slice(1)) return child;
      if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

function installDocumentShim(): void {
  (globalThis as unknown as { document?: unknown }).document = {
    createElement: (tag: string) => new FakeElement(tag),
  };
}

beforeEach(() => {
  installDocumentShim();
});

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

function makeShell(): FakeElement {
  const root = new FakeElement('div', 'statistics');
  root.classes.add('hidden');
  const list = new FakeElement('div', 'statistics-list');
  const status = new FakeElement('p', 'statistics-status');
  const close = new FakeElement('button', 'statistics-close');
  root.append(list, status, close);
  return root;
}

function makeDeps(rows: StatisticRowView[]): StatisticsPanelDeps & { closes: number } {
  const deps = {
    closes: 0,
    listRows: () => rows,
    onClose: () => {
      deps.closes++;
    },
  };
  return deps;
}

function defaultRows(): StatisticRowView[] {
  return describeStatistics(createStatisticStore());
}

describe('StatisticsPanel (271)', () => {
  it('throws fail-fast when a required element is missing', () => {
    const root = new FakeElement('div', 'statistics');
    expect(() => new StatisticsPanel(root as unknown as HTMLElement, makeDeps([]))).toThrow(
      /Statistics element missing: #statistics-list/,
    );
  });

  it('shows/hides through the hidden class', () => {
    const panel = new StatisticsPanel(
      makeShell() as unknown as HTMLElement,
      makeDeps(defaultRows()),
    );
    expect(panel.isVisible()).toBe(false);
    panel.show();
    expect(panel.isVisible()).toBe(true);
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });

  it('renders all 7 rows in catalog order with label and value', () => {
    const root = makeShell();
    new StatisticsPanel(root as unknown as HTMLElement, makeDeps(defaultRows()));
    const list = root.querySelector('#statistics-list')!;
    expect(list.children).toHaveLength(7);
    expect(list.children.map((c) => c.getAttribute('data-statistic-row'))).toEqual([
      ...DEFAULT_STATISTIC_KEYS,
    ]);
    const first = list.children[0]!;
    expect(first.children[0]!.textContent).toBe('Distance Walked');
    expect(first.children[1]!.textContent).toBe('0 m');
    const timeRow = list.children[4]!;
    expect(timeRow.children[0]!.textContent).toBe('Time Played');
    expect(timeRow.children[1]!.textContent).toBe('0s');
  });

  it('reflects live values after an increment and re-render', () => {
    let store = createStatisticStore();
    store = incrementStatistic(store, 'blocks_broken', 5);
    const root = makeShell();
    const deps = makeDeps(describeStatistics(store));
    const panel = new StatisticsPanel(root as unknown as HTMLElement, deps);
    const list = root.querySelector('#statistics-list')!;
    expect(list.children[2]!.children[1]!.textContent).toBe('5');
    store = incrementStatistic(store, 'blocks_broken', 2);
    deps.listRows = () => describeStatistics(store);
    panel.render();
    expect(list.children[2]!.children[1]!.textContent).toBe('7');
  });

  it('skips DOM churn when values are unchanged', () => {
    const root = makeShell();
    const panel = new StatisticsPanel(
      root as unknown as HTMLElement,
      makeDeps(defaultRows()),
    );
    const list = root.querySelector('#statistics-list')!;
    const before = [...list.children];
    panel.render();
    expect([...list.children]).toEqual(before);
  });

  it('delegates close clicks and narrates status', () => {
    const root = makeShell();
    const deps = makeDeps(defaultRows());
    const panel = new StatisticsPanel(root as unknown as HTMLElement, deps);
    const close = root.querySelector('#statistics-close')!;
    for (const handler of close.listeners.get('click') ?? []) handler({});
    expect(deps.closes).toBe(1);
    panel.setStatus('7 statistics, 2 non-zero.');
    expect(root.querySelector('#statistics-status')!.textContent).toBe(
      '7 statistics, 2 non-zero.',
    );
  });
});
