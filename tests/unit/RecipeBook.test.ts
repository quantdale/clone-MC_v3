import { describe, it, expect } from 'vitest';
import { createDefaultRecipeRegistry } from '../../src/inventory/RecipeRegistry';
import type { RecipeIngredient } from '../../src/inventory/RecipeRegistry';
import { parseResourceId } from '../../src/data/ResourceId';
import {
  RECIPE_GRID_CELLS,
  compactGrid,
  createDefaultRecipeBook,
  deserializeRecipeBook,
  hasRecipe,
  layoutRecipe,
  searchRecipes,
  serializeRecipeBook,
  unlockRecipe,
  unlockRecipes,
  type RecipeGridCell,
} from '../../src/inventory/RecipeBook';

const registry = createDefaultRecipeRegistry();

const item = (id: string, count = 1): RecipeIngredient => ({
  kind: 'item',
  item: parseResourceId(id),
  count,
});
const tag = (id: string): RecipeIngredient => ({
  kind: 'tag',
  tag: parseResourceId(id),
  count: 1,
});

describe('unlocks', () => {
  it('defaults to an empty book', () => {
    expect(createDefaultRecipeBook()).toEqual({ known: [] });
  });

  it('unlocks in order with identity no-ops for re-unlocks and empty keys', () => {
    const book = createDefaultRecipeBook();
    const a = unlockRecipe(book, 'planks');
    const b = unlockRecipe(a, 'glass');
    expect(b.known).toEqual(['planks', 'glass']);
    expect(unlockRecipe(b, 'planks')).toBe(b);
    expect(unlockRecipe(b, '')).toBe(b);
    expect(hasRecipe(b, 'planks')).toBe(true);
    expect(hasRecipe(b, 'sticks')).toBe(false);
  });

  it('bulk-unlocks in order and identity-no-ops when nothing is new', () => {
    const book = createDefaultRecipeBook();
    expect(unlockRecipes(book, ['sticks', 'planks']).known).toEqual(['sticks', 'planks']);
    expect(unlockRecipes(book, [])).toBe(book);
    expect(unlockRecipes(book, ['', 'planks']).known).toEqual(['planks']);
  });
});

describe('search', () => {
  const book = unlockRecipes(createDefaultRecipeBook(), [
    'planks',
    'glass',
    'sticks',
    'not_a_recipe',
  ]);

  it('returns all known recipes in registry order for a blank query', () => {
    expect(searchRecipes(registry, book, '').map((d) => d.key)).toEqual(['planks', 'glass', 'sticks']);
    expect(searchRecipes(registry, book, '   ').map((d) => d.key)).toEqual(['planks', 'glass', 'sticks']);
  });

  it('matches case-insensitively on key, name, and output id', () => {
    expect(searchRecipes(registry, book, 'plan').map((d) => d.key)).toEqual(['planks']);
    expect(searchRecipes(registry, book, 'PLANKS').map((d) => d.key)).toEqual(['planks']);
    expect(searchRecipes(registry, book, 'glass').map((d) => d.key)).toEqual(['glass']);
    expect(searchRecipes(registry, book, 'stick').map((d) => d.key)).toEqual(['sticks']);
  });

  it('matches by output item id and returns empty for no match', () => {
    const stone = searchRecipes(registry, book, 'stone');
    expect(stone.every((d) => d.output.item.path.includes('stone'))).toBe(true);
    expect(searchRecipes(registry, book, 'zzz')).toEqual([]);
  });
});

describe('layout', () => {
  it('fills 1, 4, and 9 ingredients row-major from the top-left', () => {
    const one = layoutRecipe([item('minecraft:wood')]);
    expect(one).toEqual([{ kind: 'item', item: 'minecraft:wood' }, ...Array(8).fill(null)]);

    const four = layoutRecipe([
      item('minecraft:a'),
      item('minecraft:b'),
      item('minecraft:c'),
      item('minecraft:d'),
    ]);
    expect(four.slice(0, 4)).toEqual([
      { kind: 'item', item: 'minecraft:a' },
      { kind: 'item', item: 'minecraft:b' },
      { kind: 'item', item: 'minecraft:c' },
      { kind: 'item', item: 'minecraft:d' },
    ]);
    expect(four.slice(4).every((c) => c === null)).toBe(true);

    const nine = layoutRecipe(Array.from({ length: 9 }, (_, i) => item(`minecraft:i${i}`)));
    expect(nine).toHaveLength(9);
    expect(nine.every((c) => c !== null)).toBe(true);
  });

  it('keeps tag ingredients as tag cells', () => {
    const grid = layoutRecipe([tag('minecraft:logs')]);
    expect(grid[0]).toEqual({ kind: 'tag', tag: 'minecraft:logs' });
  });

  it('throws for more than 9 ingredients', () => {
    const ten = Array.from({ length: 10 }, (_, i) => item(`minecraft:i${i}`));
    expect(() => layoutRecipe(ten)).toThrow('RecipeBook: recipe has 10 ingredients (max 9)');
    expect(RECIPE_GRID_CELLS).toBe(9);
  });
});

describe('compact', () => {
  it('extracts non-null cells in row-major order', () => {
    const grid: RecipeGridCell[] = [
      { kind: 'item', item: 'minecraft:a' },
      null,
      { kind: 'item', item: 'minecraft:b' },
      null,
      null,
      { kind: 'tag', tag: 'minecraft:logs' },
      null,
      null,
      null,
    ];
    expect(compactGrid(grid)).toEqual([
      { kind: 'item', item: 'minecraft:a' },
      { kind: 'item', item: 'minecraft:b' },
      { kind: 'tag', tag: 'minecraft:logs' },
    ]);
  });

  it('yields an empty list for an all-null grid', () => {
    expect(compactGrid(Array(9).fill(null))).toEqual([]);
  });
});

describe('persistence', () => {
  it('round-trips books', () => {
    const book = unlockRecipes(createDefaultRecipeBook(), ['planks', 'glass']);
    expect(deserializeRecipeBook(serializeRecipeBook(book))).toEqual(book);
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeRecipeBook('x')).toThrow('RecipeBook: expected an object');
    expect(() => deserializeRecipeBook(null)).toThrow('RecipeBook: expected an object');
  });

  it('rejects an unsupported version', () => {
    expect(() => deserializeRecipeBook({ version: 0, known: [] })).toThrow(
      'RecipeBook: unsupported version 0',
    );
  });

  it('rejects a non-array known', () => {
    expect(() => deserializeRecipeBook({ version: 1, known: 'x' })).toThrow(
      'RecipeBook: known must be an array',
    );
  });

  it('rejects empty and duplicate entries', () => {
    expect(() => deserializeRecipeBook({ version: 1, known: ['planks', ''] })).toThrow(
      'RecipeBook: known 1 must be a non-empty string',
    );
    expect(() => deserializeRecipeBook({ version: 1, known: ['planks', 'planks'] })).toThrow(
      'RecipeBook: known contains duplicate key planks',
    );
  });

  it('rejects unknown keys', () => {
    expect(() => deserializeRecipeBook({ version: 1, known: [], extra: true })).toThrow(
      'RecipeBook: unknown key extra',
    );
  });
});
