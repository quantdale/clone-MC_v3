/**
 * Container screen framework (203): the reusable container screen binding 106's transactional
 * menu state and 202's screen interactions into one immutable `{ menu, drag, selectedHotbar }`
 * state plus a typed event reducer. Menu-agnostic (player inventory, chest, furnace — any
 * validated `ContainerMenu`), pure, and headless-safe: no DOM access, no mutation of inputs.
 *
 * Determinism rules:
 * - Events produce a NEW state or the IDENTICAL state for a no-op (106/202 identity semantics).
 * - Drag indices are validated at `dragStart`/`dragHover`, so 202's `dragEnd` only ever sees
 *   valid indices.
 * - Invalid indices/selections throw descriptive errors (106-style); `selectedHotbar` is always
 *   an integer in [0, 8].
 * - `validateContainerScreen` validates the whole payload before accepting anything.
 */
import {
  applyMenuTransaction,
  validateContainerMenu,
  type ContainerMenu,
  type MenuTransaction,
} from './MenuTransaction';
import {
  createDragState,
  doubleClickGather,
  dragEnd,
  dragHover,
  dragStart,
  hotbarSwap,
  type DragButton,
  type DragState,
} from './InventoryScreenParity';

/** The reusable screen state. */
export interface ContainerScreenState {
  readonly menu: ContainerMenu;
  readonly drag: DragState;
  /** Selected hotbar slot (0..8) for number-key operations. */
  readonly selectedHotbar: number;
}

/** A fresh screen over a validated menu: no drag, hotbar selection 0. */
export function createContainerScreen(menu: ContainerMenu): ContainerScreenState {
  return { menu, drag: createDragState(), selectedHotbar: 0 };
}

function isDragButton(value: unknown): value is DragButton {
  return value === 'left' || value === 'right';
}

function assertMenuIndex(menu: ContainerMenu, index: number, what: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= menu.slots.length) {
    throw new Error(
      `ContainerScreen: ${what} index ${String(index)} is out of bounds for ${menu.slots.length} slots`,
    );
  }
}

/**
 * Validate an unknown value as a screen state; throws descriptively otherwise (106's menu
 * messages pass through). Nothing is partially accepted.
 */
export function validateContainerScreen(input: unknown): ContainerScreenState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('ContainerScreen: expected an object');
  }
  const r = input as Record<string, unknown>;
  const menu = validateContainerMenu(r.menu);

  if (typeof r.drag !== 'object' || r.drag === null || Array.isArray(r.drag)) {
    throw new Error('ContainerScreen: drag must be an object');
  }
  const d = r.drag as Record<string, unknown>;
  const startSlot = d.startSlot as number;
  if (typeof d.active !== 'boolean') {
    throw new Error('ContainerScreen: drag.active must be a boolean');
  }
  if (!isDragButton(d.button)) {
    throw new Error('ContainerScreen: drag.button must be "left" or "right"');
  }
  if (!Number.isInteger(startSlot) || startSlot < -1) {
    throw new Error('ContainerScreen: drag.startSlot must be an integer >= -1');
  }
  const hovered = d.hovered as unknown[];
  if (!Array.isArray(hovered) || !hovered.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < menu.slots.length)) {
    throw new Error('ContainerScreen: drag.hovered must contain unique in-bounds integers');
  }
  if (new Set(hovered).size !== hovered.length) {
    throw new Error('ContainerScreen: drag.hovered must contain unique in-bounds integers');
  }

  if (!Number.isInteger(r.selectedHotbar) || (r.selectedHotbar as number) < 0 || (r.selectedHotbar as number) > 8) {
    throw new Error('ContainerScreen: hotbar selection must be an integer in [0, 8]');
  }

  for (const key of Object.keys(r)) {
    if (key !== 'menu' && key !== 'drag' && key !== 'selectedHotbar') {
      throw new Error(`ContainerScreen: unknown key ${key}`);
    }
  }

  return {
    menu,
    drag: {
      active: d.active as boolean,
      button: d.button as DragButton,
      startSlot: d.startSlot as number,
      hovered: d.hovered as number[],
    },
    selectedHotbar: r.selectedHotbar as number,
  };
}

/** A screen-level interaction event. */
export type ContainerScreenEvent =
  | { type: 'click'; index: number; button: 'left' | 'right' }
  | { type: 'dragStart'; index: number; button: DragButton }
  | { type: 'dragHover'; index: number }
  | { type: 'dragEnd' }
  | { type: 'doubleClick'; index: number }
  | { type: 'quickMove'; index: number }
  | { type: 'hotbarSwap'; hotbarIndex: number; targetIndex: number }
  | { type: 'selectHotbar'; index: number };

/**
 * Apply one screen event, returning a NEW screen state (or the IDENTICAL state for a no-op).
 * Routes clicks/quickMove to 106's transactions and drag/gather/swap to 202; drag indices are
 * validated here first.
 */
export function applyScreenEvent(
  state: ContainerScreenState,
  event: ContainerScreenEvent,
): ContainerScreenState {
  switch (event.type) {
    case 'click': {
      const transaction: MenuTransaction =
        event.button === 'left'
          ? { type: 'leftClick', index: event.index }
          : { type: 'rightClick', index: event.index };
      return { ...state, menu: applyMenuTransaction(state.menu, transaction) };
    }
    case 'dragStart':
      assertMenuIndex(state.menu, event.index, 'dragStart');
      return { ...state, drag: dragStart(state.drag, event.button, event.index) };
    case 'dragHover':
      assertMenuIndex(state.menu, event.index, 'dragHover');
      return { ...state, drag: dragHover(state.drag, event.index) };
    case 'dragEnd': {
      const { menu, drag } = dragEnd(state.menu, state.drag);
      return { ...state, menu, drag };
    }
    case 'doubleClick':
      return { ...state, menu: doubleClickGather(state.menu, event.index) };
    case 'quickMove':
      return { ...state, menu: applyMenuTransaction(state.menu, { type: 'quickMove', index: event.index }) };
    case 'hotbarSwap':
      return { ...state, menu: hotbarSwap(state.menu, event.hotbarIndex, event.targetIndex) };
    case 'selectHotbar': {
      if (!Number.isInteger(event.index) || event.index < 0 || event.index > 8) {
        throw new Error(`ContainerScreen: hotbar selection ${String(event.index)} is out of range`);
      }
      if (state.selectedHotbar === event.index) return state;
      return { ...state, selectedHotbar: event.index };
    }
  }
}
