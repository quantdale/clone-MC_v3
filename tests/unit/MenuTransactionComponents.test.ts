import { describe, it, expect } from 'vitest';
import {
  applyMenuTransaction,
  menuComponentsEqual,
  validateContainerMenu,
  type ContainerMenu,
  type MenuSlot,
} from '../../src/inventory/MenuTransaction';

function slot(item: string | null, count: number, maxStack = 64, components?: Record<string, unknown>): MenuSlot {
  return components === undefined ? { item, count, maxStack } : { item, count, maxStack, components };
}

const BOTTLE = 'minecraft:potion';
const FX_A = { 'minecraft:potion_contents': { kind: 'NORMAL', customEffects: [{ typeId: 'a', duration: 1, amplifier: 0 }] } };
const FX_B = { 'minecraft:potion_contents': { kind: 'NORMAL', customEffects: [{ typeId: 'b', duration: 1, amplifier: 0 }] } };

function menu(slots: MenuSlot[], cursor: { item: string | null; count: number; components?: Record<string, unknown> } = { item: null, count: 0 }, playerSlotStart = 1): ContainerMenu {
  return validateContainerMenu({ slots, playerSlotStart, cursor });
}

describe('menuComponentsEqual (260)', () => {
  it('treats two absent records as equal and absent-vs-present as different', () => {
    expect(menuComponentsEqual(undefined, undefined)).toBe(true);
    expect(menuComponentsEqual(FX_A, undefined)).toBe(false);
    expect(menuComponentsEqual(undefined, FX_A)).toBe(false);
  });

  it('compares by value, insensitive to key construction order', () => {
    const reordered = { 'minecraft:potion_contents': { customEffects: [{ amplifier: 0, duration: 1, typeId: 'a' }], kind: 'NORMAL' } };
    expect(menuComponentsEqual(FX_A, reordered)).toBe(true);
    expect(menuComponentsEqual(FX_A, FX_B)).toBe(false);
  });
});

describe('component carry (260)', () => {
  it('leftClick pickup carries contents and leaves no orphans', () => {
    const m = menu([slot(BOTTLE, 1, 1, FX_A), slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.cursor).toEqual({ item: BOTTLE, count: 1, components: FX_A });
    expect(next.slots[0]).toEqual({ item: null, count: 0, maxStack: 1 });
    expect('components' in next.slots[0]!).toBe(false);
  });

  it('leftClick place delivers contents into the empty slot', () => {
    const m = menu([slot(null, 0), slot(null, 0)], { item: BOTTLE, count: 1, components: FX_A });
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.slots[0]).toEqual({ item: BOTTLE, count: 1, maxStack: 64, components: FX_A });
    expect(next.cursor).toEqual({ item: null, count: 0 });
  });

  it('leftClick swap exchanges contents both ways', () => {
    const m = menu([slot(BOTTLE, 1, 1, FX_A), slot(null, 0)], { item: BOTTLE, count: 1, components: FX_B });
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.slots[0]?.components).toEqual(FX_B);
    expect(next.cursor.components).toEqual(FX_A);
  });

  it('leftClick merges only identical contents; differing contents swap', () => {
    const same = menu([slot(BOTTLE, 1, 64, FX_A), slot(null, 0)], { item: BOTTLE, count: 2, components: FX_A });
    const merged = applyMenuTransaction(same, { type: 'leftClick', index: 0 });
    expect(merged.slots[0]?.count).toBe(3);
    expect(merged.slots[0]?.components).toEqual(FX_A);
    expect(merged.cursor).toEqual({ item: null, count: 0 });

    const diff = menu([slot(BOTTLE, 1, 64, FX_A), slot(null, 0)], { item: BOTTLE, count: 2, components: FX_B });
    const swapped = applyMenuTransaction(diff, { type: 'leftClick', index: 0 });
    expect(swapped.slots[0]?.components).toEqual(FX_B);
    expect(swapped.slots[0]?.count).toBe(2);
    expect(swapped.cursor.components).toEqual(FX_A);
    expect(swapped.cursor.count).toBe(1);
  });

  it('rightClick split carries a shared copy and clears orphans on drain', () => {
    const m = menu([slot(BOTTLE, 1, 1, FX_A), slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next.cursor).toEqual({ item: BOTTLE, count: 1, components: FX_A });
    expect(next.slots[0]).toEqual({ item: null, count: 0, maxStack: 1 });
  });

  it('rightClick place-one into an empty slot carries contents', () => {
    const m = menu([slot(null, 0), slot(null, 0)], { item: BOTTLE, count: 2, components: FX_A });
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next.slots[0]).toEqual({ item: BOTTLE, count: 1, maxStack: 64, components: FX_A });
    expect(next.cursor).toEqual({ item: BOTTLE, count: 1, components: FX_A });
  });

  it('rightClick place-one refuses to merge differing contents', () => {
    const m = menu([slot(BOTTLE, 1, 64, FX_A), slot(null, 0)], { item: BOTTLE, count: 2, components: FX_B });
    const next = applyMenuTransaction(m, { type: 'rightClick', index: 0 });
    expect(next).toEqual(m); // total no-op
  });

  it('quickMove carries contents and never merges differing ones', () => {
    // Stand-ward: player slot 1 -> container slot 0.
    const m = menu([slot(null, 0), slot(BOTTLE, 1, 1, FX_A)]);
    const moved = applyMenuTransaction(m, { type: 'quickMove', index: 1 });
    expect(moved.slots[0]).toEqual({ item: BOTTLE, count: 1, maxStack: 64, components: FX_A });
    expect(moved.slots[1]).toEqual({ item: null, count: 0, maxStack: 1 });

    // Differing contents do not merge; the stack finds the empty slot instead.
    // Two container slots (0-1) + one player slot (2): the FX_B stack must
    // skip the FX_A merge and land in the empty container slot with contents.
    const m2 = menu([slot(BOTTLE, 1, 64, FX_A), slot(null, 0), slot(BOTTLE, 1, 64, FX_B)], undefined, 2);
    const moved2 = applyMenuTransaction(m2, { type: 'quickMove', index: 2 });
    expect(moved2.slots[0]?.count).toBe(1); // untouched
    expect(moved2.slots[1]).toEqual({ item: BOTTLE, count: 1, maxStack: 64, components: FX_B });
    expect(moved2.slots[2]).toEqual({ item: null, count: 0, maxStack: 64 });
  });

  it('validateContainerMenu preserves cursor components and rejects malformed ones', () => {
    const slots = [
      { item: null, count: 0, maxStack: 64 },
      { item: null, count: 0, maxStack: 64 },
    ];
    const m = validateContainerMenu({
      slots,
      playerSlotStart: 1,
      cursor: { item: BOTTLE, count: 1, components: FX_A },
    });
    expect(m.cursor).toEqual({ item: BOTTLE, count: 1, components: FX_A });
    expect(() =>
      validateContainerMenu({
        slots,
        playerSlotStart: 1,
        cursor: { item: BOTTLE, count: 1, components: [] },
      }),
    ).toThrow(/cursor\.components must be an object/);
  });

  it('component-less flows keep their exact pre-260 shapes', () => {
    const m = menu([slot('minecraft:coal', 5), slot(null, 0)]);
    const next = applyMenuTransaction(m, { type: 'leftClick', index: 0 });
    expect(next.cursor).toEqual({ item: 'minecraft:coal', count: 5 });
    expect(next.slots[0]).toEqual({ item: null, count: 0, maxStack: 64 });
  });
});
