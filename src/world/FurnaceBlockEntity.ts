/**
 * Furnace block-entity core (109).
 *
 * A furnace smelts an input item into a result using fuel, over deterministic game ticks.
 * Recipes and fuel values are injected through `FurnaceContext` (110 supplies real values);
 * this module owns the state machine, validation, persistence envelope, menu bridge, and 052
 * entity lifecycle.
 *
 * State machine (per tick, in order):
 *
 * 1. `canSmelt` = input present, `resultOf(input)` non-null, and the output accepts the
 *    result (empty, or same item with room).
 * 2. No input -> `smeltTime` resets to 0.
 * 3. `canSmelt`:
 *    a. `smeltTimeTotal = cookTicks(input)`.
 *    b. Not burning with a fuel whose burn value is positive -> consume one fuel and set
 *       `burnTime = burnTimeTotal = fuelBurnTicks(fuel)`.
 *    c. Burning -> decrement `burnTime`; advance `smeltTime`; when it reaches the total,
 *       consume one input and merge the result into the output, then reset the smelt timers.
 * 4. Otherwise (blocked output, or no fuel) -> paused: nothing changes.
 *
 * Lit means `burnTime > 0`. All operations are pure: valid inputs never throw, invalid inputs
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

/** Stable numeric block id for the furnace block. */
export const FURNACE_BLOCK_ID = 20;
/** Stable numeric item id for the furnace item. */
export const FURNACE_ITEM_ID = 26;
/** Block-entity type key for a furnace (018 default registry). */
export const FURNACE_TYPE_KEY = 'furnace';
/** Furnace slot count: input, fuel, output. */
export const FURNACE_SLOT_COUNT = 3;
/** Total slots in a furnace menu: 3 furnace + 36 player. */
export const FURNACE_MENU_SLOT_COUNT = 39;
/** Index where the player region starts in a furnace menu. */
export const FURNACE_PLAYER_SLOT_START = FURNACE_SLOT_COUNT;
/** Menu index of the smelting input slot. */
export const FURNACE_INPUT_SLOT = 0;
/** Menu index of the fuel slot. */
export const FURNACE_FUEL_SLOT = 1;
/** Menu index of the output slot. */
export const FURNACE_OUTPUT_SLOT = 2;
/** Default per-slot stack cap for furnace slots. */
export const DEFAULT_FURNACE_SLOT_MAX_STACK = 64;

/** A validated furnace state: three slots plus burn/smelt timers. */
export interface FurnaceState {
  input: MenuSlot;
  fuel: MenuSlot;
  output: MenuSlot;
  /** Remaining burn ticks of the current fuel. */
  burnTime: number;
  /** Total burn ticks of the current fuel (0 when not burning). */
  burnTimeTotal: number;
  /** Smelt progress ticks toward the current cook. */
  smeltTime: number;
  /** Total ticks required to cook the current input (0 when no cook). */
  smeltTimeTotal: number;
}

/** Recipe/fuel values injected into the tick engine (110 supplies real data). */
export interface FurnaceContext {
  /** Burn ticks the given item provides as fuel; 0 means not a fuel. */
  fuelBurnTicks(item: string): number;
  /** Ticks required to cook the given input; 0 means not smeltable. */
  cookTicks(item: string): number;
  /** The smelting result of the given input, or null when not smeltable. */
  resultOf(item: string): { item: string; count: number } | null;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function validateSlot(slot: MenuSlot, what: string): void {
  if (!isPositiveInteger(slot.maxStack) || slot.maxStack > MAX_CURSOR_COUNT) {
    throw new Error(`FurnaceBlockEntity: ${what}.maxStack must be an integer in [1, ${MAX_CURSOR_COUNT}]`);
  }
  if (slot.item === null) {
    if (slot.count !== 0) {
      throw new Error(`FurnaceBlockEntity: ${what} with a null item must have count 0`);
    }
  } else {
    if (typeof slot.item !== 'string' || slot.item.length === 0) {
      throw new Error(`FurnaceBlockEntity: ${what}.item must be a non-empty string or null`);
    }
    if (!Number.isInteger(slot.count) || slot.count < 1 || slot.count > slot.maxStack) {
      throw new Error(`FurnaceBlockEntity: ${what}.count must be an integer in [1, maxStack]`);
    }
  }
}

function parseSlot(input: unknown, what: string): MenuSlot {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`FurnaceBlockEntity: ${what} must be an object`);
  }
  const s = input as Record<string, unknown>;
  const slot: MenuSlot = { item: s.item as string | null, count: s.count as number, maxStack: s.maxStack as number };
  validateSlot(slot, what);
  return slot;
}

