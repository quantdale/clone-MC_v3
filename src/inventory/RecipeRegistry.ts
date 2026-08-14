/**
 * Registry-backed recipe definition model (change 010).
 *
 * Recipes are immutable definitions identified by a namespaced ResourceId. Each
 * ingredient references either one exact registered item or one finalized
 * item-domain tag, plus a positive integer quantity. Output identifies a
 * registered item, a positive quantity, and optional stack component data. The
 * recipe registry validates every item/tag/output reference and finalizes to an
 * immutable, constant-time-lookup table.
 *
 * This change replaces numeric/plain-string recipe identity with ResourceId-based
 * definitions while preserving current one-click crafting behavior. Grid position,
 * file loading, furnace processing, and recipe-book UX remain out of scope.
 */

import { type ResourceId, createResourceId, resourceIdToString } from '../data/ResourceId';
import { Registry } from '../data/Registry';
import { type ItemTypeRegistry, createDefaultItemRegistry, ItemId } from './ItemRegistry';
import type { TagRegistry } from '../data/TagRegistry';
import type { StackComponentMap } from './StackDataComponents';
import type { CraftingRecipe } from './Crafting';

/** An ingredient referencing one exact registered item plus a positive quantity. */
export interface ExactItemIngredient {
  readonly kind: 'item';
  readonly item: ResourceId;
  readonly count: number;
}

/** An ingredient referencing one finalized item-domain tag plus a positive quantity. */
export interface TagIngredient {
  readonly kind: 'tag';
  readonly tag: ResourceId;
  readonly count: number;
}

/** Either ingredient variant carries a positive integer quantity. */
export type RecipeIngredient = ExactItemIngredient | TagIngredient;

/** Recipe output: a registered item, a positive quantity, and optional component data. */
export interface RecipeOutput {
  readonly item: ResourceId;
  readonly count: number;
  /** Validated by the stack-component system; absent for current recipes. */
  readonly components?: StackComponentMap;
}

/** Immutable registered recipe definition identified by ResourceId. */
export interface RecipeDefinition {
  readonly id: ResourceId;
  /** Legacy short key used by UI/tests (e.g. 'planks'). */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly ingredients: readonly RecipeIngredient[];
  readonly output: RecipeOutput;
}

/** Failure category for recipe definition validation. */
export type RecipeErrorReason =
  | 'DUPLICATE_ID'
  | 'MISSING_ITEM'
  | 'MISSING_TAG'
  | 'TAG_NOT_FINALIZED'
  | 'INVALID_QUANTITY'
  | 'INVALID_OUTPUT';

