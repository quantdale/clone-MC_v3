/**
 * Single chest block-entity core (107).
 *
 * A chest is a 27-slot inventory hosted by a block entity of the `chest` type (018 registry).
 * This module owns the chest payload end to end:
 *
 * - the 27-slot `ChestInventory` model with strict validation;
 * - 036-envelope serialization (`serializeChestInventory`/`deserializeChestInventory`) so the
 *   opaque persistence payload is lossless and round-trip exact;
 * - the 106 container-menu bridge (`createChestMenu` over 27 chest + 36 player slots,
 *   `applyChestMenuTransaction`, `extractChestInventory`/`extractPlayerSlots`) so a future
 *   chest screen interacts through the shared transaction core;
 * - the 052 `BlockEntityInstance` lifecycle (`createChestBlockEntity`, `readChestEntity`,
 *   `updateChestEntityInventory`) with `data` = the serialized inventory envelope;
 * - `chestEntityContents` (ordered non-empty stacks) for the future item-drop integration
 *   (111).
 *
 * All functions are pure over plain data: valid inputs never throw, invalid inputs throw
 * descriptive errors, and identical inputs produce identical results.
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

/** Stable numeric block id for the chest block. */
export const CHEST_BLOCK_ID = 19;
/** Stable numeric item id for the chest item. */
export const CHEST_ITEM_ID = 25;
/** Block-entity type key for a single chest (018 default registry). */
export const CHEST_TYPE_KEY = 'chest';
/** Inventory slot count of a single chest. */
export const CHEST_INVENTORY_SIZE = 27;
/** Player inventory slots in a chest menu: 9 hotbar + 27 storage. */
export const PLAYER_INVENTORY_SIZE = 36;
/** Total slots in a chest menu. */
export const CHEST_MENU_SLOT_COUNT = CHEST_INVENTORY_SIZE + PLAYER_INVENTORY_SIZE;
/** Index where the player region starts in a chest menu. */
export const CHEST_PLAYER_SLOT_START = CHEST_INVENTORY_SIZE;
/** Default per-slot stack cap for chest slots. */
export const DEFAULT_SLOT_MAX_STACK = 64;

