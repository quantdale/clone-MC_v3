import { describe, it, expect } from 'vitest';
import {
  createDefaultTypedRecipes,
  MAX_RECIPE_COUNT,
  TypedRecipeRegistry,
  validateTypedRecipe,
  type TypedRecipe,
} from '../../src/inventory/TypedRecipe';

describe('validateTypedRecipe (shaped)', () => {
  it('accepts valid shaped recipes', () => {
    const recipe: TypedRecipe = {
      kind: 'shaped',
      key: 'wooden_pickaxe',
      pattern: ['WWW', '_S_', '_S_'],
      keys: { W: 'minecraft:planks', S: 'minecraft:stick' },
      result: { item: 'minecraft:wooden_pickaxe', count: 1 },
    };
    expect(validateTypedRecipe(recipe)).toEqual(recipe);

    const oneRow: TypedRecipe = {
      kind: 'shaped',
      key: 'planks_row',
      pattern: ['W'],
      keys: { W: 'minecraft:wood' },
      result: { item: 'minecraft:planks', count: 4 },
    };
    expect(validateTypedRecipe(oneRow)).toEqual(oneRow);
  });

  it('rejects malformed shaped recipes naming the field', () => {
    const base = {
      kind: 'shaped',
      key: 'k',
      pattern: ['WWW', '_S_', '_S_'],
      keys: { W: 'minecraft:planks', S: 'minecraft:stick' },
      result: { item: 'minecraft:wooden_pickaxe', count: 1 },
    };
    expect(() => validateTypedRecipe({ ...base, key: '' })).toThrow(/key/i);
    expect(() => validateTypedRecipe({ ...base, pattern: [] })).toThrow(/pattern/i);
    expect(() => validateTypedRecipe({ ...base, pattern: ['W', 'W', 'W', 'W'] })).toThrow(/pattern/i);
    expect(() => validateTypedRecipe({ ...base, pattern: ['WW', 'WWW'] })).toThrow(/uniform width/i);
    expect(() => validateTypedRecipe({ ...base, pattern: ['___'] })).toThrow(/non-empty cell/i);
    expect(() => validateTypedRecipe({ ...base, pattern: ['WXS'] })).toThrow(/not defined in keys/i);
    expect(() => validateTypedRecipe({ ...base, keys: { W: 'minecraft:planks' } })).toThrow(/not defined in keys/i); // S missing
    expect(() => validateTypedRecipe({ ...base, keys: { W: 'minecraft:planks', S: 'minecraft:stick', Q: 'minecraft:coal' } })).toThrow(/does not appear/i);
    expect(() => validateTypedRecipe({ ...base, keys: { W: 'minecraft:planks', S: '' } })).toThrow(/S/i);
    expect(() => validateTypedRecipe({ ...base, keys: { W: 'minecraft:planks', S: 'minecraft:stick', x: 'minecraft:coal' } })).toThrow(/uppercase/i);
    expect(() => validateTypedRecipe({ ...base, result: { item: '', count: 1 } })).toThrow(/result\.item/i);
    expect(() => validateTypedRecipe({ ...base, result: { item: 'minecraft:x', count: 0 } })).toThrow(/count/i);
    expect(() => validateTypedRecipe({ ...base, result: { item: 'minecraft:x', count: MAX_RECIPE_COUNT + 1 } })).toThrow(/count/i);
    expect(() => validateTypedRecipe({ ...base, kind: 'cube' })).toThrow(/kind/i);
    expect(() => validateTypedRecipe(null)).toThrow(/object/i);
  });
});

describe('validateTypedRecipe (shapeless)', () => {
  it('accepts valid shapeless recipes', () => {
    const recipe: TypedRecipe = {
      kind: 'shapeless',
      key: 'glass',
      ingredients: ['minecraft:sand', 'minecraft:sand', 'minecraft:sand', 'minecraft:sand'],
      result: { item: 'minecraft:glass', count: 1 },
    };
    expect(validateTypedRecipe(recipe)).toEqual(recipe);
  });

  it('rejects malformed shapeless recipes', () => {
    const base = { kind: 'shapeless', key: 'k', ingredients: ['minecraft:sand'], result: { item: 'minecraft:glass', count: 1 } };
    expect(() => validateTypedRecipe({ ...base, ingredients: [] })).toThrow(/ingredients/i);
    expect(() => validateTypedRecipe({ ...base, ingredients: Array(10).fill('minecraft:sand') })).toThrow(/ingredients/i);
    expect(() => validateTypedRecipe({ ...base, ingredients: [''] })).toThrow(/ingredients/i);
    expect(() => validateTypedRecipe({ ...base, ingredients: ['minecraft:sand', 3] })).toThrow(/ingredients/i);
  });
});

