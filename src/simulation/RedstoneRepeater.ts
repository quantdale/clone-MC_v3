/**
 * Redstone repeater (159): a configurable-delay signal line — the third component to use 047's
 * `ScheduledTickQueue` (after 157/158) — that can be **locked** by a perpendicular neighbour,
 * freezing its output regardless of its front input. This is the first component whose output
 * depends on more than its own front: a genuine side input, not just a visual facing.
 *
 * `resolveRepeaterOutput` mirrors 158's `torchShouldBeLit` shape (a pure predicate the caller
 * composes at the scheduled tick, not applied immediately), extended with the second `locked`
 * input 157/158 never needed.
 *
 * No `Game`/`World` wiring, no comparator/observer (160/161), no input-change tracking (a future
 * wiring change owns "did the input change" since it already tracks the real world), no rendering
 * distinction — see `openspec/changes/159-repeater/design.md`.
 */
import { MAX_SIGNAL_STRENGTH, MIN_SIGNAL_STRENGTH } from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';

/** A repeater's selectable delay setting. */
export type RepeaterDelay = 1 | 2 | 3 | 4;

/** The four horizontal facings a repeater can be placed with (matches `REPEATER_SCHEMA`). */
export type RepeaterFacing = 'north' | 'south' | 'east' | 'west';

/**
 * Tick cost per delay setting. An explicit lookup table (not a formula) so the four vanilla values
 * are visible and independently testable. Each step is exactly `TORCH_UPDATE_DELAY_TICKS` (158)
 * longer than the last, keeping the delay unit consistent across every redstone component so far.
 */
export const REPEATER_DELAY_TICKS: Readonly<Record<RepeaterDelay, number>> = Object.freeze({
  1: 2,
  2: 4,
  3: 6,
  4: 8,
});

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeTick(tick: number): number {
  return isFiniteNumber(tick) ? tick : 0;
}

/** Advance a delay setting: 1→2→3→4→1 (vanilla's right-click cycle). */
export function cycleRepeaterDelay(delay: RepeaterDelay): RepeaterDelay {
  return (delay % 4) + 1 as RepeaterDelay;
}

/** Whether a repeater should be locked: exactly the perpendicular-neighbour power, unchanged. */
export function repeaterShouldLock(perpendicularPowered: boolean): boolean {
  return perpendicularPowered;
}

/**
 * The composed output rule: a locked repeater is frozen at `currentPowered` regardless of
 * `currentInput` (vanilla does not even queue a change while locked); an unlocked repeater follows
 * `currentInput`.
 */
export function resolveRepeaterOutput(
  currentInput: boolean,
  locked: boolean,
  currentPowered: boolean,
): boolean {
  return locked ? currentPowered : currentInput;
}

/** Full signal while powered, nothing otherwise — mirrors 158's `torchSignalStrength` exactly. */
export function repeaterSignalStrength(powered: boolean): number {
  return powered ? MAX_SIGNAL_STRENGTH : MIN_SIGNAL_STRENGTH;
}

/** Schedule a repeater's output `REPEATER_DELAY_TICKS[delay]` after `currentTick`. */
export function scheduleRepeaterOutput(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  delay: RepeaterDelay,
  currentTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(currentTick) + REPEATER_DELAY_TICKS[delay]);
}

/** Pop every repeater output due at or before `nowTick`, in 047's deterministic order. */
export function dueRepeaterOutputs(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Project a repeater's full state into the property record `REPEATER_SCHEMA` enumerates. */
export function repeaterStateProperties(
  facing: RepeaterFacing,
  delay: RepeaterDelay,
  locked: boolean,
  powered: boolean,
): Record<string, boolean | number | string> {
  return { facing, delay, locked, powered };
}
