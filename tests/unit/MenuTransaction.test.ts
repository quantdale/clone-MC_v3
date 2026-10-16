import { describe, it, expect } from 'vitest';
import {
  applyMenuTransaction,
  createContainerMenu,
  MAX_CURSOR_COUNT,
  validateContainerMenu,
  type ContainerMenu,
  type MenuSlot,
} from '../../src/inventory/MenuTransaction';

const slot = (item: string | null, count: number, maxStack = 64): MenuSlot => ({ item, count, maxStack });

// 5 slots: 3 container (0-2), 2 player (3-4).
function menu(container: MenuSlot[], player: MenuSlot[], cursor: ContainerMenu['cursor'] = { item: null, count: 0 }): ContainerMenu {
  return validateContainerMenu({ slots: [...container, ...player], playerSlotStart: container.length, cursor });
}

describe('menu construction', () => {
  it('accepts valid menus and round-trips', () => {
    const m = menu([slot('minecraft:coal', 5), slot(null, 0), slot(null, 0)], [slot(null, 0), slot(null, 0)]);
    expect(m.slots.length).toBe(5);
    expect(m.playerSlotStart).toBe(3);
    expect(m.cursor).toEqual({ item: null, count: 0 });
    expect(createContainerMenu(m.slots, 3).slots).toEqual(m.slots);
  });

  it('rejects malformed menus', () => {
    expect(() => menu([], [slot(null, 0)])).toThrow(/playerSlotStart/i);
    expect(() => validateContainerMenu({ slots: [slot(null, 0)], playerSlotStart: 1, cursor: { item: null, count: 0 } })).toThrow(/playerSlotStart/i);
    expect(() => validateContainerMenu({ slots: [slot(null, 0)], playerSlotStart: 0, cursor: { item: null, count: 0 } })).toThrow(/playerSlotStart/i);
    expect(() => menu([slot('minecraft:x', 3, 0)], [slot(null, 0)])).toThrow(/maxStack/i);
    expect(() => menu([slot('minecraft:x', 3, 65)], [slot(null, 0)])).toThrow(/maxStack/i);
    expect(() => menu([slot('minecraft:x', 70)], [slot(null, 0)])).toThrow(/count/i);
    expect(() => menu([slot(null, 3)], [slot(null, 0)])).toThrow(/count 0/i);
    expect(() => menu([slot(null, 0)], [slot(null, 0)], { item: 'minecraft:x', count: 0 })).toThrow(/cursor/i);
    expect(() => menu([slot(null, 0)], [slot(null, 0)], { item: null, count: 3 })).toThrow(/cursor/i);
    expect(() => menu([slot(null, 0)], [slot(null, 0)], { item: 'minecraft:x', count: MAX_CURSOR_COUNT + 1 })).toThrow(/cursor/i);
    expect(() => validateContainerMenu(null)).toThrow(/object/i);
  });
});

describe('leftClick', () => {
  it('picks up an empty slot into an empty cursor', () => {
    const m = menu([slot('minecraft:coal', 5)], [slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.slots[0]).toEqual(slot(null, 0));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 5 });
    expect(m.slots[0]).toEqual(slot('minecraft:coal', 5)); // immutable
  });

  it('merges same-item stacks with room', () => {
    const m = menu([slot('minecraft:coal', 30)], [slot(null, 0)], { item: 'minecraft:coal', count: 20 });
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 50));
    expect(next.cursor).toEqual({ item: null, count: 0 });
  });

  it('merges only what fits and keeps the remainder on the cursor', () => {
    const m = menu([slot('minecraft:coal', 60)], [slot(null, 0)], { item: 'minecraft:coal', count: 20 });
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 64));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 16 });
  });

  it('places the cursor into an empty slot when it fits', () => {
    const m = menu([slot(null, 0)], [slot(null, 0)], { item: 'minecraft:coal', count: 5 });
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 5));
    expect(next.cursor).toEqual({ item: null, count: 0 });
  });

  it('swaps different items', () => {
    const m = menu([slot('minecraft:coal', 5)], [slot(null, 0)], { item: 'minecraft:iron', count: 3 });
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:iron', 3));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 5 });
  });
});