/** A validated 27-slot chest inventory. */
export interface ChestInventory {
  slots: MenuSlot[];
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function validateSlot(slot: MenuSlot, index: number): void {
  if (!isPositiveInteger(slot.maxStack) || slot.maxStack > MAX_CURSOR_COUNT) {
    throw new Error(`ChestBlockEntity: slot ${index}.maxStack must be an integer in [1, ${MAX_CURSOR_COUNT}]`);
  }
  if (slot.item === null) {
    if (slot.count !== 0) {
      throw new Error(`ChestBlockEntity: slot ${index} with a null item must have count 0`);
    }
  } else {
    if (typeof slot.item !== 'string' || slot.item.length === 0) {
      throw new Error(`ChestBlockEntity: slot ${index}.item must be a non-empty string or null`);
    }
    if (!Number.isInteger(slot.count) || slot.count < 1 || slot.count > slot.maxStack) {
      throw new Error(`ChestBlockEntity: slot ${index}.count must be an integer in [1, maxStack]`);
    }
  }
}

function validateSlots(slots: unknown, length: number, what: string): MenuSlot[] {
  if (!Array.isArray(slots) || slots.length !== length) {
    throw new Error(`ChestBlockEntity: ${what} must be an array of exactly ${length} slots`);
  }
  const out: MenuSlot[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (typeof slot !== 'object' || slot === null) {
      throw new Error(`ChestBlockEntity: ${what} slot ${i} must be an object`);
    }
    const s = slot as Record<string, unknown>;
    const parsed: MenuSlot = {
      item: s.item as string | null,
      count: s.count as number,
      maxStack: s.maxStack as number,
    };
    validateSlot(parsed, i);
    out.push(parsed);
  }
  return out;
}

/** Build an empty 27-slot chest inventory. */
export function createChestInventory(): ChestInventory {
  const slots: MenuSlot[] = [];
  for (let i = 0; i < CHEST_INVENTORY_SIZE; i++) {
    slots.push({ item: null, count: 0, maxStack: DEFAULT_SLOT_MAX_STACK });
  }
  return { slots };
}

/**
 * Validate an unknown value as a `ChestInventory`. Throws a descriptive error on any invalid
 * shape or slot; never coerces.
 */
export function validateChestInventory(input: unknown): ChestInventory {
  if (typeof input !== 'object' || input === null) {
    throw new Error('ChestBlockEntity: inventory must be an object');
  }
  const r = input as Record<string, unknown>;
  const slots = validateSlots(r.slots, CHEST_INVENTORY_SIZE, 'inventory.slots');
  return { slots };
}

/** Serialize a chest inventory into the 036 opaque payload envelope (lossless). */
export function serializeChestInventory(inv: ChestInventory): unknown {
  validateChestInventory(inv);
  return {
    slots: inv.slots.map((s) => ({ item: s.item, count: s.count, maxStack: s.maxStack })),
  };
}

/** Deserialize a 036 envelope into a `ChestInventory`; throws on malformed payloads. */
export function deserializeChestInventory(data: unknown): ChestInventory {
  if (typeof data !== 'object' || data === null) {
    throw new Error('ChestBlockEntity: payload must be an object');
  }
  const r = data as Record<string, unknown>;
  const slots = validateSlots(r.slots, CHEST_INVENTORY_SIZE, 'payload.slots');
  return { slots };
}

/**
 * Build a 63-slot chest menu: slots 0-26 are the chest, slots 27-62 are the player inventory
 * (9 hotbar followed by 27 storage), cursor empty unless supplied. Every slot and the cursor
 * are validated; invalid input throws.
 */
export function createChestMenu(
  inv: ChestInventory,
  playerSlots: MenuSlot[],
  cursor?: MenuCursor,
): ContainerMenu {
  const chest = validateChestInventory(inv);
  const player = validateSlots(playerSlots, PLAYER_INVENTORY_SIZE, 'playerSlots');
  return validateContainerMenu({
    slots: [...chest.slots, ...player],
    playerSlotStart: CHEST_PLAYER_SLOT_START,
    cursor: cursor ?? { item: null, count: 0 },
  });
}

/** Apply one 106 transaction to a chest menu, returning a NEW immutable menu. */
export function applyChestMenuTransaction(menu: ContainerMenu, transaction: MenuTransaction): ContainerMenu {
  return applyMenuTransaction(menu, transaction);
}

/** Extract the 27 chest slots (indices 0-26) from a chest menu. */
export function extractChestInventory(menu: ContainerMenu): ChestInventory {
  if (menu.slots.length !== CHEST_MENU_SLOT_COUNT || menu.playerSlotStart !== CHEST_PLAYER_SLOT_START) {
    throw new Error('ChestBlockEntity: menu is not a chest menu');
  }
  return { slots: menu.slots.slice(0, CHEST_INVENTORY_SIZE).map((s) => ({ ...s })) };
}

/** Extract the 36 player slots (indices 27-62) from a chest menu. */
export function extractPlayerSlots(menu: ContainerMenu): MenuSlot[] {
  if (menu.slots.length !== CHEST_MENU_SLOT_COUNT || menu.playerSlotStart !== CHEST_PLAYER_SLOT_START) {
    throw new Error('ChestBlockEntity: menu is not a chest menu');
  }
  return menu.slots.slice(CHEST_PLAYER_SLOT_START).map((s) => ({ ...s }));
}

/** Build a 052 chest block-entity instance holding the serialized inventory. */
export function createChestBlockEntity(
  x: number,
  y: number,
  z: number,
  inventory?: ChestInventory,
): BlockEntityInstance {
  const inv = inventory === undefined ? createChestInventory() : validateChestInventory(inventory);
  return new BlockEntityInstance({
    typeKey: CHEST_TYPE_KEY,
    x,
    y,
    z,
    data: serializeChestInventory(inv),
  });
}

/**
 * Read the inventory from a block-entity instance. Throws unless the instance is a chest with
 * a valid payload.
 */
export function readChestEntity(instance: BlockEntityInstance): ChestInventory {
  if (instance.typeKey !== CHEST_TYPE_KEY) {
    throw new Error(`ChestBlockEntity: expected typeKey '${CHEST_TYPE_KEY}', got '${instance.typeKey}'`);
  }
  return deserializeChestInventory(instance.data);
}

/** Return a NEW chest instance with the given inventory; the old instance is unchanged. */
export function updateChestEntityInventory(
  instance: BlockEntityInstance,
  inventory: ChestInventory,
): BlockEntityInstance {
  const inv = validateChestInventory(inventory);
  return new BlockEntityInstance({
    typeKey: instance.typeKey,
    x: instance.x,
    y: instance.y,
    z: instance.z,
    data: serializeChestInventory(inv),
  });
}

/** Non-empty stacks of an inventory in slot order (for future 111 drop integration). */
export function chestEntityContents(inv: ChestInventory): { item: string; count: number }[] {
  const validated = validateChestInventory(inv);
  const out: { item: string; count: number }[] = [];
  for (const slot of validated.slots) {
    if (slot.item !== null && slot.count > 0) {
      out.push({ item: slot.item, count: slot.count });
    }
  }
  return out;
}

/** Convenience: the chest contents of a block-entity instance (validated). */
export function chestInstanceContents(instance: BlockEntityInstance): { item: string; count: number }[] {
  return chestEntityContents(readChestEntity(instance));
}
