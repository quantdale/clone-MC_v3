/**
 * Brewing recipes and fuel (123).
 *
 * Pure data + context for the 123 brewing-stand tick engine. A `BrewingContext` supplies
 * recipe matching (`match`), fuel burn ticks (`fuelBurnTicks`), and the ticks per brew cycle
 * (`brewTicks`). `createDefaultBrewingContext` wires the starter recipe table and blaze-powder
 * fuel. All functions are pure over plain data: valid inputs never throw, invalid inputs throw
 * descriptively, and identical inputs produce identical results.
 *
 * The recipe table is seed-independent and fully enumerable. Recipe outputs are applied to the
 * bottle's 122 `potion_contents` component by the 123 state machine; this module only resolves
 * what a `(base, ingredient)` pair should become.
 */

import { type PotionEffectData } from '../data/PotionItemData';

/** Resource-id string of the blaze-powder fuel item. */
export const BLAZE_POWDER_ITEM = 'minecraft:item/blaze_powder';

/** Resource-id string of a potion bottle item. */
export const POTION_BOTTLE_ITEM = 'minecraft:item/potion';

/** Base name of a plain water bottle. */
export const WATER_BASE = 'minecraft:potion/water';
/** Base name of the intermediate awkward potion. */
export const AWKWARD_BASE = 'minecraft:potion/awkward';
/** Base name of a mundane potion (no effects). */
export const MUNDANE_BASE = 'minecraft:potion/mundane';

/** The ingredient items used by the starter table. */
export const NETHER_WART_ITEM = 'minecraft:item/nether_wart';
export const REDSTONE_ITEM = 'minecraft:item/redstone';
export const GLOWSTONE_ITEM = 'minecraft:item/glowstone';
export const FERMENTED_SPIDER_EYE_ITEM = 'minecraft:item/fermented_spider_eye';
export const SPEED_REAGENT_ITEM = 'minecraft:item/speed_reagent';
export const STRENGTH_REAGENT_ITEM = 'minecraft:item/strength_reagent';
export const HEALING_REAGENT_ITEM = 'minecraft:item/healing_reagent';

/** Blaze-powder burn ticks (vanilla: 20 brews). */
export const BLAZE_POWDER_BURN_TICKS = 1200;

/** Ticks per brew cycle (vanilla: 400 ticks = 20 seconds at 20 tps). */
export const DEFAULT_BREW_TICKS = 400;

/** What a recipe turns a bottle into. Empty/absent `customEffects` means "no effects". */
export interface BrewingRecipeOutput {
  /** New base name; replaces the bottle base on apply. */
  readonly base?: string;
  /** New effect list; replaces the bottle effects on apply. */
  readonly customEffects?: readonly PotionEffectData[];
}

/**
 * Recipe/fuel values injected into the 123 tick engine. `match` resolves a `(base, ingredient)`
 * pair; `fuelBurnTicks` reports burn ticks (0 = not a fuel); `brewTicks` reports ticks per cycle.
 */
export interface BrewingContext {
  /** The recipe output for a known `(base, ingredient)` pair, or null when unknown. */
  match(base: string | undefined, ingredient: string): BrewingRecipeOutput | null;
  /** Burn ticks the given item provides as fuel; 0 means not a fuel. */
  fuelBurnTicks(item: string): number;
  /** Ticks required to complete one brew cycle. */
  brewTicks(): number;
}

interface RecipeEntry {
  readonly ingredient: string;
  readonly output: BrewingRecipeOutput;
}

/** Starter recipe table: base -> list of ingredient recipes. */
const STARTER_RECIPES: ReadonlyMap<string, readonly RecipeEntry[]> = new Map([
  [
    WATER_BASE,
    [{ ingredient: NETHER_WART_ITEM, output: { base: AWKWARD_BASE, customEffects: [] } }],
  ],
  [
    AWKWARD_BASE,
    [
      { ingredient: REDSTONE_ITEM, output: { customEffects: [{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }] } },
      { ingredient: GLOWSTONE_ITEM, output: { customEffects: [{ typeId: 'minecraft:effect/speed', duration: 120, amplifier: 2 }] } },
      { ingredient: FERMENTED_SPIDER_EYE_ITEM, output: { base: MUNDANE_BASE, customEffects: [] } },
      { ingredient: SPEED_REAGENT_ITEM, output: { customEffects: [{ typeId: 'minecraft:effect/speed', duration: 180, amplifier: 1 }] } },
      { ingredient: STRENGTH_REAGENT_ITEM, output: { customEffects: [{ typeId: 'minecraft:effect/strength', duration: 180, amplifier: 1 }] } },
      { ingredient: HEALING_REAGENT_ITEM, output: { customEffects: [{ typeId: 'minecraft:effect/healing', duration: 0, amplifier: 1 }] } },
    ],
  ],
]);

function normalizeBase(base: string | undefined): string {
  return base === undefined ? '' : base;
}

/**
 * Build the default 123 `BrewingContext` from the starter recipe table and blaze-powder fuel.
 * The table is fully enumerable and deterministic; unknown `(base, ingredient)` pairs return null.
 */
export function createDefaultBrewingContext(): BrewingContext {
  return {
    match: (base, ingredient) => {
      const entries = STARTER_RECIPES.get(normalizeBase(base));
      if (entries === undefined) return null;
      for (const entry of entries) {
        if (entry.ingredient === ingredient) {
          return entry.output;
        }
      }
      return null;
    },
    fuelBurnTicks: (item) => (item === BLAZE_POWDER_ITEM ? BLAZE_POWDER_BURN_TICKS : 0),
    brewTicks: () => DEFAULT_BREW_TICKS,
  };
}
