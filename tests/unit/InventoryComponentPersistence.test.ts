import { describe, it, expect } from 'vitest';
import { Inventory } from '../../src/inventory/Inventory';
import {
  createDefaultItemRegistry,
  ItemId,
} from '../../src/inventory/ItemRegistry';
import {
  DAMAGE_COMPONENT,
  ENCHANTMENTS_COMPONENT,
} from '../../src/inventory/StackDataComponents';
import { setStackEnchantments } from '../../src/inventory/EnchantmentApplication';
import { createDefaultEnchantmentRegistry, type EnchantmentRegistry } from '../../src/inventory/EnchantmentRegistry';
import { createResourceId } from '../../src/data/ResourceId';

/**
 * Regression oracle (hardening 2026-08-23, F-INV-2): snapshot()/restore()
 * previously dropped every StackComponentMap except the legacy durability
 * translation, so enchanted (and potion-bearing) items silently reset to
 * pristine across save/load while their XP/lapis cost stayed spent.
 */
describe('inventory snapshots preserve stack components', () => {
  const registry = createDefaultItemRegistry();
  const enchantments: EnchantmentRegistry = createDefaultEnchantmentRegistry();
  const pickaxe = ItemId.WoodenPickaxe;
  const efficiency = createResourceId('minecraft', 'efficiency');
  const unbreaking = createResourceId('minecraft', 'unbreaking');

  function enchantedDamagedPickaxe() {
    const inv = new Inventory(
      [ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [],
      registry,
    );
    inv.addItem(pickaxe, 1);
    inv.select(0);
    // Enchant first (replaces the component map), then accumulate wear.
    const held = inv.getSelectedStack()!;
    const enchanted = setStackEnchantments(held, [{ id: efficiency, level: 3 }], enchantments);
    inv.setSelectedStack(enchanted);
    inv.damageSelectedItem(10, 59);
    return inv.getSelectedStack();
  }

  it('round-trips enchantments and damage through snapshot/restore', () => {
    const source = new Inventory(
      [ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass, ItemId.Grass],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [],
      registry,
    );
    source.addItem(pickaxe, 1);
    source.select(0);
    source.setSelectedStack(enchantedDamagedPickaxe()!);

    const snapshot = source.snapshot();
    const restored = new Inventory([], [], [], registry);
    expect(
      restored.restore(snapshot, (id) => registry.has(id), (id) => registry.getByLegacyId(id)?.maxDurability ?? 0),
    ).toBe(true);

    const before = source.getSelectedStack()!;
    const after = restored.getSelectedStack()!;
    expect(after.id).toBe(pickaxe);
    expect(after.components?.has(ENCHANTMENTS_COMPONENT)).toBe(true);
    expect(after.components?.get<Record<string, number>>(ENCHANTMENTS_COMPONENT)).toEqual({
      'minecraft:efficiency': 3,
    });
    expect(after.components?.get<{ damage: number }>(DAMAGE_COMPONENT)?.damage).toBe(
      before.components?.get<{ damage: number }>(DAMAGE_COMPONENT)?.damage,
    );
  });

  it('preserves components on storage stacks', () => {
    const enchantedStorage = setStackEnchantments(
      { id: pickaxe, count: 1 },
      [{ id: unbreaking, level: 1 }],
      enchantments,
    );
    const source = new Inventory([ItemId.Grass], [0], [enchantedStorage], registry);
    const snapshot = source.snapshot();
    const restored = new Inventory([], [], [], registry);
    expect(restored.restore(snapshot, (id) => registry.has(id), () => 59)).toBe(true);
    expect(restored.storage[0]?.components?.has(ENCHANTMENTS_COMPONENT)).toBe(true);
  });

  it('keeps constructor-routed storage components', () => {
    const enchanted = setStackEnchantments(
      { id: pickaxe, count: 1 },
      [{ id: unbreaking, level: 1 }],
      enchantments,
    );
    const inv = new Inventory([0], [0], [enchanted], registry);
    expect(inv.storage[0]?.components?.get<Record<string, number>>(ENCHANTMENTS_COMPONENT)).toEqual({
      'minecraft:unbreaking': 1,
    });
  });

  it('rejects malformed component payloads instead of throwing', () => {
    const inv = new Inventory([0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], [], registry);
    const bad = {
      version: 1,
      slots: [pickaxe, 0, 0, 0, 0, 0, 0, 0, 0],
      counts: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      storage: [],
      selected: 0,
      slotComponents: [[{ id: 'minecraft:not_a_component', value: { x: 1 } }], null, null, null, null, null, null, null, null],
    };
    expect(inv.restore(bad, () => true, () => 59)).toBe(false);
    // State is untouched after the rejected restore.
    expect(inv.getSlotCount(0)).toBe(0);
  });

  it('rejects invalid component values', () => {
    const inv = new Inventory([0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], [], registry);
    const bad = {
      version: 1,
      slots: [pickaxe, 0, 0, 0, 0, 0, 0, 0, 0],
      counts: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      storage: [],
      selected: 0,
      slotComponents: [[{ id: 'minecraft:enchantments', value: { 'minecraft:efficiency': 0 } }], null, null, null, null, null, null, null, null],
    };
    expect(inv.restore(bad, () => true, () => 59)).toBe(false);
  });

  it('restores legacy snapshots without slotComponents verbatim', () => {
    const inv = new Inventory([], [], [], registry);
    const legacy = {
      version: 1,
      slots: [pickaxe],
      counts: [1],
      storage: [] as Array<{ id: number; count: number }>,
      selected: 0,
      durability: [49],
    };
    expect(inv.restore(legacy, () => true, () => 59)).toBe(true);
    expect(inv.getSlotDurability(0, 59)).toBe(49);
  });

  it('empty-slot serialized components do not resurrect ghost stacks', () => {
    const source = new Inventory(
      [pickaxe, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [],
      registry,
    );
    const snapshot = source.snapshot();
    const tampered = {
      ...snapshot,
      counts: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
    const restored = new Inventory([], [], [], registry);
    expect(restored.restore(tampered, () => true, () => 59)).toBe(true);
    expect(restored.getSlotCount(0)).toBe(0);
    expect(restored.slots[0]?.components).toBeUndefined();
  });
});
