import { type ResourceId } from '../data/ResourceId';
import { Inventory } from './Inventory';
import {
  type RecipeDefinition,
  type RecipeIngredient,
  type RecipeOutput,
  RecipeRegistry,
  createDefaultRecipeRegistry,
} from './RecipeRegistry';

/**
 * Public recipe projection consumed by the UI and tests. It keeps the pre-010
 * shape (string id, numeric ingredient pairs, numeric output) so the crafting panel
 * and game wiring are unchanged; it is derived from the 010 ResourceId-based
 * registry rather than stored separately.
 */
export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  ingredients: ReadonlyArray<readonly [number, number]>;
  output: number;
  outputCount: number;
}

/**
 * One-click crafting system backed by the 010 recipe registry.
 *
 * Current behavior is preserved: a recipe is craftable only when every ingredient
 * is affordable and the output fits, ingredients are removed only after both checks
 * pass (transactional), and the output is then inserted. Recipe identity is now a
 * ResourceId behind the registry; the UI continues to use the legacy short key.
 */
export class CraftingSystem {
  private readonly inventory: Inventory;
  private readonly registry: RecipeRegistry;

  constructor(inventory: Inventory, registry: RecipeRegistry = createDefaultRecipeRegistry()) {
    this.inventory = inventory;
    this.registry = registry;
  }

  /** Recipes projected into the legacy shape for the crafting panel. */
  get recipes(): CraftingRecipe[] {
    return this.registry.toLegacyRecipes();
  }

  /** Whether the given legacy recipe can be crafted right now. */
  canCraft(recipe: CraftingRecipe): boolean {
    const def = this.registry.getByKey(recipe.id);
    if (def === undefined) return false;
    return this.canCraftDefinition(def) && this.canAddOutput(def.output);
  }

  /**
   * Craft by legacy key. Returns the legacy recipe projection on success, or null
   * when the recipe is unknown, unaffordable, or lacks output capacity. On failure
   * the inventory is left unchanged.
   */
  craft(recipeId: string): CraftingRecipe | null {
    const def = this.registry.getByKey(recipeId);
    if (def === undefined) return null;
    if (!this.canCraftDefinition(def) || !this.canAddOutput(def.output)) return null;

    for (const ingredient of def.ingredients) {
      const target = this.resolveIngredientItem(ingredient);
      if (target === undefined) return null;
      this.inventory.removeItem(target, ingredient.count);
    }
    this.inventory.addItem(this.numericItemId(def.output.item), def.output.count);
    return this.registry.legacyRecipe(def.key) ?? null;
  }

  private canCraftDefinition(def: RecipeDefinition): boolean {
    return def.ingredients.every((ingredient) => {
      if (ingredient.kind === 'item') {
        return this.inventory.getItemCount(this.numericItemId(ingredient.item)) >= ingredient.count;
      }
      return this.firstTagMemberWith(ingredient) !== undefined;
    });
  }

  private canAddOutput(output: RecipeOutput): boolean {
    return this.inventory.canAddItem(this.numericItemId(output.item), output.count);
  }

  /** Resolve an exact-item ingredient to its numeric id, or the first tag member with enough stock. */
  private resolveIngredientItem(ingredient: RecipeIngredient): number | undefined {
    if (ingredient.kind === 'item') {
      return this.numericItemId(ingredient.item);
    }
    return this.firstTagMemberWith(ingredient);
  }

  /** First tag member (deterministic order) whose inventory stock covers the quantity, or undefined. */
  private firstTagMemberWith(ingredient: Extract<RecipeIngredient, { kind: 'tag' }>): number | undefined {
    const tags = this.registry.tagRegistry;
    if (tags === undefined || !tags.isFinalized) return undefined;
    for (const member of tags.membersOf(ingredient.tag)) {
      const id = this.registry.itemRegistry.getByResourceId(member).id;
      if (this.inventory.getItemCount(id) >= ingredient.count) {
        return id;
      }
    }
    return undefined;
  }

  private numericItemId(rid: ResourceId): number {
    return this.registry.itemRegistry.getByResourceId(rid).id;
  }
}