function emptySlot(): MenuSlot {
  return { item: null, count: 0, maxStack: DEFAULT_FURNACE_SLOT_MAX_STACK };
}

/** Build an empty furnace state (all timers 0). */
export function createFurnaceState(): FurnaceState {
  return {
    input: emptySlot(),
    fuel: emptySlot(),
    output: emptySlot(),
    burnTime: 0,
    burnTimeTotal: 0,
    smeltTime: 0,
    smeltTimeTotal: 0,
  };
}

/**
 * Validate an unknown value as a `FurnaceState`. Throws a descriptive error on any invalid
 * shape, slot, or time; never coerces.
 */
export function validateFurnaceState(input: unknown): FurnaceState {
  if (typeof input !== 'object' || input === null) {
    throw new Error('FurnaceBlockEntity: state must be an object');
  }
  const r = input as Record<string, unknown>;
  const state: FurnaceState = {
    input: parseSlot(r.input, 'input'),
    fuel: parseSlot(r.fuel, 'fuel'),
    output: parseSlot(r.output, 'output'),
    burnTime: r.burnTime as number,
    burnTimeTotal: r.burnTimeTotal as number,
    smeltTime: r.smeltTime as number,
    smeltTimeTotal: r.smeltTimeTotal as number,
  };
  for (const key of ['burnTime', 'burnTimeTotal', 'smeltTime', 'smeltTimeTotal'] as const) {
    if (!isNonNegativeInteger(state[key])) {
      throw new Error(`FurnaceBlockEntity: ${key} must be a non-negative integer`);
    }
  }
  if (state.burnTimeTotal === 0 && state.burnTime !== 0) {
    throw new Error('FurnaceBlockEntity: burnTimeTotal 0 requires burnTime 0');
  }
  if (state.burnTime > state.burnTimeTotal) {
    throw new Error('FurnaceBlockEntity: burnTime must not exceed burnTimeTotal');
  }
  if (state.smeltTimeTotal === 0 && state.smeltTime !== 0) {
    throw new Error('FurnaceBlockEntity: smeltTimeTotal 0 requires smeltTime 0');
  }
  if (state.smeltTime > state.smeltTimeTotal) {
    throw new Error('FurnaceBlockEntity: smeltTime must not exceed smeltTimeTotal');
  }
  return state;
}

/** Whether the furnace is currently lit (burning fuel). */
export function furnaceIsLit(state: FurnaceState): boolean {
  return state.burnTime > 0;
}

function outputAccepts(output: MenuSlot, result: { item: string; count: number }): boolean {
  if (output.item === null) {
    return result.count <= output.maxStack;
  }
  return output.item === result.item && output.count + result.count <= output.maxStack;
}

function consumeOne(slot: MenuSlot): MenuSlot {
  if (slot.item === null || slot.count < 1) {
    throw new Error('FurnaceBlockEntity: cannot consume from an empty slot');
  }
  const count = slot.count - 1;
  return count === 0 ? { item: null, count: 0, maxStack: slot.maxStack } : { ...slot, count };
}

function addOne(slot: MenuSlot, item: string, count: number): MenuSlot {
  if (slot.item === null) {
    return { item, count, maxStack: slot.maxStack };
  }
  return { ...slot, count: slot.count + count };
}

/**
 * Apply `ticks` (default 1) deterministic game ticks to a furnace state, returning a NEW
 * state. The input state is never mutated; fuel is consumed only when smelting can progress.
 */
export function tickFurnace(state: FurnaceState, ctx: FurnaceContext, ticks = 1): FurnaceState {
  if (!isPositiveInteger(ticks)) {
    throw new Error(`FurnaceBlockEntity: ticks must be a positive integer, got ${String(ticks)}`);
  }
  let next = validateFurnaceState(state);
  for (let t = 0; t < ticks; t++) {
    next = tickOnce(next, ctx);
  }
  return next;
}

