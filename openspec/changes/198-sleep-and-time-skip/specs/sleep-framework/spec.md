# Spec: sleep-framework

## Contract
This capability adds the pure sleep rules: the 24000-tick day's night window, when a player may
sleep, bed occupancy with spawn-point-on-sleep, the all-players night-skip rule, the time skip
itself, and versioned validate-before-accept persistence.

## Definitions
- **Night window**: ticks 12542 through 23459 inclusive (vanilla).
- **Bed position**: a `[x, y, z]` tuple of finite numbers.
- **Occupancy**: a bed sleeps at most one player; `enterBed` with an occupied bed is rejected.

## Invariants
- Pure and headless-safe: no world access, no mutation, no throws in the state/rules API.
- `isNight(t)` MUST be membership in [12542, 23459] inclusive.
- `canSleep(t, storm)` MUST be `isNight(t) || storm`.
- `enterBed` MUST reject occupied beds, and on success set `sleeping` and the spawn point to the
  bed position; `leaveBed` MUST clear sleeping but keep the spawn point.
- `canSkipNight(sleeping, total)` MUST be `total > 0 && sleeping >= total`.
- `skipNight(t)` MUST return `{ timeOfDay: 0, skippedTicks: 24000 - t }`.
- Deserialization MUST validate the entire payload before accepting anything and MUST throw
  descriptive errors on any violation.

## Requirements

### Requirement: night window and sleep permission
`isNight(timeOfDay)` MUST be true exactly for ticks in [12542, 23459]. `canSleep(timeOfDay,
isStorm)` MUST be true during the night window, and ALSO true at any time of day during a storm.

#### Scenario: boundaries and storm
- **GIVEN** ticks 12541, 12542, 23459, 23460, 0, and a daytime tick with `isStorm` true and false
- **THEN** `isNight` is false, true, true, false, false; `canSleep(12542, false)` is true;
  `canSleep(23459, false)` is true; `canSleep(10000, false)` is false; `canSleep(10000, true)` is
  true

### Requirement: bed entry sets sleeping and the spawn point
`enterBed(state, bedPosition, occupied)` MUST return `{ ok: false, reason: 'occupied' }` for an
occupied bed (except re-entering the SAME bed while already sleeping, which returns the IDENTICAL
state as `{ ok: true, state }`), and otherwise a state with `sleeping: true`, `spawnSet: true`,
and `spawn` equal to the bed position.

#### Scenario: entering a bed
- **GIVEN** a default state, position `[10, 64, -5]`, and `occupied` false and true
- **THEN** the free-bed result is `{ ok: true, state: { sleeping: true, spawnSet: true, spawn:
  [10, 64, -5] } }` and the occupied-bed result is `{ ok: false, reason: 'occupied' }`; entering
  the same bed again from the sleeping state returns `{ ok: true, state }` with the identical
  state object

### Requirement: leaving a bed keeps the spawn point
`leaveBed(state)` MUST return a state with `sleeping: false` and unchanged `spawnSet`/`spawn`.

#### Scenario: waking
- **GIVEN** a state sleeping at `[10, 64, -5]`
- **THEN** `leaveBed` yields `{ sleeping: false, spawnSet: true, spawn: [10, 64, -5] }`

### Requirement: spawn query
`spawnPoint(state)` MUST return `null` until a bed sets the spawn point, then the bed position.

#### Scenario: spawn point
- **GIVEN** a default state and a state with spawn `[10, 64, -5]`
- **THEN** the results are `null` and `[10, 64, -5]`

### Requirement: all players must sleep
`canSkipNight(sleepingCount, totalPlayers)` MUST be true exactly when `totalPlayers > 0` and
`sleepingCount >= totalPlayers`.

#### Scenario: occupancy
- **GIVEN** count/total pairs (0,1), (1,1), (1,2), (2,2), (0,0)
- **THEN** the results are false, true, false, true, false

### Requirement: night skip
`skipNight(timeOfDay)` MUST return `{ timeOfDay: 0, skippedTicks: 24000 - timeOfDay }`.

#### Scenario: skipping
- **GIVEN** ticks 20000, 12542, and 0
- **THEN** the results are `{ timeOfDay: 0, skippedTicks: 4000 }`, `{ timeOfDay: 0, skippedTicks:
  11458 }`, and `{ timeOfDay: 0, skippedTicks: 24000 }`

### Requirement: versioned persistence
`serializeSleepState(state)` MUST produce `{ version: 1, sleeping, spawnSet, spawn }`;
`deserializeSleepState` MUST round-trip it and MUST throw a descriptive `Error` for a non-object
payload, an unsupported version, a non-boolean `sleeping`/`spawnSet`, a malformed spawn (not an
array of three finite numbers), and unknown extra keys — accepting nothing partially.

#### Scenario: persistence
- **GIVEN** a state, its serialization, `null`, `{ version: 0, sleeping: true, spawnSet: true,
  spawn: [1, 2, 3] }`, `{ version: 1, sleeping: 'yes', spawnSet: true, spawn: [1, 2, 3] }`,
  `{ version: 1, sleeping: true, spawnSet: true, spawn: [1, 2] }`, `{ version: 1, sleeping: true,
  spawnSet: true, spawn: [1, NaN, 3] }`, and `{ version: 1, sleeping: true, spawnSet: true,
  spawn: [1, 2, 3], extra: true }`
- **THEN** the round-trip equals the original; the invalid inputs each throw mentioning
  `expected an object`, `unsupported version`, `sleeping must be a boolean`,
  `spawn must be an array of three finite numbers`, and `unknown key` respectively

## Error and failure behavior
- No throws in the state/rules API; occupancy is a structured `{ ok: false, reason: 'occupied' }`.
- Only `deserializeSleepState` throws (invalid persisted data must never be silently accepted).

## Performance and resource bounds
- All operations O(1).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions with immutable state; occupancy is enforced structurally (rejected entry).

## Observability
- The state is a plain immutable object; `spawnPoint` and `skipNight` expose the full picture.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 night window | `tests/unit/SleepFramework.test.ts` › night window and sleep permission |
| REQ-2 bed entry | › bed entry |
| REQ-3 leaving a bed | › leaving a bed |
| REQ-4 spawn query | › spawn query |
| REQ-5 all players sleep | › occupancy |
| REQ-6 night skip | › night skip |
| REQ-7 persistence | › persistence |
