import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AdvancementPanel, type AdvancementPanelDeps } from '../../src/ui/AdvancementPanel';
import { coreProgressionAdvancements } from '../../src/simulation/CoreProgressionAdvancements';
import {
  applyTriggerToProgresses,
  createDefaultAdvancementProgresses,
} from '../../src/simulation/AdvancementSave';
import {
  describeAdvancements,
  type AdvancementRowView,
} from '../../src/simulation/AdvancementView';

/**
 * Production-wiring oracles for the advancements screen (263): skeleton,
 * chain-order listing with title/description/progress, completion badge, and
 * render caching — exercised through the real DOM controller over Game-shaped
 * deps backed by the real 186 catalog and the real view helpers. The vitest
 * environment is `node`, so this follows the 259–262 pattern of shimming just
 * the touched DOM APIs.
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

let createdElements = 0;

function installDocumentShim(): void {
  createdElements = 0;
  (globalThis as unknown as { document?: unknown }).document = {
    createElement: (tag: string) => {
      createdElements++;
      return new FakeElement(tag);
    },
  };
}

beforeEach(() => {
  installDocumentShim();
});

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
});

const CATALOG = coreProgressionAdvancements();

function makeShell(): FakeElement {
  const root = new FakeElement('div', 'advancements');
  root.classes.add('hidden');
  const list = new FakeElement('div', 'advancement-list');
  const status = new FakeElement('p', 'advancement-status');
  const close = new FakeElement('button', 'advancements-close');
  root.append(list, status, close);
  return root;
}

function makeDeps(rows: AdvancementRowView[]): AdvancementPanelDeps & { closes: number } {
  const deps = {
    closes: 0,
    listRows: () => rows,
    onClose: () => {
      deps.closes++;
    },
  };
  return deps;
}

function defaultRows(): AdvancementRowView[] {
  return describeAdvancements(CATALOG, createDefaultAdvancementProgresses(CATALOG));
}

describe('AdvancementPanel (263)', () => {
  it('throws fail-fast when a required element is missing', () => {
    const root = new FakeElement('div', 'advancements');
    expect(() => new AdvancementPanel(root as unknown as HTMLElement, makeDeps([]))).toThrow(
      /Advancement element missing: #advancement-list/,
    );
  });

  it('shows/hides through the hidden class', () => {
    const panel = new AdvancementPanel(
      makeShell() as unknown as HTMLElement,
      makeDeps(defaultRows()),
    );
    expect(panel.isVisible()).toBe(false);
    panel.show();
    expect(panel.isVisible()).toBe(true);
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });

  it('renders all 7 rows in chain order with title, description, and 0/1 progress', () => {
    const root = makeShell();
    const panel = new AdvancementPanel(
      root as unknown as HTMLElement,
      makeDeps(defaultRows()),
    );
    expect(panel.isVisible()).toBe(false);
    const list = root.querySelector('#advancement-list')!;
    expect(list.children).toHaveLength(7);
    expect(
      list.children.map((c) => c.getAttribute('data-advancement-row')),
    ).toEqual(CATALOG.map((d) => d.key));
    const first = list.children[0]!;
    expect(first.children[0]!.textContent).toBe('Stone Age');
    expect(first.children[1]!.textContent).toBe('Obtain Wooden Pickaxe');
    expect(first.children[2]!.textContent).toBe('0/1');
    expect(first.classList.contains('completed')).toBe(false);
  });

  it('marks completed rows with the badge and Completed text', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const { progresses } = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'obtain_item', itemKey: 'wooden_pickaxe' },
      42,
    );
    const root = makeShell();
    new AdvancementPanel(
      root as unknown as HTMLElement,
      makeDeps(describeAdvancements(CATALOG, progresses)),
    );
    const list = root.querySelector('#advancement-list')!;
    const first = list.children[0]!;
    expect(first.classList.contains('completed')).toBe(true);
    expect(first.children[2]!.textContent).toBe('Completed');
    expect(list.children[1]!.classList.contains('completed')).toBe(false);
  });

  it('renders the status line and the empty notice', () => {
    const root = makeShell();
    const panel = new AdvancementPanel(
      root as unknown as HTMLElement,
      makeDeps(defaultRows()),
    );
    panel.setStatus('7 advancements, 1 complete.');
    expect(root.querySelector('#advancement-status')!.textContent).toBe(
      '7 advancements, 1 complete.',
    );
    const emptyRoot = makeShell();
    new AdvancementPanel(emptyRoot as unknown as HTMLElement, makeDeps([]));
    expect(emptyRoot.querySelector('#advancement-list')!.children).toHaveLength(1);
    expect(emptyRoot.querySelector('#advancement-list')!.children[0]!.textContent).toBe(
      'No advancements available.',
    );
  });

  it('skips DOM rebuilds when the rows signature is unchanged', () => {
    const root = makeShell();
    const rows = defaultRows();
    const panel = new AdvancementPanel(
      root as unknown as HTMLElement,
      makeDeps(rows),
    );
    const writes = createdElements;
    panel.render();
    expect(createdElements).toBe(writes);
  });
});
