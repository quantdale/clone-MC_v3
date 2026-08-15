/**
 * Crafting table session (105). A `CraftingTableSession` holds a 3x3 `CraftingGrid` over a
 * readonly `TypedRecipe` snapshot with immutable updates. `craftingTableMatch`/
 * `craftingTableResult` expose the current match (104 semantics: first match wins);
 * `takeCraftingTableResult` consumes exactly the matched cells and returns the result slot,
 * or returns the session unchanged with null when nothing matches (never throws).
 * `CRAFTING_TABLE_BLOCK_ID` documents the reserved block id (13) for the block expansion;
 * the UI layer opens sessions keyed on it and routes taken results into inventory.
 */

import { craftCraftingGrid, emptyCraftingGrid, matchCraftingRecipe, type CraftingGrid, type CraftingSlot } from './CraftingGrid';
import type { TypedRecipe } from './TypedRecipe';

/** Reserved crafting-table block id (documented; materialized by the block expansion). */
export const CRAFTING_TABLE_BLOCK_ID = 13;

/** A 3x3 crafting table session over a captured recipe snapshot. */
export interface CraftingTableSession {
  grid: CraftingGrid;
  recipes: readonly TypedRecipe[];
}

/** Build an empty 3x3 table session over a recipe snapshot. */
export function createCraftingTableSession(recipes: readonly TypedRecipe[]): CraftingTableSession {
  return { grid: emptyCraftingGrid(3, 3), recipes: [...recipes] };
}

/** Return a NEW session with the cell at (x, y) replaced; bounds/slots validated. */
export function setCraftingTableSlot(
  session: CraftingTableSession,
  x: number,
  y: number,
  slot: CraftingSlot | null,
): CraftingTableSession {
  return { grid: setGridSlot(session.grid, x, y, slot), recipes: session.recipes };
}

function setGridSlot(grid: CraftingGrid, x: number, y: number, slot: CraftingSlot | null): CraftingGrid {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
    throw new Error(`CraftingTable: cell (${x}, ${y}) is out of bounds for the 3x3 table`);
  }
  const slots = [...grid.slots];
  const index = y * grid.width + x;
  if (slot !== null) {
    if (typeof slot.item !== 'string' || slot.item.length === 0) {
      throw new Error(`CraftingTable: slot ${index}.item must be a non-empty string`);
    }
    if (!Number.isInteger(slot.count) || slot.count <= 0) {
      throw new Error(`CraftingTable: slot ${index}.count must be a positive integer`);
    }
  }
  slots[index] = slot;
  return { width: grid.width, height: grid.height, slots };
}

/** The first recipe matching the table grid, or null. */
export function craftingTableMatch(session: CraftingTableSession): TypedRecipe | null {
  return matchCraftingRecipe(session.grid, session.recipes);
}

/** The result slot of the current match, or null. */
export function craftingTableResult(session: CraftingTableSession): CraftingSlot | null {
  const match = craftingTableMatch(session);
  return match === null ? null : { item: match.result.item, count: match.result.count };
}

/**
 * Take the result: on a match, consume exactly the matched cells and return the result slot
 * with the new session; otherwise return the same session and null. Never throws.
 */
export function takeCraftingTableResult(
  session: CraftingTableSession,
): { session: CraftingTableSession; taken: CraftingSlot | null } {
  const match = craftingTableMatch(session);
  if (match === null) {
    return { session, taken: null };
  }
  const craft = craftCraftingGrid(session.grid, match);
  if (craft === null) {
    return { session, taken: null }; // unreachable after a match; defensive
  }
  const slots = [...session.grid.slots];
  for (const cell of craft.consumed) {
    slots[cell.y * session.grid.width + cell.x] = null;
  }
  return {
    session: { grid: { width: session.grid.width, height: session.grid.height, slots }, recipes: session.recipes },
    taken: { item: craft.result.item, count: craft.result.count },
  };
}
