import { describe, it, expect } from 'vitest';
import {
  CRAFTING_TABLE_BLOCK_ID,
  createCraftingTableSession,
  craftingTableMatch,
  craftingTableResult,
  setCraftingTableSlot,
  takeCraftingTableResult,
  type CraftingTableSession,
} from '../../src/inventory/CraftingTable';
import { createDefaultTypedRecipes, type TypedRecipe } from '../../src/inventory/TypedRecipe';

const recipes: TypedRecipe[] = createDefaultTypedRecipes().all();

function pickaxeSession(): CraftingTableSession {
  let session = createCraftingTableSession(recipes);
  session = setCraftingTableSlot(session, 0, 0, { item: 'minecraft:planks', count: 1 });
  session = setCraftingTableSlot(session, 1, 0, { item: 'minecraft:planks', count: 1 });
  session = setCraftingTableSlot(session, 2, 0, { item: 'minecraft:planks', count: 1 });
  session = setCraftingTableSlot(session, 1, 1, { item: 'minecraft:stick', count: 1 });
  session = setCraftingTableSlot(session, 1, 2, { item: 'minecraft:stick', count: 1 });
  return session;
}

function glassSession(): CraftingTableSession {
  let session = createCraftingTableSession(recipes);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      session = setCraftingTableSlot(session, x, y, x < 2 && y < 2 ? { item: 'minecraft:sand', count: 1 } : null);
    }
  }
  return session;
}

describe('session lifecycle', () => {
  it('creates an empty 3x3 session over the recipe snapshot', () => {
    const session = createCraftingTableSession(recipes);
    expect(session.grid.width).toBe(3);
    expect(session.grid.height).toBe(3);
    expect(session.grid.slots.every((s) => s === null)).toBe(true);
    expect(session.recipes.length).toBe(5);
  });

  it('updates immutably and rejects invalid cells/slots', () => {
    const session = createCraftingTableSession(recipes);
    const next = setCraftingTableSlot(session, 0, 0, { item: 'minecraft:sand', count: 1 });
    expect(session.grid.slots[0]).toBeNull();
    expect(next.grid.slots[0]).toEqual({ item: 'minecraft:sand', count: 1 });
    expect(() => setCraftingTableSlot(session, 3, 0, { item: 'minecraft:sand', count: 1 })).toThrow(/out of bounds/i);
    expect(() => setCraftingTableSlot(session, 0, 0, { item: '', count: 1 })).toThrow(/item/i);
    expect(() => setCraftingTableSlot(session, 0, 0, { item: 'minecraft:sand', count: 0 })).toThrow(/count/i);
  });
});

describe('matching and result', () => {
  it('matches the wooden pickaxe on the 3x3 table', () => {
    const session = pickaxeSession();
    const match = craftingTableMatch(session);
    expect(match?.kind).toBe('shaped');
    expect(match?.key).toBe('wooden_pickaxe');
    expect(craftingTableResult(session)).toEqual({ item: 'minecraft:wooden_pickaxe', count: 1 });
  });

  it('matches the glass recipe in a corner of the table', () => {
    const session = glassSession();
    const match = craftingTableMatch(session);
    expect(match?.kind).toBe('shapeless');
    expect(match?.key).toBe('glass');
    expect(craftingTableResult(session)).toEqual({ item: 'minecraft:glass', count: 1 });
  });

  it('returns null for an empty or non-matching session', () => {
    const empty = createCraftingTableSession(recipes);
    expect(craftingTableMatch(empty)).toBeNull();
    expect(craftingTableResult(empty)).toBeNull();

    let session = createCraftingTableSession(recipes);
    session = setCraftingTableSlot(session, 0, 0, { item: 'minecraft:gravel', count: 1 });
    expect(craftingTableMatch(session)).toBeNull();
    expect(craftingTableResult(session)).toBeNull();
  });
});

describe('takeCraftingTableResult', () => {
  it('consumes exactly the pattern cells for the pickaxe', () => {
    const session = pickaxeSession();
    const { session: next, taken } = takeCraftingTableResult(session);
    expect(taken).toEqual({ item: 'minecraft:wooden_pickaxe', count: 1 });
    // The five pattern-covered cells (which held items) are emptied.
    for (const i of [0, 1, 2, 4, 7]) {
      expect(next.grid.slots[i]).toBeNull();
    }
    // The whole grid ends up empty (the other cells were already empty).
    expect(next.grid.slots.every((s) => s === null)).toBe(true);
    // The original session is unchanged.
    expect(craftingTableMatch(session)).not.toBeNull();
    // The consumed session no longer matches.
    expect(craftingTableMatch(next)).toBeNull();
  });

  it('consumes all four sand cells for glass', () => {
    const session = glassSession();
    const { session: next, taken } = takeCraftingTableResult(session);
    expect(taken).toEqual({ item: 'minecraft:glass', count: 1 });
    for (const i of [0, 1, 3, 4]) {
      expect(next.grid.slots[i]).toBeNull();
    }
    for (const i of [2, 5, 6, 7, 8]) {
      expect(next.grid.slots[i]).toBeNull();
    }
    expect(craftingTableMatch(next)).toBeNull();
  });

  it('returns the unchanged session and null without a match', () => {
    const session = createCraftingTableSession(recipes);
    const { session: next, taken } = takeCraftingTableResult(session);
    expect(taken).toBeNull();
    expect(next).toBe(session);
  });

  it('is deterministic', () => {
    const session = pickaxeSession();
    const a = takeCraftingTableResult(session);
    const b = takeCraftingTableResult(session);
    expect(b.session.grid.slots).toEqual(a.session.grid.slots);
    expect(b.taken).toEqual(a.taken);
  });
});

describe('CRAFTING_TABLE_BLOCK_ID', () => {
  it('documents the reserved id 13', () => {
    expect(CRAFTING_TABLE_BLOCK_ID).toBe(13);
  });
});
