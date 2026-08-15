/**
 * Container menu transaction core (106). A `ContainerMenu` is an ordered list of validated
 * slots split into a container region and a player region (by `playerSlotStart`), plus a
 * cursor. `applyMenuTransaction` applies click transactions immutably and deterministically:
 * leftClick (pick up / merge / swap), rightClick (split-half pickup or place-one), placeOne,
 * and quickMove (whole stack to the other region via first-fit). Slots carry per-item stack
 * caps; counts never exceed them. Out-of-bounds indices throw; all other paths are total.
 */

/** The cursor: an item being carried between slots (count 0 iff item null). */
export interface MenuCursor {
  item: string | null;
  count: number;
}

/** One menu slot with a per-slot stack cap. */
export interface MenuSlot {
  item: string | null;
  count: number;
  maxStack: number;
}

/** A validated container menu state. */
export interface ContainerMenu {
  slots: MenuSlot[];
  /** Index where the player inventory region starts (container region precedes it). */
  playerSlotStart: number;
  cursor: MenuCursor;
}

/** Click transactions. */
export type MenuTransaction =
  | { type: 'leftClick'; index: number }
  | { type: 'rightClick'; index: number }
  | { type: 'placeOne'; index: number }
  | { type: 'quickMove'; index: number };

/** Maximum cursor count. */
export const MAX_CURSOR_COUNT = 64;

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function validateSlot(slot: MenuSlot, index: number): void {
  if (!isPositiveInteger(slot.maxStack) || slot.maxStack > MAX_CURSOR_COUNT) {
    throw new Error(`MenuTransaction: slot ${index}.maxStack must be an integer in [1, ${MAX_CURSOR_COUNT}]`);
  }
  if (slot.item === null) {
    if (slot.count !== 0) {
      throw new Error(`MenuTransaction: slot ${index} with a null item must have count 0`);
    }
  } else {
    if (typeof slot.item !== 'string' || slot.item.length === 0) {
      throw new Error(`MenuTransaction: slot ${index}.item must be a non-empty string or null`);
    }
    if (!Number.isInteger(slot.count) || slot.count < 1 || slot.count > slot.maxStack) {
      throw new Error(`MenuTransaction: slot ${index}.count must be an integer in [1, maxStack]`);
    }
  }
}

function validateCursor(cursor: MenuCursor): void {
  if (cursor.item === null) {
    if (cursor.count !== 0) {
      throw new Error('MenuTransaction: cursor with a null item must have count 0');
    }
  } else {
    if (typeof cursor.item !== 'string' || cursor.item.length === 0) {
      throw new Error('MenuTransaction: cursor.item must be a non-empty string or null');
    }
    if (!Number.isInteger(cursor.count) || cursor.count < 1 || cursor.count > MAX_CURSOR_COUNT) {
      throw new Error(`MenuTransaction: cursor.count must be an integer in [1, ${MAX_CURSOR_COUNT}]`);
    }
  }
}

/** Validate an unknown value as a container menu; throws descriptively otherwise. */
export function validateContainerMenu(input: unknown): ContainerMenu {
  if (typeof input !== 'object' || input === null) {
    throw new Error('MenuTransaction: menu must be an object');
  }
  const r = input as Record<string, unknown>;
  if (!Array.isArray(r.slots) || r.slots.length < 1) {
    throw new Error('MenuTransaction: slots must be a non-empty array');
  }
  const slots: MenuSlot[] = [];
  for (let i = 0; i < r.slots.length; i++) {
    const slot = r.slots[i];
    if (typeof slot !== 'object' || slot === null) {
      throw new Error(`MenuTransaction: slot ${i} must be an object`);
    }
    const s = slot as Record<string, unknown>;
    const parsed: MenuSlot = { item: s.item as string | null, count: s.count as number, maxStack: s.maxStack as number };
    validateSlot(parsed, i);
    slots.push(parsed);
  }
  const playerSlotStart = r.playerSlotStart as number;
  if (!Number.isInteger(playerSlotStart) || playerSlotStart <= 0 || playerSlotStart >= slots.length) {
    throw new Error(`MenuTransaction: playerSlotStart must be an integer in (0, ${slots.length}), got ${String(playerSlotStart)}`);
  }
  if (typeof r.cursor !== 'object' || r.cursor === null) {
    throw new Error('MenuTransaction: cursor must be an object');
  }
  const cursorInput = r.cursor as Record<string, unknown>;
  const cursor: MenuCursor = { item: cursorInput.item as string | null, count: cursorInput.count as number };
  validateCursor(cursor);
  return { slots, playerSlotStart, cursor };
}