/** Thrown when a recipe definition fails validation before finalization. */
export class RecipeError extends Error {
  readonly reason: RecipeErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: RecipeErrorReason, identifier: string | undefined, detail: string) {
    super(`Recipe error (${reason}): ${detail}`);
    this.name = 'RecipeError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

function isPositiveInteger(value: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Recursively freeze a definition so the registry's finalized state rejects
 * ordinary mutation of the identity, ingredients, and output. The generic registry
 * core freezes the entry wrapper but not the stored value, so we freeze the value
 * here to honor the immutability requirement.
 */
function freezeDefinition(def: RecipeDefinition): RecipeDefinition {
  for (const ingredient of def.ingredients) Object.freeze(ingredient);
  Object.freeze(def.ingredients);
  Object.freeze(def.output);
  Object.freeze(def);
  return def;
}

/**
 * Recipe registry built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, resolvable item/tag/output
 * references, positive integer quantities, output stack bounds, valid component
 * data) and then finalizes, making definitions immutable. A failed construction
 * throws before any recipe becomes craftable.
 */
export class RecipeRegistry {
  private readonly inner: Registry<RecipeDefinition>;
  private readonly items: ItemTypeRegistry;
  private readonly tags: TagRegistry | undefined;
  private readonly byKey = new Map<string, RecipeDefinition>();

  constructor(items: ItemTypeRegistry, tags: TagRegistry | undefined, definitions: readonly RecipeDefinition[]) {
    this.items = items;
    this.tags = tags;
    this.inner = new Registry<RecipeDefinition>();

    // The tag registry is owned and finalized by its caller. A referenced tag that
    // is not yet finalized is rejected here rather than finalized on the recipe
    // registry's behalf, preserving the tag registry's atomic finalization contract.
    for (const def of definitions) {
      this.validate(def);
      if (this.inner.has(def.id) || this.byKey.has(def.key)) {
        throw new RecipeError('DUPLICATE_ID', resourceIdToString(def.id), 'recipe id or key already registered');
      }
      this.inner.register(def.id, freezeDefinition(def));
      this.byKey.set(def.key, def);
    }
    this.inner.finalize();
  }

  /** Item registry used by this recipe registry for reference resolution. */
  get itemRegistry(): ItemTypeRegistry {
    return this.items;
  }

  /** Tag registry backing tag ingredients, if any. */
  get tagRegistry(): TagRegistry | undefined {
    return this.tags;
  }

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.inner.finalized;
  }

  /** Number of registered recipes. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): RecipeDefinition {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): RecipeDefinition | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether a recipe ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** Lookup a recipe by its legacy short key. */
  getByKey(key: string): RecipeDefinition | undefined {
    return this.byKey.get(key);
  }

  /** All recipes in ascending registration order (deterministic). */
  entries(): readonly RecipeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }

  /** Project one recipe into the legacy CraftingRecipe shape for UI compatibility. */
  legacyRecipe(key: string): CraftingRecipe | undefined {
    const def = this.byKey.get(key);
    return def === undefined ? undefined : this.toLegacy(def);
  }

  /** Project the registry into legacy CraftingRecipe shapes for UI compatibility. */
  toLegacyRecipes(): CraftingRecipe[] {
    return this.entries().map((def) => this.toLegacy(def));
  }

  private toLegacy(def: RecipeDefinition): CraftingRecipe {
    const ingredients: Array<readonly [number, number]> = [];
    for (const ing of def.ingredients) {
      if (ing.kind === 'item') {
        ingredients.push([this.items.getByResourceId(ing.item).id, ing.count]);
      }
      // Tag ingredients have no single numeric identity; projected out of the
      // legacy view (no current recipe uses tag ingredients).
    }
    return {
      id: def.key,
      name: def.name,
      description: def.description,
      ingredients,
      output: this.items.getByResourceId(def.output.item).id,
      outputCount: def.output.count,
    };
  }

  private validate(def: RecipeDefinition): void {
    for (const ing of def.ingredients) {
      if (!isPositiveInteger(ing.count)) {
        throw new RecipeError('INVALID_QUANTITY', resourceIdToString(def.id), 'ingredient count must be a positive integer');
      }
      if (ing.kind === 'item') {
        if (!this.items.hasByResourceId(ing.item)) {
          throw new RecipeError('MISSING_ITEM', resourceIdToString(ing.item), 'ingredient item is not a registered item');
        }
      } else {
        if (this.tags === undefined || !this.tags.has(ing.tag)) {
          throw new RecipeError('MISSING_TAG', resourceIdToString(ing.tag), 'ingredient tag is not a registered tag');
        }
        if (!this.tags.isFinalized) {
          throw new RecipeError('TAG_NOT_FINALIZED', resourceIdToString(ing.tag), 'tag registry is not finalized');
        }
      }
    }

    const out = def.output;
    if (!isPositiveInteger(out.count)) {
      throw new RecipeError('INVALID_QUANTITY', resourceIdToString(def.id), 'output count must be a positive integer');
    }
    if (!this.items.hasByResourceId(out.item)) {
      throw new RecipeError('MISSING_ITEM', resourceIdToString(out.item), 'output item is not a registered item');
    }
    const outDef = this.items.getByResourceId(out.item);
    if (out.count > outDef.stackSize) {
      throw new RecipeError(
        'INVALID_OUTPUT',
        resourceIdToString(out.item),
        `output count ${out.count} exceeds stack size ${outDef.stackSize}`,
      );
    }
    // out.components, when present, is already validated by the stack-component
    // system at construction time; no further check is required here.
  }
}

