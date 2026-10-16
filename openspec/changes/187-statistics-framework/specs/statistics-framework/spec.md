# Spec: statistics-framework

## Contract
This capability adds the last meta-progression layer: typed, immutable statistic counters over a
fixed key set, gameplay event hooks, a UI-data projection, and versioned, validated persistence.

## Definitions
- **Keys**: `walk_distance`, `mob_kills`, `blocks_broken`, `deaths`, `time_played`, `damage_taken`,
  `jumps`.
- **Store**: an immutable record of non-negative integers over exactly those keys.
- **Event**: a typed gameplay occurrence mapped to counter increments (walk/damage floored).

## Invariants
- A store has every known key at a non-negative integer.
- `incrementStatistic` returns a NEW store only for a finite, positive (floored) amount; otherwise
  the identical store.
- `statisticsSnapshot` is a fresh copy.
- `deserializeStatisticStore` validates version, the exact known-key set, and non-negative integer
  values before accepting.

## Requirements

### Requirement: the store starts at zero
`createStatisticStore()` MUST return a store with every one of the 7 keys at 0.

#### Scenario: initial store
- **GIVEN** `createStatisticStore()`
- **THEN** every key reads 0

### Requirement: increments accumulate immutably
`incrementStatistic(store, key, amount)` MUST floor a finite positive amount and return a NEW store
with the accumulated value, leaving the original untouched; a non-finite or non-positive amount
MUST return the identical store.

#### Scenario: accumulation and identity no-ops
- **GIVEN** a fresh store
- **THEN** `mob_kills` reaches 3 after increments of 1 and 2 while the original stays 0; increments
  of 0, −5, NaN, and Infinity are identity no-ops

### Requirement: events map to counters
`applyStatisticEvent` MUST map `walk` → walk_distance (floored), `kill_mob` → mob_kills +1,
`break_block` → blocks_broken +1, `death` → deaths +1, `damage` → damage_taken (floored),
`jump` → jumps +1, and `play_tick` → time_played +1; an event that increments nothing MUST return
the identical store.

#### Scenario: event mapping
- **GIVEN** a fresh store and one of each event
- **THEN** walk_distance is 3 (from 3.7), damage_taken is 4, and the six +1 counters are 1 with
  deaths 0 until a death event fires

### Requirement: the UI projection is a copy
`statisticsSnapshot(store)` MUST return a fresh plain object equal to the store; mutating it MUST
NOT affect the store.

#### Scenario: snapshot isolation
- **GIVEN** a store
- **THEN** mutating the snapshot's `mob_kills` leaves the store at its original value

### Requirement: persistence is versioned and validated
`serializeStatisticStore` MUST produce the versioned shape; `deserializeStatisticStore` MUST
round-trip it and MUST throw for null/non-object input, a wrong version, a negative or non-integer
value, a payload missing known keys, or an unknown key.

#### Scenario: round-trip and rejection
- **GIVEN** a store with activity and six malformed payload classes
- **THEN** the round-trip equals the store; every malformed payload throws (unknown keys rejected
  explicitly once all known keys are present)

## Error and failure behavior
- Deserialization throws on malformed input; all other functions are total.

## Performance and resource bounds
- All operations O(keys) or O(1).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Security and integrity
- Deserialization never accepts a partially-valid store (all-or-nothing).

## Observability
- `statisticsSnapshot` exposes the full store.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 zero store | `tests/unit/StatisticsFramework.test.ts` › basics |
| REQ-2 accumulation/no-ops | › basics |
| REQ-3 event mapping | › event hooks |
| REQ-4 snapshot copy | › UI projection |
| REQ-5 persistence | › persistence |
