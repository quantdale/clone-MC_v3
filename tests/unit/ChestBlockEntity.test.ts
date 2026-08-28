import { describe, it, expect } from 'vitest';
import { BlockEntityManager } from '../../src/simulation/BlockEntityManager';
import {
  CHEST_BLOCK_ID,
  CHEST_INVENTORY_SIZE,
  CHEST_ITEM_ID,
  CHEST_MENU_SLOT_COUNT,
  CHEST_PLAYER_SLOT_START,
  CHEST_TYPE_KEY,
  DEFAULT_SLOT_MAX_STACK,
  PLAYER_INVENTORY_SIZE,
  applyChestMenuTransaction,
  chestEntityContents,
  chestInstanceContents,
  createChestBlockEntity,
  createChestInventory,
  createChestMenu,
  deserializeChestInventory,
  extractChestInventory,
  extractPlayerSlots,
  readChestEntity,
  serializeChestInventory,
  updateChestEntityInventory,
  validateChestInventory,
} from '../../src/world/ChestBlockEntity';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import {
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';

function slot(item: string | null, count: number, maxStack = DEFAULT_SLOT_MAX_STACK): MenuSlot {
  return { item, count, maxStack };
}

function filledInventory(): ReturnType<typeof createChestInventory> {
  const inv = createChestInventory();
  inv.slots[0] = slot('minecraft:coal', 5);
  inv.slots[2] = slot('minecraft:raw_iron', 1, 64);
  inv.slots[26] = slot('minecraft:wooden_axe', 1, 1);
  return inv;
}

function playerSlots(): MenuSlot[] {
  const slots: MenuSlot[] = [];
  for (let i = 0; i < PLAYER_INVENTORY_SIZE; i++) {
    slots.push(slot(null, 0));
  }
  return slots;
}

describe('chest inventory construction and validation', () => {
  it('creates 27 empty slots with maxStack 64', () => {
    const inv = createChestInventory();
    expect(inv.slots).toHaveLength(CHEST_INVENTORY_SIZE);
    for (const s of inv.slots) {
      expect(s).toEqual({ item: null, count: 0, maxStack: 64 });
    }
    expect(validateChestInventory(inv)).toEqual(inv);
  });

  it('rejects non-object inventories', () => {
    expect(() => validateChestInventory(null)).toThrow(/must be an object/);
    expect(() => validateChestInventory(42)).toThrow(/must be an object/);
  });

  it('rejects wrong slot counts', () => {
    const inv = createChestInventory();
    expect(() => validateChestInventory({ slots: inv.slots.slice(0, 26) })).toThrow(/exactly 27/);
    expect(() =>
      validateChestInventory({ slots: [...inv.slots, slot('minecraft:coal', 1)] }),
    ).toThrow(/exactly 27/);
    expect(() => validateChestInventory({ slots: 'nope' })).toThrow(/array of exactly 27/);
  });

  it('rejects malformed slots', () => {
    const inv = createChestInventory();
    const bad = [...inv.slots];
    bad[0] = { item: 'minecraft:coal', count: 0, maxStack: 64 };
    expect(() => validateChestInventory({ slots: bad })).toThrow(/count must be an integer/);

    const over = [...inv.slots];
    over[0] = { item: 'minecraft:coal', count: 65, maxStack: 64 };
    expect(() => validateChestInventory({ slots: over })).toThrow(/count must be an integer in \[1, maxStack\]/);

    const badMax = [...inv.slots];
    badMax[0] = { item: 'minecraft:coal', count: 1, maxStack: 0 };
    expect(() => validateChestInventory({ slots: badMax })).toThrow(/maxStack must be an integer in \[1, 64\]/);

    const badMaxHigh = [...inv.slots];
    badMaxHigh[0] = { item: 'minecraft:coal', count: 1, maxStack: 65 };
    expect(() => validateChestInventory({ slots: badMaxHigh })).toThrow(/maxStack must be an integer in \[1, 64\]/);

    const negative = [...inv.slots];
    negative[0] = { item: null, count: -1, maxStack: 64 };
    expect(() => validateChestInventory({ slots: negative })).toThrow(/count 0/);

    const fractional = [...inv.slots];
    fractional[0] = { item: 'minecraft:coal', count: 1.5, maxStack: 64 };
    expect(() => validateChestInventory({ slots: fractional })).toThrow(/integer/);

    const emptyItem = [...inv.slots];
    emptyItem[0] = { item: '', count: 1, maxStack: 64 };
    expect(() => validateChestInventory({ slots: emptyItem })).toThrow(/non-empty string or null/);

    expect(() => validateChestInventory({ slots: [null, ...inv.slots.slice(1)] })).toThrow(/must be an object/);
  });
});

describe('chest inventory serialization', () => {
  it('round-trips empty and filled inventories exactly', () => {
    const empty = createChestInventory();
    expect(deserializeChestInventory(serializeChestInventory(empty))).toEqual(empty);

    const filled = filledInventory();
    const restored = deserializeChestInventory(serializeChestInventory(filled));
    expect(restored).toEqual(filled);
    expect(restored.slots[26]).toEqual(slot('minecraft:wooden_axe', 1, 1));
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeChestInventory(null)).toThrow(/must be an object/);
    expect(() => deserializeChestInventory('x')).toThrow(/must be an object/);
    expect(() => deserializeChestInventory({})).toThrow(/array of exactly 27/);
    const serialized = serializeChestInventory(createChestInventory()) as { slots: unknown[] };
    expect(() => deserializeChestInventory({ slots: serialized.slots.slice(0, 5) })).toThrow(/exactly 27/);
    const bad = { slots: [{ item: 'minecraft:coal', count: 0, maxStack: 64 }] };
    expect(() => deserializeChestInventory(bad)).toThrow(/exactly 27/);
    const badSlot = [...serialized.slots] as Record<string, unknown>[];
    badSlot[0] = { item: 'minecraft:coal', count: 100, maxStack: 64 };
    expect(() => deserializeChestInventory({ slots: badSlot })).toThrow(/count must be an integer/);
  });
});

