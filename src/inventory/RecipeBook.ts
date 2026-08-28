/**
 * Recipe book (204): the player recipe knowledge layer over 103's registry. Immutable
 * known-recipes state (unlock order), search/filter restricted to known recipes, a 3x3
 * crafting-grid layout helper with its inverse, and versioned persistence. Pure and
 * headless-safe: the registry is injected and never modified; inputs are never mutated.
 *
 * Determinism rules:
 * - `known` holds unique non-empty keys in unlock order; `unlockRecipe`/`unlockRecipes` return
 *   the IDENTICAL state when nothing changes.
 * - `searchRecipes` returns known recipes in REGISTRY order; a blank query returns all known; a
 *   non-blank query matches case-insensitively against the recipe key, name, or output item id;
 *   unknown known keys are skipped.
 * - `layoutRecipe` fills the 9-cell grid row-major from the top-left (compacted); more than 9
 *   ingredients throws; `compactGrid` is the exact inverse.
 * - Deserialization validates the whole payload before accepting anything.
 */
import { resourceIdToString } from '../data/ResourceId';
import type { RecipeDefinition, RecipeIngredient, RecipeRegistry } from './RecipeRegistry';

export const RECIPE_GRID_CELLS = 9;

/** The known-recipes state (keys in unlock order). */
export interface RecipeBookState {
  readonly known: readonly string[];
}

/** A fresh, empty book. */
export function createDefaultRecipeBook(): RecipeBookState {
  return { known: [] };
}

/** Unlock one recipe: appends a new key; identity no-op for an empty or already-known key. */
export function unlockRecipe(state: RecipeBookState, key: string): RecipeBookState {
  if (key.length === 0 || state.known.includes(key)) return state;
  return { known: [...state.known, key] };
}

/** Unlock several recipes: appends unknown non-empty keys in order; identity when nothing new. */
export function unlockRecipes(state: RecipeBookState, keys: readonly string[]): RecipeBookState {
  let next = state;
  for (const key of keys) {
    const updated = unlockRecipe(next, key);
    if (updated !== next) next = updated;
  }
  return next;
}

/** Whether the player knows a recipe key. */
export function hasRecipe(state: RecipeBookState, key: string): boolean {
  return state.known.includes(key);
}

/**
 * Search the KNOWN recipes: blank query -> all known in registry order; otherwise a
 * case-insensitive substring match against the recipe key, name, or output item id. Unknown
 * known keys are skipped silently.
 */
export function searchRecipes(
  registry: RecipeRegistry,
  state: RecipeBookState,
  query: string,
): RecipeDefinition[] {
  const q = query.trim().toLowerCase();
  const results: RecipeDefinition[] = [];
  for (const key of state.known) {
    const def = registry.getByKey(key);
    if (def === undefined) continue;
    if (q.length === 0) {
      results.push(def);
      continue;
    }
    if (
      def.key.includes(q) ||
      def.name.toLowerCase().includes(q) ||
      resourceIdToString(def.output.item).includes(q)
    ) {
      results.push(def);
    }
  }
  return results;
}

/** A laid-out crafting-grid cell. */
export type RecipeGridCell =
  | { kind: 'item'; item: string }
  | { kind: 'tag'; tag: string }
  | null;

function toCell(ingredient: RecipeIngredient): RecipeGridCell {
  if (ingredient.kind === 'item') {
    return { kind: 'item', item: resourceIdToString(ingredient.item) };
  }
  return { kind: 'tag', tag: resourceIdToString(ingredient.tag) };
}

/**
 * Lay a recipe's ingredients into the 9-cell 3x3 grid, row-major from the top-left (compacted).
 * More than 9 ingredients throws; remaining cells are null. Tag ingredients keep their tag id
 * (the wiring resolves tags to concrete items).
 */
export function layoutRecipe(ingredients: readonly RecipeIngredient[]): RecipeGridCell[] {
  if (ingredients.length > RECIPE_GRID_CELLS) {
    throw new Error(
      `RecipeBook: recipe has ${ingredients.length} ingredients (max ${RECIPE_GRID_CELLS})`,
    );
  }
  const grid: RecipeGridCell[] = [];
  for (let i = 0; i < RECIPE_GRID_CELLS; i += 1) {
    grid.push(i < ingredients.length ? toCell(ingredients[i]!) : null);
  }
  return grid;
}

/** The inverse of `layoutRecipe`: the non-null cells in row-major order. */
export function compactGrid(grid: readonly RecipeGridCell[]): RecipeGridCell[] {
  return grid.filter((cell): cell is Exclude<RecipeGridCell, null> => cell !== null);
}

/** Versioned serialized recipe book. */
export interface SerializedRecipeBook {
  version: 1;
  known: string[];
}

/** Serialize the book (identity-shaped; validation happens on deserialize). */
export function serializeRecipeBook(state: RecipeBookState): SerializedRecipeBook {
  return { version: 1, known: [...state.known] };
}

/**
 * Validate and restore a serialized book. The whole payload is validated first: object shape,
 * version, a string array of unique non-empty keys, and the exact key set. Any violation throws
 * a descriptive `Error`; nothing is partially accepted.
 */
export function deserializeRecipeBook(input: unknown): RecipeBookState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('RecipeBook: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`RecipeBook: unsupported version ${String(r.version)}`);
  }
  if (!Array.isArray(r.known)) {
    throw new Error('RecipeBook: known must be an array');
  }
  const seen = new Set<string>();
  for (let i = 0; i < r.known.length; i += 1) {
    const key = r.known[i];
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`RecipeBook: known ${i} must be a non-empty string`);
    }
    if (seen.has(key)) {
      throw new Error(`RecipeBook: known contains duplicate key ${key}`);
    }
    seen.add(key);
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'known') {
      throw new Error(`RecipeBook: unknown key ${key}`);
    }
  }
  return { known: [...(r.known as string[])] };
}
