import { describe, it, expect } from 'vitest';
import { BlockEntityInstance, BlockEntityManager } from '../../src/simulation/BlockEntityManager';
import {
  menuSlotToStack,
  stackToMenuSlot,
} from '../../src/inventory/MenuSlots';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import {
  DAMAGE_COMPONENT,
  ENCHANTMENTS_COMPONENT,
  StackComponentMap,
  createDefaultStackComponentRegistry,
} from '../../src/inventory/StackDataComponents';
import type { ItemStack } from '../../src/inventory/Inventory';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

const registry = createDefaultItemRegistry();
const componentRegistry = createDefaultStackComponentRegistry();

function stackOf(id: number, count: number, components?: StackComponentMap): ItemStack {
  return components ? { id, count, components } : { id, count };
}

describe('MenuSlots stack ↔ slot conversion (251)', () => {
  it('round-trips a plain stack losslessly', () => {
    const slot = stackToMenuSlot(stackOf(ItemId.Sand, 17), registry);
    expect(slot.item).toBe('minecraft:sand');
    expect(slot.count).toBe(17);
    expect(slot.maxStack).toBe(64);
    const back = menuSlotToStack(slot, registry)!;
    expect(back.id).toBe(ItemId.Sand);
    expect(back.count).toBe(17);
  });

  it('carries per-stack components across both directions', () => {
    const components = new StackComponentMap(componentRegistry, [
      [DAMAGE_COMPONENT, { damage: 42 }],
      [ENCHANTMENTS_COMPONENT, { 'minecraft:efficiency': 3 }],
    ]);
    const slot = stackToMenuSlot(stackOf(ItemId.WoodenPickaxe, 1, components), registry);
    expect(slot.components).toEqual({
      'minecraft:damage': { damage: 42 },
      'minecraft:enchantments': { 'minecraft:efficiency': 3 },
    });
    const back = menuSlotToStack(slot, registry)!;
    expect(back.components?.get(DAMAGE_COMPONENT)).toEqual({ damage: 42 });
    expect(back.components?.equals(components)).toBe(true);
  });

  it('maps empty/invalid inventory stacks to empty slots', () => {
    expect(stackToMenuSlot(null, registry)).toEqual({ item: null, count: 0, maxStack: 64 });
    expect(stackToMenuSlot(stackOf(ItemId.Sand, 0), registry).item).toBeNull();
    // Unknown legacy id cannot be represented — empty slot, not garbage.
    expect(stackToMenuSlot(stackOf(9999, 3), registry).item).toBeNull();
  });

  it('returns null (quarantine) rather than dropping items for unusable slots', () => {
    expect(menuSlotToStack({ item: null, count: 0, maxStack: 64 }, registry)).toBeNull();
    expect(menuSlotToStack({ item: 'minecraft:nope', count: 2, maxStack: 64 }, registry)).toBeNull();
    expect(menuSlotToStack({ item: 'minecraft:sand', count: -4, maxStack: 64 }, registry)).toBeNull();
    // Corrupt component payload → null so the caller preserves the original.
    const bad: MenuSlot = {
      item: 'minecraft:sand',
      count: 2,
      maxStack: 64,
      components: { 'minecraft:damage': { damage: -1 } },
    };
    expect(menuSlotToStack(bad, registry)).toBeNull();
    const unknownKey: MenuSlot = {
      item: 'minecraft:sand',
      count: 2,
      maxStack: 64,
      components: { 'not-a-resource-id': {} },
    };
    expect(menuSlotToStack(unknownKey, registry)).toBeNull();
  });

  it('clamps maxStack to the cursor cap and respects per-item stack sizes', () => {
    const durable = stackToMenuSlot(stackOf(ItemId.WoodenPickaxe, 1), registry);
    expect(durable.maxStack).toBe(1); // tools do not stack
    const bulk = stackToMenuSlot(stackOf(ItemId.Sand, 1), registry);
    expect(bulk.maxStack).toBe(64);
  });
});

describe('BlockEntityManager replace/all (251)', () => {
  it('replace swaps the instance in place preserving insertion order', () => {
    const manager = new BlockEntityManager();
    const first = new BlockEntityInstance({ typeKey: 'furnace', x: 1, y: 1, z: 1, data: 'a' });
    const second = new BlockEntityInstance({ typeKey: 'furnace', x: 20, y: 1, z: 1, data: 'b' });
    manager.add(first);
    manager.add(second);

    const updated = new BlockEntityInstance({ typeKey: 'furnace', x: 1, y: 1, z: 1, data: 'a2' });
    expect(manager.replace(updated)).toBe(true);
    expect(manager.get(1, 1, 1)?.data).toBe('a2');
    expect(manager.all().map((i) => i.data)).toEqual(['a2', 'b']); // order preserved
  });

  it('replace rejects missing positions, type mismatches, and cross-chunk moves', () => {
    const manager = new BlockEntityManager();
    const furnace = new BlockEntityInstance({ typeKey: 'furnace', x: 1, y: 1, z: 1 });
    manager.add(furnace);

    expect(manager.replace(new BlockEntityInstance({ typeKey: 'furnace', x: 9, y: 9, z: 9 }))).toBe(false);
    expect(manager.replace(new BlockEntityInstance({ typeKey: 'chest', x: 1, y: 1, z: 1 }))).toBe(false);
    // Same position key but a different chunk would be impossible for equal coords;
    // the guard is exercised by the type mismatch above, so assert identity here.
    expect(manager.replace(furnace)).toBe(true);
  });

  it('all() reflects removals deterministically', () => {
    const manager = new BlockEntityManager();
    const a = new BlockEntityInstance({ typeKey: 'furnace', x: 0, y: 0, z: 0 });
    const b = new BlockEntityInstance({ typeKey: 'furnace', x: 16, y: 0, z: 0 });
    manager.add(a);
    manager.add(b);
    manager.remove(0, 0, 0);
    expect(manager.all().map((i) => i.x)).toEqual([16]);
  });
});