describe('chest menu bridge', () => {
  it('builds a 63-slot menu with playerSlotStart 27', () => {
    const inv = filledInventory();
    const menu = createChestMenu(inv, playerSlots());
    expect(menu.slots).toHaveLength(CHEST_MENU_SLOT_COUNT);
    expect(menu.playerSlotStart).toBe(CHEST_PLAYER_SLOT_START);
    expect(menu.cursor).toEqual({ item: null, count: 0 });
    expect(extractChestInventory(menu)).toEqual(inv);
    expect(extractPlayerSlots(menu)).toEqual(playerSlots());
  });

  it('validates player slots and cursors', () => {
    const badPlayer = playerSlots();
    badPlayer[0] = { item: null, count: 1, maxStack: 64 };
    expect(() => createChestMenu(createChestInventory(), badPlayer)).toThrow(/null item must have count 0/);
    expect(() => createChestMenu(createChestInventory(), playerSlots().slice(0, 35))).toThrow(/exactly 36/);
    expect(() =>
      createChestMenu(createChestInventory(), playerSlots(), { item: 'minecraft:coal', count: 65 }),
    ).toThrow(/cursor/);
  });

  it('applies left-click pickup from the chest region', () => {
    const inv = filledInventory();
    const menu = createChestMenu(inv, playerSlots());
    const next = applyChestMenuTransaction(menu, { type: 'leftClick', index: 0 });
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 5 });
    expect(extractChestInventory(next).slots[0]).toEqual(slot(null, 0));
    // Source unchanged (immutability).
    expect(menu.cursor).toEqual({ item: null, count: 0 });
    expect(extractChestInventory(menu)).toEqual(inv);
  });

  it('applies left-click merge into a player slot and swap', () => {
    const inv = filledInventory();
    const player = playerSlots();
    player[0] = slot('minecraft:coal', 60);
    const menu = createChestMenu(inv, player);
    // Pick the chest coal stack (5) onto the cursor.
    const picked = applyChestMenuTransaction(menu, { type: 'leftClick', index: 0 });
    // Merge into the player coal slot (60 + 5 = 65 > 64 -> 4 moved, 1 remains).
    const merged = applyChestMenuTransaction(picked, { type: 'leftClick', index: 27 });
    expect(merged.cursor).toEqual({ item: 'minecraft:coal', count: 1 });
    expect(extractPlayerSlots(merged)[0]).toEqual(slot('minecraft:coal', 64));

    // Swap: click a different player slot holding raw_iron x2.
    const swapInv = createChestInventory();
    swapInv.slots[0] = slot('minecraft:coal', 3);
    const player2 = playerSlots();
    player2[1] = slot('minecraft:raw_iron', 2);
    const swapMenu = createChestMenu(swapInv, player2);
    const pickedSwap = applyChestMenuTransaction(swapMenu, { type: 'leftClick', index: 0 });
    const swapped = applyChestMenuTransaction(pickedSwap, { type: 'leftClick', index: 28 });
    expect(swapped.cursor).toEqual({ item: 'minecraft:raw_iron', count: 2 });
    expect(extractPlayerSlots(swapped)[1]).toEqual(slot('minecraft:coal', 3));
    expect(extractChestInventory(swapped).slots[0]).toEqual(slot(null, 0));
  });

  it('applies right-click split-half pickup', () => {
    const inv = createChestInventory();
    inv.slots[0] = slot('minecraft:coal', 7);
    const menu = createChestMenu(inv, playerSlots());
    const next = applyChestMenuTransaction(menu, { type: 'rightClick', index: 0 });
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 4 });
    expect(extractChestInventory(next).slots[0]).toEqual(slot('minecraft:coal', 3));
  });

  it('applies placeOne from the cursor into a chest slot', () => {
    const inv = createChestInventory();
    const menu = createChestMenu(inv, playerSlots(), { item: 'minecraft:coal', count: 2 });
    const next = applyChestMenuTransaction(menu, { type: 'placeOne', index: 5 });
    expect(extractChestInventory(next).slots[5]).toEqual(slot('minecraft:coal', 1));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 1 });
  });

  it('quick-moves a chest stack into the player region first-fit', () => {
    const inv = createChestInventory();
    inv.slots[0] = slot('minecraft:coal', 10);
    const player = playerSlots();
    player[0] = slot('minecraft:coal', 62);
    player[1] = slot(null, 0, 64);
    const menu = createChestMenu(inv, player);
    const next = applyChestMenuTransaction(menu, { type: 'quickMove', index: 0 });
    // 62 + 2 = 64 into slot 27 (player[0]), then 8 into the empty slot 28 (player[1]).
    expect(extractPlayerSlots(next)[0]).toEqual(slot('minecraft:coal', 64));
    expect(extractPlayerSlots(next)[1]).toEqual(slot('minecraft:coal', 8));
    expect(extractChestInventory(next).slots[0]).toEqual(slot(null, 0));
  });

  it('quick-moves a player stack into the chest region with remainder', () => {
    const inv = createChestInventory();
    inv.slots[0] = slot('minecraft:coal', 60);
    const player = playerSlots();
    player[0] = slot('minecraft:coal', 30);
    const menu = createChestMenu(inv, player);
    const next = applyChestMenuTransaction(menu, { type: 'quickMove', index: 27 });
    // First pass merges 4 into chest slot 0 (60 + 4 = 64); the remaining 26
    // fills the first empty chest slot (slot 1); the player slot empties.
    expect(extractChestInventory(next).slots[0]).toEqual(slot('minecraft:coal', 64));
    expect(extractChestInventory(next).slots[1]).toEqual(slot('minecraft:coal', 26));
    expect(extractPlayerSlots(next)[0]).toEqual(slot(null, 0));
  });

  it('throws on out-of-bounds transaction indices', () => {
    const menu = createChestMenu(createChestInventory(), playerSlots());
    expect(() => applyChestMenuTransaction(menu, { type: 'leftClick', index: -1 })).toThrow(/out of bounds/);
    expect(() => applyChestMenuTransaction(menu, { type: 'leftClick', index: 63 })).toThrow(/out of bounds/);
  });

  it('rejects extraction from a non-chest menu', () => {
    const menu = createChestMenu(createChestInventory(), playerSlots());
    const foreign = { ...menu, slots: menu.slots.slice(0, 10), playerSlotStart: 5 };
    expect(() => extractChestInventory(foreign)).toThrow(/not a chest menu/);
    expect(() => extractPlayerSlots(foreign)).toThrow(/not a chest menu/);
  });
});