function tickOnce(state: FurnaceState, ctx: FurnaceContext): FurnaceState {
  const input = state.input;
  const fuel = state.fuel;
  const output = state.output;
  if (input.item === null) {
    return {
      input,
      fuel,
      output,
      burnTime: state.burnTime,
      burnTimeTotal: state.burnTimeTotal,
      smeltTime: 0,
      smeltTimeTotal: 0,
    };
  }

  const result = ctx.resultOf(input.item);
  const cookTicks = result === null ? 0 : ctx.cookTicks(input.item);
  const canSmelt = result !== null && cookTicks > 0 && outputAccepts(output, result);

  // Input present but blocked (output full/mismatch or unsmeltable): paused.
  if (!canSmelt) {
    return {
      input,
      fuel,
      output,
      burnTime: state.burnTime,
      burnTimeTotal: state.burnTimeTotal,
      smeltTime: state.smeltTime,
      smeltTimeTotal: state.smeltTimeTotal,
    };
  }

  let burnTime = state.burnTime;
  let burnTimeTotal = state.burnTimeTotal;
  let smeltTime = state.smeltTime;
  let nextFuel = fuel;
  const smeltTimeTotal = cookTicks;

  // Light the furnace when not burning and a real fuel is present.
  if (burnTime === 0 && fuel.item !== null) {
    const burnTicks = ctx.fuelBurnTicks(fuel.item);
    if (burnTicks > 0) {
      nextFuel = consumeOne(fuel);
      burnTimeTotal = burnTicks;
      burnTime = burnTicks;
    }
  }

  if (burnTime > 0) {
    burnTime -= 1;
    smeltTime = Math.min(smeltTimeTotal, smeltTime + 1);
    if (smeltTime >= smeltTimeTotal) {
      // Cook complete: consume one input, merge the result into the output.
      const nextInput = consumeOne(input);
      const nextOutput = addOne(output, result.item, result.count);
      return {
        input: nextInput,
        fuel: nextFuel,
        output: nextOutput,
        burnTime,
        burnTimeTotal,
        smeltTime: 0,
        smeltTimeTotal: 0,
      };
    }
  }

  return {
    input,
    fuel: nextFuel,
    output,
    burnTime,
    burnTimeTotal,
    smeltTime,
    smeltTimeTotal,
  };
}

/** Serialize a furnace state into the 036 opaque payload envelope (lossless). */
export function serializeFurnaceState(state: FurnaceState): unknown {
  const valid = validateFurnaceState(state);
  return {
    input: { item: valid.input.item, count: valid.input.count, maxStack: valid.input.maxStack },
    fuel: { item: valid.fuel.item, count: valid.fuel.count, maxStack: valid.fuel.maxStack },
    output: { item: valid.output.item, count: valid.output.count, maxStack: valid.output.maxStack },
    burnTime: valid.burnTime,
    burnTimeTotal: valid.burnTimeTotal,
    smeltTime: valid.smeltTime,
    smeltTimeTotal: valid.smeltTimeTotal,
  };
}

/** Deserialize a 036 envelope into a `FurnaceState`; throws on malformed payloads. */
export function deserializeFurnaceState(data: unknown): FurnaceState {
  if (typeof data !== 'object' || data === null) {
    throw new Error('FurnaceBlockEntity: payload must be an object');
  }
  const r = data as Record<string, unknown>;
  const state: FurnaceState = {
    input: parseSlot(r.input, 'payload.input'),
    fuel: parseSlot(r.fuel, 'payload.fuel'),
    output: parseSlot(r.output, 'payload.output'),
    burnTime: r.burnTime as number,
    burnTimeTotal: r.burnTimeTotal as number,
    smeltTime: r.smeltTime as number,
    smeltTimeTotal: r.smeltTimeTotal as number,
  };
  return validateFurnaceState(state);
}

/**
 * Build a 39-slot furnace menu: input 0, fuel 1, output 2, player 3-38, cursor empty unless
 * supplied. Every slot and the cursor are validated; invalid input throws.
 */
export function createFurnaceMenu(
  state: FurnaceState,
  playerSlots: MenuSlot[],
  cursor?: MenuCursor,
): ContainerMenu {
  const valid = validateFurnaceState(state);
  if (!Array.isArray(playerSlots)) {
    throw new Error('FurnaceBlockEntity: playerSlots must be an array of exactly 36 slots');
  }
  const slots = [valid.input, valid.fuel, valid.output, ...playerSlots];
  if (slots.length !== FURNACE_MENU_SLOT_COUNT) {
    throw new Error(`FurnaceBlockEntity: menu must have exactly ${FURNACE_MENU_SLOT_COUNT} slots`);
  }
  return validateContainerMenu({
    slots,
    playerSlotStart: FURNACE_PLAYER_SLOT_START,
    cursor: cursor ?? { item: null, count: 0 },
  });
}

