import { describe, it, expect } from 'vitest';
import {
  craftCraftingGrid,
  createCraftingGrid,
  emptyCraftingGrid,
  matchCraftingRecipe,
  setCraftingSlot,
  type CraftingSlot,
} from '../../src/inventory/CraftingGrid';
import { createDefaultTypedRecipes, type TypedRecipe } from '../../src/inventory/TypedRecipe';

const sand: CraftingSlot = { item: 'minecraft:sand', count: 1 };

function fullGrid(width: number, height: number, item: string): ReturnType<typeof createCraftingGrid> {
  let grid = emptyCraftingGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      grid = setCraftingSlot(grid, x, y, { item, count: 1 });
    }
  }
  return grid;
}

describe('grid construction', () => {
  it('accepts valid grids of every size', () => {
    for (const [w, h] of [[1, 1], [2, 2], [3, 3], [1, 2], [2, 1]] as const) {
      const grid = createCraftingGrid(w, h);
      expect(grid.width).toBe(w);
      expect(grid.height).toBe(h);
      expect(grid.slots.length).toBe(w * h);
      expect(grid.slots.every((s) => s === null)).toBe(true);
    }
    const withSlots = createCraftingGrid(2, 2, [sand, null, sand, null]);
    expect(withSlots.slots[0]).toEqual(sand);
  });

  it('rejects malformed grids', () => {
    expect(() => createCraftingGrid(0, 2)).toThrow(/width\/height/i);
    expect(() => createCraftingGrid(4, 2)).toThrow(/width\/height/i);
    expect(() => createCraftingGrid(2, 2.5)).toThrow(/width\/height/i);
    expect(() => createCraftingGrid(2, 2, [sand, null, sand])).toThrow(/slots length/i);
    expect(() => createCraftingGrid(2, 2, [{ item: '', count: 1 }, null, null, null])).toThrow(/item/i);
    expect(() => createCraftingGrid(2, 2, [{ item: 'minecraft:x', count: 0 }, null, null, null])).toThrow(/count/i);
  });

  it('updates immutably and rejects out-of-bounds cells', () => {
    const grid = emptyCraftingGrid(2, 2);
    const next = setCraftingSlot(grid, 1, 0, sand);
    expect(grid.slots[1]).toBeNull();
    expect(next.slots[1]).toEqual(sand);
    expect(next.slots[0]).toBeNull();
    expect(() => setCraftingSlot(grid, 2, 0, sand)).toThrow(/out of bounds/i);
    expect(() => setCraftingSlot(grid, 0, 0, { item: '', count: 1 })).toThrow(/item/i);
  });
});

describe('matchCraftingRecipe (shaped)', () => {
  const recipes = createDefaultTypedRecipes().all();

  it('matches the wooden pickaxe pattern in a 3x3 grid', () => {
    let grid = emptyCraftingGrid(3, 3);
    grid = setCraftingSlot(grid, 0, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 1, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 2, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 1, 1, { item: 'minecraft:stick', count: 1 });
    grid = setCraftingSlot(grid, 1, 2, { item: 'minecraft:stick', count: 1 });
    const match = matchCraftingRecipe(grid, recipes);
    expect(match?.kind).toBe('shaped');
    expect(match?.key).toBe('wooden_pickaxe');
  });

  it('does not match a 2x2 grid (pattern too large)', () => {
    const grid = fullGrid(2, 2, 'minecraft:planks');
    expect(matchCraftingRecipe(grid, recipes)).toBeNull();
  });

  it('rejects extra filled cells outside the pattern', () => {
    let grid = emptyCraftingGrid(3, 3);
    grid = setCraftingSlot(grid, 0, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 1, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 2, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 1, 1, { item: 'minecraft:stick', count: 1 });
    grid = setCraftingSlot(grid, 1, 2, { item: 'minecraft:stick', count: 1 });
    grid = setCraftingSlot(grid, 2, 2, sand); // extra cell
    expect(matchCraftingRecipe(grid, recipes)).toBeNull();
  });

  it('rejects a grid whose cells differ from the pattern', () => {
    const grid = fullGrid(3, 3, 'minecraft:sand');
    expect(matchCraftingRecipe(grid, recipes)).toBeNull();
  });
});

