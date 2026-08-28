/**
 * Double-chest composition (108).
 *
 * Two horizontally adjacent chests form a double chest: a 54-slot menu view over two
 * independent 27-slot `ChestInventory`s (107). Each half persists as its own 107 envelope,
 * matching Minecraft's per-block-entity storage; pairing is purely a composition rule.
 *
 * This module owns:
 *
 * - horizontal adjacency (same Y, |dx|+|dz| == 1);
 * - deterministic, argument-order-independent pair identity (`chestPairKey`) and
 *   primary/secondary half order (`doubleChestOrder`, lexicographic by x then z);
 * - the 90-slot double-chest menu bridge (`createDoubleChestMenu`:
 *   primary 0-26, secondary 27-53, player 54-89, `playerSlotStart` 54) over the 106
 *   transaction core;
 * - exact half extraction back to 107 inventories, and unpairing to the surviving half.
 *
 * All functions are pure over plain data: valid inputs never throw, invalid inputs throw
 * descriptive errors, and identical inputs produce identical results.
 */

import { validateContainerMenu, type ContainerMenu, type MenuCursor, type MenuSlot, type MenuTransaction, applyMenuTransaction } from '../inventory/MenuTransaction';
import { type ChestInventory, validateChestInventory } from './ChestBlockEntity';

/** Total chest slots of a double chest. */
export const DOUBLE_CHEST_SLOT_COUNT = 54;
/** Total slots in a double-chest menu: 54 chest + 36 player. */
export const DOUBLE_CHEST_MENU_SLOT_COUNT = 90;
/** Index where the player region starts in a double-chest menu. */
export const DOUBLE_CHEST_PLAYER_SLOT_START = DOUBLE_CHEST_SLOT_COUNT;

/** A world position (block coordinates). */
export interface ChestPosition {
  x: number;
  y: number;
  z: number;
}

function samePosition(a: ChestPosition, b: ChestPosition): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Whether two chest positions form a horizontal adjacent pair: distinct, same Y, and exactly
 * one axis offset by 1.
 */
export function isHorizontalAdjacent(a: ChestPosition, b: ChestPosition): boolean {
  if (samePosition(a, b) || a.y !== b.y) {
    return false;
  }
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
}

function assertAdjacent(a: ChestPosition, b: ChestPosition): void {
  if (!isHorizontalAdjacent(a, b)) {
    throw new Error(
      `DoubleChest: positions (${a.x},${a.y},${a.z}) and (${b.x},${b.y},${b.z}) are not horizontally adjacent`,
    );
  }
}

function positionKey(p: ChestPosition): string {
  return `${p.x},${p.y},${p.z}`;
}

/**
 * Canonical pair identity for an adjacent pair. Argument-order independent: swapping the
 * inputs yields the same key.
 */
export function chestPairKey(a: ChestPosition, b: ChestPosition): string {
  assertAdjacent(a, b);
  const [first, second] = doubleChestOrder(a, b);
  return `${positionKey(first)}|${positionKey(second)}`;
}

function lexicographicallySmaller(a: ChestPosition, b: ChestPosition): boolean {
  if (a.x !== b.x) return a.x < b.x;
  if (a.z !== b.z) return a.z < b.z;
  return a.y < b.y;
}

/**
 * Deterministic half order for an adjacent pair: `[primary, secondary]` where the primary is
 * the lexicographically smaller position (x, then z). Throws for non-adjacent pairs.
 */
export function doubleChestOrder(a: ChestPosition, b: ChestPosition): [ChestPosition, ChestPosition] {
  assertAdjacent(a, b);
  return lexicographicallySmaller(a, b) ? [a, b] : [b, a];
}

/**
 * Build a 90-slot double-chest menu: primary half 0-26, secondary half 27-53, player 54-89,
 * `playerSlotStart` 54, cursor empty unless supplied. Both halves and every slot are
 * validated; invalid input throws.
 */
export function createDoubleChestMenu(
  primary: ChestInventory,
  secondary: ChestInventory,
  playerSlots: MenuSlot[],
  cursor?: MenuCursor,
): ContainerMenu {
  const p = validateChestInventory(primary);
  const s = validateChestInventory(secondary);
  if (!Array.isArray(playerSlots)) {
    throw new Error('DoubleChest: playerSlots must be an array of exactly 36 slots');
  }
  const slots = [...p.slots, ...s.slots, ...playerSlots];
  if (slots.length !== DOUBLE_CHEST_MENU_SLOT_COUNT) {
    throw new Error(`DoubleChest: menu must have exactly ${DOUBLE_CHEST_MENU_SLOT_COUNT} slots`);
  }
  return validateContainerMenu({
    slots,
    playerSlotStart: DOUBLE_CHEST_PLAYER_SLOT_START,
    cursor: cursor ?? { item: null, count: 0 },
  });
}

/** Apply one 106 transaction to a double-chest menu, returning a NEW immutable menu. */
export function applyDoubleChestMenuTransaction(menu: ContainerMenu, transaction: MenuTransaction): ContainerMenu {
  return applyMenuTransaction(menu, transaction);
}

function assertDoubleChestMenu(menu: ContainerMenu): void {
  if (menu.slots.length !== DOUBLE_CHEST_MENU_SLOT_COUNT || menu.playerSlotStart !== DOUBLE_CHEST_PLAYER_SLOT_START) {
    throw new Error('DoubleChest: menu is not a double-chest menu');
  }
}

/** Extract the two 27-slot halves (primary 0-26, secondary 27-53) from a double-chest menu. */
export function extractDoubleChestHalves(menu: ContainerMenu): { primary: ChestInventory; secondary: ChestInventory } {
  assertDoubleChestMenu(menu);
  return {
    primary: { slots: menu.slots.slice(0, 27).map((s) => ({ ...s })) },
    secondary: { slots: menu.slots.slice(27, 54).map((s) => ({ ...s })) },
  };
}

/** Extract the 36 player slots (indices 54-89) from a double-chest menu. */
export function extractDoubleChestPlayerSlots(menu: ContainerMenu): MenuSlot[] {
  assertDoubleChestMenu(menu);
  return menu.slots.slice(DOUBLE_CHEST_PLAYER_SLOT_START).map((s) => ({ ...s }));
}

/**
 * Unpair a double chest: `removed` must be one of the two positions; the other position's
 * inventory is returned as the surviving single chest. Throws when `removed` matches neither.
 */
export function unpairDoubleChest(
  removed: ChestPosition,
  a: ChestPosition,
  aInventory: ChestInventory,
  b: ChestPosition,
  bInventory: ChestInventory,
): ChestInventory {
  assertAdjacent(a, b);
  const aInv = validateChestInventory(aInventory);
  const bInv = validateChestInventory(bInventory);
  if (samePosition(removed, a)) {
    return bInv;
  }
  if (samePosition(removed, b)) {
    return aInv;
  }
  throw new Error(
    `DoubleChest: removed position (${removed.x},${removed.y},${removed.z}) matches neither paired position`,
  );
}
