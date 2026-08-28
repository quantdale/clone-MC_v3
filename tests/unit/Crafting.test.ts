import { describe, expect, it } from 'vitest';
import { CraftingSystem } from '../../src/inventory/Crafting';
import { Inventory } from '../../src/inventory/Inventory';
import { ItemId } from '../../src/inventory/ItemRegistry';

describe('crafting recipes', () => {
  it('crafts planks from one log', () => {
    const inventory = new Inventory([ItemId.Wood, ItemId.Planks], [1, 0]);
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('planks')?.outputCount).toBe(4);
    expect(inventory.getItemCount(ItemId.Wood)).toBe(0);
    expect(inventory.getItemCount(ItemId.Planks)).toBe(4);
  });

  it('does not consume ingredients when a recipe is unaffordable', () => {
    const inventory = new Inventory([ItemId.Sand, ItemId.Glass], [3, 0]);
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('glass')).toBeNull();
    expect(inventory.getItemCount(ItemId.Sand)).toBe(3);
  });

  it('reports unknown recipes as a no-op', () => {
    const crafting = new CraftingSystem(new Inventory());
    expect(crafting.craft('missing')).toBeNull();
  });

  it('crafts a masonry chain from stone into cobblestone and bricks', () => {
    const inventory = new Inventory([ItemId.Stone, ItemId.Cobblestone, ItemId.Bricks], [6, 0, 0]);
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('cobblestone')?.output).toBe(ItemId.Cobblestone);
    expect(inventory.getItemCount(ItemId.Cobblestone)).toBe(2);
    expect(crafting.craft('bricks')).toBeNull();
    inventory.addItem(ItemId.Cobblestone, 2);
    expect(crafting.craft('bricks')?.output).toBe(ItemId.Bricks);
    expect(inventory.getItemCount(ItemId.Bricks)).toBe(4);
  });

  it('crafts sticks and a wooden pickaxe transactionally', () => {
    const inventory = new Inventory(
      [ItemId.Planks, ItemId.Stick, ItemId.WoodenPickaxe],
      [5, 0, 0],
    );
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('wooden_pickaxe')).toBeNull();
    expect(crafting.craft('sticks')?.output).toBe(ItemId.Stick);
    expect(inventory.getItemCount(ItemId.Stick)).toBe(4);
    expect(crafting.craft('wooden_pickaxe')?.output).toBe(ItemId.WoodenPickaxe);
    expect(inventory.getItemCount(ItemId.WoodenPickaxe)).toBe(1);
    expect(inventory.getItemCount(ItemId.Planks)).toBe(0);
  });
});
