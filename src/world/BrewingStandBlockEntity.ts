/**
 * Brewing stand block-entity core (123).
 *
 * A brewing stand brews one bottle from an ingredient using blaze-powder fuel, over deterministic
 * game ticks. Recipes and fuel values are injected through `BrewingContext` (BrewingRecipes supplies
 * real values); this module owns the state machine, validation, persistence envelope, and 052
 * entity lifecycle. It mirrors the 109 furnace shape: an immutable `BrewingState`, a pure
 * `tickBrewing(state, ctx, ticks)` function, a strict `validateBrewingState` parser, and
 * `serialize/deserialize` envelopes.
 *
 * State machine (per tick, in order):
 *
 * 1. Read the bottle's 122 `potion_contents` via `readBottleContents` -> `{ base, contents } | null`.
 *    `canBrew` = a valid bottle potion AND an ingredient item AND a non-null `match(base, ingredient)`.
 * 2. Light fuel when not currently burning, a real fuel is present, and `canBrew`: consume one fuel
 *    and set `fuelBurnTime = fuelBurnTimeTotal = fuelBurnTicks(fuel)`.
 * 3. Any active fuel always burns down one tick (even while paused), mirroring furnace fuel behavior
 *    and satisfying the safe-pause requirement.
 * 4. While burning and `canBrew`: advance `brewTime` toward `brewTicks()`; on reaching the total,
 *    apply the recipe into the bottle's `potion_contents`, consume one ingredient, and reset the
 *    brew timers. If the recipe cannot produce a valid potion, the brew pauses (no write, no
 *    consumption) so the tick never throws for valid inputs.
 *
 * Lit means `fuelBurnTime > 0`. All operations are pure: valid inputs never throw, invalid inputs
 * throw descriptive errors, identical inputs produce identical results.
 */

import { BlockEntityInstance } from '../simulation/BlockEntityManager';
import {
  type ContainerMenu,
  type MenuCursor,
  type MenuSlot,
  type MenuTransaction,
  MAX_CURSOR_COUNT,
  applyMenuTransaction,
  validateContainerMenu,
} from '../inventory/MenuTransaction';
import {
  type BrewingContext,
  type BrewingRecipeOutput,
} from '../inventory/BrewingRecipes';
import {
  type PotionContents,
  POTION_CONTENTS_COMPONENT,
  createPotionContents,
  potionContentsComponentType,
} from '../data/PotionItemData';
import { resourceIdToString } from '../data/ResourceId';

/** Block-entity type key for a brewing stand (018 default registry). */
export const BREWING_STAND_TYPE_KEY = 'brewing_stand';
/** Brewing slot count: bottle, fuel, ingredient. */
export const BREWING_SLOT_COUNT = 3;
/** Total slots in a brewing menu: 3 stand + 36 player. */
export const BREWING_MENU_SLOT_COUNT = 39;
/** Index where the player region starts in a brewing menu. */
export const BREWING_PLAYER_SLOT_START = BREWING_SLOT_COUNT;
/** Menu index of the bottle slot. */
export const BREWING_BOTTLE_SLOT = 0;
/** Menu index of the fuel slot. */
export const BREWING_FUEL_SLOT = 1;
/** Menu index of the ingredient slot. */
export const BREWING_INGREDIENT_SLOT = 2;
/** Default per-slot stack cap for brewing slots. */
export const DEFAULT_BREWING_SLOT_MAX_STACK = 64;

/** The `components` map key for the potion contents component. */
export const POTION_CONTENTS_KEY = resourceIdToString(POTION_CONTENTS_COMPONENT);

/** A validated brewing state: three slots plus brew and fuel timers. */
export interface BrewingState {
  bottle: MenuSlot;
  fuel: MenuSlot;
  ingredient: MenuSlot;
  /** Remaining brew ticks of the current cycle. */
  brewTime: number;
  /** Total brew ticks of the current cycle (0 when no brew). */
  brewTimeTotal: number;
  /** Remaining burn ticks of the current fuel. */
  fuelBurnTime: number;
  /** Total burn ticks of the current fuel (0 when not burning). */
  fuelBurnTimeTotal: number;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function validateSlot(slot: MenuSlot, what: string): void {
  if (!isPositiveInteger(slot.maxStack) || slot.maxStack > MAX_CURSOR_COUNT) {
    throw new Error(`BrewingStandBlockEntity: ${what}.maxStack must be an integer in [1, ${MAX_CURSOR_COUNT}]`);
  }
  if (slot.item === null) {
    if (slot.count !== 0) {
      throw new Error(`BrewingStandBlockEntity: ${what} with a null item must have count 0`);
    }
  } else {
    if (typeof slot.item !== 'string' || slot.item.length === 0) {
      throw new Error(`BrewingStandBlockEntity: ${what}.item must be a non-empty string or null`);
    }
    if (!Number.isInteger(slot.count) || slot.count < 1 || slot.count > slot.maxStack) {
      throw new Error(`BrewingStandBlockEntity: ${what}.count must be an integer in [1, maxStack]`);
    }
  }
  if (slot.components !== undefined) {
    if (typeof slot.components !== 'object' || slot.components === null || Array.isArray(slot.components)) {
      throw new Error(`BrewingStandBlockEntity: ${what}.components must be an object when present`);
    }
  }
}

function parseSlot(input: unknown, what: string): MenuSlot {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`BrewingStandBlockEntity: ${what} must be an object`);
  }
  const s = input as Record<string, unknown>;
  const slot: MenuSlot = {
    item: s.item as string | null,
    count: s.count as number,
    maxStack: s.maxStack as number,
    ...(s.components !== undefined ? { components: s.components as Readonly<Record<string, unknown>> } : {}),
  };
  validateSlot(slot, what);
  return slot;
}

