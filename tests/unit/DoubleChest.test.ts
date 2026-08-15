import { describe, it, expect } from 'vitest';
import { BlockEntityManager } from '../../src/simulation/BlockEntityManager';
import {
  type ChestPosition,
  DOUBLE_CHEST_MENU_SLOT_COUNT,
  DOUBLE_CHEST_PLAYER_SLOT_START,
  DOUBLE_CHEST_SLOT_COUNT,
  applyDoubleChestMenuTransaction,
  chestPairKey,
  createDoubleChestMenu,
  doubleChestOrder,
  extractDoubleChestHalves,
  extractDoubleChestPlayerSlots,
  isHorizontalAdjacent,
  unpairDoubleChest,
} from '../../src/world/DoubleChest';
import {
  type ChestInventory,
  createChestBlockEntity,
  createChestInventory,
  readChestEntity,
} from '../../src/world/ChestBlockEntity';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';
import { DEFAULT_SLOT_MAX_STACK } from '../../src/world/ChestBlockEntity';

const pos = (x: number, y: number, z: number): ChestPosition => ({ x, y, z });

function slot(item: string | null, count: number, maxStack = DEFAULT_SLOT_MAX_STACK): MenuSlot {
  return { item, count, maxStack };
}

function filledInventory(offsets: Array<[number, string, number]>): ChestInventory {
  const inv = createChestInventory();
  for (const [index, item, count] of offsets) {
    inv.slots[index] = slot(item, count);
  }
  return inv;
}

function playerSlots(): MenuSlot[] {
  const slots: MenuSlot[] = [];
  for (let i = 0; i < 36; i++) {
    slots.push(slot(null, 0));
  }
  return slots;
}

describe('horizontal adjacency', () => {
  it('accepts the four cardinal neighbours', () => {
    const center = pos(0, 0, 0);
    for (const other of [pos(1, 0, 0), pos(-1, 0, 0), pos(0, 0, 1), pos(0, 0, -1)]) {
      expect(isHorizontalAdjacent(center, other)).toBe(true);
      expect(isHorizontalAdjacent(other, center)).toBe(true);
    }
  });

  it('rejects diagonal, vertical, same, and distant positions', () => {
    const center = pos(0, 0, 0);
    expect(isHorizontalAdjacent(center, pos(1, 0, 1))).toBe(false);
    expect(isHorizontalAdjacent(center, pos(0, 1, 0))).toBe(false);
    expect(isHorizontalAdjacent(center, pos(0, 0, 0))).toBe(false);
    expect(isHorizontalAdjacent(center, pos(2, 0, 0))).toBe(false);
  });
});

describe('pair key and order', () => {
  it('produces order-independent keys and primary/secondary order', () => {
    const a = pos(3, 4, 5);
    const b = pos(3, 4, 6);
    expect(chestPairKey(a, b)).toBe(chestPairKey(b, a));
    expect(chestPairKey(a, b)).toBe('3,4,5|3,4,6');
    // x differs -> lower x is primary.
    expect(doubleChestOrder(a, b)).toEqual([a, b]);
    expect(doubleChestOrder(b, a)).toEqual([a, b]);
    // z differs when x is equal -> lower z is primary.
    const c = pos(2, 0, 9);
    const d = pos(2, 0, 8);
    expect(doubleChestOrder(c, d)).toEqual([d, c]);
    expect(chestPairKey(c, d)).toBe(chestPairKey(d, c));
  });

  it('throws for non-adjacent pairs', () => {
    expect(() => chestPairKey(pos(0, 0, 0), pos(1, 1, 0))).toThrow(/not horizontally adjacent/);
    expect(() => doubleChestOrder(pos(0, 0, 0), pos(3, 0, 0))).toThrow(/not horizontally adjacent/);
  });
});

