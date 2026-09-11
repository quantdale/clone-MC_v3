import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Production-wiring oracles for the live brewing screen (260): skeleton,
 * render (progress + status), click routing, component-preserving cursor,
 * quick-move insert, atomicity, and render caching — exercised through the
 * real DOM controller over the real 106 transaction core. The vitest
 * environment is `node`, so this follows the FurnacePanelTransactions pattern
 * of shimming just the touched DOM APIs.
 */

class FakeCtx {
  drawCalls = 0;
  drawImage(): void {
    this.drawCalls++;
  }
}

class FakeElement {
  tagName: string;
  id = '';
  className = '';
  title = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  classes = new Set<string>();
  children: FakeElement[] = [];
  listeners = new Map<string, Array<(e: unknown) => void>>();
  ctx = new FakeCtx();
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
    this.text = value;
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

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
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

  getContext(): FakeCtx {
    return this.ctx;
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

const { BrewingPanel } = await import('../../src/ui/BrewingPanel');
const { Inventory } = await import('../../src/inventory/Inventory');
const { createDefaultItemRegistry, ItemId } = await import('../../src/inventory/ItemRegistry');
const {
  StackComponentMap,
  createDefaultStackComponentRegistry,
} = await import('../../src/inventory/StackDataComponents');
const {
  BREWING_BOTTLE_SLOT,
  BREWING_FUEL_SLOT,
  BREWING_INGREDIENT_SLOT,
  POTION_CONTENTS_KEY,
  createBrewingState,
} = await import('../../src/world/BrewingStandBlockEntity');
const { createPotionContents, POTION_CONTENTS_COMPONENT } = await import('../../src/data/PotionItemData');
const { AWKWARD_BASE, BLAZE_POWDER_ITEM } = await import('../../src/inventory/BrewingRecipes');
import type { BrewingState } from '../../src/world/BrewingStandBlockEntity';
import type { BrewingPanel as BrewingPanelType } from '../../src/ui/BrewingPanel';
import type { Inventory as InventoryType } from '../../src/inventory/Inventory';
import type { ItemTypeRegistry } from '../../src/inventory/ItemRegistry';

const registry = createDefaultItemRegistry();
const atlas = { canvas: new FakeElement('canvas') } as never;
const componentRegistry = createDefaultStackComponentRegistry();

function awkwardContents(): Record<string, unknown> {
  return {
    [POTION_CONTENTS_KEY]: createPotionContents({
      base: AWKWARD_BASE,
      customEffects: [{ typeId: 'minecraft:effect/speed', duration: 0, amplifier: 0 }],
    }),
  };
}

function awkwardStackInInventory() {
  return {
    id: ItemId.Potion,
    count: 1,
    components: new StackComponentMap(componentRegistry).with(
      POTION_CONTENTS_COMPONENT,
      createPotionContents({
        base: AWKWARD_BASE,
        customEffects: [{ typeId: 'minecraft:effect/speed', duration: 0, amplifier: 0 }],
      }) as never,
    ),
  };
}

interface Rig {
  root: FakeElement;
  inventory: InventoryType;
  panel: BrewingPanelType;
  state: () => BrewingState;
  closed: () => boolean;
  cellsByMenuIndex: () => Map<number, FakeElement>;
}

function makeRig(initial?: Partial<BrewingState>): Rig {
  const root = new FakeElement('div', 'brewing');
  for (const id of [
    'brewing-bottle-slot',
    'brewing-fuel-slot',
    'brewing-ingredient-slot',
    'brewing-player-grid',
    'brewing-status',
    'brewing-flame-bar',
    'brewing-arrow-bar',
    'brewing-cursor',
  ]) {
    root.appendChild(new FakeElement('div', id));
  }
  root.appendChild(new FakeElement('button', 'brewing-close'));

  const inventory = new Inventory(Array<number>(9).fill(0), Array<number>(9).fill(0), [], registry);
  let state: BrewingState = { ...createBrewingState(), ...initial };
  let closed = false;

  const panel = new BrewingPanel(root as unknown as HTMLElement, {
    inventory,
    registry: registry as ItemTypeRegistry,
    atlas,
    getState: () => state,
    applySlots: (slots) => {
      // Mirror the host's atomic validate-then-swap contract.
      state = { ...state, ...slots };
      return state;
    },
    onInventoryChanged: () => undefined,
    onClose: () => {
      closed = true;
    },
  });

  const cellsByMenuIndex = (): Map<number, FakeElement> => {
    const map = new Map<number, FakeElement>();
    map.set(BREWING_BOTTLE_SLOT, root.querySelector('#brewing-bottle-slot')!);
    map.set(BREWING_FUEL_SLOT, root.querySelector('#brewing-fuel-slot')!);
    map.set(BREWING_INGREDIENT_SLOT, root.querySelector('#brewing-ingredient-slot')!);
    root.querySelector('#brewing-player-grid')!.children.forEach((cell, k) => map.set(3 + k, cell));
    return map;
  };

  return {
    root,
    inventory: inventory as InventoryType,
    panel: panel as BrewingPanelType,
    state: () => state,
    closed: () => closed,
    cellsByMenuIndex,
  };
}

function click(cell: FakeElement, button: 0 | 2, shiftKey = false): void {
  cell.dispatch('mousedown', { button, shiftKey, preventDefault: () => undefined });
}

describe('BrewingPanel skeleton (260)', () => {
  it('throws fail-fast when a required element is missing', () => {
    const root = new FakeElement('div', 'brewing');
    expect(
      () =>
        new BrewingPanel(root as unknown as HTMLElement, {
          inventory: new Inventory(Array<number>(9).fill(0), Array<number>(9).fill(0), [], registry),
          registry: registry as ItemTypeRegistry,
          atlas,
          getState: () => null,
          applySlots: () => null,
          onInventoryChanged: () => undefined,
          onClose: () => undefined,
        }),
    ).toThrow(/Brewing element missing: #brewing-bottle-slot/);
  });

  it('shows/hides through the hidden class', () => {
    const rig = makeRig();
    expect(rig.panel.isVisible()).toBe(true); // FakeElement starts classless
    rig.panel.hide();
    expect(rig.panel.isVisible()).toBe(false);
    rig.panel.show();
    expect(rig.panel.isVisible()).toBe(true);
  });

  it('builds 39 slot cells: 3 stand + 36 player', () => {
    const rig = makeRig();
    expect(rig.cellsByMenuIndex().size).toBe(39);
  });
});

describe('BrewingPanel render (260)', () => {
  it('renders slots, status text, and progress bars from authoritative state', () => {
    const rig = makeRig({
      bottle: { item: 'minecraft:potion', count: 1, maxStack: 64, components: awkwardContents() },
      fuel: { item: BLAZE_POWDER_ITEM, count: 2, maxStack: 64 },
      ingredient: { item: 'minecraft:redstone', count: 3, maxStack: 64 },
      brewTime: 100,
      brewTimeTotal: 400,
      fuelBurnTime: 600,
      fuelBurnTimeTotal: 1200,
    });
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();
    expect(cells.get(BREWING_BOTTLE_SLOT)!.attributes.get('aria-label')).toContain('Potion, 1');
    expect(cells.get(BREWING_FUEL_SLOT)!.attributes.get('aria-label')).toContain('Blaze Powder, 2');
    expect(cells.get(BREWING_INGREDIENT_SLOT)!.attributes.get('aria-label')).toContain('Redstone Dust, 3');

    expect(rig.root.querySelector('#brewing-status')!.textContent).toContain('Brewing');
    expect(rig.root.querySelector('#brewing-flame-bar')!.style.width).toBe('50%');
    expect(rig.root.querySelector('#brewing-arrow-bar')!.style.width).toBe('25%');
  });

  it('names the idle states distinctly', () => {
    const rig = makeRig({
      bottle: { item: 'minecraft:potion', count: 1, maxStack: 64, components: awkwardContents() },
      fuel: { item: BLAZE_POWDER_ITEM, count: 1, maxStack: 64 },
    });
    rig.panel.show();
    // Bottle + fuel but no matching ingredient: not lit, fuel present.
    expect(rig.root.querySelector('#brewing-status')!.textContent).toContain('Out of fire');
  });

  it('performs zero writes on a signature-identical second render', () => {
    const rig = makeRig({
      bottle: { item: 'minecraft:potion', count: 1, maxStack: 64, components: awkwardContents() },
    });
    rig.panel.show();
    const status = rig.root.querySelector('#brewing-status')!;
    const before = status.textContent;
    // Count textContent setter invocations: a signature-identical re-render
    // must early-return with zero writes (259 signature-gate parity).
    let writes = 0;
    let backing = before;
    Object.defineProperty(status, 'textContent', {
      configurable: true,
      get: () => backing,
      set: (v: string) => {
        writes++;
        backing = v;
      },
    });
    rig.panel.render();
    expect(writes).toBe(0);
    expect(status.textContent).toBe(before);
  });

  it('renders nothing new when the stand vanished (null state)', () => {
    const rig = makeRig();
    rig.panel.show();
    expect(() => rig.panel.render()).not.toThrow();
  });
});

describe('BrewingPanel transactions (260)', () => {
  it('quick-move inserts the bottle WITH its contents (T7b carry proof)', () => {
    const rig = makeRig();
    rig.inventory.slots[0] = awkwardStackInInventory();
    rig.panel.show();

    const cells = rig.cellsByMenuIndex();
    click(cells.get(3)!, 0, true); // shift-click the awkward bottle into the stand
    const bottle = rig.state().bottle;
    expect(bottle.item).toBe('minecraft:potion');
    expect(bottle.components?.[POTION_CONTENTS_KEY]).toBeDefined();
    expect(rig.inventory.slots[0]!.count).toBe(0);
  });

  it('left-click picks the bottle back up onto a contents-preserving cursor', () => {
    const rig = makeRig({
      bottle: { item: 'minecraft:potion', count: 1, maxStack: 1, components: awkwardContents() },
    });
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();
    click(cells.get(BREWING_BOTTLE_SLOT)!, 0); // pick up
    expect(rig.state().bottle.item).toBeNull();
    const taken = rig.panel.takeCursor();
    expect(taken?.item).toBe('minecraft:potion');
    expect(taken?.components?.[POTION_CONTENTS_KEY]).toBeDefined();
  });

  it('quick-move loads bottle, fuel, and ingredient in first-fit order', () => {
    // First-fit routing (furnace parity, no slot filters in the 123 menu):
    // insert in bottle → fuel → ingredient order so each lands in its role.
    const rig = makeRig();
    rig.inventory.slots[0] = awkwardStackInInventory();
    rig.inventory.slots[1] = { id: ItemId.BlazePowder, count: 4 };
    rig.inventory.slots[2] = { id: ItemId.Redstone, count: 5 };
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();
    click(cells.get(3)!, 0, true); // bottle -> bottle slot
    click(cells.get(4)!, 0, true); // powder -> fuel slot
    click(cells.get(5)!, 0, true); // redstone -> ingredient slot
    expect(rig.state().bottle.item).toBe('minecraft:potion');
    expect(rig.state().bottle.components?.[POTION_CONTENTS_KEY]).toBeDefined();
    expect(rig.state().fuel).toEqual({ item: BLAZE_POWDER_ITEM, count: 4, maxStack: 64 });
    expect(rig.state().ingredient).toEqual({ item: 'minecraft:redstone', count: 5, maxStack: 64 });
  });

  it('aborts the whole transaction when a result cannot convert back', () => {
    const rig = makeRig();
    rig.inventory.slots[0] = { id: 999999, count: 1 }; // unknown legacy id
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();
    const before = JSON.stringify(rig.state());
    click(cells.get(3)!, 0); // pick up the unknown stack
    click(cells.get(BREWING_FUEL_SLOT)!, 0); // try to place into fuel
    // Either the pickup or the place aborts: authoritative state untouched.
    expect(JSON.stringify(rig.state())).toBe(before);
  });

  it('ignores transactions when the stand vanished mid-session', () => {
    let live: BrewingState | null = { ...createBrewingState() };
    const root = new FakeElement('div', 'brewing');
    for (const id of [
      'brewing-bottle-slot',
      'brewing-fuel-slot',
      'brewing-ingredient-slot',
      'brewing-player-grid',
      'brewing-status',
      'brewing-flame-bar',
      'brewing-arrow-bar',
      'brewing-cursor',
    ]) {
      root.appendChild(new FakeElement('div', id));
    }
    const inventory = new Inventory(Array<number>(9).fill(0), Array<number>(9).fill(0), [], registry);
    inventory.slots[0] = { id: ItemId.Redstone, count: 2 };
    const panel = new BrewingPanel(root as unknown as HTMLElement, {
      inventory,
      registry: registry as ItemTypeRegistry,
      atlas,
      getState: () => live,
      applySlots: () => null, // vanished: host rejects the write
      onInventoryChanged: () => undefined,
      onClose: () => undefined,
    });
    panel.show();
    live = null; // stand destroyed while open
    const grid = root.querySelector('#brewing-player-grid')!;
    grid.children[0]!.dispatch('mousedown', { button: 0, shiftKey: true, preventDefault: () => undefined });
    expect(inventory.slots[0]).toEqual({ id: ItemId.Redstone, count: 2 });
  });

  it('takeCursor empties and reports null when nothing is carried', () => {
    const rig = makeRig();
    rig.panel.show();
    expect(rig.panel.takeCursor()).toBeNull();
    expect(rig.panel.takeCursor()).toBeNull();
  });
});
