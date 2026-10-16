/**
 * Redstone consumer blocks (162): the first redstone blocks that are pure *sinks* rather than
 * sources — 154-161 all read power in only to compute a signal they emit back out; a lamp/door/
 * trapdoor reads power in and changes its own visible state, full stop. Closes the producer-to-
 * consumer loop this section has been building toward since 154.
 *
 * The core rule is the same one-line identity for all three: active exactly when powered. What
 * differs is timing — vanilla's redstone lamp turns on immediately but defers turning back off by
 * a short scheduled delay (so a single flickering pulse doesn't visibly strobe the lamp); doors and
 * trapdoors toggle immediately in both directions. That asymmetry is why the lamp gets its own 047
 * scheduling bridge (this section's sixth consumer) while the door/trapdoor functions do not.
 *
 * No dependency on 154's `RedstoneSignal.ts`: these blocks consume a plain `powered: boolean`, not
 * a signal strength, so there is no signal-domain clamping here. No player interaction (opening/
 * closing a door or trapdoor by hand, the same 156-161 deferral), no double-tall door geometry/
 * hinge/half state, no `facing` property (purely visual, 157/158's identical precedent), no
 * `Game`/`World` wiring — see `openspec/changes/162-redstone-consumer-blocks/design.md`.
 */
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';

/** Ticks a lit lamp waits after losing power before actually turning off (vanilla's flicker guard). */
export const LAMP_OFF_DELAY_TICKS = 4;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeTick(tick: number): number {
  return isFiniteNumber(tick) ? tick : 0;
}

/** The one underlying rule shared by every consumer in this module: active exactly when powered. */
function consumerActive(powered: boolean): boolean {
  return powered;
}

/**
 * Whether a redstone lamp should be lit, if applied right now. Turning on is immediate — the
 * caller applies this the moment `powered` becomes `true`. Turning off is deferred: the caller
 * instead calls `scheduleLampOff` and only applies `false` if `dueLampOffs` later confirms the lamp
 * is still unpowered at the scheduled tick.
 */
export function lampShouldBeLit(powered: boolean): boolean {
  return consumerActive(powered);
}

/** Schedule a lamp to re-check whether it should turn off, `LAMP_OFF_DELAY_TICKS` after losing power. */
export function scheduleLampOff(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  currentTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(currentTick) + LAMP_OFF_DELAY_TICKS);
}

/** Pop every lamp off-recheck due at or before `nowTick`, in 047's deterministic order. */
export function dueLampOffs(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Whether a door should be open. Toggles immediately in both directions — no scheduling. */
export function doorShouldBeOpen(powered: boolean): boolean {
  return consumerActive(powered);
}

/** Whether a trapdoor should be open. Identical rule and timing to the door. */
export function trapdoorShouldBeOpen(powered: boolean): boolean {
  return consumerActive(powered);
}

/** Project a lamp's lit flag into the property record `LAMP_SCHEMA` enumerates. */
export function lampStateProperties(lit: boolean): Record<string, boolean> {
  return { lit };
}

/** Project a door's open flag into the property record `OPEN_SCHEMA` enumerates. */
export function doorStateProperties(open: boolean): Record<string, boolean> {
  return { open };
}

/** Project a trapdoor's open flag into the property record `OPEN_SCHEMA` enumerates. */
export function trapdoorStateProperties(open: boolean): Record<string, boolean> {
  return { open };
}
