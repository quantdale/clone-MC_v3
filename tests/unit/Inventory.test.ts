import { describe, it, expect } from 'vitest';
import { Inventory } from '../../src/inventory/Inventory';
import { ItemId } from '../../src/inventory/ItemRegistry';

describe('inventory hotbar selection', () => {
  it('defaults to the first slot selected', () => {
    const inv = new Inventory();
    expect(inv.selected).toBe(0);
    expect(inv.getSelectedItemId()).toBe(inv.slots[0]);
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
    const inv = new Inventory([ItemId.Grass, ItemId.Stone, ItemId.Sand]);
    inv.select(1);
    expect(inv.getSelectedItemId()).toBe(ItemId.Stone);
  });

  it('falls back to default slots when constructed empty', () => {
    const inv = new Inventory([]);
    expect(inv.slots.length).toBeGreaterThan(0);
    inv.select(0);
    expect(inv.getSelectedItemId()).toBe(inv.slots[0]);
  });

  it('default slots match the documented block order', () => {
    // Grass / Dirt / Stone / Sand / Wood / Planks / Glass / Water / Apple.
    const inv = new Inventory();
    expect(inv.slots).toEqual([
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
    expect(inv.counts).toEqual([32, 32, 64, 16, 0, 0, 0, 8, 0]);
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
    expect(inv.counts[0]).toBe(64);
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

  it('round-trips a validated snapshot', () => {
    const source = new Inventory([ItemId.Wood, ItemId.Planks], [2, 3], [{ id: ItemId.Sand, count: 4 }]);
    source.select(1);
    const restored = new Inventory();
    expect(restored.restore(source.snapshot())).toBe(true);
    expect(restored.slots).toEqual(source.slots);
    expect(restored.counts).toEqual(source.counts);
    expect(restored.storage).toEqual(source.storage);
    expect(restored.selected).toBe(1);
    expect(restored.restore({ version: 2 })).toBe(false);
    expect(restored.restore(source.snapshot(), (id) => id !== ItemId.Wood)).toBe(false);
    const malformed = source.snapshot();
    malformed.durability = [99, 0];
    expect(restored.restore(malformed, () => true, (id) => id === ItemId.Wood ? 10 : 0)).toBe(false);
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
});
