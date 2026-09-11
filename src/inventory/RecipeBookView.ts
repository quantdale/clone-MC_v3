import { resourceIdToString } from '../data/ResourceId';
import { layoutRecipe, searchRecipes } from './RecipeBook';
import type { RecipeBookState } from './RecipeBook';
import type { RecipeDefinition, RecipeIngredient, RecipeRegistry } from './RecipeRegistry';

/**
 * Recipe book selection views and discovery (262): pure, headless-safe
 * helpers over the 204 known set and the 103 registry. `Game` delegates its
 * selection detail and R2 craftable-discovery to these functions; the panel
 * renders the views without owning any book state.
 *
 * Ingredient coverage reuses `CraftingSystem` resolution semantics exactly:
 * exact-item ingredients read the stock count; tag ingredients resolve to the
 * first registry tag member (deterministic order) with covering stock, else
 * the maximum member stock (display-only — the craft itself stays
 * transactional, so display drift can never corrupt the inventory).
 */

/** One laid-out ingredient cell for the selection detail view. */
export interface RecipeBookCellView {
  label: string;
  need: number;
  have: number;
  missing: boolean;
}

/** The selection detail the panel renders. */
export interface RecipeBookSelectionView {
  key: string;
  name: string;
  description: string;
  outputLabel: string;
  /** Exactly 9 cells in `layoutRecipe` order; null = empty grid cell. */
  cells: readonly (RecipeBookCellView | null)[];
  /** Number of ingredients not fully covered by the inventory. */
  missingCount: number;
  /** Affordable AND output capacity available (matches `CraftingSystem.craft`). */
  canCraft: boolean;
}

/** Inventory coverage for one ingredient (CraftingSystem resolution). */
export function recipeIngredientHave(
  registry: RecipeRegistry,
  ingredient: RecipeIngredient,
  getItemCount: (numericItemId: number) => number,
): number {
  if (ingredient.kind === 'item') {
    return getItemCount(registry.itemRegistry.getByResourceId(ingredient.item).id);
  }
  const tags = registry.tagRegistry;
  if (tags === undefined || !tags.isFinalized) return 0;
  let best = 0;
  for (const member of tags.membersOf(ingredient.tag)) {
    const stock = getItemCount(registry.itemRegistry.getByResourceId(member).id);
    if (stock >= ingredient.count) return stock;
    if (stock > best) best = stock;
  }
  return best;
}

/** Whether every ingredient is covered (output capacity NOT consulted). */
export function isRecipeAffordable(
  registry: RecipeRegistry,
  def: RecipeDefinition,
  getItemCount: (numericItemId: number) => number,
): boolean {
  return def.ingredients.every(
    (ingredient) => recipeIngredientHave(registry, ingredient, getItemCount) >= ingredient.count,
  );
}

/**
 * Known-recipe search enforcing the 204 registry-order contract: the
 * `searchRecipes` filter is delegated wholesale, then the result is ordered
 * by registry index. (The helper iterates the known set, which coincides
 * with registry order only when unlock order matches it; the sort makes the
 * contracted order hold for out-of-order R1 unlocks too.)
 */
export function searchRecipeBook(
  registry: RecipeRegistry,
  book: RecipeBookState,
  query: string,
): RecipeDefinition[] {
  const order = new Map<string, number>();
  registry.entries().forEach((def, index) => order.set(def.key, index));
  return searchRecipes(registry, book, query)
    .slice()
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/**
 * R2 craftable-discovery (262): registry-ordered keys of every recipe
 * currently affordable with the player's inventory. Output capacity is
 * ignored for discovery (the craft itself still enforces it); the caller
 * unlocks the result via `unlockRecipes` and persists when it grows.
 */
export function findDiscoverableRecipes(
  registry: RecipeRegistry,
  getItemCount: (numericItemId: number) => number,
): string[] {
  const keys: string[] = [];
  for (const def of registry.entries()) {
    if (isRecipeAffordable(registry, def, getItemCount)) keys.push(def.key);
  }
  return keys;
}

/**
 * Build the selection view for `selectedKey`: null for a null key, an
 * unknown key, or a key the book does not know (stale-button/registry-drift
 * guard — never throws). `layoutRecipe` overflow propagates (unreachable
 * with the current catalog; the caller surfaces it as a status message).
 */
export function describeRecipeBookSelection(
  registry: RecipeRegistry,
  book: RecipeBookState,
  selectedKey: string | null,
  getItemCount: (numericItemId: number) => number,
  canAcceptOutput: (def: RecipeDefinition) => boolean,
  outputLabelFor: (def: RecipeDefinition) => string,
): RecipeBookSelectionView | null {
  if (selectedKey === null || !book.known.includes(selectedKey)) return null;
  const def = registry.getByKey(selectedKey);
  if (def === undefined) return null;
  // layoutRecipe compacts row-major: laid[i] corresponds to ingredients[i].
  const cells = layoutRecipe(def.ingredients).map((cell, i) => {
    if (cell === null) return null;
    const ingredient = def.ingredients[i]!;
    const label = resourceIdToString(ingredient.kind === 'item' ? ingredient.item : ingredient.tag);
    const have = recipeIngredientHave(registry, ingredient, getItemCount);
    return { label, need: ingredient.count, have, missing: have < ingredient.count };
  });
  const missingCount = cells.filter((cell) => cell !== null && cell.missing).length;
  return {
    key: def.key,
    name: def.name,
    description: def.description,
    outputLabel: outputLabelFor(def),
    cells,
    missingCount,
    canCraft: missingCount === 0 && canAcceptOutput(def),
  };
}
