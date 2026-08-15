import { describe, it, expect } from 'vitest';
import {
  createDefaultItemRegistry,
  ItemId,
  type ItemTypeRegistry,
} from '../../src/inventory/ItemRegistry';

describe('item registry enchanting data (120)', () => {
  const registry: ItemTypeRegistry = createDefaultItemRegistry();

  it('resolves the new enchanting item ids', () => {
    const lapis = registry.getByLegacyId(ItemId.LapisLazuli);
    const book = registry.getByLegacyId(ItemId.Book);
    const shelf = registry.getByLegacyId(ItemId.Bookshelf);
    const table = registry.getByLegacyId(ItemId.EnchantingTable);
    expect(lapis?.key).toBe('lapis_lazuli');
    expect(book?.key).toBe('book');
    expect(shelf?.key).toBe('bookshelf');
    expect(table?.key).toBe('enchanting_table');
    // legacy id<->key lookups agree.
    expect(registry.getByKey('lapis_lazuli')?.id).toBe(ItemId.LapisLazuli);
    expect(registry.getByKey('enchanting_table')?.id).toBe(ItemId.EnchantingTable);
  });

  it('seeds enchantability for enchantable items', () => {
    expect(registry.getByLegacyId(ItemId.WoodenPickaxe)?.enchantability).toBeGreaterThan(0);
    expect(registry.getByLegacyId(ItemId.StonePickaxe)?.enchantability).toBeGreaterThan(0);
    expect(registry.getByLegacyId(ItemId.WoodenAxe)?.enchantability).toBeGreaterThan(0);
    expect(registry.getByLegacyId(ItemId.Book)?.enchantability).toBeGreaterThan(0);
  });

  it('leaves non-enchantable items with no enchantability', () => {
    expect(registry.getByLegacyId(ItemId.LapisLazuli)?.enchantability ?? 0).toBe(0);
    expect(registry.getByLegacyId(ItemId.Apple)?.enchantability ?? 0).toBe(0);
  });

  it('places the bookshelf and enchanting-table blocks', () => {
    expect(registry.getByLegacyId(ItemId.Bookshelf)?.placeBlock).toBeDefined();
    expect(registry.getByLegacyId(ItemId.EnchantingTable)?.placeBlock).toBeDefined();
  });
});