function emptySlot(): MenuSlot {
  return { item: null, count: 0, maxStack: DEFAULT_BREWING_SLOT_MAX_STACK };
}

/** Build an empty brewing state (all timers 0). The bottle slot is empty until a bottle is placed. */
export function createBrewingState(): BrewingState {
  return {
    bottle: emptySlot(),
    fuel: emptySlot(),
    ingredient: emptySlot(),
    brewTime: 0,
    brewTimeTotal: 0,
    fuelBurnTime: 0,
    fuelBurnTimeTotal: 0,
  };
}

/**
 * Validate an unknown value as a `BrewingState`. Throws a descriptive error on any invalid
 * shape, slot, or time; never coerces.
 */
export function validateBrewingState(input: unknown): BrewingState {
  if (typeof input !== 'object' || input === null) {
    throw new Error('BrewingStandBlockEntity: state must be an object');
  }
  const r = input as Record<string, unknown>;
  const state: BrewingState = {
    bottle: parseSlot(r.bottle, 'bottle'),
    fuel: parseSlot(r.fuel, 'fuel'),
    ingredient: parseSlot(r.ingredient, 'ingredient'),
    brewTime: r.brewTime as number,
    brewTimeTotal: r.brewTimeTotal as number,
    fuelBurnTime: r.fuelBurnTime as number,
    fuelBurnTimeTotal: r.fuelBurnTimeTotal as number,
  };
  for (const key of ['brewTime', 'brewTimeTotal', 'fuelBurnTime', 'fuelBurnTimeTotal'] as const) {
    if (!isNonNegativeInteger(state[key])) {
      throw new Error(`BrewingStandBlockEntity: ${key} must be a non-negative integer`);
    }
  }
  if (state.fuelBurnTimeTotal === 0 && state.fuelBurnTime !== 0) {
    throw new Error('BrewingStandBlockEntity: fuelBurnTimeTotal 0 requires fuelBurnTime 0');
  }
  if (state.fuelBurnTime > state.fuelBurnTimeTotal) {
    throw new Error('BrewingStandBlockEntity: fuelBurnTime must not exceed fuelBurnTimeTotal');
  }
  if (state.brewTimeTotal === 0 && state.brewTime !== 0) {
    throw new Error('BrewingStandBlockEntity: brewTimeTotal 0 requires brewTime 0');
  }
  if (state.brewTime > state.brewTimeTotal) {
    throw new Error('BrewingStandBlockEntity: brewTime must not exceed brewTimeTotal');
  }
  return state;
}

/** Whether the brewing stand is currently lit (burning fuel). */
export function brewingIsLit(state: BrewingState): boolean {
  return state.fuelBurnTime > 0;
}

/** The valid potion contents carried by a bottle slot, or null when missing/invalid. */
export function readBottleContents(slot: MenuSlot): { base: string | undefined; contents: PotionContents } | null {
  if (slot.item === null || slot.components === undefined) {
    return null;
  }
  const raw = slot.components[POTION_CONTENTS_KEY];
  if (!potionContentsComponentType.validate(raw)) {
    return null;
  }
  const contents = raw as PotionContents;
  return { base: contents.base, contents };
}

function consumeOne(slot: MenuSlot): MenuSlot {
  if (slot.item === null || slot.count < 1) {
    throw new Error('BrewingStandBlockEntity: cannot consume from an empty slot');
  }
  const count = slot.count - 1;
  return count === 0 ? { ...slot, item: null, count: 0 } : { ...slot, count };
}

