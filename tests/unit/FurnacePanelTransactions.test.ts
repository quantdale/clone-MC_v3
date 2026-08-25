import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Production-wiring oracles for the live furnace screen (251): click routing,
 * cursor handling, quick-move losslessness, take-only output enforcement, and
 * render caching — exercised through the real DOM controller over the real 106
 * transaction core. The vitest environment is `node`, so this follows the
 * HotbarIconRefresh/DebugOverlay pattern of shimming just the touched DOM APIs.
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

const { FurnacePanel } = await import('../../src/ui/FurnacePanel');
const { Inventory } = await import('../../src/inventory/Inventory');
const { createDefaultItemRegistry, ItemId } = await import('../../src/inventory/ItemRegistry');
const {
  FURNACE_INPUT_SLOT,
  FURNACE_FUEL_SLOT,
  FURNACE_OUTPUT_SLOT,
  createFurnaceState,
} = await import('../../src/world/FurnaceBlockEntity');
import type { FurnaceState } from '../../src/world/FurnaceBlockEntity';
import type { FurnacePanel as FurnacePanelType } from '../../src/ui/FurnacePanel';
import type { Inventory as InventoryType } from '../../src/inventory/Inventory';
import type { ItemTypeRegistry } from '../../src/inventory/ItemRegistry';

const registry = createDefaultItemRegistry();
const atlas = { canvas: new FakeElement('canvas') } as never;

interface Rig {
  root: FakeElement;
  inventory: InventoryType;
  panel: FurnacePanelType;
  state: () => FurnaceState;
  closed: () => boolean;
  cellsByMenuIndex: () => Map<number, FakeElement>;
}

