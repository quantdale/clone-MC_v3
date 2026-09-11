import { describe, it, expect } from 'vitest';
import {
  createDefaultRecipeBook,
  unlockRecipe,
  unlockRecipes,
  type RecipeBookState,
} from '../../src/inventory/RecipeBook';
import {
  describeRecipeBookSelection,
  findDiscoverableRecipes,
  isRecipeAffordable,
  recipeIngredientHave,
  searchRecipeBook,
} from '../../src/inventory/RecipeBookView';
import { createDefaultRecipeRegistry } from '../../src/inventory/RecipeRegistry';
import { createResourceId } from '../../src/data/ResourceId';
import { CraftingSystem } from '../../src/inventory/Crafting';
import { Inventory } from '../../src/inventory/Inventory';

/**
 * Wiring oracles for the recipe book UI (262): the pure T4 helpers Game
 * delegates to — contracted registry-order search, ingredient coverage
 * (item + tag-no-registry rules), affordability, R2 discovery, selection
 * views with capacity edges, and the R1 unlock-on-craft composition over the
 * real registry, real inventory, and real transactional CraftingSystem.
 */

function stockOf(entries: Array<[number, number]>): (id: number) => number {
  const map = new Map(entries);
  return (id: number) => map.get(id) ?? 0;
}

