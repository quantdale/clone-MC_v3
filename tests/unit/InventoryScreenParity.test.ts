import { describe, it, expect } from 'vitest';
import { createContainerMenu, type ContainerMenu, type MenuSlot } from '../../src/inventory/MenuTransaction';
import {
  HOTBAR_SIZE,
  createDragState,
  doubleClickGather,
  dragEnd,
  dragHover,
  dragStart,
  hotbarSwap,
} from '../../src/inventory/InventoryScreenParity';

const EMPTY = (maxStack = 64): MenuSlot => ({ item: null, count: 0, maxStack });
const STACK = (item: string, count: number, maxStack = 64): MenuSlot => ({
  item,
  count,
  maxStack,
});

/** 18 slots: container 0-8, player 9-17 (hotbar 9-11). */
function menuWith(cursor: { item: string | null; count: number }): ContainerMenu {
  const slots: MenuSlot[] = [
    EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(),
    EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(), EMPTY(),
  ];
  slots[0] = STACK('a', 20);
  slots[1] = STACK('a', 30);
  slots[9] = STACK('a', 1);
  slots[12] = STACK('b', 3);
  return { ...createContainerMenu(slots, 9), cursor };
}

const withCursor = (menu: ContainerMenu, cursor: { item: string | null; count: number }): ContainerMenu => ({
  ...menu,
  cursor,
});

describe('drag lifecycle', () => {
  it('starts, hovers uniquely, and identity-no-ops when inactive', () => {
    const idle = createDragState();
    const active = dragStart(idle, 'left', 3);
    expect(active).toEqual({ active: true, button: 'left', startSlot: 3, hovered: [3] });
    const hovered = dragHover(active, 4);
    expect(hovered.hovered).toEqual([3, 4]);
    expect(dragHover(hovered, 3)).toBe(hovered);
    expect(dragHover(hovered, 4)).toBe(hovered);
    expect(dragHover(idle, 4)).toBe(idle);
  });
});

describe('left drag', () => {
  it('distributes in rounds across hovered slots', () => {
    const menu = withCursor(menuWith({ item: 'a', count: 5 }), { item: 'a', count: 5 });
    const drag = dragStart(dragHover(dragStart(createDragState(), 'left', 2), 5), 'left', 2);
    const { menu: result, drag: next } = dragEnd(menu, drag);
    expect(result.slots[2]).toEqual({ item: 'a', count: 3, maxStack: 64 });
    expect(result.slots[5]).toEqual({ item: 'a', count: 2, maxStack: 64 });
    expect(result.cursor).toEqual({ item: null, count: 0 });
    expect(next.active).toBe(false);
    expect(next.hovered).toEqual([]);
  });

  it('keeps the remainder when a hovered slot is capped or holds a different item', () => {
    const base = menuWith({ item: 'a', count: 5 });
    const menu = {
      ...base,
      slots: base.slots.map((s, i) => {
        if (i === 2) return STACK('a', 2, 3); // nearly full, cap 3
        if (i === 5) return STACK('b', 1); // wrong item
        return s;
      }),
    };
    const drag = dragStart(dragHover(dragStart(createDragState(), 'left', 2), 5), 'left', 2);
    const { menu: result } = dragEnd(menu, drag);
    expect(result.slots[2]).toEqual({ item: 'a', count: 3, maxStack: 3 });
    expect(result.slots[5]).toEqual({ item: 'b', count: 1, maxStack: 64 });
    expect(result.cursor).toEqual({ item: 'a', count: 4 });
  });

  it('respects stack caps', () => {
    const menu = withCursor(menuWith({ item: 'a', count: 5 }), { item: 'a', count: 5 });
    const capped = {
      ...menu,
      slots: menu.slots.map((s, i) => (i === 2 ? STACK('a', 0, 2) : s)),
    };
    const drag = dragStart(createDragState(), 'left', 2);
    const { menu: result } = dragEnd(capped, drag);
    expect(result.slots[2]).toEqual({ item: 'a', count: 2, maxStack: 2 });
    expect(result.cursor).toEqual({ item: 'a', count: 3 });
  });
});

