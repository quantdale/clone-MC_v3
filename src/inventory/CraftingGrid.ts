/**
 * Crafting grid evaluation (104). A `CraftingGrid` is a validated 1-3 x 1-3 row-major grid of
 * slots (item resource-id strings, or empty). `matchCraftingRecipe` finds the first recipe
 * matching the grid: shaped patterns fit top-left with `_` matching empty slots and no extra
 * filled cells outside the pattern; shapeless recipes match by ingredient multiset.
 * `craftCraftingGrid` returns the exact result and consumed cell coordinates for a matching
 * recipe (pattern-covered cells for shaped, all filled cells for shapeless). Grid updates are
 * immutable; matching and crafting never throw.
 */

import type { RecipeResult, TypedRecipe } from './TypedRecipe';

/** A filled grid cell: an item resource id and a payload count (one ingredient per cell). */
export interface CraftingSlot {
  item: string;
  count: number;
}

/** A validated crafting grid (row-major slots). */
export interface CraftingGrid {
  width: number;
  height: number;
  slots: Array<CraftingSlot | null>;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function validateGridShape(width: number, height: number): void {
  if (!isPositiveInteger(width) || width > 3 || !isPositiveInteger(height) || height > 3) {
    throw new Error(`CraftingGrid: width/height must be integers in [1, 3], got ${width}x${height}`);
  }
}

function validateSlot(slot: CraftingSlot | null, index: number): void {
  if (slot === null) {
    return;
  }
  if (typeof slot.item !== 'string' || slot.item.length === 0) {
    throw new Error(`CraftingGrid: slot ${index}.item must be a non-empty string`);
  }
  if (!isPositiveInteger(slot.count)) {
    throw new Error(`CraftingGrid: slot ${index}.count must be a positive integer`);
  }
}

/** Build a validated crafting grid; slots default to empty. */
export function createCraftingGrid(width: number, height: number, slots?: Array<CraftingSlot | null>): CraftingGrid {
  validateGridShape(width, height);
  const resolved: Array<CraftingSlot | null> = slots ?? Array(width * height).fill(null);
  if (resolved.length !== width * height) {
    throw new Error(`CraftingGrid: slots length must be ${width * height}, got ${resolved.length}`);
  }
  for (let i = 0; i < resolved.length; i++) {
    validateSlot(resolved[i]!, i);
  }
  return { width, height, slots: [...resolved] };
}

/** An all-empty grid. */
export function emptyCraftingGrid(width: number, height: number): CraftingGrid {
  return createCraftingGrid(width, height);
}

/** Return a NEW grid with the cell at (x, y) replaced (immutable update). */
export function setCraftingSlot(grid: CraftingGrid, x: number, y: number, slot: CraftingSlot | null): CraftingGrid {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
    throw new Error(`CraftingGrid: cell (${x}, ${y}) is out of bounds for ${grid.width}x${grid.height}`);
  }
  const index = y * grid.width + x;
  validateSlot(slot, index);
  const slots = [...grid.slots];
  slots[index] = slot;
  return { width: grid.width, height: grid.height, slots };
}

/** The item in a grid cell, or null when empty. */
function itemAt(grid: CraftingGrid, x: number, y: number): string | null {
  const slot = grid.slots[y * grid.width + x];
  return slot === null || slot === undefined ? null : slot.item;
}

/** Whether a shaped recipe matches the grid (fit, empty equivalence, no extras). */
function matchesShaped(grid: CraftingGrid, recipe: Extract<TypedRecipe, { kind: 'shaped' }>): boolean {
  const patternHeight = recipe.pattern.length;
  const patternWidth = recipe.pattern[0]!.length;
  if (patternHeight > grid.height || patternWidth > grid.width) {
    return false;
  }
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const item = itemAt(grid, x, y);
      if (x < patternWidth && y < patternHeight) {
        const ch = recipe.pattern[y]![x]!;
        if (ch === '_') {
          if (item !== null) {
            return false;
          }
        } else if (item !== recipe.keys[ch]) {
          return false;
        }
      } else if (item !== null) {
        return false; // filled cell outside the pattern
      }
    }
  }
  return true;
}

/** Whether a shapeless recipe matches the grid by ingredient multiset. */
function matchesShapeless(grid: CraftingGrid, recipe: Extract<TypedRecipe, { kind: 'shapeless' }>): boolean {
  const counts = new Map<string, number>();
  for (const ingredient of recipe.ingredients) {
    counts.set(ingredient, (counts.get(ingredient) ?? 0) + 1);
  }
  let filled = 0;
  for (const slot of grid.slots) {
    if (slot !== null && slot !== undefined) {
      filled++;
      const remaining = (counts.get(slot.item) ?? 0) - 1;
      if (remaining < 0) {
        return false;
      }
      counts.set(slot.item, remaining);
    }
  }
  if (filled !== recipe.ingredients.length) {
    return false;
  }
  for (const remaining of counts.values()) {
    if (remaining !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Find the first recipe (input order) matching the grid; returns null when none match.
 * Processing recipes never match a grid.
 */
export function matchCraftingRecipe(grid: CraftingGrid, recipes: readonly TypedRecipe[]): TypedRecipe | null {
  for (const recipe of recipes) {
    if (recipe.kind === 'shaped') {
      if (matchesShaped(grid, recipe)) {
        return recipe;
      }
    } else if (recipe.kind === 'shapeless') {
      if (matchesShapeless(grid, recipe)) {
        return recipe;
      }
    }
  }
  return null;
}

/** Consumed cell coordinates for a matched recipe. */
export interface CraftingConsumption {
  recipe: TypedRecipe;
  result: RecipeResult;
  consumed: Array<{ x: number; y: number }>;
}

/**
 * Compute the result and exact consumed cells for a recipe on a grid; null when the recipe
 * does not match. Never throws.
 */
export function craftCraftingGrid(grid: CraftingGrid, recipe: TypedRecipe): CraftingConsumption | null {
  if (recipe.kind === 'shaped') {
    if (!matchesShaped(grid, recipe)) {
      return null;
    }
    const patternWidth = recipe.pattern[0]!.length;
    const consumed: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < recipe.pattern.length; y++) {
      for (let x = 0; x < patternWidth; x++) {
        if (recipe.pattern[y]![x] !== '_') {
          consumed.push({ x, y });
        }
      }
    }
    return { recipe, result: recipe.result, consumed };
  }
  if (recipe.kind === 'shapeless') {
    if (!matchesShapeless(grid, recipe)) {
      return null;
    }
    const consumed: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (itemAt(grid, x, y) !== null) {
          consumed.push({ x, y });
        }
      }
    }
    return { recipe, result: recipe.result, consumed };
  }
  return null; // processing recipes never craft on a grid
}