describe('RecipeBookWiring (262)', () => {
  it('searchRecipeBook returns blank-query results in registry order for out-of-order unlocks', () => {
    const registry = createDefaultRecipeRegistry();
    const book: RecipeBookState = { known: ['sticks', 'planks'] };
    expect(searchRecipeBook(registry, book, '').map((d) => d.key)).toEqual(['planks', 'sticks']);
    expect(searchRecipeBook(registry, book, 'pickaxe').map((d) => d.key)).toEqual([]);
  });

  it('searchRecipeBook filters case-insensitively and skips unknown keys', () => {
    const registry = createDefaultRecipeRegistry();
    const book: RecipeBookState = { known: ['wooden_pickaxe', 'stone_pickaxe', 'not_a_recipe'] };
    expect(searchRecipeBook(registry, book, 'PICKAXE').map((d) => d.key)).toEqual([
      'wooden_pickaxe',
      'stone_pickaxe',
    ]);
  });

  it('recipeIngredientHave reads exact-item stock', () => {
    const registry = createDefaultRecipeRegistry();
    const def = registry.getByKey('sticks')!;
    expect(def.ingredients).toHaveLength(1);
    expect(recipeIngredientHave(registry, def.ingredients[0]!, stockOf([[12, 1]]))).toBe(1);
    expect(recipeIngredientHave(registry, def.ingredients[0]!, stockOf([]))).toBe(0);
  });

  it('recipeIngredientHave is 0 for tag ingredients without a tag registry', () => {
    const registry = createDefaultRecipeRegistry();
    expect(registry.tagRegistry).toBeUndefined();
    expect(
      recipeIngredientHave(
        registry,
        { kind: 'tag', tag: createResourceId('minecraft', 'planks'), count: 2 },
        stockOf([[12, 9]]),
      ),
    ).toBe(0);
  });

  it('isRecipeAffordable ignores output capacity (discovery rule)', () => {
    const registry = createDefaultRecipeRegistry();
    const sticks = registry.getByKey('sticks')!;
    expect(isRecipeAffordable(registry, sticks, stockOf([[12, 2]]))).toBe(true);
    expect(isRecipeAffordable(registry, sticks, stockOf([[12, 1]]))).toBe(false);
  });

  it('findDiscoverableRecipes returns registry-ordered affordable keys', () => {
    const registry = createDefaultRecipeRegistry();
    expect(findDiscoverableRecipes(registry, stockOf([[7, 1]]))).toEqual(['planks']);
    expect(findDiscoverableRecipes(registry, stockOf([[12, 2]]))).toEqual(['sticks']);
    expect(findDiscoverableRecipes(registry, stockOf([]))).toEqual([]);
    expect(findDiscoverableRecipes(registry, stockOf([[7, 1], [12, 2]]))).toEqual(['planks', 'sticks']);
  });

  it('describeRecipeBookSelection is null for null/unknown/unlisted keys', () => {
    const registry = createDefaultRecipeRegistry();
    const book: RecipeBookState = { known: ['sticks'] };
    const get = stockOf([[12, 2]]);
    const accept = () => true;
    const label = () => 'out';
    expect(describeRecipeBookSelection(registry, book, null, get, accept, label)).toBeNull();
    expect(describeRecipeBookSelection(registry, book, 'planks', get, accept, label)).toBeNull();
    expect(describeRecipeBookSelection(registry, book, 'not_a_recipe', get, accept, label)).toBeNull();
  });

  it('describeRecipeBookSelection lays out sticks as 1 filled + 8 empty cells', () => {
    const registry = createDefaultRecipeRegistry();
    const book: RecipeBookState = { known: ['sticks'] };
    // sticks = ONE ingredient (planks x2); the cell carries the INGREDIENT id.
    const view = describeRecipeBookSelection(
      registry,
      book,
      'sticks',
      stockOf([[12, 2]]),
      () => true,
      () => 'Stick ×4',
    )!;
    expect(view.key).toBe('sticks');
    expect(view.name).toBe('Sticks');
    expect(view.outputLabel).toBe('Stick ×4');
    expect(view.cells).toHaveLength(9);
    expect(view.cells.filter((c) => c !== null)).toHaveLength(1);
    expect(view.cells[0]).toEqual({ label: 'minecraft:planks', need: 2, have: 2, missing: false });
    expect(view.missingCount).toBe(0);
    expect(view.canCraft).toBe(true);
  });

  it('describeRecipeBookSelection reports the ingredient label and have counts', () => {
    const registry = createDefaultRecipeRegistry();
    const book: RecipeBookState = { known: ['sticks'] };
    const view = describeRecipeBookSelection(
      registry,
      book,
      'sticks',
      stockOf([[12, 1]]),
      () => true,
      () => 'Stick ×4',
    )!;
    expect(view.cells[0]).toEqual({ label: 'minecraft:planks', need: 2, have: 1, missing: true });
  });

  it('describeRecipeBookSelection gates canCraft on output capacity', () => {
    const registry = createDefaultRecipeRegistry();
    const book: RecipeBookState = { known: ['sticks'] };
    const get = stockOf([[12, 2]]);
    const label = () => 'Stick ×4';
    expect(
      describeRecipeBookSelection(registry, book, 'sticks', get, () => true, label)!.canCraft,
    ).toBe(true);
    const blocked = describeRecipeBookSelection(registry, book, 'sticks', get, () => false, label)!;
    expect(blocked.canCraft).toBe(false);
    expect(blocked.missingCount).toBe(0);
  });

  it('R1 composition: successful craft unlocks, failed craft unlocks nothing', () => {
    const registry = createDefaultRecipeRegistry();
    const inventory = new Inventory();
    const system = new CraftingSystem(inventory, registry);
    let book = createDefaultRecipeBook();

    inventory.addItem(12, 1);
    expect(system.craft('sticks')).toBeNull();
    expect(book.known).toEqual([]);

    inventory.addItem(12, 1);
    const crafted = system.craft('sticks');
    expect(crafted?.id).toBe('sticks');
    book = unlockRecipe(book, crafted!.id);
    expect(book.known).toEqual(['sticks']);

    // Re-unlock is an identity no-op (no duplicate keys, no rewrite).
    expect(unlockRecipe(book, 'sticks')).toBe(book);
  });

  it('R2 composition: discovery persists only when the set grows (reopen identity)', () => {
    const registry = createDefaultRecipeRegistry();
    const get = stockOf([[7, 1]]);
    let book = createDefaultRecipeBook();
    const grown = unlockRecipes(book, findDiscoverableRecipes(registry, get));
    expect(grown.known).toEqual(['planks']);
    expect(grown).not.toBe(book);
    book = grown;
    // Reopening with an unchanged inventory performs no write.
    expect(unlockRecipes(book, findDiscoverableRecipes(registry, get))).toBe(book);
  });
});
