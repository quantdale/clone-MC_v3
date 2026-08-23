import { describe, it, expect } from 'vitest';
import { Inventory } from '../../src/inventory/Inventory';
import {
  createDefaultItemRegistry,
  ItemId,
} from '../../src/inventory/ItemRegistry';

/**
 * Regression oracle (hardening 2026-08-23, F-INV-1): before the fix the three
 * tool definitions declared stackSize 64, so two crafted pickaxes merged into a
 * single shared-damage stack and breaking one destroyed both. Durable items now
 * stack at 1; each crafted copy occupies its own slot with independent wear.
 */
describe('tool durability is per-item, never per-pile', () => {
  const registry = createDefaultItemRegistry();
  const pickaxe = ItemId.WoodenPickaxe;

  function inventoryWithTwoPickaxes(): Inventory {
    // Nine explicitly-empty slots so adds land at deterministic indices.
    const inv = new Inventory(
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [],
      registry,
    );
    // Two separately-crafted pickaxes land in distinct slots.
    expect(inv.addItem(pickaxe, 1)).toBe(0);
    expect(inv.addItem(pickaxe, 1)).toBe(0);
    return inv;
  }

  it('keeps two crafted pickaxes in separate unmerged slots', () => {
    const inv = inventoryWithTwoPickaxes();
    const occupied = inv.slots.filter((s) => s.id === pickaxe && s.count > 0);
    expect(occupied).toHaveLength(2);
    for (const stack of occupied) expect(stack.count).toBe(1);
  });

  it('breaking one pickaxe leaves the other intact', () => {
    const inv = inventoryWithTwoPickaxes();
    // Wear slot 0 to its final use and break it.
    inv.select(0);
    let broke = false;
    for (let i = 0; i < 59 && !broke; i++) {
      broke = inv.damageSelectedItem(1, 59);
    }
    expect(broke).toBe(true);
    expect(inv.getSlotCount(0)).toBe(0);

    const other = inv.slots.find((s) => s.id === pickaxe && s.count > 0);
    expect(other, 'the second pickaxe must survive').toBeDefined();
    expect(other!.count).toBe(1);
    expect(inv.getItemCount(pickaxe)).toBe(1);
  });

  it('wears each copy independently', () => {
    const inv = inventoryWithTwoPickaxes();
    inv.select(0);
    inv.damageSelectedItem(10, 59);
    inv.select(1);
    expect(inv.getSlotDurability(1, 59)).toBe(59);
    expect(inv.getSlotDurability(0, 59)).toBe(49);
  });
});