describe('right drag', () => {
  it('distributes evenly with the remainder to earliest slots', () => {
    const menu = {
      ...menuWith({ item: 'a', count: 10 }),
      slots: menuWith({ item: 'a', count: 10 }).slots.map((s, i) =>
        i < 3 ? EMPTY() : i === 9 || i === 12 ? s : EMPTY(),
      ),
    };
    const drag = dragStart(
      dragHover(dragHover(dragStart(createDragState(), 'right', 0), 1), 2),
      'right',
      0,
    );
    const { menu: result } = dragEnd(menu, drag);
    expect(result.slots[0]!.count).toBe(4);
    expect(result.slots[1]!.count).toBe(3);
    expect(result.slots[2]!.count).toBe(3);
    expect(result.cursor).toEqual({ item: null, count: 0 });
  });

  it('leaves the unfitted remainder on the cursor when capped', () => {
    const menu = withCursor(menuWith({ item: 'a', count: 10 }), { item: 'a', count: 10 });
    const capped = {
      ...menu,
      slots: menu.slots.map((s, i) => (i === 0 ? STACK('a', 0, 2) : s)),
    };
    const drag = dragStart(createDragState(), 'right', 0);
    const { menu: result } = dragEnd(capped, drag);
    expect(result.slots[0]).toEqual({ item: 'a', count: 2, maxStack: 2 });
    expect(result.cursor).toEqual({ item: 'a', count: 8 });
  });
});

describe('inactive dragEnd', () => {
  it('returns the identical menu and drag state', () => {
    const menu = withCursor(menuWith({ item: 'a', count: 5 }), { item: 'a', count: 5 });
    const drag = createDragState();
    const result = dragEnd(menu, drag);
    expect(result.menu).toBe(menu);
    expect(result.drag).toBe(drag);
  });

  it('clears the drag without touching the menu when the cursor is empty', () => {
    const menu = menuWith({ item: null, count: 0 });
    const drag = dragStart(createDragState(), 'left', 0);
    const { menu: result, drag: next } = dragEnd(menu, drag);
    expect(result).toBe(menu);
    expect(next.active).toBe(false);
  });
});

describe('double-click gather', () => {
  it('gathers same-item stacks into the cursor and drains slots', () => {
    const menu = menuWith({ item: null, count: 0 });
    const result = doubleClickGather(menu, 0);
    // 20 (slot 0) + 30 (slot 1) + 1 (hotbar slot 9) = 51
    expect(result.cursor).toEqual({ item: 'a', count: 51 });
    expect(result.slots[0]).toEqual(EMPTY());
    expect(result.slots[1]).toEqual(EMPTY());
    expect(result.slots[9]).toEqual(EMPTY());
  });

  it('caps the cursor at 64 and leaves the remainder in the slot', () => {
    const menu = withCursor(menuWith({ item: 'a', count: 50 }), { item: 'a', count: 50 });
    const result = doubleClickGather(menu, 0);
    expect(result.cursor).toEqual({ item: 'a', count: 64 });
    expect(result.slots[0]).toEqual(STACK('a', 6));
  });

  it('identity-no-ops on a mismatched cursor and when both are empty', () => {
    const menu = withCursor(menuWith({ item: 'b', count: 1 }), { item: 'b', count: 1 });
    expect(doubleClickGather(menu, 0)).toBe(menu);
    const empty = menuWith({ item: null, count: 0 });
    const noItem = { ...empty, slots: empty.slots.map(() => EMPTY()) };
    expect(doubleClickGather(noItem, 0)).toBe(noItem);
  });
});

describe('hotbar swap', () => {
  it('swaps the hotbar slot with the target slot', () => {
    const menu = menuWith({ item: null, count: 0 });
    const result = hotbarSwap(menu, 9, 12);
    expect(result.slots[9]).toEqual(STACK('b', 3));
    expect(result.slots[12]).toEqual(STACK('a', 1));
  });

  it('moves into an empty target', () => {
    const menu = menuWith({ item: null, count: 0 });
    const result = hotbarSwap(menu, 9, 15);
    expect(result.slots[15]).toEqual(STACK('a', 1));
    expect(result.slots[9]).toEqual(EMPTY());
  });

  it('identity-no-ops when both slots are empty or the indices match', () => {
    const menu = menuWith({ item: null, count: 0 });
    const emptyHotbar = { ...menu, slots: menu.slots.map((s, i) => (i === 9 ? EMPTY() : s)) };
    expect(hotbarSwap(emptyHotbar, 9, 15)).toBe(emptyHotbar);
    expect(hotbarSwap(menu, 9, 9)).toBe(menu);
  });

  it('throws for a non-hotbar index and out-of-bounds', () => {
    const menu = menuWith({ item: null, count: 0 });
    expect(() => hotbarSwap(menu, 5, 12)).toThrow(
      'InventoryScreenParity: hotbarIndex 5 is outside the hotbar range',
    );
    expect(() => hotbarSwap(menu, 9, 99)).toThrow(
      'InventoryScreenParity: targetIndex 99 is out of bounds for 18 slots',
    );
    expect(HOTBAR_SIZE).toBe(9);
  });
});
