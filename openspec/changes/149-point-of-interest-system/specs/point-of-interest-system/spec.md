# Spec: point-of-interest-system

## Contract
This capability adds a chunk-scoped, in-memory registry of point-of-interest (POI) records — a
typed, claimable block position — plus a deterministic nearest-unclaimed query and a
serialize/deserialize contract. No real IndexedDB persistence, no villager entity, no
profession/workstation catalog, no multi-claimant model, no spatial acceleration structure — see
the proposal's Non-goals.

## Definitions
- **POI**: a `PointOfInterestRecord` — a `type` (`ResourceId`), an integer block position, and a
  `claimed` boolean.
- **Claimed**: `true` once `claim` has succeeded for that position and no `release`/`remove` has
  happened since.
- **Chunk**: identified by `(sectionIndex(x), sectionIndex(z))` (021), matching every other
  chunk-scoped module in this codebase.

## Invariants
- At most one POI exists per distinct integer `(x, y, z)` position.
- A newly added POI is always unclaimed.
- `claim`/`release` only succeed (return `true`, change state) under their documented preconditions;
  otherwise they return `false` and change nothing.
- `findNearestUnclaimed` only returns a same-type, unclaimed, in-range record; ties break by
  registration order.
- `deserializeChunk` is atomic: every record in the batch is added, or none are, and the manager is
  never left partially updated.

## Requirements

### Requirement: add rejects a duplicate position
`PointOfInterestManager.add` MUST throw and leave the manager unchanged when a record already
exists at the exact `(x, y, z)` position; otherwise it MUST register a new, unclaimed record.

#### Scenario: adding at a free position succeeds
- **GIVEN** an empty manager
- **WHEN** `add(bedType, 1, 2, 3)` is called
- **THEN** `get(1, 2, 3)` returns a record with `claimed: false`

#### Scenario: adding at an occupied position throws
- **GIVEN** a manager with a POI already at `(1, 2, 3)`
- **WHEN** `add(otherType, 1, 2, 3)` is called
- **THEN** it throws, and `get(1, 2, 3)` still reflects the original record

### Requirement: claim and release report success/failure accurately
`claim` MUST return `true` and mark the record claimed only when it exists and is currently
unclaimed; `release` MUST return `true` and mark it unclaimed only when it exists and is currently
claimed. Both MUST return `false` and change nothing otherwise.

#### Scenario: claiming an unclaimed POI succeeds
- **GIVEN** an unclaimed POI at `(1, 2, 3)`
- **WHEN** `claim(1, 2, 3)` is called
- **THEN** it returns `true`, and `get(1, 2, 3)!.claimed` is `true`

#### Scenario: claiming an already-claimed POI fails
- **GIVEN** a POI at `(1, 2, 3)` already claimed
- **WHEN** `claim(1, 2, 3)` is called again
- **THEN** it returns `false`, and the POI remains claimed

#### Scenario: releasing an unclaimed POI fails
- **GIVEN** an unclaimed POI at `(1, 2, 3)`
- **WHEN** `release(1, 2, 3)` is called
- **THEN** it returns `false`

#### Scenario: claim/release on a nonexistent position fails
- **GIVEN** no POI at `(9, 9, 9)`
- **WHEN** `claim(9, 9, 9)` and `release(9, 9, 9)` are each called
- **THEN** both return `false`

### Requirement: findNearestUnclaimed filters by type, claimed state, and distance
`findNearestUnclaimed(type, x, y, z, maxDistance)` MUST return the nearest record matching `type`,
currently unclaimed, and within `maxDistance`, or `null` if none qualifies; ties MUST break by
registration order.

#### Scenario: the nearest same-type unclaimed POI is returned
- **GIVEN** two unclaimed same-type POIs at different distances from `(0, 0, 0)`, both within
  `maxDistance`
- **WHEN** `findNearestUnclaimed` is called
- **THEN** it returns the closer one

#### Scenario: a claimed POI is excluded even if nearer
- **GIVEN** a claimed same-type POI nearer than an unclaimed one, both within `maxDistance`
- **WHEN** `findNearestUnclaimed` is called
- **THEN** it returns the unclaimed (farther) one

#### Scenario: a different-type POI is excluded even if nearer
- **GIVEN** a nearer POI of a different type and a farther POI of the queried type, both unclaimed
  and within `maxDistance`
- **WHEN** `findNearestUnclaimed` is called for the target type
- **THEN** it returns the farther, correctly-typed POI

#### Scenario: an out-of-range POI is excluded
- **GIVEN** one unclaimed same-type POI farther than `maxDistance`
- **WHEN** `findNearestUnclaimed` is called
- **THEN** it returns `null`

### Requirement: serializeChunk/deserializeChunk round-trip atomically
`serializeChunk(cx, cz)` MUST include exactly the records in that chunk. `deserializeChunk` MUST
add every record in a valid batch, or none of them (manager unchanged) when any record is malformed,
out-of-chunk, or duplicates an existing/batch position.

#### Scenario: a valid batch round-trips
- **GIVEN** a manager with POIs in chunk `(0, 0)`, serialized via `serializeChunk(0, 0)`
- **WHEN** a fresh manager calls `deserializeChunk(0, 0, records)` with that output
- **THEN** every original record is present with the same type/position/claimed state

#### Scenario: a malformed record rejects the whole batch
- **GIVEN** a batch containing one well-formed record and one with a non-integer coordinate
- **WHEN** `deserializeChunk` is called with that batch
- **THEN** it throws, and the manager gains none of the batch's records

### Requirement: forgetChunk evicts exactly that chunk's POIs
`forgetChunk(cx, cz)` MUST remove every POI whose position falls in that chunk and MUST NOT affect
POIs in any other chunk.

#### Scenario: forgetChunk removes only the targeted chunk's POIs
- **GIVEN** POIs in both chunk `(0, 0)` and chunk `(1, 0)`
- **WHEN** `forgetChunk(0, 0)` is called
- **THEN** chunk `(0, 0)`'s POIs are gone and chunk `(1, 0)`'s POIs remain

## Error and failure behavior
- `add` throws for a duplicate position or non-finite-integer coordinates.
- `deserializeChunk` throws (manager unchanged) for a malformed batch.
- `claim`/`release`/`remove` on a nonexistent position return `false`, never throw.

## Performance and resource bounds
- `findNearestUnclaimed`/`serializeChunk`/`getInChunk` are O(n) over the live POI count.

## Compatibility and migration
- One new, additive file; no existing module edited; no schema/save-format change (no real
  persistence store exists yet).

## Security and integrity
- All inputs are caller-supplied numeric coordinates/`ResourceId` values; no new untrusted input
  surface.

## Observability
- `getAll()`/`getInChunk()` expose the full live set for future debugging/HUD use.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 add rejects duplicate position | `tests/unit/PointOfInterest.test.ts` add cases |
| REQ-2 claim/release success/failure reporting | claim/release cases |
| REQ-3 findNearestUnclaimed filtering + tie-breaking | findNearestUnclaimed cases |
| REQ-4 serializeChunk/deserializeChunk atomic round-trip | serialize/deserialize cases |
| REQ-5 forgetChunk chunk-scoped eviction | forgetChunk case |
