# Spec: entity-persistence-runtime

## Contract
This capability adds a bridge between the 129 `EntityManager`'s live `EntityInstance`s and the
already-generic 037/038 persistence store: `serializeChunk` produces 037 `SerializedEntity[]` for a
chunk's persistent entities, and `deserializeChunk` restores them, atomically. No changes to
`EntityRepository`, `DirtySaveQueue`, `RepositorySaveSink`, or `Game` are in scope — see the
proposal's Non-goals.

## Definitions
- **Persistent entity**: a live `EntityInstance` whose registered `EntityTypeDefinition.isPersistent`
  (017) is `true`.
- **Entity chunk**: the pair `(sectionIndex(transform.x), sectionIndex(transform.z))` (021
  `sectionIndex`, floor-division, correct for negative coordinates).
- **Persisted payload**: the `data` field of a `SerializedEntity` produced by `serializeChunk`:
  `{ id, dimension, transform, velocity }`, where `dimension` is `resourceIdToString(entity.dimension)`
  and `transform`/`velocity` are the entity's exact (unfloored) values.

## Invariants
- `serializeChunk(cx, cz)` returns exactly the `ACTIVE`, persistent entities whose entity chunk is
  `(cx, cz)` — never a `REMOVED` entity, never a non-persistent entity, never an entity from another
  chunk.
- `deserializeChunk` is atomic: the manager's `get`/`getAll`/`size`/id-minting counter are unchanged
  after a call that throws.
- A round trip (`serializeChunk` → `deserializeChunk` into a fresh `EntityManager` bound to the same
  registry) preserves `id`, `typeId`, `dimension`, and every `transform`/`velocity` field exactly.

## Requirements

### Requirement: serializeChunk includes only active, persistent, in-chunk entities
`serializeChunk(cx, cz)` MUST return a `SerializedEntity` for every entity that is simultaneously
`ACTIVE`, registered to a type with `isPersistent === true`, and located in chunk `(cx, cz)`, and MUST
exclude every entity failing any one of those three conditions.

#### Scenario: a persistent active entity in the target chunk is included
- **GIVEN** an `EntityManager` with a persistent-typed (`zombie`) entity `ACTIVE` at a transform whose
  chunk is `(0, 0)`
- **WHEN** `serializeChunk(0, 0)` is called
- **THEN** the result contains exactly one `SerializedEntity` for that entity, with `typeKey` equal to
  its `resourceIdToString(typeId)`

#### Scenario: a non-persistent entity is excluded even when active and in-chunk
- **GIVEN** an `EntityManager` with an entity of a type whose `isPersistent` is `false` (or absent),
  `ACTIVE`, in chunk `(0, 0)`
- **WHEN** `serializeChunk(0, 0)` is called
- **THEN** the result does not include that entity

#### Scenario: a removed entity and an out-of-chunk entity are excluded
- **GIVEN** a persistent entity that has been `remove`d, and a second persistent entity whose chunk
  is `(1, 0)`
- **WHEN** `serializeChunk(0, 0)` is called
- **THEN** neither entity appears in the result

### Requirement: a round trip preserves identity and state exactly
`deserializeChunk(cx, cz, serializeChunk(cx, cz))`, called on a *different*, otherwise-empty
`EntityManager` bound to the same `EntityRegistry`, MUST restore each entity with the same `id`,
`typeId`, `dimension`, `transform` (`x`/`y`/`z`/`yaw`/`pitch`), and `velocity` as the original.

#### Scenario: serialize then deserialize into a fresh manager preserves everything
- **GIVEN** a manager with a persistent entity spawned with a non-default transform (`yaw`/`pitch`
  non-zero), non-zero velocity, and a non-overworld dimension
- **WHEN** its chunk is serialized and the result is deserialized into a fresh `EntityManager`
- **THEN** `get(id)` on the fresh manager returns an entity with identical `typeId`, `dimension`,
  `transform`, and `velocity`

### Requirement: deserializeChunk rejects a chunk-membership mismatch
`deserializeChunk(cx, cz, entities)` MUST throw, without spawning any entity, when any record's
persisted `(x, z)` maps (via `sectionIndex`) to a chunk other than `(cx, cz)`.

