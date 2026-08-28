# Proposal: 198-sleep-and-time-skip

## Problem
The game has no sleep rules: no night window, no bed occupancy, no spawn-point-on-sleep, no
night-skip semantics. 199's particle hooks and later daylight-cycle wiring need the sleep
framework to build on.

## Goals
- `src/simulation/SleepFramework.ts` (NEW), pure and headless-safe (no world access, no mutation):
  - **Night window**: `NIGHT_START_TICK` (12542) / `NIGHT_END_TICK` (23459) / `DAY_TICKS`
    (24000); `isNight(timeOfDay)` and `canSleep(timeOfDay, isStorm)` — sleeping is allowed during
    the night window OR at any time during a storm (vanilla).
  - **Bed state**: `SleepState { sleeping, spawnSet, spawn }`; `createDefaultSleepState()`;
    `enterBed(state, bedPosition, occupied)` returns `{ ok: true, state }` (sleeping true, spawn
    point set to the bed) or `{ ok: false, reason: 'occupied' }` for an occupied bed;
    `leaveBed(state)` clears sleeping but keeps the spawn point.
  - **Occupancy rule**: `canSkipNight(sleepingCount, totalPlayers)` — the night skips only when
    ALL players are sleeping (vanilla).
  - **Time skip**: `skipNight(timeOfDay)` — morning: `{ timeOfDay: 0, skippedTicks:
    DAY_TICKS - timeOfDay }` (the wiring also clears weather, per vanilla).
  - **Spawn query**: `spawnPoint(state)` — the bed position, or `null` until set.
  - **Persistence**: `serializeSleepState` / `deserializeSleepState` — version 1,
    validate-before-accept (booleans, 3-finite-number spawn tuple, exact key set; descriptive
    throws).

## Non-goals
- **No bed block interaction wiring** (the block behavior layer applies `enterBed`), **no
  multiplayer lobby/percentage logic** (all-players rule only), **no weather clearing on wake**
  (the wiring applies 196's `setWeather`), **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 197 (`weather-rendering`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (the fixed-tick time model's 24000-tick day).

## Proposed change
1. `src/simulation/SleepFramework.ts` (NEW): the constants, night/sleep rules, bed state,
   occupancy, time skip, spawn query, and versioned persistence.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Night-window drift from vanilla**. Mitigation: boundary ticks are pinned in tests
  (12541/12542/23459/23460).
- **Occupancy misuse** (negative counts). Mitigation: `canSkipNight` returns false for
  non-positive totals or counts outside [0, total].

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: defaults; night-window boundaries; canSleep (day/night/storm matrix); bed
  enter (sleeping + spawn set, occupied rejection), leave (spawn kept), spawn query; occupancy
  (all-players rule incl. edge counts); skipNight (morning, mid-night, dawn-edge); persistence
  round-trip and every rejection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