describe('chest block-entity lifecycle', () => {
  it('creates a chest instance whose payload round-trips', () => {
    const entity = createChestBlockEntity(1, 2, 3);
    expect(entity.typeKey).toBe(CHEST_TYPE_KEY);
    expect(entity.tickable).toBe(false);
    expect(readChestEntity(entity)).toEqual(createChestInventory());

    const filled = filledInventory();
    const entity2 = createChestBlockEntity(1, 2, 3, filled);
    expect(readChestEntity(entity2)).toEqual(filled);
  });

  it('updateChestEntityInventory returns a new instance and leaves the old unchanged', () => {
    const entity = createChestBlockEntity(4, 5, 6);
    const filled = filledInventory();
    const updated = updateChestEntityInventory(entity, filled);
    expect(updated).not.toBe(entity);
    expect(updated.x).toBe(4);
    expect(updated.y).toBe(5);
    expect(updated.z).toBe(6);
    expect(readChestEntity(updated)).toEqual(filled);
    expect(readChestEntity(entity)).toEqual(createChestInventory());
  });

  it('rejects reads of non-chest instances', () => {
    const entity = createChestBlockEntity(1, 2, 3);
    const foreign = { ...entity, typeKey: 'furnace' } as typeof entity;
    expect(() => readChestEntity(foreign)).toThrow(/expected typeKey 'chest'/);
  });

  it('rejects reads of instances with malformed payloads', () => {
    const entity = createChestBlockEntity(1, 2, 3);
    const malformed = { ...entity, data: { slots: 'garbage' } } as typeof entity;
    expect(() => readChestEntity(malformed)).toThrow(/array of exactly 27/);
  });
});