/** Build an empty-cursor menu over validated slots. */
export function createContainerMenu(slots: MenuSlot[], playerSlotStart: number): ContainerMenu {
  return validateContainerMenu({ slots, playerSlotStart, cursor: { item: null, count: 0 } });
}

function assertIndex(menu: ContainerMenu, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= menu.slots.length) {
    throw new Error(`MenuTransaction: index ${String(index)} is out of bounds for ${menu.slots.length} slots`);
  }
}

/**
 * Apply one click transaction to a menu, returning a NEW immutable menu state. Out-of-bounds
 * indices throw; all other paths are total and deterministic.
 */
export function applyMenuTransaction(menu: ContainerMenu, transaction: MenuTransaction): ContainerMenu {
  assertIndex(menu, transaction.index);
  const slots = menu.slots.map((s) => ({ ...s }));
  const cursor: MenuCursor = { ...menu.cursor };
  const slot = slots[transaction.index]!;

  switch (transaction.type) {
    case 'leftClick': {
      if (cursor.item === null) {
        // Pick up the slot.
        cursor.item = slot.item;
        cursor.count = slot.count;
        slot.item = null;
        slot.count = 0;
      } else if (slot.item === null) {
        // Place the cursor when it fits; otherwise swap.
        if (cursor.count <= slot.maxStack) {
          slot.item = cursor.item;
          slot.count = cursor.count;
          cursor.item = null;
          cursor.count = 0;
        } else {
          slot.item = cursor.item;
          slot.count = slot.maxStack;
          cursor.count -= slot.maxStack;
        }
      } else if (slot.item === cursor.item) {
        // Merge as much as fits; the remainder stays on the cursor.
        const moved = Math.min(cursor.count, slot.maxStack - slot.count);
        slot.count += moved;
        cursor.count -= moved;
        if (cursor.count === 0) {
          cursor.item = null;
        }
      } else {
        // Swap.
        const oldItem = slot.item;
        const oldCount = slot.count;
        slot.item = cursor.item;
        slot.count = cursor.count;
        cursor.item = oldItem;
        cursor.count = oldCount;
      }
      break;
    }
    case 'rightClick': {
      if (slot.item !== null && (cursor.item === null || cursor.item === slot.item)) {
        // Split-half pickup (merge-limited by cursor room).
        const wanted = Math.ceil(slot.count / 2);
        if (cursor.item === null) {
          cursor.item = slot.item;
          cursor.count = wanted;
          slot.count -= wanted;
        } else {
          const room = MAX_CURSOR_COUNT - cursor.count;
          const moved = Math.min(wanted, room);
          cursor.count += moved;
          slot.count -= moved;
        }
        if (slot.count === 0) {
          slot.item = null;
        }
      } else if (cursor.item !== null && (slot.item === null || (slot.item === cursor.item && slot.count < slot.maxStack))) {
        // Place one.
        if (slot.item === null) {
          slot.item = cursor.item;
          slot.count = 1;
        } else {
          slot.count += 1;
        }
        cursor.count -= 1;
        if (cursor.count === 0) {
          cursor.item = null;
        }
      }
      break;
    }
    case 'placeOne': {
      if (cursor.item === null || cursor.count < 1) {
        break;
      }
      if (slot.item === null) {
        slot.item = cursor.item;
        slot.count = 1;
        cursor.count -= 1;
      } else if (slot.item === cursor.item && slot.count < slot.maxStack) {
        slot.count += 1;
        cursor.count -= 1;
      }
      if (cursor.count === 0) {
        cursor.item = null;
      }
      break;
    }
    case 'quickMove': {
      const toPlayer = transaction.index < menu.playerSlotStart;
      const start = toPlayer ? menu.playerSlotStart : 0;
      const end = toPlayer ? slots.length : menu.playerSlotStart;
      if (slot.item !== null) {
        let remaining = slot.count;
        // First pass: merge into same-item slots with room.
        for (let i = start; i < end && remaining > 0; i++) {
          const target = slots[i]!;
          if (target.item === slot.item && target.count < target.maxStack) {
            const moved = Math.min(remaining, target.maxStack - target.count);
            target.count += moved;
            remaining -= moved;
          }
        }
        // Second pass: first empty slot.
        for (let i = start; i < end && remaining > 0; i++) {
          const target = slots[i]!;
          if (target.item === null) {
            const moved = Math.min(remaining, target.maxStack);
            target.item = slot.item;
            target.count = moved;
            remaining -= moved;
          }
        }
        slot.count = remaining;
        if (remaining === 0) {
          slot.item = null;
        }
      }
      break;
    }
  }

  return { slots, playerSlotStart: menu.playerSlotStart, cursor };
}
