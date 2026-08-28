/**
 * Inventory screen parity (202): the screen-level interaction semantics over 106's container
 * menu — mouse drag with distribution, double-click gather, and number-key hotbar swap. Pure and
 * headless-safe: inputs are never mutated; transforms return NEW objects or the IDENTICAL object
 * for a no-op. 106's transaction core is untouched (the wiring picks items up via its
 * leftClick/rightClick before dragging).
 *
 * Determinism rules:
 * - Left drag distributes in rounds: one item per hovered slot per round, cycling until the
 *   cursor empties or nothing fits; the remainder stays on the cursor.
 * - Right drag distributes evenly: base = floor(count / n), the first count % n hovered slots get
 *   base + 1 (in hover order), subject to fit; the unfitted remainder stays on the cursor.
 * - `doubleClickGather` moves same-item stacks (slot order) into the cursor up to 64, draining
 *   slots; mismatched cursors and empty cases identity no-op.
 * - `hotbarSwap` swaps/moves between a hotbar slot (player region's first 9) and any slot;
 *   descriptive throws for out-of-bounds and non-hotbar indices.
 */
import {
  MAX_CURSOR_COUNT,
  type ContainerMenu,
  type MenuSlot,
} from './MenuTransaction';

export type DragButton = 'left' | 'right';

/** The mouse-drag state; the carried stack lives in the menu cursor. */
export interface DragState {
  readonly active: boolean;
  readonly button: DragButton;
  readonly startSlot: number;
  readonly hovered: readonly number[];
}

/** A fresh, inactive drag. */
export function createDragState(): DragState {
  return { active: false, button: 'left', startSlot: -1, hovered: [] };
}

/** Start (or restart) a drag: active, hovered = [startSlot]. Same-button/same-slot restart is an identity no-op. */
export function dragStart(state: DragState, button: DragButton, startSlot: number): DragState {
  if (state.active && state.button === button && state.startSlot === startSlot) return state;
  return { active: true, button, startSlot, hovered: [startSlot] };
}

/** Add a hovered slot (unique) while active; identity no-op when inactive or already hovered. */
export function dragHover(state: DragState, index: number): DragState {
  if (!state.active || state.hovered.includes(index)) return state;
  return { ...state, hovered: [...state.hovered, index] };
}

function cloneSlots(menu: ContainerMenu): MenuSlot[] {
  return menu.slots.map((s) => ({ ...s }));
}

/**
 * Finish a drag: distribute the cursor across the hovered slots (left = rounds, right = even)
 * and clear the drag. An inactive drag returns the IDENTICAL menu and drag state.
 */
export function dragEnd(
  menu: ContainerMenu,
  state: DragState,
): { menu: ContainerMenu; drag: DragState } {
  const inactive: DragState = { active: false, button: state.button, startSlot: -1, hovered: [] };
  if (!state.active) return { menu, drag: state };
  if (menu.cursor.item === null || menu.cursor.count === 0) {
    return { menu, drag: inactive };
  }
  const item = menu.cursor.item;
  const slots = cloneSlots(menu);
  let remaining = menu.cursor.count;

  if (state.button === 'left') {
    let progress = true;
    while (remaining > 0 && progress) {
      progress = false;
      for (const index of state.hovered) {
        const slot = slots[index]!;
        if (slot.item === null) {
          slot.item = item;
          slot.count = 1;
          remaining -= 1;
          progress = true;
        } else if (slot.item === item && slot.count < slot.maxStack) {
          slot.count += 1;
          remaining -= 1;
          progress = true;
        }
        if (remaining === 0) break;
      }
    }
  } else {
    const n = state.hovered.length;
    const base = Math.floor(remaining / n);
    const rem = remaining % n;
    for (let i = 0; i < n && remaining > 0; i += 1) {
      const slot = slots[state.hovered[i]!]!;
      const want = base + (i < rem ? 1 : 0);
      if (slot.item === null) {
        const take = Math.min(want, slot.maxStack, remaining);
        slot.item = item;
        slot.count = take;
        remaining -= take;
      } else if (slot.item === item) {
        const take = Math.min(want, slot.maxStack - slot.count, remaining);
        slot.count += take;
        remaining -= take;
      }
    }
  }

  const cursor =
    remaining === 0
      ? { item: null, count: 0 }
      : { item, count: remaining };

  return {
    menu: { slots, playerSlotStart: menu.playerSlotStart, cursor },
    drag: inactive,
  };
}