function makeRig(initial?: Partial<FurnaceState>): Rig {
  const root = new FakeElement('div', 'furnace');
  for (const id of [
    'furnace-input-slot',
    'furnace-fuel-slot',
    'furnace-output-slot',
    'furnace-player-grid',
    'furnace-status',
    'furnace-flame-bar',
    'furnace-arrow-bar',
    'furnace-cursor',
  ]) {
    root.appendChild(new FakeElement('div', id));
  }
  root.appendChild(new FakeElement('button', 'furnace-close'));

  const inventory = new Inventory(Array<number>(9).fill(0), Array<number>(9).fill(0), [], registry);
  let state: FurnaceState = { ...createFurnaceState(), ...initial };
  let closed = false;

  const panel = new FurnacePanel(root as unknown as HTMLElement, {
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
    map.set(FURNACE_INPUT_SLOT, root.querySelector('#furnace-input-slot')!);
    map.set(FURNACE_FUEL_SLOT, root.querySelector('#furnace-fuel-slot')!);
    map.set(FURNACE_OUTPUT_SLOT, root.querySelector('#furnace-output-slot')!);
    root.querySelector('#furnace-player-grid')!.children.forEach((cell, k) => map.set(3 + k, cell));
    return map;
  };

  return {
    root,
    inventory: inventory as InventoryType,
    panel: panel as FurnacePanelType,
    state: () => state,
    closed: () => closed,
    cellsByMenuIndex,
  };
}

function click(cell: FakeElement, button: 0 | 2, shiftKey = false): void {
  cell.dispatch('mousedown', { button, shiftKey, preventDefault: () => undefined });
}

describe('FurnacePanel wiring (251)', () => {
  it('builds 39 slot cells: 3 furnace + 36 player', () => {
    const rig = makeRig();
    expect(rig.cellsByMenuIndex().size).toBe(39);
  });

  it('renders slots, status text, and indicator bars from authoritative state', () => {
    const rig = makeRig({
      input: { item: 'minecraft:sand', count: 7, maxStack: 64 },
      fuel: { item: 'minecraft:coal', count: 2, maxStack: 64 },
      burnTime: 5,
      burnTimeTotal: 10,
      smeltTime: 50,
      smeltTimeTotal: 200,
    });
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();
    expect(cells.get(FURNACE_INPUT_SLOT)!.attributes.get('aria-label')).toContain('Sand, 7');
    expect(cells.get(FURNACE_FUEL_SLOT)!.attributes.get('aria-label')).toContain('Coal, 2');
    expect(cells.get(FURNACE_OUTPUT_SLOT)!.attributes.get('aria-label')).toContain('empty');

    expect(rig.root.querySelector('#furnace-status')!.textContent).toContain('Burning');
    expect(rig.root.querySelector('#furnace-flame-bar')!.style.width).toBe('50%');
    expect(rig.root.querySelector('#furnace-arrow-bar')!.style.width).toBe('25%');
  });

  it('left-click moves a stack from the player region into the input slot and back', () => {
    const rig = makeRig();
    rig.inventory.slots[0] = { id: ItemId.Sand, count: 12 };
    rig.panel.show();

    const cells = rig.cellsByMenuIndex();
    click(cells.get(3)!, 0); // pick up sand from hotbar slot 0
    click(cells.get(FURNACE_INPUT_SLOT)!, 0); // place into input
    expect(rig.state().input).toEqual({ item: 'minecraft:sand', count: 12, maxStack: 64 });
    expect(rig.inventory.slots[0]!.count).toBe(0);

    click(cells.get(FURNACE_INPUT_SLOT)!, 0); // pick it back up
    click(cells.get(3)!, 0); // place back into hotbar
    expect(rig.state().input.item).toBeNull();
    expect(rig.inventory.slots[0]!.count).toBe(12);
  });

  it('right-click splits half onto the cursor and places one into fuel', () => {
    const rig = makeRig();
    rig.inventory.slots[0] = { id: ItemId.Coal, count: 10 };
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();

    click(cells.get(3)!, 2); // split-half pickup → cursor coal x5
    expect(rig.inventory.slots[0]!.count).toBe(5);
    click(cells.get(FURNACE_FUEL_SLOT)!, 2); // place ONE from the cursor into fuel
    expect(rig.state().fuel).toEqual({ item: 'minecraft:coal', count: 1, maxStack: 64 });
    // The placed unit came off the cursor; the hotbar stack itself is untouched.
    expect(rig.inventory.slots[0]!.count).toBe(5);

    // Close hands the remaining cursor stack (5 − 1 placed) to the caller.
    expect(rig.panel.takeCursor()).toEqual({ item: 'minecraft:coal', count: 4 });
    expect(rig.panel.takeCursor()).toBeNull();
  });

  it('shift-click quick move round trip between regions is lossless', () => {
    const rig = makeRig();
    rig.inventory.slots[0] = { id: ItemId.Sand, count: 37 };
    rig.inventory.storage[0] = { id: ItemId.Sand, count: 27 };
    rig.panel.show();

    const cells = rig.cellsByMenuIndex();
    click(cells.get(3)!, 0, true); // quick-move hotbar stack → furnace input
    expect(rig.state().input.count).toBe(37);
    expect(rig.inventory.slots[0]!.count).toBe(0);
    expect(rig.inventory.storage[0]!.count).toBe(27); // untouched

    click(cells.get(FURNACE_INPUT_SLOT)!, 0, true); // quick-move back out
    // Merge-first: the whole returning stack fits the existing storage stack's room.
    expect(rig.inventory.slots[0]!.count).toBe(0);
    expect(rig.inventory.storage[0]!.count).toBe(64);
    expect(rig.state().input.item).toBeNull();

    // Combined multiset identical to the original (lossless round trip).
    const total = rig.inventory.slots[0]!.count + (rig.inventory.storage[0]?.count ?? 0);
    expect(total).toBe(64);
  });

  it('output slot is extraction-only: swap/place onto it is rejected, extraction works', () => {
    const rig = makeRig({ output: { item: 'minecraft:glass', count: 3, maxStack: 64 } });
    rig.inventory.slots[0] = { id: ItemId.Dirt, count: 5 };
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();

    click(cells.get(3)!, 0); // cursor dirt x5
    click(cells.get(FURNACE_OUTPUT_SLOT)!, 0); // attempted swap INTO output
    expect(rig.state().output).toEqual({ item: 'minecraft:glass', count: 3, maxStack: 64 });
    // The rejected transaction changed nothing: the dirt stays on the cursor,
    // and returning it to the hotbar proves no item was lost or duplicated.
    click(cells.get(3)!, 0);
    expect(rig.inventory.slots[0]!.count).toBe(5);

    click(cells.get(3)!, 0); // pick dirt up again (fresh cursor)
    rig.panel.takeCursor(); // clear the cursor via the close seam
    click(cells.get(FURNACE_OUTPUT_SLOT)!, 0); // plain extraction works
    expect(rig.panel.takeCursor()).toEqual({ item: 'minecraft:glass', count: 3 });
    expect(rig.state().output.item).toBeNull();
  });

  it('close button routes through onClose and unchanged renders keep DOM nodes stable', () => {
    const rig = makeRig();
    rig.panel.show();
    rig.root.querySelector('#furnace-close')!.dispatch('click');
    expect(rig.closed()).toBe(true);
    expect(rig.panel.isVisible()).toBe(true); // hiding is the session owner's job

    const inputBefore = rig.cellsByMenuIndex().get(FURNACE_INPUT_SLOT)!;
    rig.panel.render();
    expect(rig.cellsByMenuIndex().get(FURNACE_INPUT_SLOT)).toBe(inputBefore);
  });

  it('show/hide cycles reset the render cache so timer progress repaints', () => {
    const rig = makeRig({ smeltTime: 0, smeltTimeTotal: 200 });
    rig.panel.show();
    expect(rig.root.querySelector('#furnace-arrow-bar')!.style.width).toBe('0%');
    rig.panel.hide();
    rig.panel.show();
    expect(rig.root.querySelector('#furnace-arrow-bar')!.style.width).toBe('0%');
  });

  it('mousemove while carrying positions the floating cursor chip', () => {
    const rig = makeRig();
    rig.inventory.slots[0] = { id: ItemId.Sand, count: 4 };
    rig.panel.show();
    const cells = rig.cellsByMenuIndex();
    click(cells.get(3)!, 0); // carry sand
    rig.root.dispatch('mousemove', { clientX: 120, clientY: 60 });
    const chip = rig.root.querySelector('#furnace-cursor')!;
    expect(chip.style.left).toBe('128px');
    expect(chip.style.top).toBe('68px');
    expect(rig.panel.takeCursor()).toEqual({ item: 'minecraft:sand', count: 4 });
  });

  it('a transaction whose result cannot be represented is rejected atomically — no deletion, no stranding', () => {
    // Registry wrapper whose resource-id lookup fails for dirt only.
    const brokenRegistry = new Proxy(registry, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (prop === 'getByResourceId' && typeof value === 'function') {
          return (rid: { namespace: string; path: string }) => {
            if (rid.namespace === 'minecraft' && rid.path === 'dirt') {
              throw new Error('injected lookup failure');
            }
            return value.call(target, rid);
          };
        }
        return value;
      },
    });
    const root = new FakeElement('div', 'furnace-broken');
    for (const id of [
      'furnace-input-slot',
      'furnace-fuel-slot',
      'furnace-output-slot',
      'furnace-player-grid',
      'furnace-status',
      'furnace-flame-bar',
      'furnace-arrow-bar',
      'furnace-cursor',
    ]) {
      root.appendChild(new FakeElement('div', id));
    }
    root.appendChild(new FakeElement('button', 'furnace-close'));
    const inventory = new Inventory(Array<number>(9).fill(0), Array<number>(9).fill(0), [], registry);
    let state: FurnaceState = createFurnaceState();
    const panel = new FurnacePanel(root as unknown as HTMLElement, {
      inventory,
      registry: brokenRegistry as ItemTypeRegistry,
      atlas,
      getState: () => state,
      applySlots: (slots) => {
        state = { ...state, ...slots };
        return state;
      },
      onInventoryChanged: () => undefined,
      onClose: () => undefined,
    });

    inventory.slots[0] = { id: ItemId.Dirt, count: 5 };
    panel.show();
    const grid = root.querySelector('#furnace-player-grid')!;
    click(grid.children[0]!, 0); // attempted pickup of an unrepresentable stack
    // The whole transaction was rejected BEFORE any write-back: the stack stays
    // in its original hotbar slot (never deleted) and nothing is stranded on
    // the cursor where closeFurnace could only quarantine it.
    expect(inventory.slots[0]).toEqual({ id: ItemId.Dirt, count: 5 });
    expect(panel.takeCursor()).toBeNull();
  });

  it('construction fails loudly when a required element is missing', () => {
    const root = new FakeElement('div', 'furnace-partial');
    root.appendChild(new FakeElement('div', 'furnace-input-slot'));
    expect(
      () =>
        new FurnacePanel(root as unknown as HTMLElement, {
          inventory: new Inventory([], [], [], registry),
          registry: registry as ItemTypeRegistry,
          atlas,
          getState: () => null,
          applySlots: () => null,
          onInventoryChanged: () => undefined,
          onClose: () => undefined,
        }),
    ).toThrow(/Furnace element missing/);
  });
});
