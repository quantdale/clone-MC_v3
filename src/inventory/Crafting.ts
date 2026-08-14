import { ItemId } from './ItemRegistry';
import { Inventory } from './Inventory';

export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  ingredients: ReadonlyArray<readonly [number, number]>;
  output: number;
  outputCount: number;
}

/**
 * Small, deterministic recipe book for the survival loop. Recipes deliberately
 * use blocks already present in the world plus a small set of stable tool-item
 * ids, keeping the recipe book deterministic without a second item registry.
 */
export const RECIPES: readonly CraftingRecipe[] = [
  {
    id: 'planks',
    name: 'Oak Planks',
    description: '1 log → 4 planks',
    ingredients: [[ItemId.Wood, 1]],
    output: ItemId.Planks,
    outputCount: 4,
  },
  {
    id: 'glass',
    name: 'Glass',
    description: '4 sand → 1 glass',
    ingredients: [[ItemId.Sand, 4]],
    output: ItemId.Glass,
    outputCount: 1,
  },
  {
    id: 'sticks',
    name: 'Sticks',
    description: '2 planks → 4 sticks',
    ingredients: [[ItemId.Planks, 2]],
    output: ItemId.Stick,
    outputCount: 4,
  },
  {
    id: 'gravel',
    name: 'Gravel',
    description: '2 stone → 1 gravel',
    ingredients: [[ItemId.Stone, 2]],
    output: ItemId.Gravel,
    outputCount: 1,
  },
  {
    id: 'cobblestone',
    name: 'Cobblestone',
    description: '2 stone → 2 cobblestone',
    ingredients: [[ItemId.Stone, 2]],
    output: ItemId.Cobblestone,
    outputCount: 2,
  },
  {
    id: 'bricks',
    name: 'Bricks',
    description: '4 cobblestone → 4 bricks',
    ingredients: [[ItemId.Cobblestone, 4]],
    output: ItemId.Bricks,
    outputCount: 4,
  },
  {
    id: 'wooden_pickaxe',
    name: 'Wooden Pickaxe',
    description: '3 planks + 2 sticks → 1 tool',
    ingredients: [[ItemId.Planks, 3], [ItemId.Stick, 2]],
    output: ItemId.WoodenPickaxe,
    outputCount: 1,
  },
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    description: '3 stone + 2 sticks → 1 tool',
    ingredients: [[ItemId.Stone, 3], [ItemId.Stick, 2]],
    output: ItemId.StonePickaxe,
    outputCount: 1,
  },
  {
    id: 'wooden_axe',
    name: 'Wooden Axe',
    description: '3 planks + 2 sticks → 1 tool',
    ingredients: [[ItemId.Planks, 3], [ItemId.Stick, 2]],
    output: ItemId.WoodenAxe,
    outputCount: 1,
  },
];

export class CraftingSystem {
  readonly recipes = RECIPES;

  constructor(private readonly inventory: Inventory) {}

  canCraft(recipe: CraftingRecipe): boolean {
    return this.inventory.hasItems(recipe.ingredients);
  }

  craft(recipeId: string): CraftingRecipe | null {
    const recipe = this.recipes.find((candidate) => candidate.id === recipeId);
    if (!recipe || !this.canCraft(recipe) || !this.inventory.canAddItem(recipe.output, recipe.outputCount)) {
      return null;
    }
    for (const [id, count] of recipe.ingredients) {
      this.inventory.removeItem(id, count);
    }
    this.inventory.addItem(recipe.output, recipe.outputCount);
    return recipe;
  }
}
