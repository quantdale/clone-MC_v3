/**
 * Redstone comparator (160): the first *analog* component — output is a genuine function of two
 * signal strengths, not just two booleans. Two selectable modes: `compare` passes the front input
 * through unchanged when it is at least the side input (else 0); `subtract` always outputs
 * `max(0, front - side)`.
 *
 * Both inputs are clamped through 154's `clampSignal` before any comparison or arithmetic —
 * mirroring 154's own "every source value is clamped on read" discipline — so an out-of-domain
 * caller value can never produce an out-of-domain result.
 *
 * No container signal reads (a chest/furnace's fullness as 0-15 needs a bridge from 106's
 * container model that no titled change builds before 166; `sideInput` is a plain number so that
 * future bridge plugs in without touching this module), no `Game`/`World` wiring, no observer
 * (161) — see `openspec/changes/160-comparator/design.md`.
 */
import { MIN_SIGNAL_STRENGTH, clampSignal } from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';

/** A comparator's selectable mode. */
export type ComparatorMode = 'compare' | 'subtract';

/** The four horizontal facings a comparator can be placed with (matches `COMPARATOR_SCHEMA`). */
export type ComparatorFacing = 'north' | 'south' | 'east' | 'west';

/**
 * Ticks between a sampled input change and the comparator updating. Reuses 158's
 * `TORCH_UPDATE_DELAY_TICKS` value (2) directly: vanilla's comparator and torch genuinely share
 * the same one-redstone-tick update speed.
 */
export const COMPARATOR_UPDATE_DELAY_TICKS = 2;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeTick(tick: number): number {
  return isFiniteNumber(tick) ? tick : 0;
}

/** Toggle between the two modes: `compare` ↔ `subtract`. */
export function cycleComparatorMode(mode: ComparatorMode): ComparatorMode {
  return mode === 'compare' ? 'subtract' : 'compare';
}

/**
 * The resolved output for `mode` given a front and side input, both clamped into the signal domain
 * before any comparison or arithmetic:
 * - `compare`: the (clamped) front input when it is `>=` the (clamped) side input, else 0 — the
 *   threshold is inclusive, so an exactly-equal front and side still passes through.
 * - `subtract`: `front - side`, floored at 0 (a side stronger than front never underflows).
 */
export function resolveComparatorOutput(
  mode: ComparatorMode,
  frontInput: number,
  sideInput: number,
): number {
  const front = clampSignal(frontInput);
  const side = clampSignal(sideInput);
  if (mode === 'compare') {
    return front >= side ? front : MIN_SIGNAL_STRENGTH;
  }
  return Math.max(MIN_SIGNAL_STRENGTH, front - side);
}

/** Whether a resolved output counts as powered: strictly positive. */
export function comparatorIsPowered(output: number): boolean {
  return clampSignal(output) > MIN_SIGNAL_STRENGTH;
}

/** Schedule a comparator to re-evaluate `COMPARATOR_UPDATE_DELAY_TICKS` after `currentTick`. */
export function scheduleComparatorUpdate(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  currentTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(currentTick) + COMPARATOR_UPDATE_DELAY_TICKS);
}

/** Pop every comparator update due at or before `nowTick`, in 047's deterministic order. */
export function dueComparatorUpdates(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Project a comparator's full state into the property record `COMPARATOR_SCHEMA` enumerates. */
export function comparatorStateProperties(
  facing: ComparatorFacing,
  mode: ComparatorMode,
  powered: boolean,
): Record<string, boolean | string> {
  return { facing, mode, powered };
}
