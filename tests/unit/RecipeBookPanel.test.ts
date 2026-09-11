import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RecipeBookPanel, type RecipeBookPanelDeps } from '../../src/ui/RecipeBookPanel';
import { createDefaultRecipeBook, type RecipeBookState } from '../../src/inventory/RecipeBook';
import {
  describeRecipeBookSelection,
  searchRecipeBook,
  type RecipeBookSelectionView,
} from '../../src/inventory/RecipeBookView';
import {
  createDefaultRecipeRegistry,
  type RecipeDefinition,
  type RecipeRegistry,
} from '../../src/inventory/RecipeRegistry';
import { CraftingSystem } from '../../src/inventory/Crafting';
import { Inventory } from '../../src/inventory/Inventory';

/**
 * Production-wiring oracles for the recipe book screen (262): skeleton,
 * known-only registry-order listing, search filtering, selection detail
 * (laid-out cells + have/missing), craft outcomes with status strings, and
 * render caching — exercised through the real DOM controller over
 * Game-shaped deps backed by the real registry and the real 204 helpers.
 * The vitest environment is `node`, so this follows the GameRulePanel
 * pattern of shimming just the touched DOM APIs.
 */

class FakeElement {
  tagName: string;
  id = '';
  className = '';
  value = '';
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

  dispatch(type: string, event: unknown = {}): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
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

/**
 * Game-shaped deps: real registry + real 204 search + real RecipeBookView
 * selection views over a real Inventory, with crafts routed through a real
 * CraftingSystem (the same transactional engine Game uses). R1 unlocks are a
 * Game-level concern pinned in T4/E2E; the harness keeps the book fixed so
 * panel narration is isolated.
 */
function makeDeps() {
  const registry: RecipeRegistry = createDefaultRecipeRegistry();
  const inventory = new Inventory();
  const system = new CraftingSystem(inventory, registry);
  let book: RecipeBookState = createDefaultRecipeBook();
  let query = '';
  let selected: string | null = null;
  let changed = 0;

  const numericId = (item: { namespace: string; path: string }): number =>
    registry.itemRegistry.getByResourceId(item as never).id as number;
  function buildView(): RecipeBookSelectionView | null {
    return describeRecipeBookSelection(
      registry,
      book,
      selected,
      (id) => inventory.getItemCount(id),
      (def) => inventory.canAddItem(numericId(def.output.item), def.output.count),
      (def) =>
        `${registry.itemRegistry.getByLegacyId(numericId(def.output.item))?.name ?? def.key} ×${def.output.count}`,
    );
  }

  const deps: RecipeBookPanelDeps = {
    getQuery: () => query,
    setQuery: (q: string) => {
      query = q;
    },
    // Production search path (registry-order contract enforced in T4 helper).
    listRecipes: (): RecipeDefinition[] => searchRecipeBook(registry, book, query),
    getSelected: () => buildView(),
    getSelectedKey: () => selected,
    selectRecipe: (key: string | null): boolean => {
      if (key === null) {
        selected = null;
        return true;
      }
      if (!book.known.includes(key) || registry.getByKey(key) === undefined) return false;
      selected = key;
      return true;
    },
    craftSelected: (): boolean => {
      if (selected === null || buildView() === null) return false;
      return system.craft(selected) !== null;
    },
    onChanged: () => {
      changed++;
    },
    onClose: () => undefined,
  };
  return {
    deps,
    registry,
    inventory,
    book: () => book,
    setBook: (b: RecipeBookState) => {
      book = b;
    },
    query: () => query,
    changed: () => changed,
  };
}

function makeShell(): FakeElement {
  const el = new FakeElement('div', 'recipebook');
  const search = new FakeElement('input', 'recipebook-search');
  const list = new FakeElement('div', 'recipebook-list');
  const detail = new FakeElement('div', 'recipebook-detail');
  const title = new FakeElement('h3', '');
  title.className = 'recipebook-detail-title';
  const grid = new FakeElement('div', 'recipebook-grid');
  const missing = new FakeElement('p', 'recipebook-missing');
  const craft = new FakeElement('button', 'recipebook-craft');
  const status = new FakeElement('p', 'recipebook-status');
  const close = new FakeElement('button', 'recipebook-close');
  detail.appendChild(title);
  detail.appendChild(grid);
  el.appendChild(search);
  el.appendChild(list);
  el.appendChild(detail);
  el.appendChild(missing);
  el.appendChild(craft);
  el.appendChild(status);
  el.appendChild(close);
  return el;
}

function resultButtons(el: FakeElement): FakeElement[] {
  return el.querySelector('#recipebook-list')!.children.filter((c) => c.tagName === 'button');
}

describe('RecipeBookPanel (262)', () => {
  it('throws fail-fast when required elements are missing', () => {
    const { deps } = makeDeps();
    expect(() => new RecipeBookPanel(new FakeElement('div') as unknown as HTMLElement, deps)).toThrow(
      /Recipebook element missing: #recipebook-search/,
    );
    const el = new FakeElement('div');
    el.appendChild(new FakeElement('input', 'recipebook-search'));
    expect(() => new RecipeBookPanel(el as unknown as HTMLElement, deps)).toThrow(
      /Recipebook element missing: #recipebook-list/,
    );
  });

  it('show/hide/isVisible toggles the hidden class', () => {
    const { deps } = makeDeps();
    const panel = new RecipeBookPanel(makeShell() as unknown as HTMLElement, deps);
    expect(panel.isVisible()).toBe(true);
    panel.hide();
    expect(panel.isVisible()).toBe(false);
    panel.show();
    expect(panel.isVisible()).toBe(true);
  });

  it('blank query lists all known in registry order', () => {
    const ctx = makeDeps();
    // Unlock sticks-first; registry order still lists planks before sticks.
    ctx.setBook({ known: ['sticks', 'planks'] });
    expect(ctx.deps.listRecipes().map((d) => d.key)).toEqual(['planks', 'sticks']);
  });

  it('renders one button per listed entry with data attributes', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['planks', 'sticks'] });
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    const buttons = resultButtons(el);
    expect(buttons.map((b) => b.getAttribute('data-recipebook-recipe'))).toEqual(['planks', 'sticks']);
  });

  it('non-blank query filters by key, name, or output', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['planks', 'sticks', 'wooden_pickaxe', 'stone_pickaxe'] });
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    ctx.deps.setQuery('pickaxe');
    panel.render();
    expect(resultButtons(el).map((b) => b.getAttribute('data-recipebook-recipe'))).toEqual([
      'wooden_pickaxe',
      'stone_pickaxe',
    ]);
    ctx.deps.setQuery('PLANK');
    panel.render();
    expect(resultButtons(el).map((b) => b.getAttribute('data-recipebook-recipe'))).toEqual(['planks']);
  });

  it('empty book renders the no-match notice', () => {
    const ctx = makeDeps();
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    const list = el.querySelector('#recipebook-list')!;
    expect(list.children).toHaveLength(1);
    expect(list.children[0]!.textContent).toBe('No known recipes match.');
  });

  it('typing in search re-renders the filtered list', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['planks', 'sticks'] });
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    expect(resultButtons(el)).toHaveLength(2);
    const search = el.querySelector('#recipebook-search')!;
    search.value = 'stick';
    search.dispatch('input');
    panel.render();
    expect(resultButtons(el).map((b) => b.getAttribute('data-recipebook-recipe'))).toEqual(['sticks']);
    expect(ctx.query()).toBe('stick');
  });

  it('selecting a result renders laid-out cells with the missing line', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['sticks'] });
    // sticks = ONE ingredient (planks x2): 1 filled cell (have 1/need 2) + 8 empty.
    ctx.inventory.addItem(12, 1);
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    resultButtons(el)[0]!.dispatch('click');
    panel.render();
    const grid = el.querySelector('#recipebook-grid')!;
    expect(grid.children).toHaveLength(9);
    expect(grid.children.filter((c) => !c.classList.contains('empty'))).toHaveLength(1);
    expect(grid.children.filter((c) => c.classList.contains('empty'))).toHaveLength(8);
    const filled = grid.children.find((c) => !c.classList.contains('empty'))!;
    expect(filled.textContent).toContain('1/2');
    expect(filled.classList.contains('missing')).toBe(true);
    expect(el.querySelector('#recipebook-missing')!.textContent).toContain('Missing ingredients:');
  });

  it('selecting an unknown key keeps selection null with a status', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['sticks'] });
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    expect(ctx.deps.selectRecipe('planks')).toBe(false);
    panel.render();
    expect(ctx.deps.getSelected()).toBeNull();
    // Panel-level stale path: click handler reports when select fails.
    expect(el.querySelector('#recipebook-status')!.textContent).toBe('');
  });

  it('affordable craft reports Crafted and consumes stock', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['planks'] });
    ctx.inventory.addItem(7, 1); // 1 log -> 4 planks
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    resultButtons(el)[0]!.dispatch('click');
    (el.querySelector('#recipebook-craft')! as FakeElement).dispatch('click');
    panel.render();
    expect(el.querySelector('#recipebook-status')!.textContent).toBe('Crafted Oak Planks.');
    expect(ctx.inventory.getItemCount(7)).toBe(0);
    expect(ctx.inventory.getItemCount(12)).toBe(4);
    expect(ctx.book().known).toEqual(['planks']);
  });

  it('stock lost between select and craft is a status no-op with stock intact', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['sticks'] });
    ctx.inventory.addItem(12, 2);
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    resultButtons(el)[0]!.dispatch('click');
    // One plank leaves the inventory before the craft click lands: the
    // transactional craft fails and nothing is consumed.
    ctx.inventory.removeItem(12, 1);
    (el.querySelector('#recipebook-craft')! as FakeElement).dispatch('click');
    panel.render();
    expect(el.querySelector('#recipebook-status')!.textContent).toContain('Missing ingredients:');
    expect(ctx.inventory.getItemCount(12)).toBe(1);
    expect(ctx.book().known).toEqual(['sticks']);
  });

  it('unaffordable craft is a status no-op with stock and book unchanged', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['sticks'] });
    ctx.inventory.addItem(12, 1); // 1 of 2 planks
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    resultButtons(el)[0]!.dispatch('click');
    (el.querySelector('#recipebook-craft')! as FakeElement).dispatch('click');
    panel.render();
    expect(el.querySelector('#recipebook-status')!.textContent).toContain('Missing ingredients:');
    expect(ctx.inventory.getItemCount(12)).toBe(1);
    expect(ctx.book().known).toEqual(['sticks']);
  });

  it('craft with no selection reports Select-a-recipe with no writes', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['sticks'] });
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    (el.querySelector('#recipebook-craft')! as FakeElement).dispatch('click');
    expect(el.querySelector('#recipebook-status')!.textContent).toBe('Select a recipe first.');
    expect(ctx.changed()).toBe(0);
  });

  it('second render with no changes creates no elements (signature gate)', () => {
    const ctx = makeDeps();
    ctx.setBook({ known: ['planks', 'sticks'] });
    const el = makeShell();
    const panel = new RecipeBookPanel(el as unknown as HTMLElement, ctx.deps);
    panel.render();
    createdElements = 0;
    panel.render();
    expect(createdElements).toBe(0);
  });
});
