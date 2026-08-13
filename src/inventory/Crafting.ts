import { BlockId } from '../world/BlockRegistry';
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
    ingredients: [[BlockId.Wood, 1]],
    output: BlockId.Planks,
    outputCount: 4,
  },
  {
    id: 'glass',
    name: 'Glass',
    description: '4 sand → 1 glass',
    ingredients: [[BlockId.Sand, 4]],
    output: BlockId.Glass,
    outputCount: 1,
  },
  {
    id: 'sticks',
    name: 'Sticks',
    description: '2 planks → 4 sticks',
    ingredients: [[BlockId.Planks, 2]],
    output: BlockId.Stick,
    outputCount: 4,
  },
  {
    id: 'gravel',
    name: 'Gravel',
    description: '2 stone → 1 gravel',
    ingredients: [[BlockId.Stone, 2]],
    output: BlockId.Gravel,
    outputCount: 1,
  },
  {
    id: 'cobblestone',
    name: 'Cobblestone',
    description: '2 stone → 2 cobblestone',
    ingredients: [[BlockId.Stone, 2]],
    output: BlockId.Cobblestone,
    outputCount: 2,
  },
  {
    id: 'bricks',
    name: 'Bricks',
    description: '4 cobblestone → 4 bricks',
    ingredients: [[BlockId.Cobblestone, 4]],
    output: BlockId.Bricks,
    outputCount: 4,
  },
  {
    id: 'wooden_pickaxe',
    name: 'Wooden Pickaxe',
    description: '3 planks + 2 sticks → 1 tool',
    ingredients: [[BlockId.Planks, 3], [BlockId.Stick, 2]],
    output: BlockId.WoodenPickaxe,
    outputCount: 1,
  },
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    description: '3 stone + 2 sticks → 1 tool',
    ingredients: [[BlockId.Stone, 3], [BlockId.Stick, 2]],
    output: BlockId.StonePickaxe,
    outputCount: 1,
  },
  {
    id: 'wooden_axe',
    name: 'Wooden Axe',
    description: '3 planks + 2 sticks → 1 tool',
    ingredients: [[BlockId.Planks, 3], [BlockId.Stick, 2]],
    output: BlockId.WoodenAxe,
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
