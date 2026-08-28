/**
 * Redstone observer (161): detects a state change in the block it faces and emits a short pulse
 * out its back — the last of the 157-161 logic-component trio, and the first to react to a
 * *neighbour's* state rather than to power flowing into itself.
 *
 * Facing is 6-way (matches 154's `Direction` exactly, not the 4-way horizontal-only facing 159/160
 * use) because an observer can watch the block above or below it just as validly as one to a side —
 * the first 6-way facing schema in this series. Watched/emission neighbour positions are derived
 * directly from 154's `offsetInDirection`/`OPPOSITE_DIRECTION`, reusing its direction vocabulary
 * rather than reintroducing a parallel one.
 *
 * The pulse is two-phase and each phase rides its own 047 `ScheduledTickQueue`: pulse-start fires
 * `OBSERVER_PULSE_START_DELAY_TICKS` after a detected change; pulse-end fires
 * `OBSERVER_PULSE_DURATION_TICKS` after that. Two independent queues (rather than one shared queue)
 * are used because 047's queue holds at most one pending entry per position — a single queue could
 * never represent "pending turn-on" and "pending turn-off" for the same block at once, whereas two
 * queues can never collide with each other by construction.
 *
 * Change detection itself ("did the observed neighbour's state actually change") is the caller's
 * job, matching 159's identical deferral of input-change tracking to a future wiring change that
 * already owns the real `World`. Re-triggering while a pulse is pending-on simply reschedules that
 * pending-on tick later (047's own dedup-by-position behavior) — not a special case here.
 *
 * No `Game`/`World` wiring, no block-update/BUD-style cascade beyond the emitted pulse itself — see
 * `openspec/changes/161-observer/design.md`.
 */
import {
  MIN_SIGNAL_STRENGTH,
  MAX_SIGNAL_STRENGTH,
  OPPOSITE_DIRECTION,
  offsetInDirection,
  type Direction,
} from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';

/** The six-way facing an observer can be placed with — matches 154's `Direction` exactly. */
export type ObserverFacing = Direction;

/** Ticks after a detected change before the pulse turns on (vanilla's 1 redstone tick). */
export const OBSERVER_PULSE_START_DELAY_TICKS = 2;
/** Ticks the pulse stays on before turning back off (vanilla's 1 redstone tick). */
export const OBSERVER_PULSE_DURATION_TICKS = 2;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeTick(tick: number): number {
  return isFiniteNumber(tick) ? tick : 0;
}

/** The position of the neighbour this observer watches: one block in its facing direction. */
export function observedNeighborPosition(
  x: number,
  y: number,
  z: number,
  facing: ObserverFacing,
): [number, number, number] {
  return offsetInDirection(x, y, z, facing);
}

/** The position the pulse is emitted toward: one block behind the observer (opposite its facing). */
export function emissionNeighborPosition(
  x: number,
  y: number,
  z: number,
  facing: ObserverFacing,
): [number, number, number] {
  return offsetInDirection(x, y, z, OPPOSITE_DIRECTION[facing]);
}

/** Schedule the pulse to turn on `OBSERVER_PULSE_START_DELAY_TICKS` after `currentTick`. */
export function scheduleObserverPulseStart(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  currentTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(currentTick) + OBSERVER_PULSE_START_DELAY_TICKS);
}

/** Pop every pulse-start event due at or before `nowTick`, in 047's deterministic order. */
export function dueObserverPulseStarts(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Schedule the pulse to turn back off `OBSERVER_PULSE_DURATION_TICKS` after it turned on. */
export function scheduleObserverPulseEnd(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  pulseStartTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(pulseStartTick) + OBSERVER_PULSE_DURATION_TICKS);
}

/** Pop every pulse-end event due at or before `nowTick`, in 047's deterministic order. */
export function dueObserverPulseEnds(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Full signal while the pulse is on, nothing otherwise. */
export function observerSignalStrength(powered: boolean): number {
  return powered ? MAX_SIGNAL_STRENGTH : MIN_SIGNAL_STRENGTH;
}

/** Project an observer's full state into the property record `OBSERVER_SCHEMA` enumerates. */
export function observerStateProperties(
  facing: ObserverFacing,
  powered: boolean,
): Record<string, boolean | string> {
  return { facing, powered };
}
