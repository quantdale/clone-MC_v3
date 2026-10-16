/**
 * Typed recipe definitions (103). `TypedRecipe` covers the full recipe vocabulary with three
 * kinds: `shaped` (1-3x1-3 pattern grid over named item keys), `shapeless` (1-9 unordered
 * ingredients), and `processing` (furnace-style single input -> result with cooking time and
 * experience). `TypedRecipeRegistry` stores only validated recipes with atomic rejection
 * (003 pattern). Item references are resource-id strings following the `ItemRegistry`
 * vocabulary (e.g. `minecraft:planks`). 104/105 consume shaped/shapeless for crafting grids;
 * 109/110 consume processing for the furnace. The 010 one-click recipe registry is untouched.
 */

/** The three recipe kinds. */
export type RecipeKind = 'shaped' | 'shapeless' | 'processing';

/** Maximum result count for any recipe (standard stack cap). */
export const MAX_RECIPE_COUNT = 64;

/** A recipe result: an item resource id and a positive count. */
export interface RecipeResult {
  item: string;
  count: number;
}

/** A shaped (grid) recipe: pattern rows over named keys. */
export interface ShapedRecipe {
  kind: 'shaped';
  key: string;
  /** 1-3 rows, each 1-3 chars, uniform width; '_' = empty cell. */
  pattern: string[];
  /** Uppercase A-Z pattern chars -> item resource ids. */
  keys: Record<string, string>;
  result: RecipeResult;
}

/** A shapeless recipe: 1-9 unordered ingredients. */
export interface ShapelessRecipe {
  kind: 'shapeless';
  key: string;
  ingredients: string[];
  result: RecipeResult;
}

/** A processing (smelting) recipe: single input -> result with cooking time and experience. */
export interface ProcessingRecipe {
  kind: 'processing';
  key: string;
  input: string;
  result: RecipeResult;
  /** Cooking time in ticks (positive integer). */
  cookingTime: number;
  /** Experience granted (finite, >= 0). */
  experience: number;
}

/** Any typed recipe. */
export type TypedRecipe = ShapedRecipe | ShapelessRecipe | ProcessingRecipe;

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateResult(r: unknown, path: string): RecipeResult {
  if (typeof r !== 'object' || r === null) {
    throw new Error(`TypedRecipe: ${path} must be an object`);
  }
  const res = r as Record<string, unknown>;
  if (typeof res.item !== 'string' || res.item.length === 0) {
    throw new Error(`TypedRecipe: ${path}.item must be a non-empty string`);
  }
  if (!isPositiveInteger(res.count) || (res.count as number) > MAX_RECIPE_COUNT) {
    throw new Error(`TypedRecipe: ${path}.count must be an integer in [1, ${MAX_RECIPE_COUNT}], got ${String(res.count)}`);
  }
  return { item: res.item, count: res.count as number };
}

