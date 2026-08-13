import { describe, expect, it } from 'vitest';
import { CraftingSystem } from '../../src/inventory/Crafting';
import { Inventory } from '../../src/inventory/Inventory';
import { BlockId } from '../../src/world/BlockRegistry';

describe('crafting recipes', () => {
  it('crafts planks from one log', () => {
    const inventory = new Inventory([BlockId.Wood, BlockId.Planks], [1, 0]);
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('planks')?.outputCount).toBe(4);
    expect(inventory.getItemCount(BlockId.Wood)).toBe(0);
    expect(inventory.getItemCount(BlockId.Planks)).toBe(4);
  });

  it('does not consume ingredients when a recipe is unaffordable', () => {
    const inventory = new Inventory([BlockId.Sand, BlockId.Glass], [3, 0]);
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('glass')).toBeNull();
    expect(inventory.getItemCount(BlockId.Sand)).toBe(3);
  });

  it('reports unknown recipes as a no-op', () => {
    const crafting = new CraftingSystem(new Inventory());
    expect(crafting.craft('missing')).toBeNull();
  });

  it('crafts a masonry chain from stone into cobblestone and bricks', () => {
    const inventory = new Inventory([BlockId.Stone, BlockId.Cobblestone, BlockId.Bricks], [6, 0, 0]);
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('cobblestone')?.output).toBe(BlockId.Cobblestone);
    expect(inventory.getItemCount(BlockId.Cobblestone)).toBe(2);
    expect(crafting.craft('bricks')).toBeNull();
    inventory.addItem(BlockId.Cobblestone, 2);
    expect(crafting.craft('bricks')?.output).toBe(BlockId.Bricks);
    expect(inventory.getItemCount(BlockId.Bricks)).toBe(4);
  });

  it('crafts sticks and a wooden pickaxe transactionally', () => {
    const inventory = new Inventory(
      [BlockId.Planks, BlockId.Stick, BlockId.WoodenPickaxe],
      [5, 0, 0],
    );
    const crafting = new CraftingSystem(inventory);
    expect(crafting.craft('wooden_pickaxe')).toBeNull();
    expect(crafting.craft('sticks')?.output).toBe(BlockId.Stick);
    expect(inventory.getItemCount(BlockId.Stick)).toBe(4);
    expect(crafting.craft('wooden_pickaxe')?.output).toBe(BlockId.WoodenPickaxe);
    expect(inventory.getItemCount(BlockId.WoodenPickaxe)).toBe(1);
    expect(inventory.getItemCount(BlockId.Planks)).toBe(0);
  });
});
