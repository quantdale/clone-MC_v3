import { describe, it, expect } from 'vitest';
import { Inventory } from '../../src/inventory/Inventory';
import { ItemId } from '../../src/inventory/ItemRegistry';
import { DAMAGE_COMPONENT } from '../../src/inventory/StackDataComponents';

describe('inventory hotbar selection', () => {
  it('defaults to the first slot selected', () => {
    const inv = new Inventory();
    expect(inv.selected).toBe(0);
    expect(inv.getSelectedItemId()).toBe(inv.slots[0]?.id ?? 0);
  });

  it('selects a slot by index', () => {
    const inv = new Inventory();
    inv.select(5);
    expect(inv.selected).toBe(5);
  });

  it('clamps out-of-range selection', () => {
    const inv = new Inventory();
    inv.select(-3);
    expect(inv.selected).toBe(0);
    inv.select(999);
    expect(inv.selected).toBe(inv.slots.length - 1);
  });

  it('cycles forward with wraparound', () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(1);
    expect(inv.selected).toBe(1);
    // Wrap past the last slot back to the first.
    inv.select(inv.slots.length - 1);
    inv.cycle(1);
    expect(inv.selected).toBe(0);
  });

  it('cycles backward with wraparound', () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(-1);
    expect(inv.selected).toBe(inv.slots.length - 1);
    // Wrap past the first slot back to the last.
    inv.cycle(-1);
    expect(inv.selected).toBe(inv.slots.length - 2);
  });

  it('returns the selected block id', () => {
    const inv = new Inventory([ItemId.Grass, ItemId.Stone, ItemId.Sand], [1, 1, 1]);
    inv.select(1);
    expect(inv.getSelectedItemId()).toBe(ItemId.Stone);
  });

  it('falls back to default slots when constructed empty', () => {
    const inv = new Inventory([]);
    expect(inv.slots.length).toBeGreaterThan(0);
    inv.select(0);
    expect(inv.getSelectedItemId()).toBe(inv.slots[0]?.id ?? 0);
  });

  it('default slots match the documented block order', () => {
    // Grass / Dirt / Stone / Sand / Wood / Planks / Glass / Water / Apple.
    const inv = new Inventory();
    expect(inv.slots.map((s) => s.id)).toEqual([
      ItemId.Grass,
      ItemId.Dirt,
      ItemId.Stone,
      ItemId.Sand,
      ItemId.Wood,
      ItemId.Planks,
      ItemId.Glass,
      ItemId.Water,
      ItemId.Apple,
    ]);
    expect(inv.slots.map((s) => s.count)).toEqual([32, 32, 64, 16, 0, 0, 0, 8, 0]);
  });

  it('cycles wrap with a delta larger than the slot count', () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(10); // 10 slots forward → wraps to 1 (10 % 9 = 1).
    expect(inv.selected).toBe(1);
    inv.cycle(-10); // back to 0.
    expect(inv.selected).toBe(0);
  });

  it('select truncates fractional indices to the nearest slot', () => {
    const inv = new Inventory();
    inv.select(1.7);
    expect(inv.selected).toBe(1);
    inv.select(-0.5);
    expect(inv.selected).toBe(0);
  });

  it('stacks items and spills overflow into main inventory', () => {
    const inv = new Inventory([ItemId.Stone], [60]);
    expect(inv.addItem(ItemId.Stone, 8)).toBe(0);
    expect(inv.getSlotCount(0)).toBe(64);
    expect(inv.storage).toEqual([{ id: ItemId.Stone, count: 4 }]);
    expect(inv.getItemCount(ItemId.Stone)).toBe(68);
  });

  it('removes items across hotbar and storage transactionally', () => {
    const inv = new Inventory([ItemId.Sand], [2], [{ id: ItemId.Sand, count: 5 }]);
    expect(inv.removeItem(ItemId.Sand, 6)).toBe(true);
    expect(inv.getItemCount(ItemId.Sand)).toBe(1);
    expect(inv.removeItem(ItemId.Sand, 2)).toBe(false);
    expect(inv.getItemCount(ItemId.Sand)).toBe(1);
  });

  it('consumes only the selected hotbar stack', () => {
    const inv = new Inventory([ItemId.Stone, ItemId.Dirt], [1, 4]);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.getSlotCount(0)).toBe(0);
    inv.select(1);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.getSlotCount(1)).toBe(3);
  });

  it('round-trips a validated snapshot without leaking component state', () => {
    const source = new Inventory([ItemId.Wood, ItemId.Planks], [2, 3], [{ id: ItemId.Sand, count: 4 }]);
    source.select(1);
    const restored = new Inventory();
    expect(restored.restore(source.snapshot())).toBe(true);
    expect(restored.slots.map((s) => s.id)).toEqual(source.slots.map((s) => s.id));
    expect(restored.slots.map((s) => s.count)).toEqual(source.slots.map((s) => s.count));
    expect(restored.storage).toEqual(source.storage);
    expect(restored.selected).toBe(1);
    expect(restored.restore({ version: 2 })).toBe(false);
    expect(restored.restore(source.snapshot(), (id) => id !== ItemId.Wood)).toBe(false);
    const malformed = source.snapshot();
    malformed.durability = [99, 0];
    expect(restored.restore(malformed, () => true, (id) => (id === ItemId.Wood ? 10 : 0))).toBe(false);
  });

  it('tracks tool durability and breaks the selected tool at zero', () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    expect(inv.getSelectedDurability(3)).toBe(3);
    expect(inv.damageSelectedItem(1, 3)).toBe(false);
    expect(inv.getSelectedDurability(3)).toBe(2);
    expect(inv.damageSelectedItem(2, 3)).toBe(true);
    expect(inv.getSlotCount()).toBe(0);
    expect(inv.getSelectedDurability(3)).toBe(0);
  });

  it('expresses tool wear through the 008 damage component and round-trips it', () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    expect(inv.damageSelectedItem(1, 59)).toBe(false);
    const stack = inv.slots[0]!;
    expect(stack.components?.has(DAMAGE_COMPONENT)).toBe(true);
    expect(stack.components?.get<{ damage: number }>(DAMAGE_COMPONENT)?.damage).toBe(1);
    // Remaining durability is the cap minus accumulated damage.
    expect(inv.getSelectedDurability(59)).toBe(58);

    const saved = inv.snapshot();
    const restored = new Inventory();
    expect(restored.restore(saved, () => true, (id) => (id === ItemId.WoodenPickaxe ? 59 : 0))).toBe(true);
    expect(restored.getSelectedDurability(59)).toBe(58);
    expect(restored.slots[0]!.components?.get<{ damage: number }>(DAMAGE_COMPONENT)?.damage).toBe(1);
  });

  it('does not merge stacks that share an id but differ in components', () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    expect(inv.damageSelectedItem(1, 59)).toBe(false); // now damaged (damage 1)
    // Adding a fresh, pristine pickaxe must not merge into the damaged slot.
    expect(inv.addItem(ItemId.WoodenPickaxe, 1)).toBe(0);
    expect(inv.getItemCount(ItemId.WoodenPickaxe)).toBe(2);
    const damaged = inv.slots[0]!;
    const pristine = inv.storage[0] ?? inv.slots.find((s) => s.count > 0 && s !== damaged);
    expect(damaged.components?.get<{ damage: number }>(DAMAGE_COMPONENT)?.damage).toBe(1);
    expect(pristine?.components?.has(DAMAGE_COMPONENT) ?? false).toBe(false);
  });

  it('merges identical plain stacks up to the item-specific maximum', () => {
    const inv = new Inventory([ItemId.Coal], [60]);
    expect(inv.addItem(ItemId.Coal, 8)).toBe(0);
    expect(inv.getSlotCount(0)).toBe(64);
    expect(inv.storage).toEqual([{ id: ItemId.Coal, count: 4 }]);
  });

  it('rejects malformed snapshot restoration atomically', () => {
    const inv = new Inventory([ItemId.Stone], [4]);
    const snapshot = inv.snapshot();
    const goodCount = inv.getItemCount(ItemId.Stone);
    // Corrupt the slot count beyond the stack cap.
    const corrupted = JSON.parse(JSON.stringify(snapshot));
    corrupted.counts[0] = 999;
    expect(inv.restore(corrupted)).toBe(false);
    expect(inv.getItemCount(ItemId.Stone)).toBe(goodCount);
    // Corrupt the slot id.
    const badId = JSON.parse(JSON.stringify(snapshot));
    badId.slots[0] = 999;
    expect(inv.restore(badId, (id) => id !== 999)).toBe(false);
    expect(inv.getItemCount(ItemId.Stone)).toBe(goodCount);
  });

  it('keeps empty slots free of meaningful component state', () => {
    const inv = new Inventory([ItemId.WoodenPickaxe], [1]);
    inv.damageSelectedItem(1, 59);
    expect(inv.slots[0]!.components?.has(DAMAGE_COMPONENT)).toBe(true);
    // Consuming to zero clears the slot and any component it carried.
    inv.consumeSelected();
    expect(inv.getSlotCount(0)).toBe(0);
    expect(inv.slots[0]!.components).toBeUndefined();
  });

  it('restores a legacy snapshot that omits wear data as full tools', () => {
    const inv = new Inventory();
    const legacy = {
      version: 1 as const,
      slots: [ItemId.WoodenPickaxe],
      counts: [1],
      storage: [],
      selected: 0,
    };
    expect(inv.restore(legacy, () => true, (id) => (id === ItemId.WoodenPickaxe ? 59 : 0))).toBe(true);
    expect(inv.getSlotCount(0)).toBe(1);
    expect(inv.getSelectedDurability(59)).toBe(59);
    expect(inv.slots[0]!.components?.has(DAMAGE_COMPONENT) ?? false).toBe(false);
  });
});
