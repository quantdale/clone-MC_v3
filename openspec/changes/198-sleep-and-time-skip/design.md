# Design: 198-sleep-and-time-skip

## Context/current state
- The fixed-tick clock (044) runs a 24000-tick day; nothing defines night, beds, or sleeping. 198
  adds the pure sleep framework; the block-behavior layer applies `enterBed`, and 199's particle
  hooks can react to wake events.

## Target state
- `src/simulation/SleepFramework.ts` holding the day/night constants, night and sleep rules, the
  immutable `SleepState` (sleeping flag + spawn point), occupancy, time skip, and versioned
  persistence.

## Invariants
- Pure and headless-safe: no world access, no mutation of anything outside the returned state.
- The night window is [12542, 23459] inclusive; `isNight` is membership in it; `canSleep` is
  `isNight(timeOfDay) || isStorm`.
- `enterBed` succeeds only when the bed is unoccupied (re-entering the SAME bed while already
  sleeping is an identity no-op); success sets `sleeping` and the spawn point to the bed position;
  `leaveBed` keeps the spawn point.
- `canSkipNight(sleeping, total)` is `total > 0 && sleeping >= total` (all players, vanilla).
- `skipNight` returns morning (`timeOfDay` 0) with `skippedTicks = DAY_TICKS - timeOfDay`.
- Deserialization validates the whole payload before accepting anything; violations throw
  descriptive errors.

## API and data model
```ts
// src/simulation/SleepFramework.ts (new)
export const DAY_TICKS = 24000;
export const NIGHT_START_TICK = 12542;
export const NIGHT_END_TICK = 23459;

export interface SleepState {
  sleeping: boolean;
  spawnSet: boolean;
  spawn: readonly [number, number, number];  // bed position; meaningful only when spawnSet
}

export type BedPosition = readonly [number, number, number];
export type EnterBedResult = { ok: true; state: SleepState } | { ok: false; reason: 'occupied' };

export function createDefaultSleepState(): SleepState;
export function isNight(timeOfDay: number): boolean;
export function canSleep(timeOfDay: number, isStorm: boolean): boolean;
export function enterBed(state: SleepState, bedPosition: BedPosition, occupied: boolean): EnterBedResult;
export function leaveBed(state: SleepState): SleepState;
export function canSkipNight(sleepingCount: number, totalPlayers: number): boolean;
export function skipNight(timeOfDay: number): { timeOfDay: number; skippedTicks: number };
export function spawnPoint(state: SleepState): readonly [number, number, number] | null;

export interface SerializedSleepState { version: 1; sleeping: boolean; spawnSet: boolean; spawn: [number, number, number]; }
export function serializeSleepState(state: SleepState): SerializedSleepState;
export function deserializeSleepState(input: unknown): SleepState;
```

## Control/data flow
1. A player interacts with a bed; the block layer checks the bed's occupancy and calls
   `enterBed(state, bedPos, occupied)`.
2. Each tick the wiring asks `canSleep(timeOfDay, isStorm)` (or the player entered explicitly) and
   counts sleeping players; when `canSkipNight(sleeping, total)` holds, it applies
   `skipNight(timeOfDay)` and clears weather (196).
3. `spawnPoint(state)` feeds the respawn flow (040's player record holds the persisted spawn).

## Detailed behavior
- `isNight(t)` = `t >= NIGHT_START_TICK && t <= NIGHT_END_TICK` (inclusive both ends).
- `canSleep(t, storm)` = `isNight(t) || storm`.
- `enterBed`: `occupied` -> `{ ok: false, reason: 'occupied' }`; otherwise a new state with
  `sleeping: true`, `spawnSet: true`, `spawn: bedPosition`.
- `leaveBed`: `sleeping: false`, spawn fields unchanged (identity no-op when not sleeping).
- `canSkipNight(s, t)` = `t > 0 && s >= t` (counts outside [0, t] can't over-qualify: `s >= t`
  with `s > t` is still true — acceptable; `t <= 0` -> false).
- `skipNight(t)`: `{ timeOfDay: 0, skippedTicks: DAY_TICKS - t }` — e.g. 20000 -> 4000 skipped,
  0 -> a full 24000-tick day (documented).
- `spawnPoint(state)`: `null` when `spawnSet` false, else the stored tuple.
- `deserializeSleepState` rejections: non-object -> `SleepFramework: expected an object`; bad
  version -> `unsupported version <v>`; non-boolean fields -> `sleeping must be a boolean, got <v>`
  / `spawnSet must be a boolean, got <v>`; malformed spawn -> `spawn must be an array of three
  finite numbers`; unknown keys -> `unknown key <k>`.

## Failure modes
- No throws in the state/rules API; `enterBed` reports occupancy as a structured result.
- Only `deserializeSleepState` throws (invalid persisted data must not be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- All operations O(1).

## Testing seams
- Tests drive the framework directly with boundary ticks (12541/12542/23459/23460), occupancy
  edge counts, and every persistence rejection.

## Observability/debugging
- The state is a plain immutable object; `spawnPoint` and `skipNight` expose the full picture.

## Affected files/symbols
- `src/simulation/SleepFramework.ts` (new).
- Tests: `tests/unit/SleepFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Percentage-based multiplayer skip**: rejected — the all-players vanilla rule keeps 198 pure
  and simple; lobby percentages belong to a future multiplayer change.

## Downstream dependencies
- 199 (`particle-system`) hooks wake/enter events; the block layer applies bed interaction; 242's
  e2e sleeps through a night.