/** Apply a recipe output to the bottle's potion contents; null when the result is invalid. */
function applyMatch(
  bottleState: { base: string | undefined; contents: PotionContents },
  match: BrewingRecipeOutput,
): PotionContents | null {
  const base = match.base ?? bottleState.base;
  const customEffects = match.customEffects ?? bottleState.contents.customEffects;
  try {
    return createPotionContents({ base, customEffects });
  } catch {
    return null;
  }
}

/** Return a NEW bottle slot carrying the given potion contents. */
function writeBottleContents(slot: MenuSlot, contents: PotionContents): MenuSlot {
  const components = { ...(slot.components ?? {}), [POTION_CONTENTS_KEY]: contents };
  return { ...slot, components };
}

/**
 * Apply `ticks` (default 1) deterministic game ticks to a brewing state, returning a NEW state.
 * The input state is never mutated; fuel is consumed only when a brew can progress.
 */
export function tickBrewing(state: BrewingState, ctx: BrewingContext, ticks = 1): BrewingState {
  if (!isPositiveInteger(ticks)) {
    throw new Error(`BrewingStandBlockEntity: ticks must be a positive integer, got ${String(ticks)}`);
  }
  let next = validateBrewingState(state);
  for (let t = 0; t < ticks; t++) {
    next = tickOnce(next, ctx);
  }
  return next;
}

function tickOnce(state: BrewingState, ctx: BrewingContext): BrewingState {
  const bottle = state.bottle;
  const fuel = state.fuel;
  const ingredient = state.ingredient;

  const bottleState = readBottleContents(bottle);
  const ingredientItem = ingredient.item;
  const match =
    bottleState !== null && ingredientItem !== null ? ctx.match(bottleState.base, ingredientItem) : null;
  const canBrew = bottleState !== null && ingredientItem !== null && match !== null;

  let fuelBurnTime = state.fuelBurnTime;
  let fuelBurnTimeTotal = state.fuelBurnTimeTotal;
  let brewTime = state.brewTime;
  let brewTimeTotal = state.brewTimeTotal;
  let nextBottle = bottle;
  let nextIngredient = ingredient;
  let nextFuel = fuel;

  // Light fuel when not burning, a real fuel is present, and a brew is possible.
  if (fuelBurnTime === 0 && canBrew && fuel.item !== null) {
    const burnTicks = ctx.fuelBurnTicks(fuel.item);
    if (burnTicks > 0) {
      nextFuel = consumeOne(fuel);
      fuelBurnTimeTotal = burnTicks;
      fuelBurnTime = burnTicks;
    }
  }

  // Active fuel always burns down, even while paused (safe-pause requirement).
  if (fuelBurnTime > 0) {
    fuelBurnTime -= 1;

    if (canBrew) {
      if (brewTimeTotal === 0) {
        brewTimeTotal = ctx.brewTicks();
      }
      brewTime = Math.min(brewTimeTotal, brewTime + 1);
      if (brewTime >= brewTimeTotal) {
        const applied = applyMatch(bottleState!, match!);
        if (applied !== null) {
          nextBottle = writeBottleContents(bottle, applied);
          nextIngredient = consumeOne(ingredient);
          brewTime = 0;
          brewTimeTotal = 0;
        }
      }
    }
  }

  return {
    bottle: nextBottle,
    fuel: nextFuel,
    ingredient: nextIngredient,
    brewTime,
    brewTimeTotal,
    fuelBurnTime,
    fuelBurnTimeTotal,
  };
}

/** Serialize a brewing state into the 036 opaque payload envelope (lossless). */
export function serializeBrewingState(state: BrewingState): unknown {
  const valid = validateBrewingState(state);
  const serializeSlot = (slot: MenuSlot) => ({
    item: slot.item,
    count: slot.count,
    maxStack: slot.maxStack,
    ...(slot.components !== undefined ? { components: slot.components } : {}),
  });
  return {
    bottle: serializeSlot(valid.bottle),
    fuel: serializeSlot(valid.fuel),
    ingredient: serializeSlot(valid.ingredient),
    brewTime: valid.brewTime,
    brewTimeTotal: valid.brewTimeTotal,
    fuelBurnTime: valid.fuelBurnTime,
    fuelBurnTimeTotal: valid.fuelBurnTimeTotal,
  };
}

/** Deserialize a 036 envelope into a `BrewingState`; throws on malformed payloads. */
export function deserializeBrewingState(data: unknown): BrewingState {
  if (typeof data !== 'object' || data === null) {
    throw new Error('BrewingStandBlockEntity: payload must be an object');
  }
  const r = data as Record<string, unknown>;
  const state: BrewingState = {
    bottle: parseSlot(r.bottle, 'payload.bottle'),
    fuel: parseSlot(r.fuel, 'payload.fuel'),
    ingredient: parseSlot(r.ingredient, 'payload.ingredient'),
    brewTime: r.brewTime as number,
    brewTimeTotal: r.brewTimeTotal as number,
    fuelBurnTime: r.fuelBurnTime as number,
    fuelBurnTimeTotal: r.fuelBurnTimeTotal as number,
  };
  return validateBrewingState(state);
}

