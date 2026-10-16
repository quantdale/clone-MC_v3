/**
 * Recipe/loot content expansion (220): data-driven crafting/processing/brewing recipes and
 * source-based loot tables over 103/110's systems — the established no-new-architecture pattern
 * (215-219; the runtime consumes these definitions through the existing registries, untouched).
 * Pure and headless-safe.
 *
 * Determinism rules:
 * - Ids are valid namespaced ids (004 rules) whose path does NOT start with the kind's prefix
 *   ('recipe/', 'loot/').
 * - Recipe: `name` optional non-empty; `output` non-empty item id; `count` positive integer
 *   (default 1); `ingredients` non-empty item ids; `category` crafting|smelting|brewing
 *   (default crafting).
 * - Loot: `source` non-empty; `drops` non-empty, each { item (non-empty), weight (positive
 *   integer), count ([min, max] positive integers, min <= max) }.
 * - Per-kind duplicate ids are rejected; the whole payload validates before anything is
 *   accepted. `createRecipeLootExpansion` preserves registration order; lookups are total.
 */
import {
  createResourceId,
  isValidResourceNamespace,
  isValidResourcePath,
  resourceIdEquals,
  resourceIdToString,
  tryParseResourceId,
  type ResourceId,
} from './ResourceId';

export type RecipeCategory = 'crafting' | 'smelting' | 'brewing';

const RECIPE_CATEGORIES: readonly string[] = ['crafting', 'smelting', 'brewing'];

/** One data-driven recipe definition. */
export interface RecipeDefinition {
  readonly id: ResourceId;
  /** Optional non-empty name. */
  readonly name?: string;
  /** Item id. */
  readonly output: string;
  /** Positive integer (default 1). */
  readonly count: number;
  /** Non-empty item ids. */
  readonly ingredients: readonly string[];
  /** Default 'crafting'. */
  readonly category: RecipeCategory;
}

/** One loot drop entry. */
export interface LootDrop {
  readonly item: string;
  /** Positive integer. */
  readonly weight: number;
  /** Positive-integer [min, max] pair with min <= max. */
  readonly count: readonly [number, number];
}

/** One data-driven loot definition. */
export interface LootDefinition {
  readonly id: ResourceId;
  /** Entity/block id. */
  readonly source: string;
  readonly drops: readonly LootDrop[];
}

