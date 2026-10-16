/**
 * Sleep framework (198): the pure sleep rules over the fixed-tick 24000-tick day. Night window
 * (vanilla 12542-23459), sleep permission (night or storm), bed occupancy with spawn-point-on-
 * sleep, the all-players night-skip rule, the time skip itself, and versioned persistence.
 *
 * Determinism rules:
 * - `enterBed` rejects occupied beds with a structured result; success sets sleeping and the
 *   spawn point; `leaveBed` keeps the spawn point.
 * - `canSkipNight(sleeping, total)` = `total > 0 && sleeping >= total` (all players, vanilla).
 * - `skipNight(t)` returns morning (`timeOfDay` 0) with `skippedTicks = DAY_TICKS - t`.
 * - Deserialization validates the whole payload (version, booleans, a 3-finite-number spawn,
 *   exact key set) before accepting anything; violations throw descriptive errors.
 */
export const DAY_TICKS = 24000;
export const NIGHT_START_TICK = 12542;
export const NIGHT_END_TICK = 23459;

/** Immutable per-player sleep state. */
export interface SleepState {
  readonly sleeping: boolean;
  readonly spawnSet: boolean;
  /** Bed position; meaningful only when `spawnSet`. */
  readonly spawn: readonly [number, number, number];
}

export type BedPosition = readonly [number, number, number];

export type EnterBedResult =
  | { ok: true; state: SleepState }
  | { ok: false; reason: 'occupied' };

/** A fresh state: awake, no spawn point. */
export function createDefaultSleepState(): SleepState {
  return { sleeping: false, spawnSet: false, spawn: [0, 0, 0] };
}

/** Whether `timeOfDay` is inside the vanilla night window [12542, 23459] inclusive. */
export function isNight(timeOfDay: number): boolean {
  return timeOfDay >= NIGHT_START_TICK && timeOfDay <= NIGHT_END_TICK;
}

/** Whether the player may sleep now: during the night window, or any time during a storm. */
export function canSleep(timeOfDay: number, isStorm: boolean): boolean {
  return isNight(timeOfDay) || isStorm;
}

/**
 * Enter a bed. Re-entering the SAME bed while already sleeping returns the IDENTICAL state (no
 * op). An occupied bed is rejected (`{ ok: false, reason: 'occupied' }`); otherwise a NEW state
 * with `sleeping: true` and the spawn point set to the bed position.
 */
export function enterBed(state: SleepState, bedPosition: BedPosition, occupied: boolean): EnterBedResult {
  if (state.sleeping && samePosition(state.spawn, bedPosition)) return { ok: true, state };
  if (occupied) return { ok: false, reason: 'occupied' };
  return { ok: true, state: { sleeping: true, spawnSet: true, spawn: [...bedPosition] } };
}

function samePosition(a: readonly [number, number, number], b: BedPosition): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Leave the bed: awake, spawn point kept (identity no-op when already awake). */
export function leaveBed(state: SleepState): SleepState {
  if (!state.sleeping) return state;
  return { sleeping: false, spawnSet: state.spawnSet, spawn: state.spawn };
}

/** Whether the night may skip: ALL players must be sleeping (vanilla). */
export function canSkipNight(sleepingCount: number, totalPlayers: number): boolean {
  return totalPlayers > 0 && sleepingCount >= totalPlayers;
}

/** Skip the night to morning. */
export function skipNight(timeOfDay: number): { timeOfDay: number; skippedTicks: number } {
  return { timeOfDay: 0, skippedTicks: DAY_TICKS - timeOfDay };
}

/** The respawn point (bed position), or `null` until a bed sets it. */
export function spawnPoint(state: SleepState): readonly [number, number, number] | null {
  return state.spawnSet ? state.spawn : null;
}

/** Versioned serialized sleep state. */
export interface SerializedSleepState {
  version: 1;
  sleeping: boolean;
  spawnSet: boolean;
  spawn: [number, number, number];
}

/** Serialize the state (identity-shaped; validation happens on deserialize). */
export function serializeSleepState(state: SleepState): SerializedSleepState {
  return { version: 1, sleeping: state.sleeping, spawnSet: state.spawnSet, spawn: [...state.spawn] };
}

function isBedPosition(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

/**
 * Validate and restore a serialized state. The whole payload is validated first: object shape,
 * version, boolean flags, a 3-finite-number spawn tuple, and the exact key set. Any violation
 * throws a descriptive `Error`; nothing is partially accepted.
 */
export function deserializeSleepState(input: unknown): SleepState {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('SleepFramework: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== 1) {
    throw new Error(`SleepFramework: unsupported version ${String(r.version)}`);
  }
  if (typeof r.sleeping !== 'boolean') {
    throw new Error(`SleepFramework: sleeping must be a boolean, got ${String(r.sleeping)}`);
  }
  if (typeof r.spawnSet !== 'boolean') {
    throw new Error(`SleepFramework: spawnSet must be a boolean, got ${String(r.spawnSet)}`);
  }
  if (!isBedPosition(r.spawn)) {
    throw new Error('SleepFramework: spawn must be an array of three finite numbers');
  }
  for (const key of Object.keys(r)) {
    if (key !== 'version' && key !== 'sleeping' && key !== 'spawnSet' && key !== 'spawn') {
      throw new Error(`SleepFramework: unknown key ${key}`);
    }
  }
  return { sleeping: r.sleeping, spawnSet: r.spawnSet, spawn: r.spawn };
}