describe('matchCraftingRecipe (shapeless)', () => {
  const recipes = createDefaultTypedRecipes().all();

  it('matches the 4-sand glass recipe in a full 2x2 grid', () => {
    const grid = fullGrid(2, 2, 'minecraft:sand');
    const match = matchCraftingRecipe(grid, recipes);
    expect(match?.kind).toBe('shapeless');
    expect(match?.key).toBe('glass');
  });

  it('does not match with a different item or multiplicity', () => {
    const wrongItem = fullGrid(2, 2, 'minecraft:gravel');
    expect(matchCraftingRecipe(wrongItem, recipes)).toBeNull();
    const wrongCount = createCraftingGrid(2, 2, [sand, sand, sand, null]);
    expect(matchCraftingRecipe(wrongCount, recipes)).toBeNull();
  });
});

describe('first match wins', () => {
  it('returns the first matching recipe in input order', () => {
    const first: TypedRecipe = {
      kind: 'shapeless',
      key: 'a',
      ingredients: ['minecraft:sand', 'minecraft:sand', 'minecraft:sand', 'minecraft:sand'],
      result: { item: 'minecraft:glass', count: 1 },
    };
    const second: TypedRecipe = {
      kind: 'shapeless',
      key: 'b',
      ingredients: ['minecraft:sand', 'minecraft:sand', 'minecraft:sand', 'minecraft:sand'],
      result: { item: 'minecraft:glass', count: 2 },
    };
    const grid = fullGrid(2, 2, 'minecraft:sand');
    expect(matchCraftingRecipe(grid, [first, second])).toEqual(first);
  });
});

describe('craftCraftingGrid', () => {
  const recipes = createDefaultTypedRecipes().all();

  it('returns the result and consumed pattern cells for a shaped recipe', () => {
    let grid = emptyCraftingGrid(3, 3);
    grid = setCraftingSlot(grid, 0, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 1, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 2, 0, { item: 'minecraft:planks', count: 1 });
    grid = setCraftingSlot(grid, 1, 1, { item: 'minecraft:stick', count: 1 });
    grid = setCraftingSlot(grid, 1, 2, { item: 'minecraft:stick', count: 1 });
    const pickaxe = recipes.find((r) => r.key === 'wooden_pickaxe')!;
    const craft = craftCraftingGrid(grid, pickaxe);
    expect(craft).not.toBeNull();
    expect(craft!.result).toEqual({ item: 'minecraft:wooden_pickaxe', count: 1 });
    expect(craft!.consumed).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it('returns the result and all filled cells for a shapeless recipe', () => {
    const grid = fullGrid(2, 2, 'minecraft:sand');
    const glass = recipes.find((r) => r.key === 'glass')!;
    const craft = craftCraftingGrid(grid, glass);
    expect(craft).not.toBeNull();
    expect(craft!.result).toEqual({ item: 'minecraft:glass', count: 1 });
    expect(craft!.consumed).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('returns null for a non-matching recipe and for processing recipes', () => {
    const grid = fullGrid(2, 2, 'minecraft:sand');
    const pickaxe = recipes.find((r) => r.key === 'wooden_pickaxe')!;
    expect(craftCraftingGrid(grid, pickaxe)).toBeNull();
    const smelt = recipes.find((r) => r.key === 'smelt_sand')!;
    expect(craftCraftingGrid(grid, smelt)).toBeNull();
  });

  it('is deterministic', () => {
    const grid = fullGrid(2, 2, 'minecraft:sand');
    const glass = recipes.find((r) => r.key === 'glass')!;
    const a = craftCraftingGrid(grid, glass);
    const b = craftCraftingGrid(grid, glass);
    expect(b).toEqual(a);
  });
});
