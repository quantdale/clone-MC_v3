# Spec: end-exit-progression

## Contract
This capability closes the End arc: the exit portal (vanilla's 5×5-minus-corners shape, spawning
when 183's gateway opens and persisting after victory), the return teleport destination (the
overworld spawn), and the versioned, validated boss-completion record that survives save/reload.

## Definitions
- **Exit portal**: 21 cells — the full 5×5 minus the four corners.
- **Completion record**: `{ dragonKey, defeated, defeatedTick }` — the persisted post-boss state.

## Invariants
- `endExitPortalCells` returns exactly 21 distinct cells with all four corners absent.
- `endExitPortalSpawns(gatewayOpen)` = `gatewayOpen`; `endExitPortalRemains(record)` is true iff a
  defeated record exists.
- `endExitDestination` returns the spawn unchanged when finite, else `null`.
- `markDragonDefeated` returns a record iff the boss is `DEFEATED`.
- `deserializeDragonCompletion` validates every field before accepting; malformed input throws.

## Requirements

### Requirement: the exit portal has vanilla geometry
`endExitPortalCells` MUST return exactly 21 distinct cells (5×5 minus the four corners).

#### Scenario: geometry
- **GIVEN** a portal centered at (0, 64, 0)
- **THEN** all four corner cells are absent, the edges and interior are present, and the set has
  exactly 21 distinct cells

### Requirement: spawning and persistence rules
`endExitPortalSpawns(gatewayOpen)` MUST equal `gatewayOpen`; `endExitPortalRemains(record)` MUST be
true exactly when a defeated record exists.

#### Scenario: spawn and remain
- **GIVEN** gatewayOpen false/true and defeated/living/null records
- **THEN** spawns are false/true; remains are true for the defeated record, false otherwise

### Requirement: the return destination is the overworld spawn
`endExitDestination(worldSpawn)` MUST return the spawn unchanged when its coordinates are finite,
and `null` otherwise.

#### Scenario: destination
- **GIVEN** a finite spawn and spawns with NaN/Infinity components
- **THEN** the finite one is returned unchanged; the others yield `null`

### Requirement: the completion record is produced exactly on defeat
`markDragonDefeated(state, tick)` MUST return `null` for a living fight and a record with the given
tick for a `DEFEATED` fight; `dragonCompletionIsDefeated(record)` MUST read the flag.

#### Scenario: defeat and record
- **GIVEN** a fresh fight and a fully-damaged fight
- **THEN** the fresh fight yields `null`; the defeated fight yields a record with
  `dragonKey 'ender_dragon'`, `defeated true`, and the observed tick

### Requirement: completion persistence is versioned and validated
`serializeDragonCompletion` MUST produce the versioned shape; `deserializeDragonCompletion` MUST
round-trip it and MUST throw a descriptive error for null/non-object input, a wrong version, an
empty dragon key, a non-boolean `defeated`, or a negative/non-integer `defeatedTick`.

#### Scenario: round-trip and rejection
- **GIVEN** a record and malformed payloads
- **THEN** the round-trip equals the record; every malformed payload throws

## Error and failure behavior
- `deserializeDragonCompletion` throws on malformed input; all other functions are total for
  well-formed inputs.

## Performance and resource bounds
- All functions O(≤ 25); serialization O(1).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; the completion record is a new
  additive persistence shape (versioned).

## Security and integrity
- `deserializeDragonCompletion` never accepts a partially-valid record (all-or-nothing).

## Observability
- `dragonCompletionIsDefeated`/`endExitPortalRemains` are explicit booleans.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 portal geometry | `tests/unit/EndExitProgression.test.ts` › geometry |
| REQ-2 spawn/persist | › spawning and persistence |
| REQ-3 destination | › return destination |
| REQ-4 completion record | › completion record |
| REQ-5 persistence | › serialization |