describe('validateTypedRecipe (processing)', () => {
  it('accepts valid processing recipes', () => {
    const recipe: TypedRecipe = {
      kind: 'processing',
      key: 'smelt_sand',
      input: 'minecraft:sand',
      result: { item: 'minecraft:glass', count: 1 },
      cookingTime: 200,
      experience: 0.1,
    };
    expect(validateTypedRecipe(recipe)).toEqual(recipe);
  });

  it('rejects malformed processing recipes', () => {
    const base = { kind: 'processing', key: 'k', input: 'minecraft:sand', result: { item: 'minecraft:glass', count: 1 }, cookingTime: 200, experience: 0.1 };
    expect(() => validateTypedRecipe({ ...base, input: '' })).toThrow(/input/i);
    expect(() => validateTypedRecipe({ ...base, cookingTime: 0 })).toThrow(/cookingTime/i);
    expect(() => validateTypedRecipe({ ...base, cookingTime: -5 })).toThrow(/cookingTime/i);
    expect(() => validateTypedRecipe({ ...base, cookingTime: 1.5 })).toThrow(/cookingTime/i);
    expect(() => validateTypedRecipe({ ...base, experience: -0.1 })).toThrow(/experience/i);
    expect(() => validateTypedRecipe({ ...base, experience: Number.NaN })).toThrow(/experience/i);
  });
});

describe('TypedRecipeRegistry', () => {
  const shaped: TypedRecipe = {
    kind: 'shaped',
    key: 'wooden_pickaxe',
    pattern: ['WWW', '_S_', '_S_'],
    keys: { W: 'minecraft:planks', S: 'minecraft:stick' },
    result: { item: 'minecraft:wooden_pickaxe', count: 1 },
  };
  const shapeless: TypedRecipe = {
    kind: 'shapeless',
    key: 'glass',
    ingredients: ['minecraft:sand', 'minecraft:sand', 'minecraft:sand', 'minecraft:sand'],
    result: { item: 'minecraft:glass', count: 1 },
  };

  it('registers, gets, checks, sizes, lists, and clears', () => {
    const registry = new TypedRecipeRegistry();
    registry.register(shaped);
    registry.register(shapeless);
    expect(registry.get('wooden_pickaxe')).toEqual(shaped);
    expect(registry.has('wooden_pickaxe')).toBe(true);
    expect(registry.has('missing')).toBe(false);
    expect(registry.size).toBe(2);
    expect(registry.all()).toEqual([shaped, shapeless]);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('wooden_pickaxe')).toBeNull();
  });

  it('rejects duplicates and invalid recipes atomically', () => {
    const registry = new TypedRecipeRegistry();
    registry.register(shaped);

    expect(() => registry.register(shaped)).toThrow(/duplicate/i);
    expect(() => registry.register({ ...shapeless, ingredients: [] })).toThrow(/ingredients/i);
    expect(registry.size).toBe(1);
    expect(registry.has('glass')).toBe(false);
  });
});

describe('createDefaultTypedRecipes', () => {
  it('registers exactly the documented defaults deterministically', () => {
    const a = createDefaultTypedRecipes();
    const b = createDefaultTypedRecipes();
    expect(a.size).toBe(5);
    expect(a.get('wooden_pickaxe')).toEqual({
      kind: 'shaped',
      key: 'wooden_pickaxe',
      pattern: ['WWW', '_S_', '_S_'],
      keys: { W: 'minecraft:planks', S: 'minecraft:stick' },
      result: { item: 'minecraft:wooden_pickaxe', count: 1 },
    });
    expect(a.get('glass')).toEqual({
      kind: 'shapeless',
      key: 'glass',
      ingredients: ['minecraft:sand', 'minecraft:sand', 'minecraft:sand', 'minecraft:sand'],
      result: { item: 'minecraft:glass', count: 1 },
    });
    expect(a.get('smelt_sand')).toEqual({
      kind: 'processing',
      key: 'smelt_sand',
      input: 'minecraft:sand',
      result: { item: 'minecraft:glass', count: 1 },
      cookingTime: 200,
      experience: 0.1,
    });
    expect(a.get('smelt_cobblestone')).toEqual({
      kind: 'processing',
      key: 'smelt_cobblestone',
      input: 'minecraft:cobblestone',
      result: { item: 'minecraft:stone', count: 1 },
      cookingTime: 200,
      experience: 0.1,
    });
    expect(a.get('smelt_raw_iron')).toEqual({
      kind: 'processing',
      key: 'smelt_raw_iron',
      input: 'minecraft:raw_iron',
      result: { item: 'minecraft:iron_ingot', count: 1 },
      cookingTime: 200,
      experience: 0.7,
    });
    expect(b).toEqual(a);
    // Every default re-validates.
    for (const recipe of a.all()) {
      expect(validateTypedRecipe(recipe)).toEqual(recipe);
    }
  });
});
