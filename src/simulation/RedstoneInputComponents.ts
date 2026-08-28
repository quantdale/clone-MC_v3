/**
 * Redstone input components (157): the three foundational power sources — lever, button, pressure
 * plate. All three emit full signal while powered; they differ in exactly one interesting way,
 * which is what this module models: how their powered state *ends*. A lever latches until toggled;
 * a button releases itself after a fixed delay; a plate follows occupancy with a trailing delay.
 *
 * Timing rides on 047's `ScheduledTickQueue`, whose absolute-due-tick scheduling, per-position
 * dedup, and deterministic `(tickTime, seq)` pop ordering are exactly right here. (156 correctly
 * did *not* use it — wire propagation is immediate; this is its first redstone consumer, and 159's
 * repeater delay will be the second. Entries are keyed by position and ordered by absolute tick, so
 * independent users of one queue cannot interfere.)
 *
 * No facing/attachment state (that drives models — 059/060 — not signal behavior), no `Game`/
 * `World` wiring, no interaction or entity-detection logic, no weighted plates — see
 * `openspec/changes/157-redstone-input-components/design.md`.
 */
import { MAX_SIGNAL_STRENGTH, MIN_SIGNAL_STRENGTH } from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';

/** The three foundational redstone sources. */
export type RedstoneComponentKind = 'lever' | 'button' | 'pressure_plate';

/** Ticks a pressed button stays powered (1 second at 20 TPS). */
export const BUTTON_ACTIVE_TICKS = 20;
/** Ticks a vacated pressure plate stays powered before releasing. */
export const PLATE_RELEASE_DELAY_TICKS = 10;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * The signal a component emits. Every kind emits `MAX_SIGNAL_STRENGTH` while powered and
 * `MIN_SIGNAL_STRENGTH` otherwise — the three differ in *when* they are powered, never in *how
 * strongly*. (Analog sources such as weighted plates are separate later content.)
 */
export function componentSignalStrength(kind: RedstoneComponentKind, powered: boolean): number {
  void kind;
  return powered ? MAX_SIGNAL_STRENGTH : MIN_SIGNAL_STRENGTH;
}

/** Flip a lever. Involutive: applying it twice returns the original state. */
export function toggleLever(powered: boolean): boolean {
  return !powered;
}

/** The result of pressing a button: powered now, releasing at `releaseTick`. */
export interface ButtonPress {
  readonly powered: true;
  readonly releaseTick: number;
}

/**
 * Press a button at `currentTick`. Always powers on and always sets the release
 * `BUTTON_ACTIVE_TICKS` later — pressing an already-pressed button re-arms the release rather than
 * doing nothing, matching vanilla (and why 047's per-position dedup is the right primitive).
 */
export function pressButton(currentTick: number): ButtonPress {
  const now = isFiniteNumber(currentTick) ? currentTick : 0;
  return { powered: true, releaseTick: now + BUTTON_ACTIVE_TICKS };
}

/**
 * Whether a pressure plate reads powered from what stands on it. A negative or non-finite count
 * reads `false` rather than throwing (154-156's total convention). Deciding *which* entities count
 * needs the entity/collision layer and is the caller's job.
 */
export function platePowered(entityCount: number): boolean {
  return isFiniteNumber(entityCount) && entityCount > 0;
}

/** The tick a vacated plate releases at. */
export function plateReleaseTick(currentTick: number): number {
  const now = isFiniteNumber(currentTick) ? currentTick : 0;
  return now + PLATE_RELEASE_DELAY_TICKS;
}

/**
 * Schedule a component's self-release on 047's queue. Returns `false` and schedules nothing for a
 * lever — a lever latches, and only a second interaction changes it. (Returning a boolean rather
 * than silently no-op'ing lets a caller assert it did not accidentally arm a latch.)
 */
export function scheduleComponentRelease(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  kind: RedstoneComponentKind,
  currentTick: number,
): boolean {
  if (kind === 'lever') return false;
  const dueTick = kind === 'button' ? pressButton(currentTick).releaseTick : plateReleaseTick(currentTick);
  queue.schedule(x, y, z, dueTick);
  return true;
}

/**
 * Pop every component release due at or before `nowTick`, in 047's deterministic
 * `(tickTime, seq)` order. Later entries stay queued.
 */
export function dueComponentReleases(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Project a component's powered flag into the property record `POWERED_SCHEMA` enumerates. */
export function componentStateProperties(powered: boolean): Record<string, boolean> {
  return { powered };
}