/** Build a 39-slot brewing menu: bottle 0, fuel 1, ingredient 2, player 3-38. */
export function createBrewingMenu(
  state: BrewingState,
  playerSlots: MenuSlot[],
  cursor?: MenuCursor,
): ContainerMenu {
  const valid = validateBrewingState(state);
  if (!Array.isArray(playerSlots)) {
    throw new Error('BrewingStandBlockEntity: playerSlots must be an array of exactly 36 slots');
  }
  const slots = [valid.bottle, valid.fuel, valid.ingredient, ...playerSlots];
  if (slots.length !== BREWING_MENU_SLOT_COUNT) {
    throw new Error(`BrewingStandBlockEntity: menu must have exactly ${BREWING_MENU_SLOT_COUNT} slots`);
  }
  return validateContainerMenu({
    slots,
    playerSlotStart: BREWING_PLAYER_SLOT_START,
    cursor: cursor ?? { item: null, count: 0 },
  });
}

/** Apply one 106 transaction to a brewing menu, returning a NEW immutable menu. */
export function applyBrewingMenuTransaction(menu: ContainerMenu, transaction: MenuTransaction): ContainerMenu {
  return applyMenuTransaction(menu, transaction);
}

function assertBrewingMenu(menu: ContainerMenu): void {
  if (menu.slots.length !== BREWING_MENU_SLOT_COUNT || menu.playerSlotStart !== BREWING_PLAYER_SLOT_START) {
    throw new Error('BrewingStandBlockEntity: menu is not a brewing menu');
  }
}

/** Extract the three brewing slots (indices 0-2) from a brewing menu. */
export function extractBrewingSlots(menu: ContainerMenu): { bottle: MenuSlot; fuel: MenuSlot; ingredient: MenuSlot } {
  assertBrewingMenu(menu);
  return {
    bottle: { ...menu.slots[BREWING_BOTTLE_SLOT]! },
    fuel: { ...menu.slots[BREWING_FUEL_SLOT]! },
    ingredient: { ...menu.slots[BREWING_INGREDIENT_SLOT]! },
  };
}

/** Extract the 36 player slots (indices 3-38) from a brewing menu. */
export function extractBrewingPlayerSlots(menu: ContainerMenu): MenuSlot[] {
  assertBrewingMenu(menu);
  return menu.slots.slice(BREWING_PLAYER_SLOT_START).map((s) => ({ ...s }));
}

/** Build a 052 brewing-stand block-entity instance holding the serialized state. */
export function createBrewingStandBlockEntity(
  x: number,
  y: number,
  z: number,
  state?: BrewingState,
): BlockEntityInstance {
  const valid = state === undefined ? createBrewingState() : validateBrewingState(state);
  return new BlockEntityInstance({
    typeKey: BREWING_STAND_TYPE_KEY,
    x,
    y,
    z,
    tickable: true,
    data: serializeBrewingState(valid),
  });
}

/**
 * Read the state from a block-entity instance. Throws unless the instance is a brewing stand with
 * a valid payload.
 */
export function readBrewingState(instance: BlockEntityInstance): BrewingState {
  if (instance.typeKey !== BREWING_STAND_TYPE_KEY) {
    throw new Error(`BrewingStandBlockEntity: expected typeKey '${BREWING_STAND_TYPE_KEY}', got '${instance.typeKey}'`);
  }
  return deserializeBrewingState(instance.data);
}

/** Return a NEW brewing instance with the given state; the old instance is unchanged. */
export function updateBrewingState(
  instance: BlockEntityInstance,
  state: BrewingState,
): BlockEntityInstance {
  const valid = validateBrewingState(state);
  return new BlockEntityInstance({
    typeKey: instance.typeKey,
    x: instance.x,
    y: instance.y,
    z: instance.z,
    tickable: true,
    data: serializeBrewingState(valid),
  });
}

/** Brew progress fraction in [0,1]; 0 when nothing brews. */
export function brewingBrewProgress(state: BrewingState): number {
  const valid = validateBrewingState(state);
  if (valid.brewTimeTotal === 0) {
    return 0;
  }
  return Math.min(1, valid.brewTime / valid.brewTimeTotal);
}

/** Burn progress fraction in [0,1]; 0 when not burning. */
export function brewingFuelFraction(state: BrewingState): number {
  const valid = validateBrewingState(state);
  if (valid.fuelBurnTimeTotal === 0) {
    return 0;
  }
  return Math.min(1, valid.fuelBurnTime / valid.fuelBurnTimeTotal);
}
