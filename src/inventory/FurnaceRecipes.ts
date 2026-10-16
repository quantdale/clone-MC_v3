/**
 * Furnace recipes and fuels (110).
 *
 * Real data for the 109 tick engine:
 *
 * - `FuelValueRegistry`: strict, atomic fuel values (item -> burn ticks);
 * - `createDefaultFuelValues`: coal 1600, wood 300, planks 300, stick 100;
 * - `createFurnaceContext`: wires the 103 `TypedRecipeRegistry` (processing kind) and the
 *   fuel registry into 109's `FurnaceContext`, rejecting duplicate processing inputs
 *   atomically;
 * - `takeFurnaceXp`: drains the integer floor of accumulated experience and carries the
 *   fraction (vanilla-style fractional XP carry).
 *
 * All functions are pure over plain data: valid inputs never throw, invalid inputs throw
 * descriptive errors, and identical inputs produce identical results.
 */

import { type ProcessingRecipe, type TypedRecipeRegistry } from './TypedRecipe';
import type { FurnaceContext } from '../world/FurnaceBlockEntity';

/** A fuel value: an item resource id and its burn ticks. */
export interface FuelValue {
  item: string;
  burnTicks: number;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Strict registry of fuel values keyed by item resource id. Construction is atomic: a
 * duplicate or invalid registration throws and leaves the registry unchanged.
 */
export class FuelValueRegistry {
  private readonly fuels = new Map<string, number>();

  /** Register a fuel value; throws on duplicates or invalid burn ticks. */
  register(item: string, burnTicks: number): void {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error('FuelValueRegistry: item must be a non-empty string');
    }
    if (!isPositiveInteger(burnTicks)) {
      throw new Error(`FuelValueRegistry: burnTicks must be a positive integer, got ${String(burnTicks)}`);
    }
    if (this.fuels.has(item)) {
      throw new Error(`FuelValueRegistry: duplicate fuel item: ${item}`);
    }
    this.fuels.set(item, burnTicks);
  }

  /** Burn ticks for an item; 0 when the item is not a fuel. */
  burnTicksOf(item: string): number {
    return this.fuels.get(item) ?? 0;
  }

  /** Whether the item is a registered fuel. */
  has(item: string): boolean {
    return this.fuels.has(item);
  }

  /** Number of registered fuels. */
  get size(): number {
    return this.fuels.size;
  }

  /** All fuel values in registration order (deterministic). */
  all(): FuelValue[] {
    return [...this.fuels.entries()].map(([item, burnTicks]) => ({ item, burnTicks }));
  }
}

/**
 * Default fuel values for the current item vocabulary (original data aligned with vanilla
 * proportions): coal 1600, wood log 300, planks 300, stick 100.
 */
export function createDefaultFuelValues(): FuelValueRegistry {
  const registry = new FuelValueRegistry();
  registry.register('minecraft:coal', 1600);
  registry.register('minecraft:wood', 300);
  registry.register('minecraft:planks', 300);
  registry.register('minecraft:stick', 100);
  return registry;
}

/**
 * Build the 109 `FurnaceContext` from the 103 processing recipes and the fuel registry.
 * Processing recipes are indexed by input item; two recipes sharing an input throw
 * atomically (deterministic resolution).
 */
export function createFurnaceContext(
  recipes: TypedRecipeRegistry,
  fuels: FuelValueRegistry,
): FurnaceContext {
  const byInput = new Map<string, ProcessingRecipe>();
  for (const recipe of recipes.all()) {
    if (recipe.kind === 'processing') {
      if (byInput.has(recipe.input)) {
        throw new Error(`FurnaceRecipes: duplicate processing input '${recipe.input}'`);
      }
      byInput.set(recipe.input, recipe);
    }
  }
  return {
    fuelBurnTicks: (item) => fuels.burnTicksOf(item),
    cookTicks: (item) => byInput.get(item)?.cookingTime ?? 0,
    resultOf: (item) => {
      const recipe = byInput.get(item);
      return recipe === undefined ? null : { item: recipe.result.item, count: recipe.result.count };
    },
    experienceOf: (item) => byInput.get(item)?.experience ?? 0,
  };
}

/**
 * Drain accumulated furnace experience: the integer floor is granted to the player and the
 * fraction is carried in the furnace (vanilla-style). Throws on invalid xp.
 */
export function takeFurnaceXp(xp: number): { taken: number; remaining: number } {
  if (!isFiniteNumber(xp) || xp < 0) {
    throw new Error(`FurnaceRecipes: xp must be a finite number >= 0, got ${String(xp)}`);
  }
  const taken = Math.floor(xp);
  return { taken, remaining: xp - taken };
}