function toResourceId(value: unknown, what: string): ResourceId {
  if (typeof value === 'string') {
    const parsed = tryParseResourceId(value, 'minecraft');
    if (parsed === null) {
      throw new Error(`RecipeLoot: ${what} must be a valid namespaced id`);
    }
    return parsed;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).namespace === 'string' &&
    typeof (value as Record<string, unknown>).path === 'string'
  ) {
    const r = value as { namespace: string; path: string };
    if (!isValidResourceNamespace(r.namespace) || !isValidResourcePath(r.path)) {
      throw new Error(`RecipeLoot: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`RecipeLoot: ${what} must be a valid namespaced id`);
}

function requireNonEmptyStrings(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`RecipeLoot: ${what} must be non-empty strings`);
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`RecipeLoot: ${what} must be non-empty strings`);
    }
  }
  return [...value];
}

export interface RecipeDefinitionInput {
  readonly id: ResourceId | string;
  readonly name?: string;
  readonly output: string;
  readonly count?: number;
  readonly ingredients: readonly string[];
  readonly category?: RecipeCategory;
}

/** Build a validated recipe definition. */
export function createRecipeDefinition(input: RecipeDefinitionInput): RecipeDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('recipe/')) {
    throw new Error(`RecipeLoot: id path must not start with 'recipe/'`);
  }
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length === 0)) {
    throw new Error('RecipeLoot: name must be a non-empty string when present');
  }
  if (typeof input.output !== 'string' || input.output.length === 0) {
    throw new Error('RecipeLoot: output must be a non-empty string');
  }
  const count = input.count ?? 1;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('RecipeLoot: count must be a positive integer');
  }
  if (input.ingredients.length === 0) {
    throw new Error('RecipeLoot: ingredients must not be empty');
  }
  const category = input.category ?? 'crafting';
  if (!RECIPE_CATEGORIES.includes(category)) {
    throw new Error('RecipeLoot: category must be crafting, smelting, or brewing');
  }
  return {
    id,
    ...(input.name !== undefined ? { name: input.name } : {}),
    output: input.output,
    count,
    ingredients: requireNonEmptyStrings(input.ingredients, 'ingredients'),
    category: category as RecipeCategory,
  };
}

function validateDrop(value: unknown, index: number): LootDrop {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`RecipeLoot: drops ${index} must be an object`);
  }
  const d = value as Record<string, unknown>;
  if (typeof d.item !== 'string' || d.item.length === 0) {
    throw new Error(`RecipeLoot: drops ${index}.item must be a non-empty string`);
  }
  if (!Number.isInteger(d.weight) || (d.weight as number) < 1) {
    throw new Error(`RecipeLoot: drops ${index}.weight must be a positive integer`);
  }
  const count = d.count as unknown;
  if (
    !Array.isArray(count) ||
    count.length !== 2 ||
    !Number.isInteger(count[0]) ||
    !Number.isInteger(count[1]) ||
    (count[0] as number) < 1 ||
    (count[1] as number) < 1 ||
    (count[0] as number) > (count[1] as number)
  ) {
    throw new Error(
      `RecipeLoot: drops ${index}.count must be a positive integer [min, max] pair with min <= max`,
    );
  }
  return { item: d.item, weight: d.weight as number, count: [count[0] as number, count[1] as number] };
}

export interface LootDefinitionInput {
  readonly id: ResourceId | string;
  readonly source: string;
  readonly drops: readonly {
    readonly item: string;
    readonly weight: number;
    readonly count: readonly [number, number];
  }[];
}

/** Build a validated loot definition. */
export function createLootDefinition(input: LootDefinitionInput): LootDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('loot/')) {
    throw new Error(`RecipeLoot: id path must not start with 'loot/'`);
  }
  if (typeof input.source !== 'string' || input.source.length === 0) {
    throw new Error('RecipeLoot: source must be a non-empty string');
  }
  if (input.drops.length === 0) {
    throw new Error('RecipeLoot: drops must not be empty');
  }
  return { id, source: input.source, drops: input.drops.map(validateDrop) };
}

/** The validated recipe/loot expansion (registration order per kind). */
export interface RecipeLootExpansion {
  readonly recipes: readonly RecipeDefinition[];
  readonly loot: readonly LootDefinition[];
}

function rejectDuplicates<T extends { id: ResourceId }>(
  definitions: readonly T[],
  what: string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const definition of definitions) {
    const key = resourceIdToString(definition.id);
    if (seen.has(key)) {
      throw new Error(`RecipeLoot: duplicate ${what} id ${key}`);
    }
    seen.add(key);
    out.push(definition);
  }
  return out;
}

/** Build an expansion; per-kind duplicate ids are rejected wholesale. */
export function createRecipeLootExpansion(input: {
  recipes?: readonly RecipeDefinition[];
  loot?: readonly LootDefinition[];
}): RecipeLootExpansion {
  return {
    recipes: rejectDuplicates(input.recipes ?? [], 'recipe'),
    loot: rejectDuplicates(input.loot ?? [], 'loot'),
  };
}

function resolveId(id: ResourceId | string): ResourceId | null {
  return typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
}

/** Look up a recipe by id; undefined when missing. */
export function recipeById(
  expansion: RecipeLootExpansion,
  id: ResourceId | string,
): RecipeDefinition | undefined {
  const target = resolveId(id);
  if (target === null) return undefined;
  return expansion.recipes.find((r) => resourceIdEquals(r.id, target));
}

/** Look up a loot table by id; undefined when missing. */
export function lootById(
  expansion: RecipeLootExpansion,
  id: ResourceId | string,
): LootDefinition | undefined {
  const target = resolveId(id);
  if (target === null) return undefined;
  return expansion.loot.find((l) => resourceIdEquals(l.id, target));
}

/** The recipes producing an item, in registration order. */
export function recipesByOutput(
  expansion: RecipeLootExpansion,
  itemId: string,
): readonly RecipeDefinition[] {
  return expansion.recipes.filter((r) => r.output === itemId);
}

/** The loot tables for a source, in registration order. */
export function lootForSource(
  expansion: RecipeLootExpansion,
  source: string,
): readonly LootDefinition[] {
  return expansion.loot.filter((l) => l.source === source);
}