describe('double-chest menu', () => {
  it('builds a 90-slot menu with playerSlotStart 54', () => {
    const primary = filledInventory([[0, 'minecraft:coal', 5]]);
    const secondary = filledInventory([[26, 'minecraft:raw_iron', 2]]);
    const menu = createDoubleChestMenu(primary, secondary, playerSlots());
    expect(menu.slots).toHaveLength(DOUBLE_CHEST_MENU_SLOT_COUNT);
    expect(menu.playerSlotStart).toBe(DOUBLE_CHEST_PLAYER_SLOT_START);
    expect(menu.cursor).toEqual({ item: null, count: 0 });
    const halves = extractDoubleChestHalves(menu);
    expect(halves.primary).toEqual(primary);
    expect(halves.secondary).toEqual(secondary);
    expect(extractDoubleChestPlayerSlots(menu)).toEqual(playerSlots());
  });

  it('validates inventories, player slots, and cursors', () => {
    const bad = createChestInventory();
    bad.slots[0] = { item: 'minecraft:coal', count: 0, maxStack: 64 };
    expect(() => createDoubleChestMenu(bad, createChestInventory(), playerSlots())).toThrow(/count must be an integer/);
    expect(() => createDoubleChestMenu(createChestInventory(), createChestInventory(), playerSlots().slice(0, 35))).toThrow(
      /exactly 90 slots/,
    );
    // @ts-expect-error intentionally passing a non-array
    expect(() => createDoubleChestMenu(createChestInventory(), createChestInventory(), 'nope')).toThrow(
      /exactly 36 slots/,
    );
    expect(() =>
      createDoubleChestMenu(createChestInventory(), createChestInventory(), playerSlots(), {
        item: 'minecraft:coal',
        count: 65,
      }),
    ).toThrow(/cursor/);
  });

  it('applies transactions across all three regions', () => {
    const primary = filledInventory([[0, 'minecraft:coal', 10]]);
    const secondary = filledInventory([[0, 'minecraft:raw_iron', 4]]);
    const player = playerSlots();
    player[0] = slot('minecraft:coal', 62);
    const menu = createDoubleChestMenu(primary, secondary, player);

    // Pick up coal from the primary half (slot 0).
    const picked = applyDoubleChestMenuTransaction(menu, { type: 'leftClick', index: 0 });
    expect(picked.cursor).toEqual({ item: 'minecraft:coal', count: 10 });

    // Merge into the player slot (62 + 2 = 64; 8 remain on the cursor).
    const merged = applyDoubleChestMenuTransaction(picked, { type: 'leftClick', index: 54 });
    expect(extractDoubleChestPlayerSlots(merged)[0]).toEqual(slot('minecraft:coal', 64));
    expect(merged.cursor).toEqual({ item: 'minecraft:coal', count: 8 });

    // Quick-move the secondary half's raw_iron stack into the player region
    // (secondary slot 27 -> first empty player slot, player[1]).
    const quickIron = applyDoubleChestMenuTransaction(merged, { type: 'quickMove', index: 27 });
    expect(extractDoubleChestHalves(quickIron).secondary.slots[0]).toEqual(slot(null, 0));
    expect(extractDoubleChestPlayerSlots(quickIron)[1]).toEqual(slot('minecraft:raw_iron', 4));

    // Place one coal from the cursor into the emptied secondary slot.
    const placed = applyDoubleChestMenuTransaction(quickIron, { type: 'placeOne', index: 27 });
    expect(extractDoubleChestHalves(placed).secondary.slots[0]).toEqual(slot('minecraft:coal', 1));
    expect(placed.cursor).toEqual({ item: 'minecraft:coal', count: 7 });

    // Quick-move the full player coal stack into the chest region: first-fit
    // merges 63 into the coal slot 27 (1 + 63 = 64), the remainder 1 fills the
    // first empty chest slot (primary slot 0).
    const quick = applyDoubleChestMenuTransaction(placed, { type: 'quickMove', index: 54 });
    expect(extractDoubleChestHalves(quick).secondary.slots[0]).toEqual(slot('minecraft:coal', 64));
    expect(extractDoubleChestHalves(quick).primary.slots[0]).toEqual(slot('minecraft:coal', 1));
    expect(extractDoubleChestPlayerSlots(quick)[0]).toEqual(slot(null, 0));

    // Source menu unchanged.
    expect(menu.cursor).toEqual({ item: null, count: 0 });
    expect(extractDoubleChestHalves(menu).primary).toEqual(primary);
  });

  it('throws on out-of-bounds transaction indices', () => {
    const menu = createDoubleChestMenu(createChestInventory(), createChestInventory(), playerSlots());
    expect(() => applyDoubleChestMenuTransaction(menu, { type: 'leftClick', index: -1 })).toThrow(/out of bounds/);
    expect(() => applyDoubleChestMenuTransaction(menu, { type: 'leftClick', index: 90 })).toThrow(/out of bounds/);
  });

  it('rejects extraction from a foreign menu', () => {
    const menu = createDoubleChestMenu(createChestInventory(), createChestInventory(), playerSlots());
    const foreign = { ...menu, playerSlotStart: 27, slots: menu.slots.slice(0, 63) };
    expect(() => extractDoubleChestHalves(foreign)).toThrow(/not a double-chest menu/);
    expect(() => extractDoubleChestPlayerSlots(foreign)).toThrow(/not a double-chest menu/);
  });
});

