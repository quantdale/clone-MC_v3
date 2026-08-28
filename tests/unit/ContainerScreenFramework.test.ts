import { describe, it, expect } from 'vitest';
import { createContainerMenu, type ContainerMenu, type MenuSlot } from '../../src/inventory/MenuTransaction';
import {
  applyScreenEvent,
  createContainerScreen,
  validateContainerScreen,
  type ContainerScreenState,
} from '../../src/inventory/ContainerScreenFramework';

const EMPTY = (maxStack = 64): MenuSlot => ({ item: null, count: 0, maxStack });
const STACK = (item: string, count: number, maxStack = 64): MenuSlot => ({
  item,
  count,
  maxStack,
});

/** 18 slots: container 0-8, player 9-17 (hotbar 9-11). */
function makeMenu(): ContainerMenu {
  const slots: MenuSlot[] = Array.from({ length: 18 }, () => EMPTY());
  slots[0] = STACK('a', 5);
  slots[1] = STACK('a', 30);
  slots[2] = STACK('a', 5);
  slots[9] = STACK('a', 1);
  return createContainerMenu(slots, 9);
}

function screen(): ContainerScreenState {
  return createContainerScreen(makeMenu());
}

describe('creation and validation', () => {
  it('creates a default screen over a menu', () => {
    const s = screen();
    expect(s.selectedHotbar).toBe(0);
    expect(s.drag).toEqual({ active: false, button: 'left', startSlot: -1, hovered: [] });
    expect(s.menu.slots).toHaveLength(18);
  });

  it('validates a valid screen and rejects malformed ones', () => {
    expect(validateContainerScreen(screen())).toEqual(screen());
    expect(() => validateContainerScreen(null)).toThrow('ContainerScreen: expected an object');
    expect(() => validateContainerScreen({ ...screen(), selectedHotbar: 9 })).toThrow(
      'ContainerScreen: hotbar selection must be an integer in [0, 8]',
    );
    expect(() =>
      validateContainerScreen({ ...screen(), drag: { active: true, button: 'left', startSlot: 0, hovered: [3, 3] } }),
    ).toThrow('ContainerScreen: drag.hovered must contain unique in-bounds integers');
    expect(() => validateContainerScreen({ ...screen(), extra: true })).toThrow(
      'ContainerScreen: unknown key extra',
    );
  });
});

describe('clicks', () => {
  it('picks up with left click and splits with right click', () => {
    const left = applyScreenEvent(screen(), { type: 'click', index: 0, button: 'left' });
    expect(left.menu.cursor).toEqual({ item: 'a', count: 5 });
    expect(left.menu.slots[0]).toEqual(EMPTY());

    const right = applyScreenEvent(screen(), { type: 'click', index: 2, button: 'right' });
    expect(right.menu.cursor).toEqual({ item: 'a', count: 3 });
    expect(right.menu.slots[2]).toEqual(STACK('a', 2));
  });

  it('quick-moves via shift-click', () => {
    const moved = applyScreenEvent(screen(), { type: 'quickMove', index: 0 });
    // the player region's slot 9 holds a1 with room, so all 5 merge there
    expect(moved.menu.slots[0]).toEqual(EMPTY());
    expect(moved.menu.slots[9]).toEqual(STACK('a', 6));
    expect(moved.menu.slots[10]).toEqual(EMPTY());
  });

  it('throws for out-of-bounds clicks', () => {
    expect(() => applyScreenEvent(screen(), { type: 'click', index: 99, button: 'left' })).toThrow(
      'MenuTransaction: index 99 is out of bounds for 18 slots',
    );
  });
});

describe('drag flow', () => {
  it('binds pickup -> dragStart -> dragHover -> dragEnd', () => {
    const picked = applyScreenEvent(screen(), { type: 'click', index: 0, button: 'left' });
    const started = applyScreenEvent(picked, { type: 'dragStart', index: 4, button: 'left' });
    expect(started.drag.active).toBe(true);
    const hovered = applyScreenEvent(started, { type: 'dragHover', index: 5 });
    expect(hovered.drag.hovered).toEqual([4, 5]);
    const dropped = applyScreenEvent(hovered, { type: 'dragEnd' });
    expect(dropped.menu.slots[4]).toEqual(STACK('a', 3));
    expect(dropped.menu.slots[5]).toEqual(STACK('a', 2));
    expect(dropped.menu.cursor).toEqual({ item: null, count: 0 });
    expect(dropped.drag.active).toBe(false);
  });

  it('throws for invalid drag indices', () => {
    const s = screen();
    expect(() => applyScreenEvent(s, { type: 'dragStart', index: 99, button: 'left' })).toThrow(
      'ContainerScreen: dragStart index 99 is out of bounds for 18 slots',
    );
    expect(() => applyScreenEvent(s, { type: 'dragHover', index: -1 })).toThrow(
      'ContainerScreen: dragHover index -1 is out of bounds for 18 slots',
    );
  });
});

describe('gather, swap, selection', () => {
  it('gathers with double-click', () => {
    const gathered = applyScreenEvent(screen(), { type: 'doubleClick', index: 0 });
    // a5 (slot 0) + a30 (slot 1) + a5 (slot 2) + a1 (hotbar 9) = 41
    expect(gathered.menu.cursor).toEqual({ item: 'a', count: 41 });
    expect(gathered.menu.slots[0]).toEqual(EMPTY());
    expect(gathered.menu.slots[1]).toEqual(EMPTY());
    expect(gathered.menu.slots[2]).toEqual(EMPTY());
    expect(gathered.menu.slots[9]).toEqual(EMPTY());
  });

  it('swaps via hotbarSwap and throws for container-region hotbar indices', () => {
    const swapped = applyScreenEvent(screen(), { type: 'hotbarSwap', hotbarIndex: 9, targetIndex: 12 });
    expect(swapped.menu.slots[9]).toEqual(EMPTY());
    expect(swapped.menu.slots[12]).toEqual(STACK('a', 1));
    expect(() =>
      applyScreenEvent(screen(), { type: 'hotbarSwap', hotbarIndex: 5, targetIndex: 12 }),
    ).toThrow('InventoryScreenParity: hotbarIndex 5 is outside the hotbar range');
  });

  it('selects the hotbar with range validation and identity no-op', () => {
    const s = screen();
    const selected = applyScreenEvent(s, { type: 'selectHotbar', index: 3 });
    expect(selected.selectedHotbar).toBe(3);
    expect(selected).not.toBe(s);
    expect(applyScreenEvent(selected, { type: 'selectHotbar', index: 3 })).toBe(selected);
    expect(() => applyScreenEvent(s, { type: 'selectHotbar', index: 9 })).toThrow(
      'ContainerScreen: hotbar selection 9 is out of range',
    );
  });
});

describe('immutability', () => {
  it('never mutates the input screen', () => {
    const s = screen();
    const before = JSON.stringify(s);
    applyScreenEvent(s, { type: 'click', index: 0, button: 'left' });
    applyScreenEvent(s, { type: 'dragStart', index: 4, button: 'left' });
    applyScreenEvent(s, { type: 'doubleClick', index: 0 });
    applyScreenEvent(s, { type: 'selectHotbar', index: 2 });
    expect(JSON.stringify(s)).toBe(before);
  });
});