#### Scenario: a record outside the requested chunk rejects the whole batch
- **GIVEN** two otherwise-valid serialized entities, one whose `(x, z)` maps to `(0, 0)` and one
  whose `(x, z)` maps to `(1, 0)`
- **WHEN** `deserializeChunk(0, 0, [bothRecords])` is called
- **THEN** it throws, and the manager remains empty (neither entity was spawned)

### Requirement: deserializeChunk rejects a malformed typeKey, dimension, transform, or velocity
`deserializeChunk` MUST throw, without spawning any entity in the batch, when any record's `typeKey`
does not parse to a registered `EntityRegistry` type, or its `data.dimension` does not parse as a
resource id, or its `data.transform`/`data.velocity` fails `isValidTransform`/`isValidVelocity`.

#### Scenario: an unregistered typeKey rejects the batch
- **GIVEN** a serialized entity whose `typeKey` is a well-formed but unregistered resource id string
- **WHEN** `deserializeChunk` is called with it
- **THEN** it throws and the manager is unchanged

#### Scenario: a malformed dimension or non-finite transform/velocity field rejects the batch
- **GIVEN** one serialized entity with `data.dimension` not a valid resource-id string, and separately
  one with a `NaN` field in `data.transform`
- **WHEN** `deserializeChunk` is called with each
- **THEN** both throw and the manager is unchanged

### Requirement: deserializeChunk rejects a duplicate id, atomically
`deserializeChunk` MUST throw, without spawning any entity in the batch, when two records in the same
batch share an `id`, or when a record's `id` already identifies a record in the manager (`ACTIVE` or
retained `REMOVED`).

#### Scenario: a duplicate id within the batch rejects the whole batch
- **GIVEN** two otherwise-valid records in the same chunk sharing `data.id`
- **WHEN** `deserializeChunk` is called with both
- **THEN** it throws and neither entity is spawned

#### Scenario: a batch id colliding with an already-live entity rejects the whole batch
- **GIVEN** a manager with an entity already spawned at `id = 7`, and an incoming batch containing one
  valid new record plus one record with `data.id = 7`
- **WHEN** `deserializeChunk` is called with the batch
- **THEN** it throws, the pre-existing `id = 7` entity is unchanged, and the batch's other
  otherwise-valid record was NOT spawned either (atomic)

## Error and failure behavior
- `deserializeChunk` throws a descriptive `Error` (naming the offending field/id/chunk) for every
  rejection case above; the manager's `get`/`getAll`/`size`/id-minting counter are unchanged in every
  such case.
- `serializeChunk` never throws (pure filter over already-valid live state).

## Performance and resource bounds
- `serializeChunk` is O(n) over all `ACTIVE` entities in the manager.
- `deserializeChunk` is O(m) over the incoming batch (validate pass + spawn pass), plus O(m) for
  duplicate-id `Set` tracking.

## Compatibility and migration
- Two additive methods on `EntityManager`; the 037 `SerializedEntity` envelope and 038's
  `SaveUnitKind`/`RepositorySaveSink` routing for `'entities'` are unchanged. No schema/save-format
  change; no migration.

## Security and integrity
- Every restored `transform`/`velocity` passes the same finite-number validation as a direct `spawn`
  call, so a malformed persisted payload can never inject a non-finite value into live entity state.
- Atomicity guarantees a partially-invalid save chunk can never leave the manager in a half-restored
  state.

## Observability
- Thrown errors name the specific invalid id/chunk/field, aiding diagnosis of a corrupted or
  hand-edited save record.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 serializeChunk filters active+persistent+in-chunk | `tests/unit/EntityManager.test.ts` serializeChunk cases |
| REQ-2 round trip preserves identity/state | `tests/unit/EntityManager.test.ts` round-trip case |
| REQ-3 chunk-membership mismatch rejected | `tests/unit/EntityManager.test.ts` deserializeChunk chunk-mismatch case |
| REQ-4 malformed typeKey/dimension/transform/velocity rejected | `tests/unit/EntityManager.test.ts` deserializeChunk malformed-payload cases |
| REQ-5 duplicate id rejected atomically | `tests/unit/EntityManager.test.ts` deserializeChunk duplicate-id cases |