describe('rightClick', () => {
  it('takes ceil(count / 2) from a slot into an empty cursor', () => {
    const m = menu([slot('minecraft:coal', 5)], [slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 2));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 3 });
  });

  it('merges the split into a same-item cursor up to the cursor cap', () => {
    const m = menu([slot('minecraft:coal', 10)], [slot(null, 0)], { item: 'minecraft:coal', count: 62 });
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 64 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 8));
  });

  it('places one from the cursor into an empty slot', () => {
    const m = menu([slot(null, 0)], [slot(null, 0)], { item: 'minecraft:coal', count: 10 });
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 1));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 9 });
  });

  it('splits a full same-item slot instead of placing onto it', () => {
    const m = menu([slot('minecraft:coal', 64)], [slot(null, 0)], { item: 'minecraft:coal', count: 10 });
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 32));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 42 });
  });

  it('does nothing with a mismatched full slot', () => {
    const m = menu([slot('minecraft:iron', 64)], [slot(null, 0)], { item: 'minecraft:coal', count: 10 });
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:iron', 64));
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 10 });
  });
});

describe('placeOne', () => {
  it('places one into an empty or mergeable slot', () => {
    const m = menu([slot(null, 0), slot('minecraft:coal', 63)], [slot(null, 0)], { item: 'minecraft:coal', count: 5 });
    const a = applyMenuTransaction(m, { type: 'placeOne', index: 0 });
    expect(a.slots[0]).toEqual(slot('minecraft:coal', 1));
    expect(a.cursor).toEqual({ item: 'minecraft:coal', count: 4 });
    const b = applyMenuTransaction(m, { type: 'placeOne', index: 1 });
    expect(b.slots[1]).toEqual(slot('minecraft:coal', 64));
    expect(b.cursor).toEqual({ item: 'minecraft:coal', count: 4 });
  });

  it('does nothing with an empty cursor or a full mismatched slot', () => {
    const m = menu([slot('minecraft:iron', 64)], [slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'placeOne', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:iron', 64));
    expect(next.cursor).toEqual({ item: null, count: 0 });
  });
});

describe('quickMove', () => {
  it('moves a container stack into the player region by first-fit merge', () => {
    const m = menu([slot('minecraft:coal', 10)], [slot('minecraft:coal', 60), slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'quickMove', index: 0 });
    expect(next.slots[0]).toEqual(slot(null, 0));
    expect(next.slots[1]).toEqual(slot('minecraft:coal', 64));
    expect(next.slots[2]).toEqual(slot('minecraft:coal', 6));
  });

  it('moves a player stack into the container region', () => {
    const m = menu([slot(null, 0), slot(null, 0), slot(null, 0)], [slot('minecraft:iron', 40)]);
    const next = applyMenuTransaction(m, { type: 'quickMove', index: 3 });
    expect(next.slots[0]).toEqual(slot('minecraft:iron', 40));
    expect(next.slots[3]).toEqual(slot(null, 0));
  });

  it('leaves the remainder in the source when the target region is full of other items', () => {
    const m = menu([slot('minecraft:coal', 10)], [slot('minecraft:iron', 64), slot('minecraft:iron', 64)]);
    const next = applyMenuTransaction(m, { type: 'quickMove', index: 0 });
    expect(next.slots[0]).toEqual(slot('minecraft:coal', 10));
    expect(next.slots[1]).toEqual(slot('minecraft:iron', 64));
  });

  it('moves a stack of 64 into an empty slot', () => {
    const m = menu([slot('minecraft:coal', 64)], [slot(null, 0), slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'quickMove', index: 0 });
    expect(next.slots[0]).toEqual(slot(null, 0));
    expect(next.slots[1]).toEqual(slot('minecraft:coal', 64));
  });
});

describe('bounds and determinism', () => {
  it('throws on out-of-bounds indices for every transaction type', () => {
    const m = menu([slot(null, 0)], [slot(null, 0)]);
    for (const tx of [
      { type: 'leftClick', index: 2 },
      { type: 'rightClick', index: -1 },
      { type: 'placeOne', index: 5 },
      { type: 'quickMove', index: 2.5 },
    ] as const) {
      expect(() => applyMenuTransaction(m, tx)).toThrow(/out of bounds/i);
    }
  });

  it('is deterministic and immutable', () => {
    const m = menu([slot('minecraft:coal', 30)], [slot('minecraft:coal', 30)], { item: 'minecraft:coal', count: 20 });
    const a = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    const b = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(b).toEqual(a);
    expect(m.slots[0]).toEqual(slot('minecraft:coal', 30));
    expect(m.slots[1]).toEqual(slot('minecraft:coal', 30));
    expect(m.cursor).toEqual({ item: 'minecraft:coal', count: 20 });
  });
});