// --- Current recipe catalog migration ---

interface RecipeSpec {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly ingredients: ReadonlyArray<readonly [ItemId, number]>;
  readonly output: ItemId;
  readonly outputCount: number;
}

/**
 * Current survival recipe catalog, expressed with the same costs/outputs as the
 * pre-010 plain-string definitions. Each entry is migrated to a ResourceId-based
 * definition keyed by `minecraft:recipe/<key>`.
 */
const CURRENT_RECIPE_SPECS: readonly RecipeSpec[] = [
  { key: 'planks', name: 'Oak Planks', description: '1 log → 4 planks', ingredients: [[ItemId.Wood, 1]], output: ItemId.Planks, outputCount: 4 },
  { key: 'glass', name: 'Glass', description: '4 sand → 1 glass', ingredients: [[ItemId.Sand, 4]], output: ItemId.Glass, outputCount: 1 },
  { key: 'sticks', name: 'Sticks', description: '2 planks → 4 sticks', ingredients: [[ItemId.Planks, 2]], output: ItemId.Stick, outputCount: 4 },
  { key: 'gravel', name: 'Gravel', description: '2 stone → 1 gravel', ingredients: [[ItemId.Stone, 2]], output: ItemId.Gravel, outputCount: 1 },
  { key: 'cobblestone', name: 'Cobblestone', description: '2 stone → 2 cobblestone', ingredients: [[ItemId.Stone, 2]], output: ItemId.Cobblestone, outputCount: 2 },
  { key: 'bricks', name: 'Bricks', description: '4 cobblestone → 4 bricks', ingredients: [[ItemId.Cobblestone, 4]], output: ItemId.Bricks, outputCount: 4 },
  { key: 'wooden_pickaxe', name: 'Wooden Pickaxe', description: '3 planks + 2 sticks → 1 tool', ingredients: [[ItemId.Planks, 3], [ItemId.Stick, 2]], output: ItemId.WoodenPickaxe, outputCount: 1 },
  { key: 'stone_pickaxe', name: 'Stone Pickaxe', description: '3 stone + 2 sticks → 1 tool', ingredients: [[ItemId.Stone, 3], [ItemId.Stick, 2]], output: ItemId.StonePickaxe, outputCount: 1 },
  { key: 'wooden_axe', name: 'Wooden Axe', description: '3 planks + 2 sticks → 1 tool', ingredients: [[ItemId.Planks, 3], [ItemId.Stick, 2]], output: ItemId.WoodenAxe, outputCount: 1 },
];

/** Build ResourceId-based definitions for the current catalog using `items`. */
export function buildCurrentRecipes(items: ItemTypeRegistry): RecipeDefinition[] {
  return CURRENT_RECIPE_SPECS.map((spec) => ({
    id: createResourceId('minecraft', `recipe/${spec.key}`),
    key: spec.key,
    name: spec.name,
    description: spec.description,
    ingredients: spec.ingredients.map(
      ([id, count]): RecipeIngredient => ({
        kind: 'item',
        item: items.getByLegacyId(id)!.resourceId,
        count,
      }),
    ),
    output: {
      item: items.getByLegacyId(spec.output)!.resourceId,
      count: spec.outputCount,
    },
  }));
}

/** Build the default recipe registry over the default item registry. */
export function createDefaultRecipeRegistry(tags?: TagRegistry): RecipeRegistry {
  const items = createDefaultItemRegistry();
  return new RecipeRegistry(items, tags, buildCurrentRecipes(items));
}
