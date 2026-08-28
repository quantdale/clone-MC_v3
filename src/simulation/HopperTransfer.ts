/**
 * Hopper transfer (166): directional, timed, one-item-at-a-time transfer between containers — the
 * first module in this section to move an *item*, not a signal or a block.
 *
 * `transferOneItem` reuses 106's `MenuSlot` shape directly rather than a parallel type, but is not
 * routed through 106's `applyMenuTransaction`: that API models player click transactions
 * (leftClick/rightClick/placeOne/quickMove), and a hopper's automatic one-item move on a timer has
 * no click semantics to reuse.
 *
 * `hopperShouldTransfer` is the *inverse* of 162's consumer rule — a hopper transfers exactly when
 * **un**powered, the second inverting rule in this section after 158's torch (there the inversion
 * flips a signal; here it flips a lockout). `enabled` (not `powered`) is the block's own property
 * name, matching vanilla's real hopper blockstate.
 *
 * `HopperFacing` excludes `'up'`: a hopper's intake is always fixed to its top face regardless of
 * facing, so `hopperIntakePosition` never depends on it.
 *
 * No item-entity scooping, no real container-transaction integration (`transferOneItem` operates
 * on plain `MenuSlot[]` arrays a future wiring change supplies), no `Game`/`World` wiring — see
 * `openspec/changes/166-hopper-transfer/design.md`.
 */
import { offsetInDirection } from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';
import type { MenuSlot } from '../inventory/MenuTransaction';

/** A hopper's facing: five-way, since `'up'` is reserved for its fixed intake. */
export type HopperFacing = 'down' | 'north' | 'south' | 'east' | 'west';

/** Ticks between transfer attempts (vanilla's hopper cooldown). */
export const HOPPER_TRANSFER_COOLDOWN_TICKS = 8;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeTick(tick: number): number {
  return isFiniteNumber(tick) ? tick : 0;
}

/** The outcome of a single transfer attempt. */
export interface HopperTransferResult {
  readonly moved: boolean;
  readonly source: MenuSlot[];
  readonly destination: MenuSlot[];
}

/**
 * Move at most one item unit from the first non-empty `source` slot into `destination`: a
 * same-item slot with room is preferred; failing that, the first empty slot. A failed search (no
 * source item, or no room anywhere in `destination`) leaves both sides unchanged in content —
 * `moved: false` — and never partially depletes the source.
 */
export function transferOneItem(
  source: readonly MenuSlot[],
  destination: readonly MenuSlot[],
): HopperTransferResult {
  const sourceSlots = source.map((s) => ({ ...s }));
  const destinationSlots = destination.map((s) => ({ ...s }));

  const sourceIndex = sourceSlots.findIndex((s) => s.item !== null && s.count > 0);
  if (sourceIndex === -1) {
    return { moved: false, source: sourceSlots, destination: destinationSlots };
  }
  const sourceSlot = sourceSlots[sourceIndex]!;
  const item = sourceSlot.item!;

  let destIndex = destinationSlots.findIndex((d) => d.item === item && d.count < d.maxStack);
  if (destIndex === -1) {
    destIndex = destinationSlots.findIndex((d) => d.item === null);
  }
  if (destIndex === -1) {
    return { moved: false, source: sourceSlots, destination: destinationSlots };
  }

  const destSlot = destinationSlots[destIndex]!;
  if (destSlot.item === null) {
    destSlot.item = item;
    destSlot.count = 1;
  } else {
    destSlot.count += 1;
  }
  sourceSlot.count -= 1;
  if (sourceSlot.count === 0) {
    sourceSlot.item = null;
  }

  return { moved: true, source: sourceSlots, destination: destinationSlots };
}

/** Whether a hopper transfers right now: exactly the inverse of `powered` (redstone lockout). */
export function hopperShouldTransfer(powered: boolean): boolean {
  return !powered;
}

/** The position a hopper pulls from: always straight up, independent of `facing`. */
export function hopperIntakePosition(x: number, y: number, z: number): [number, number, number] {
  return offsetInDirection(x, y, z, 'up');
}

/** The position a hopper pushes into: one block in its `facing` direction. */
export function hopperOutputPosition(
  x: number,
  y: number,
  z: number,
  facing: HopperFacing,
): [number, number, number] {
  return offsetInDirection(x, y, z, facing);
}

/** Schedule the next transfer attempt `HOPPER_TRANSFER_COOLDOWN_TICKS` after `currentTick`. */
export function scheduleHopperTransfer(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  currentTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(currentTick) + HOPPER_TRANSFER_COOLDOWN_TICKS);
}

/** Pop every hopper transfer due at or before `nowTick`, in 047's deterministic order. */
export function dueHopperTransfers(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Project a hopper's full state into the property record `HOPPER_SCHEMA` enumerates. */
export function hopperStateProperties(
  facing: HopperFacing,
  enabled: boolean,
): Record<string, boolean | string> {
  return { facing, enabled };
}