describe('chest contents extraction', () => {
  it('lists non-empty stacks in slot order', () => {
    const inv = filledInventory();
    expect(chestEntityContents(inv)).toEqual([
      { item: 'minecraft:coal', count: 5 },
      { item: 'minecraft:raw_iron', count: 1 },
      { item: 'minecraft:wooden_axe', count: 1 },
    ]);
    expect(chestEntityContents(createChestInventory())).toEqual([]);
    expect(chestInstanceContents(createChestBlockEntity(0, 0, 0, filledInventory()))).toEqual(
      chestEntityContents(filledInventory()),
    );
  });
});

describe('block-entity manager chunk round-trip', () => {
  it('serializes and restores a chest entity across a chunk boundary', () => {
    const manager = new BlockEntityManager();
    const entity = createChestBlockEntity(20, 30, 40, filledInventory());
    expect(manager.add(entity)).toBe(true);
    expect(manager.serializeChunk(1, 2)).toHaveLength(1);
    expect(manager.serializeChunk(3, 4)).toHaveLength(0);

    const fresh = new BlockEntityManager();
    expect(fresh.deserializeChunk(1, 2, manager.serializeChunk(1, 2))).toBe(1);
    const restored = fresh.get(20, 30, 40);
    expect(restored).not.toBeNull();
    expect(readChestEntity(restored!)).toEqual(filledInventory());
  });

  it('rejects restoring a chest outside its chunk', () => {
    const manager = new BlockEntityManager();
    const entity = createChestBlockEntity(20, 30, 40, filledInventory());
    manager.add(entity);
    const fresh = new BlockEntityManager();
    expect(() => fresh.deserializeChunk(9, 9, manager.serializeChunk(1, 2))).toThrow(/outside chunk/);
  });
});

describe('registry integration', () => {
  it('registers chest block 19 and item 25 with valid cross-references', () => {
    const blocks = createDefaultBlockRegistry();
    const items = createDefaultItemRegistry();
    expect(() => validateItemBlockCrossReferences(blocks, items)).not.toThrow();

    const block = blocks.get(CHEST_BLOCK_ID);
    expect(block.key).toBe('chest');
    expect(block.solid).toBe(true);
    expect(block.breakable).toBe(true);
    expect(block.hardness).toBe(2.5);
    expect(block.lootTable).toBeDefined();
    expect(blocks.getByResourceId(block.dropItem!)!.id).toBe(CHEST_BLOCK_ID); // block self-drop

    const item = items.get(CHEST_ITEM_ID);
    expect(item.key).toBe('chest');
    expect(item.stackSize).toBe(64);
    expect(blocks.getByResourceId(item.placeBlock!)!.id).toBe(CHEST_BLOCK_ID);
    // The auto-built loot table resolves the chest drop (item side).
    expect(items.hasByResourceId(block.dropItem!)).toBe(true);
  });
});