describe('unpairing', () => {
  it('returns the surviving half for both argument orders and assignments', () => {
    const a = pos(1, 2, 3);
    const b = pos(2, 2, 3);
    const aInv = filledInventory([[0, 'minecraft:coal', 5]]);
    const bInv = filledInventory([[1, 'minecraft:raw_iron', 2]]);

    expect(unpairDoubleChest(a, a, aInv, b, bInv)).toEqual(bInv);
    expect(unpairDoubleChest(b, a, aInv, b, bInv)).toEqual(aInv);
    expect(unpairDoubleChest(a, b, bInv, a, aInv)).toEqual(bInv);
  });

  it('throws for unknown removed positions and non-adjacent pairs', () => {
    const a = pos(1, 2, 3);
    const b = pos(2, 2, 3);
    const empty = createChestInventory();
    expect(() => unpairDoubleChest(pos(9, 9, 9), a, empty, b, empty)).toThrow(/matches neither/);
    expect(() => unpairDoubleChest(a, a, empty, pos(5, 2, 3), empty)).toThrow(/not horizontally adjacent/);
  });
});

describe('determinism and immutability', () => {
  it('repeated calls produce identical results and leave inputs unchanged', () => {
    const primary = filledInventory([[0, 'minecraft:coal', 10]]);
    const secondary = filledInventory([[0, 'minecraft:raw_iron', 4]]);
    const player = playerSlots();
    player[0] = slot('minecraft:coal', 62);
    const menu = createDoubleChestMenu(primary, secondary, player);
    const before = JSON.stringify(menu);

    const first = applyDoubleChestMenuTransaction(menu, { type: 'leftClick', index: 0 });
    const second = applyDoubleChestMenuTransaction(menu, { type: 'leftClick', index: 0 });
    expect(first).toEqual(second);
    expect(JSON.stringify(menu)).toBe(before);
  });
});

describe('manager round-trip', () => {
  it('restores two adjacent chest entities exactly', () => {
    const manager = new BlockEntityManager();
    const left = createChestBlockEntity(20, 30, 40, filledInventory([[0, 'minecraft:coal', 5]]));
    const right = createChestBlockEntity(21, 30, 40, filledInventory([[26, 'minecraft:raw_iron', 2]]));
    expect(isHorizontalAdjacent({ x: 20, y: 30, z: 40 }, { x: 21, y: 30, z: 40 })).toBe(true);
    expect(chestPairKey({ x: 20, y: 30, z: 40 }, { x: 21, y: 30, z: 40 })).toBe('20,30,40|21,30,40');
    expect(manager.add(left)).toBe(true);
    expect(manager.add(right)).toBe(true);
    expect(manager.serializeChunk(1, 2)).toHaveLength(2);

    const fresh = new BlockEntityManager();
    expect(fresh.deserializeChunk(1, 2, manager.serializeChunk(1, 2))).toBe(2);
    expect(readChestEntity(fresh.get(20, 30, 40)!)).toEqual(filledInventory([[0, 'minecraft:coal', 5]]));
    expect(readChestEntity(fresh.get(21, 30, 40)!)).toEqual(filledInventory([[26, 'minecraft:raw_iron', 2]]));
    expect(DOUBLE_CHEST_SLOT_COUNT).toBe(54);
  });
});