function sameSlot(a: MenuSlot, b: MenuSlot): boolean {
  return a.item === b.item && a.count === b.count && a.maxStack === b.maxStack;
}

function sameMenu(a: ContainerMenu, b: ContainerMenu): boolean {
  if (a.playerSlotStart !== b.playerSlotStart) return false;
  if (a.cursor.item !== b.cursor.item || a.cursor.count !== b.cursor.count) return false;
  if (a.slots.length !== b.slots.length) return false;
  for (let i = 0; i < a.slots.length; i += 1) {
    if (!sameSlot(a.slots[i]!, b.slots[i]!)) return false;
  }
  return true;
}

/**
 * Double-click gather: with an empty cursor or a same-item cursor, move same-item stacks (in
 * slot order) into the cursor up to 64, draining slots. A mismatched cursor or no item anywhere
 * returns the IDENTICAL menu.
 */
export function doubleClickGather(menu: ContainerMenu, index: number): ContainerMenu {
  const slot = menu.slots[index];
  if (slot === undefined) return menu;
  if (menu.cursor.item !== null && slot.item !== menu.cursor.item) return menu;
  const target = menu.cursor.item ?? slot.item;
  if (target === null) return menu;

  const slots = cloneSlots(menu);
  let count = menu.cursor.count;
  for (let i = 0; i < slots.length && count < MAX_CURSOR_COUNT; i += 1) {
    const s = slots[i]!;
    if (s.item !== target) continue;
    const room = MAX_CURSOR_COUNT - count;
    const moved = Math.min(s.count, room);
    s.count -= moved;
    if (s.count === 0) s.item = null;
    count += moved;
  }

  const result: ContainerMenu = {
    slots,
    playerSlotStart: menu.playerSlotStart,
    cursor: { item: target, count },
  };
  return sameMenu(menu, result) ? menu : result;
}

export const HOTBAR_SIZE = 9;

function assertIndex(menu: ContainerMenu, index: number, what: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= menu.slots.length) {
    throw new Error(
      `InventoryScreenParity: ${what} ${String(index)} is out of bounds for ${menu.slots.length} slots`,
    );
  }
}

/**
 * Number-key hotbar swap: swap the hotbar slot (player region's first 9) with `targetIndex`, or
 * move into an empty target. Identity no-ops when the indices match or both slots are empty.
 * Throws for out-of-bounds indices and a non-hotbar `hotbarIndex`.
 */
export function hotbarSwap(menu: ContainerMenu, hotbarIndex: number, targetIndex: number): ContainerMenu {
  assertIndex(menu, hotbarIndex, 'hotbarIndex');
  assertIndex(menu, targetIndex, 'targetIndex');
  const hotbarEnd = Math.min(menu.playerSlotStart + HOTBAR_SIZE, menu.slots.length);
  if (hotbarIndex < menu.playerSlotStart || hotbarIndex >= hotbarEnd) {
    throw new Error(`InventoryScreenParity: hotbarIndex ${hotbarIndex} is outside the hotbar range`);
  }
  if (hotbarIndex === targetIndex) return menu;

  const slots = cloneSlots(menu);
  const hotbar = slots[hotbarIndex]!;
  const target = slots[targetIndex]!;
  if (hotbar.item === null) return menu;
  if (target.item === null) {
    target.item = hotbar.item;
    target.count = hotbar.count;
    target.components = hotbar.components;
    hotbar.item = null;
    hotbar.count = 0;
    delete hotbar.components;
  } else {
    const oldItem = target.item;
    const oldCount = target.count;
    const oldComponents = target.components;
    target.item = hotbar.item;
    target.count = hotbar.count;
    target.components = hotbar.components;
    hotbar.item = oldItem;
    hotbar.count = oldCount;
    if (oldComponents !== undefined) hotbar.components = oldComponents;
    else delete hotbar.components;
  }
  return { slots, playerSlotStart: menu.playerSlotStart, cursor: menu.cursor };
}