/** Validate an unknown value as a typed recipe; throws descriptively otherwise. */
export function validateTypedRecipe(input: unknown): TypedRecipe {
  if (typeof input !== 'object' || input === null) {
    throw new Error('TypedRecipe: recipe must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('TypedRecipe: key must be a non-empty string');
  }
  switch (r.kind) {
    case 'shaped': {
      if (!Array.isArray(r.pattern) || r.pattern.length < 1 || r.pattern.length > 3) {
        throw new Error('TypedRecipe: shaped.pattern must have 1-3 rows');
      }
      const width = (r.pattern[0] as string).length;
      if (width < 1 || width > 3) {
        throw new Error(`TypedRecipe: shaped.pattern rows must be 1-3 chars, got ${width}`);
      }
      let nonEmpty = false;
      for (const row of r.pattern) {
        if (typeof row !== 'string' || row.length !== width) {
          throw new Error('TypedRecipe: shaped.pattern rows must be strings of uniform width');
        }
        for (const ch of row) {
          if (ch !== '_') {
            nonEmpty = true;
          }
        }
      }
      if (!nonEmpty) {
        throw new Error('TypedRecipe: shaped.pattern must contain at least one non-empty cell');
      }
      if (typeof r.keys !== 'object' || r.keys === null || Array.isArray(r.keys)) {
        throw new Error('TypedRecipe: shaped.keys must be an object');
      }
      const keys = r.keys as Record<string, unknown>;
      for (const [ch, value] of Object.entries(keys)) {
        if (!/^[A-Z]$/.test(ch)) {
          throw new Error(`TypedRecipe: shaped.keys chars must be uppercase A-Z, got ${ch}`);
        }
        if (typeof value !== 'string' || value.length === 0) {
          throw new Error(`TypedRecipe: shaped.keys.${ch} must be a non-empty string`);
        }
        if (!r.pattern.some((row) => row.includes(ch))) {
          throw new Error(`TypedRecipe: shaped.keys char ${ch} does not appear in the pattern`);
        }
      }
      for (const row of r.pattern) {
        for (const ch of row) {
          if (ch !== '_' && !(ch in keys)) {
            throw new Error(`TypedRecipe: shaped.pattern char ${ch} is not defined in keys`);
          }
        }
      }
      return {
        kind: 'shaped',
        key: r.key,
        pattern: r.pattern as string[],
        keys: r.keys as Record<string, string>,
        result: validateResult(r.result, 'shaped.result'),
      };
    }
    case 'shapeless': {
      if (!Array.isArray(r.ingredients) || r.ingredients.length < 1 || r.ingredients.length > 9) {
        throw new Error('TypedRecipe: shapeless.ingredients must have 1-9 entries');
      }
      for (const ing of r.ingredients) {
        if (typeof ing !== 'string' || ing.length === 0) {
          throw new Error('TypedRecipe: shapeless.ingredients entries must be non-empty strings');
        }
      }
      return {
        kind: 'shapeless',
        key: r.key,
        ingredients: r.ingredients as string[],
        result: validateResult(r.result, 'shapeless.result'),
      };
    }
    case 'processing': {
      if (typeof r.input !== 'string' || r.input.length === 0) {
        throw new Error('TypedRecipe: processing.input must be a non-empty string');
      }
      if (!isPositiveInteger(r.cookingTime)) {
        throw new Error(`TypedRecipe: processing.cookingTime must be a positive integer, got ${String(r.cookingTime)}`);
      }
      if (!isFiniteNumber(r.experience) || r.experience < 0) {
        throw new Error(`TypedRecipe: processing.experience must be a finite number >= 0, got ${String(r.experience)}`);
      }
      return {
        kind: 'processing',
        key: r.key,
        input: r.input,
        result: validateResult(r.result, 'processing.result'),
        cookingTime: r.cookingTime as number,
        experience: r.experience as number,
      };
    }
    default:
      throw new Error(`TypedRecipe: unknown recipe kind: ${String(r.kind)}`);
  }
}

/** Registry of validated typed recipes (duplicate/invalid rejection, no partial state). */
export class TypedRecipeRegistry {
  private readonly recipes = new Map<string, TypedRecipe>();

  register(recipe: TypedRecipe): void {
    const validated = validateTypedRecipe(recipe);
    if (this.recipes.has(validated.key)) {
      throw new Error(`TypedRecipeRegistry: duplicate key: ${validated.key}`);
    }
    this.recipes.set(validated.key, validated);
  }

  get(key: string): TypedRecipe | null {
    return this.recipes.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.recipes.has(key);
  }

  get size(): number {
    return this.recipes.size;
  }

  /** All validated recipes in registration order (103 extension). */
  all(): TypedRecipe[] {
    return [...this.recipes.values()];
  }

  clear(): void {
    this.recipes.clear();
  }
}

/**
 * Documented default typed recipes: wooden pickaxe (shaped 3x3), glass (shapeless 4x sand),
 * smelt_sand and smelt_cobblestone (processing). Item ids follow `ItemRegistry` vocabulary.
 */
export function createDefaultTypedRecipes(): TypedRecipeRegistry {
  const registry = new TypedRecipeRegistry();
  registry.register({
    kind: 'shaped',
    key: 'wooden_pickaxe',
    pattern: ['WWW', '_S_', '_S_'],
    keys: { W: 'minecraft:planks', S: 'minecraft:stick' },
    result: { item: 'minecraft:wooden_pickaxe', count: 1 },
  });
  registry.register({
    kind: 'shapeless',
    key: 'glass',
    ingredients: ['minecraft:sand', 'minecraft:sand', 'minecraft:sand', 'minecraft:sand'],
    result: { item: 'minecraft:glass', count: 1 },
  });
  registry.register({
    kind: 'processing',
    key: 'smelt_sand',
    input: 'minecraft:sand',
    result: { item: 'minecraft:glass', count: 1 },
    cookingTime: 200,
    experience: 0.1,
  });
  registry.register({
    kind: 'processing',
    key: 'smelt_cobblestone',
    input: 'minecraft:cobblestone',
    result: { item: 'minecraft:stone', count: 1 },
    cookingTime: 200,
    experience: 0.1,
  });
  registry.register({
    kind: 'processing',
    key: 'smelt_raw_iron',
    input: 'minecraft:raw_iron',
    result: { item: 'minecraft:iron_ingot', count: 1 },
    cookingTime: 200,
    experience: 0.7,
  });
  return registry;
}
