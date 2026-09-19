import { describe, expect, it } from 'vitest';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';

describe('trading catalog items (278)', () => {
  const registry = createDefaultItemRegistry();

  it('declares emerald/bread/paper at stable ids 68-70', () => {
    expect(ItemId.Emerald).toBe(68);
    expect(ItemId.Bread).toBe(69);
    expect(ItemId.Paper).toBe(70);
    expect(registry.getByLegacyId(ItemId.Emerald)?.key).toBe('emerald');
    expect(registry.getByLegacyId(ItemId.Bread)?.key).toBe('bread');
    expect(registry.getByLegacyId(ItemId.Paper)?.key).toBe('paper');
    expect(registry.getByKey('emerald')?.id).toBe(ItemId.Emerald);
    expect(registry.getByKey('bread')?.id).toBe(ItemId.Bread);
    expect(registry.getByKey('paper')?.id).toBe(ItemId.Paper);
  });

  it('names and tiles the new items', () => {
    expect(registry.getByLegacyId(ItemId.Emerald)?.name).toBe('Emerald');
    expect(registry.getByLegacyId(ItemId.Bread)?.name).toBe('Bread');
    expect(registry.getByLegacyId(ItemId.Paper)?.name).toBe('Paper');
    expect(registry.getByLegacyId(ItemId.Emerald)?.iconTile).toBe(70);
    expect(registry.getByLegacyId(ItemId.Bread)?.iconTile).toBe(71);
    expect(registry.getByLegacyId(ItemId.Paper)?.iconTile).toBe(72);
  });

  it('stacks to 64 with no block placement and no durability', () => {
    for (const id of [ItemId.Emerald, ItemId.Bread, ItemId.Paper] as const) {
      const def = registry.getByLegacyId(id)!;
      expect(def.stackSize).toBe(64);
      expect(def.placeBlock).toBeUndefined();
      expect(def.maxDurability ?? 0).toBe(0);
    }
  });

  it('flags bread as food (5 hunger)', () => {
    const bread = registry.getByLegacyId(ItemId.Bread)!;
    expect(bread.isFood).toBe(true);
    expect(bread.foodHunger).toBe(5);
    expect(registry.getByLegacyId(ItemId.Emerald)?.isFood ?? false).toBe(false);
    expect(registry.getByLegacyId(ItemId.Paper)?.isFood ?? false).toBe(false);
  });

  it('resolves every 151 trade key to an item id', () => {
    const keys = [
      'wheat',
      'emerald',
      'bread',
      'apple',
      'paper',
      'book',
      'coal',
      'iron_ingot',
      'wooden_axe',
    ];
    for (const key of keys) {
      expect(registry.getByKey(key)?.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps ids unique and above the previous maximum (67)', () => {
    const ids = registry.all().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [ItemId.Emerald, ItemId.Bread, ItemId.Paper] as const) {
      expect(id).toBeGreaterThan(67);
    }
  });
});
