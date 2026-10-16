import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  createLootDefinition,
  createRecipeDefinition,
  createRecipeLootExpansion,
  lootById,
  lootForSource,
  recipeById,
  recipesByOutput,
} from '../../src/data/RecipeLootExpansion';

describe('creation', () => {
  it('builds each kind with explicit fields and defaults', () => {
    const planks = createRecipeDefinition({
      id: 'minecraft:planks_alt',
      name: 'recipe.planks_alt',
      output: 'minecraft:planks',
      count: 4,
      ingredients: ['minecraft:wood'],
      category: 'crafting',
    });
    expect(planks).toMatchObject({ count: 4, category: 'crafting', ingredients: ['minecraft:wood'] });

    const ingot = createRecipeDefinition({
      id: 'minecraft:ingot_alt',
      output: 'minecraft:iron_ingot',
      ingredients: ['minecraft:iron_ore'],
    });
    expect(ingot.count).toBe(1);
    expect(ingot.category).toBe('crafting');
    expect(ingot.name).toBeUndefined();

    const loot = createLootDefinition({
      id: 'minecraft:zombie_alt',
      source: 'minecraft:zombie',
      drops: [{ item: 'minecraft:rotten_flesh', weight: 10, count: [1, 3] }],
    });
    expect(loot).toMatchObject({ source: 'minecraft:zombie', drops: [{ item: 'minecraft:rotten_flesh', weight: 10, count: [1, 3] }] });
  });
});

describe('rejections', () => {
  it('rejects invalid ids and prefixed paths', () => {
    expect(() =>
      createRecipeDefinition({ id: 'Bad Id', output: 'x', ingredients: ['a'] }),
    ).toThrow('RecipeLoot: id must be a valid namespaced id');
    expect(() =>
      createRecipeDefinition({ id: 'minecraft:recipe/planks', output: 'x', ingredients: ['a'] }),
    ).toThrow("RecipeLoot: id path must not start with 'recipe/'");
    expect(() =>
      createLootDefinition({ id: 'minecraft:loot/chest', source: 's', drops: [{ item: 'i', weight: 1, count: [1, 1] }] }),
    ).toThrow("RecipeLoot: id path must not start with 'loot/'");
  });

  it('rejects bad recipe fields', () => {
    expect(() =>
      createRecipeDefinition({ id: 'minecraft:a', name: '', output: 'x', ingredients: ['a'] }),
    ).toThrow('RecipeLoot: name must be a non-empty string when present');
    expect(() => createRecipeDefinition({ id: 'minecraft:a', output: '', ingredients: ['a'] })).toThrow(
      'RecipeLoot: output must be a non-empty string',
    );
    for (const count of [0, 1.5]) {
      expect(() =>
        createRecipeDefinition({ id: 'minecraft:a', output: 'x', count, ingredients: ['a'] }),
      ).toThrow('RecipeLoot: count must be a positive integer');
    }
    expect(() => createRecipeDefinition({ id: 'minecraft:a', output: 'x', ingredients: [] })).toThrow(
      'RecipeLoot: ingredients must not be empty',
    );
    expect(() =>
      createRecipeDefinition({ id: 'minecraft:a', output: 'x', ingredients: [''] }),
    ).toThrow('RecipeLoot: ingredients must be non-empty strings');
    expect(() =>
      createRecipeDefinition({ id: 'minecraft:a', output: 'x', ingredients: ['a'], category: 'enchanting' as never }),
    ).toThrow('RecipeLoot: category must be crafting, smelting, or brewing');
  });

  it('rejects bad loot fields and drops', () => {
    expect(() => createLootDefinition({ id: 'minecraft:a', source: '', drops: [{ item: 'i', weight: 1, count: [1, 1] }] })).toThrow(
      'RecipeLoot: source must be a non-empty string',
    );
    expect(() => createLootDefinition({ id: 'minecraft:a', source: 's', drops: [] })).toThrow(
      'RecipeLoot: drops must not be empty',
    );
    expect(() =>
      createLootDefinition({ id: 'minecraft:a', source: 's', drops: [{ item: '', weight: 1, count: [1, 1] }] }),
    ).toThrow('RecipeLoot: drops 0.item must be a non-empty string');
    for (const weight of [0, 1.5]) {
      expect(() =>
        createLootDefinition({ id: 'minecraft:a', source: 's', drops: [{ item: 'i', weight, count: [1, 1] }] }),
      ).toThrow('RecipeLoot: drops 0.weight must be a positive integer');
    }
    for (const count of [[3, 1], [1, 0], [1, 1.5]] as const) {
      expect(() =>
        createLootDefinition({ id: 'minecraft:a', source: 's', drops: [{ item: 'i', weight: 1, count }] }),
      ).toThrow('RecipeLoot: drops 0.count must be a positive integer [min, max] pair with min <= max');
    }
  });
});

describe('expansion', () => {
  const recipeA = createRecipeDefinition({ id: 'minecraft:a', output: 'minecraft:planks', ingredients: ['x'] });
  const recipeB = createRecipeDefinition({ id: 'minecraft:b', output: 'minecraft:planks', ingredients: ['y'] });
  const loot1 = createLootDefinition({ id: 'minecraft:l1', source: 'minecraft:zombie', drops: [{ item: 'i', weight: 1, count: [1, 1] }] });

  it('groups by kind preserving registration order', () => {
    const expansion = createRecipeLootExpansion({ recipes: [recipeA, recipeB], loot: [loot1] });
    expect(expansion.recipes).toEqual([recipeA, recipeB]);
    expect(expansion.loot).toEqual([loot1]);
  });

  it('looks up by string and ResourceId, undefined when missing', () => {
    const expansion = createRecipeLootExpansion({ recipes: [recipeA], loot: [loot1] });
    expect(recipeById(expansion, 'minecraft:a')).toEqual(recipeA);
    expect(lootById(expansion, createResourceId('minecraft', 'l1'))).toEqual(loot1);
    expect(lootById(expansion, 'minecraft:nope')).toBeUndefined();
  });

  it('filters recipes by output and loot by source', () => {
    const expansion = createRecipeLootExpansion({ recipes: [recipeA, recipeB], loot: [loot1] });
    expect(recipesByOutput(expansion, 'minecraft:planks')).toEqual([recipeA, recipeB]);
    expect(recipesByOutput(expansion, 'minecraft:nope')).toEqual([]);
    expect(lootForSource(expansion, 'minecraft:zombie')).toEqual([loot1]);
    expect(lootForSource(expansion, 'minecraft:cow')).toEqual([]);
  });

  it('rejects per-kind duplicates and supports empty expansions', () => {
    expect(() => createRecipeLootExpansion({ recipes: [recipeA, recipeA] })).toThrow(
      'RecipeLoot: duplicate recipe id minecraft:a',
    );
    expect(() => createRecipeLootExpansion({ loot: [loot1, loot1] })).toThrow(
      'RecipeLoot: duplicate loot id minecraft:l1',
    );
    const empty = createRecipeLootExpansion({});
    expect(empty.recipes).toEqual([]);
    expect(empty.loot).toEqual([]);
  });
});
