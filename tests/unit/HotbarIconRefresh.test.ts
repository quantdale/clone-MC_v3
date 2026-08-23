import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type * as InventoryModule from '../../src/inventory/Inventory';

/**
 * Regression oracle (hardening 2026-08-23, F-INV-7): hotbar slot icons and
 * titles were painted once at construction; render() never refreshed them, so
 * restored saves and pickups into empty slots kept stale visuals all session.
 * The vitest environment is `node`, so this follows the DebugOverlay.test.ts
 * pattern of shimming just the DOM APIs Hotbar touches.
 */

class FakeCtx {
  drawCalls = 0;
  drawImage(): void {
    this.drawCalls++;
  }
}

class FakeElement {
  tagName: string;
  className = '';
  title = '';
  type = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  classes = new Set<string>();
  children: FakeElement[] = [];
  ctx = new FakeCtx();

  constructor(tagName = 'div') {
    this.tagName = tagName;
  }

  /** Mirrors real DOM semantics: assigning textContent clears children. */
  get textContent(): string {
    return '';
  }

  set textContent(_: string) {
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

  addEventListener(): void {
    // listeners not exercised here
  }

  querySelector(selector: string): FakeElement | null {
    return (
      this.children.find(
        (child) => `.${child.className}` === selector || child.tagName === selector,
      ) ?? null
    );
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

const { Hotbar } = await import('../../src/inventory/Hotbar');
const { Inventory } = await import('../../src/inventory/Inventory');
const { createDefaultItemRegistry, ItemId } = await import('../../src/inventory/ItemRegistry');

const atlas = { canvas: new FakeElement('canvas') } as never;
const realRegistry = createDefaultItemRegistry();

function makeInventory(): InventoryModule.Inventory {
  // Nine explicitly-empty slots; adds land at deterministic indices.
  return new Inventory(
    Array<number>(9).fill(0),
    Array<number>(9).fill(0),
    [],
    realRegistry,
  );
}

function makeHotbar(inventory: InventoryModule.Inventory) {
  const container = new FakeElement('div');
  const hotbar = new Hotbar(
    container as unknown as HTMLElement,
    inventory,
    atlas,
    realRegistry,
  );
  return { container, hotbar };
}

describe('Hotbar icon refresh', () => {
  function slotChildren(container: FakeElement): Array<{
    slot: FakeElement;
    countLabel: FakeElement;
    durabilityBar: FakeElement;
    canvas: FakeElement;
  }> {
    return container.children.map((slot) => ({
      slot,
      countLabel: slot.querySelector('.slot-count')!,
      durabilityBar: slot.querySelector('.slot-durability')!,
      canvas: slot.querySelector('canvas') as unknown as FakeElement,
    }));
  }

  it('paints each slot once when nothing changed', () => {
    const inv = makeInventory();
    inv.addItem(ItemId.Grass, 2); // slot 0
    const { container, hotbar } = makeHotbar(inv);
    hotbar.render();
    const drawsAfterBuild = slotChildren(container).map((c) => c.canvas.ctx.drawCalls);
    expect(drawsAfterBuild[0]).toBe(1);
    expect(drawsAfterBuild[4]).toBe(1); // an empty (Air-id) slot
  });

  it('redraws icon + title when a slot item changes identity', () => {
    const inv = makeInventory();
    const { container, hotbar } = makeHotbar(inv);
    // Simulate a pickup replacing the empty slot's placeholder identity.
    inv.addItem(ItemId.Cobblestone, 3);
    hotbar.render();
    const children = slotChildren(container);
    expect(children.length).toBeGreaterThan(0);
    const filled = children[0]!;
    expect(filled.canvas.ctx.drawCalls).toBe(2); // repainted exactly once more
    expect(filled.slot.title).toBe(realRegistry.getByLegacyId(ItemId.Cobblestone)?.name);
    expect(children[4]!.canvas.ctx.drawCalls).toBe(1); // unchanged slot not repainted
  });

  it('show/hide toggle the container visibility class', () => {
    const inv = makeInventory();
    const { container, hotbar } = makeHotbar(inv);
    hotbar.show();
    expect(container.classes.has('hidden')).toBe(false);
    hotbar.hide();
    expect(container.classes.has('hidden')).toBe(true);
  });

  it('dispose clears all slot DOM and internal bookkeeping', () => {
    const inv = makeInventory();
    inv.addItem(ItemId.Grass, 1);
    const { container, hotbar } = makeHotbar(inv);
    hotbar.dispose();
    expect(container.children).toHaveLength(0);
    // A post-dispose render must be a safe no-op with nothing tracked.
    expect(() => hotbar.render()).not.toThrow();
  });
});