/** Apply one 106 transaction to a furnace menu, returning a NEW immutable menu. */
export function applyFurnaceMenuTransaction(menu: ContainerMenu, transaction: MenuTransaction): ContainerMenu {
  return applyMenuTransaction(menu, transaction);
}

function assertFurnaceMenu(menu: ContainerMenu): void {
  if (menu.slots.length !== FURNACE_MENU_SLOT_COUNT || menu.playerSlotStart !== FURNACE_PLAYER_SLOT_START) {
    throw new Error('FurnaceBlockEntity: menu is not a furnace menu');
  }
}

/** Extract the three furnace slots (indices 0-2) from a furnace menu. */
export function extractFurnaceSlots(menu: ContainerMenu): { input: MenuSlot; fuel: MenuSlot; output: MenuSlot } {
  assertFurnaceMenu(menu);
  return {
    input: { ...menu.slots[FURNACE_INPUT_SLOT]! },
    fuel: { ...menu.slots[FURNACE_FUEL_SLOT]! },
    output: { ...menu.slots[FURNACE_OUTPUT_SLOT]! },
  };
}

/** Extract the 36 player slots (indices 3-38) from a furnace menu. */
export function extractFurnacePlayerSlots(menu: ContainerMenu): MenuSlot[] {
  assertFurnaceMenu(menu);
  return menu.slots.slice(FURNACE_PLAYER_SLOT_START).map((s) => ({ ...s }));
}

/** Return a NEW state with the same timers and the given slots. */
export function withFurnaceSlots(
  state: FurnaceState,
  slots: { input: MenuSlot; fuel: MenuSlot; output: MenuSlot },
): FurnaceState {
  const valid = validateFurnaceState(state);
  const next: FurnaceState = {
    input: { ...slots.input },
    fuel: { ...slots.fuel },
    output: { ...slots.output },
    burnTime: valid.burnTime,
    burnTimeTotal: valid.burnTimeTotal,
    smeltTime: valid.smeltTime,
    smeltTimeTotal: valid.smeltTimeTotal,
  };
  return validateFurnaceState(next);
}

/** Smelt progress fraction in [0,1]; 0 when nothing cooks. */
export function furnaceTickProgress(state: FurnaceState): number {
  const valid = validateFurnaceState(state);
  if (valid.smeltTimeTotal === 0) {
    return 0;
  }
  return Math.min(1, valid.smeltTime / valid.smeltTimeTotal);
}

/** Burn progress fraction in [0,1]; 0 when not burning. */
export function furnaceBurnFraction(state: FurnaceState): number {
  const valid = validateFurnaceState(state);
  if (valid.burnTimeTotal === 0) {
    return 0;
  }
  return Math.min(1, valid.burnTime / valid.burnTimeTotal);
}

/** Build a 052 furnace block-entity instance holding the serialized state. */
export function createFurnaceBlockEntity(
  x: number,
  y: number,
  z: number,
  state?: FurnaceState,
): BlockEntityInstance {
  const valid = state === undefined ? createFurnaceState() : validateFurnaceState(state);
  return new BlockEntityInstance({
    typeKey: FURNACE_TYPE_KEY,
    x,
    y,
    z,
    tickable: true,
    data: serializeFurnaceState(valid),
  });
}

/**
 * Read the state from a block-entity instance. Throws unless the instance is a furnace with
 * a valid payload.
 */
export function readFurnaceState(instance: BlockEntityInstance): FurnaceState {
  if (instance.typeKey !== FURNACE_TYPE_KEY) {
    throw new Error(`FurnaceBlockEntity: expected typeKey '${FURNACE_TYPE_KEY}', got '${instance.typeKey}'`);
  }
  return deserializeFurnaceState(instance.data);
}

/** Return a NEW furnace instance with the given state; the old instance is unchanged. */
export function updateFurnaceState(
  instance: BlockEntityInstance,
  state: FurnaceState,
): BlockEntityInstance {
  const valid = validateFurnaceState(state);
  return new BlockEntityInstance({
    typeKey: instance.typeKey,
    x: instance.x,
    y: instance.y,
    z: instance.z,
    tickable: true,
    data: serializeFurnaceState(valid),
  });
}
