/**
 * Dropper ejection (167): the second item-moving module in this section and the first place 166's
 * `transferOneItem`/`MenuSlot` model meets a real *container write-back*. A dropper, like a hopper,
 * transfers exactly when **un**powered (the same inverse-of-162 lockout), but its behavior on a
 * "no container in front" facing is different: a hopper would simply do nothing, whereas a dropper
 * *drops* the item as an entity into the world.
 *
 * To stay in this section's "caller samples, this module computes" discipline (no `Game`/`World`
 * wiring), the world drop is modeled as a returned `DroppedItem` descriptor — position, item, count —
 * rather than an actual spawned entity. A future wiring change turns that descriptor into a real
 * 111-style item entity; the decision logic lives here, the spawn does not.
 *
 * `dropperOutputPosition` reuses 154's `offsetInDirection` (a `DropperFacing` is the same five-way
 * subset hopper uses — no `'up'`, since a dropper's output is its faced side). `ejectFromDropper`
 * itself is position-agnostic: it takes an explicit `dropPosition` so the pure core never touches
 * coordinates, exactly as 166's `transferOneItem` never does.
 */
import { offsetInDirection } from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';
import type { MenuSlot } from '../inventory/MenuTransaction';
import { transferOneItem } from './HopperTransfer';

/** A dropper's facing: five-way, since `'up'` is never a legal output direction. */
export type DropperFacing = 'down' | 'north' | 'south' | 'east' | 'west';

/** Ticks between ejection attempts (mirrors 166's hopper cadence for the 047 bridge). */
export const DROPPER_EJECT_COOLDOWN_TICKS = 8;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeTick(tick: number): number {
  return isFiniteNumber(tick) ? tick : 0;
}

/** A dropped item entity descriptor (pure model; a wiring change spawns the real 111-style entity). */
export interface DroppedItem {
  readonly item: string;
  readonly count: number;
  readonly position: readonly [number, number, number];
}

/** The outcome of one dropper ejection attempt. */
export type DropperEjectResult =
  | { kind: 'container'; moved: true; source: MenuSlot[]; destination: MenuSlot[] }
  | { kind: 'drop'; moved: true; source: MenuSlot[]; drop: DroppedItem }
  | { kind: 'none'; moved: false; source: MenuSlot[] };

/**
 * Eject one item from `source`:
 * - into `destinationContainer` (a `MenuSlot[]`) when one is supplied — reusing 166's
 *   `transferOneItem`; a full container yields `kind: 'none'` (a dropper does *not* spill into the
 *   world when facing a container that cannot accept the item);
 * - as a `DroppedItem` at `dropPosition` when `destinationContainer` is `null` (facing air / no
 *   container);
 * - `kind: 'none'` when `source` has nothing to eject.
 * A failed/empty ejection never depletes `source`; a `drop` decrements `source` by exactly one.
 */
export function ejectFromDropper(
  source: readonly MenuSlot[],
  destinationContainer: readonly MenuSlot[] | null,
  dropPosition: readonly [number, number, number],
): DropperEjectResult {
  const sourceSlots = source.map((s) => ({ ...s }));

  const sourceIndex = sourceSlots.findIndex((s) => s.item !== null && s.count > 0);
  if (sourceIndex === -1) {
    return { kind: 'none', moved: false, source: sourceSlots };
  }
  const sourceSlot = sourceSlots[sourceIndex]!;
  const item = sourceSlot.item!;

  if (destinationContainer !== null) {
    const res = transferOneItem(sourceSlots, destinationContainer);
    if (res.moved) {
      return { kind: 'container', moved: true, source: res.source, destination: res.destination };
    }
    // Container present but cannot accept the item: no spill, source untouched.
    return { kind: 'none', moved: false, source: sourceSlots };
  }

  // Facing no container: drop into the world at the provided position.
  sourceSlot.count -= 1;
  if (sourceSlot.count === 0) {
    sourceSlot.item = null;
  }
  return {
    kind: 'drop',
    moved: true,
    source: sourceSlots,
    drop: { item, count: 1, position: [dropPosition[0], dropPosition[1], dropPosition[2]] },
  };
}

/** Whether a dropper ejects right now: exactly the inverse of `powered` (same lockout as 166). */
export function dropperShouldTransfer(powered: boolean): boolean {
  return !powered;
}

/** The position a dropper ejects into: one block in its `facing` direction. */
export function dropperOutputPosition(
  x: number,
  y: number,
  z: number,
  facing: DropperFacing,
): [number, number, number] {
  return offsetInDirection(x, y, z, facing);
}

/** Schedule the next ejection attempt `DROPPER_EJECT_COOLDOWN_TICKS` after `currentTick`. */
export function scheduleDropperEject(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  currentTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(currentTick) + DROPPER_EJECT_COOLDOWN_TICKS);
}

/** Pop every dropper ejection due at or before `nowTick`, in 047's deterministic order. */
export function dueDropperEjects(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Project a dropper's full state into the property record `DROPPER_SCHEMA` enumerates. */
export function dropperStateProperties(
  facing: DropperFacing,
  enabled: boolean,
): Record<string, boolean | string> {
  return { facing, enabled };
}
