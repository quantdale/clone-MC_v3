# Spec: entity-core

## Contract
This capability adds a general, minimal runtime entity model: an `EntityInstance` data shape
(stable id, registered 017 type, transform, velocity, lifecycle state, dimension) and an
`EntityManager` that mints ids, validates spawns, tracks lifecycle, and exposes pure mutators. No
physics/collision, persistence, chunk-based activation, dirty-property tracking, or migration of
`ItemEntityManager`/`XpOrbManager` is in scope — see the proposal's Non-goals.

## Definitions
- **Entity instance**: an `EntityInstance` record: `id` (stable non-negative integer, unique per
  manager), `typeId` (a `ResourceId` registered in the bound `EntityRegistry`), `transform`
  (`{x,y,z,yaw,pitch}`, all finite numbers), `velocity` (`{vx,vy,vz}`, all finite numbers),
  `dimension` (a `ResourceId` ownership tag), and `state` (`'ACTIVE' | 'REMOVED'`).
- **Manager**: an `EntityManager` bound to one `EntityRegistry` at construction; owns zero or more
  entity instances it has spawned.
- **Spawn**: `manager.spawn(typeId, dimension, transform, opts?)` creates and stores a new `ACTIVE`
  entity instance, returning it.
- **Active entity**: an entity instance whose `state === 'ACTIVE'`.
- **Removed entity**: an entity instance whose `state === 'REMOVED'`; its record is retained in the
  manager (queryable via `get`) but excluded from `getAll`/`getInDimension`/`size`.

## Invariants
- Ids minted by a manager (when `opts.id` is omitted) are unique and strictly increasing across that
  manager's lifetime, reset only by `clear()`.
- `spawn` is atomic: any validation failure throws and leaves the manager's observable state
  (`get`/`getAll`/`size`/id-minting counter) exactly as it was before the call.
- `transform` and `velocity` on every stored instance always hold five and three finite numbers,
  respectively; no mutator can write a non-finite field.
- `state` transitions only `ACTIVE → REMOVED`, performed only by `remove`; there is no operation that
  reverses it.
- `getAll()`, `getInDimension(dimension)`, and `size` reflect exactly the set of `ACTIVE` entities.

## Requirements

### Requirement: spawn creates a valid, registered, active entity
`EntityManager.spawn(typeId, dimension, transform, opts?)` MUST throw when `typeId` is not
registered in the bound `EntityRegistry`, when `transform` holds a non-finite `x`/`y`/`z`/`yaw`/
`pitch`, or when the effective velocity (`opts.velocity` or `ZERO_VELOCITY`) holds a non-finite
`vx`/`vy`/`vz`. On success it MUST store and return a new `EntityInstance` with `state === 'ACTIVE'`,
the given `typeId`/`dimension`, and a defensive copy of `transform`/velocity.

#### Scenario: a valid spawn returns an active instance
- **GIVEN** an `EntityManager` bound to `createDefaultEntityRegistry()`
- **WHEN** `spawn(zombieTypeId, overworld, { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 })` is called
- **THEN** it returns an `EntityInstance` with `state === 'ACTIVE'`, `typeId === zombieTypeId`,
  `dimension === overworld`, and `velocity` equal to `ZERO_VELOCITY`

#### Scenario: spawn rejects an unregistered type without mutating the manager
- **GIVEN** an `EntityManager` and an unregistered `ResourceId`
- **WHEN** `spawn(unregisteredTypeId, overworld, validTransform)` is called
- **THEN** it throws, and `manager.size` and `manager.getAll()` are unchanged

#### Scenario: spawn rejects a non-finite transform or velocity field
- **GIVEN** an `EntityManager`
- **WHEN** `spawn` is called with `transform.y = NaN`, and separately with `opts.velocity.vx = Infinity`
- **THEN** both calls throw and neither stores an entity

### Requirement: explicit id collision is rejected
`spawn` called with an explicit `opts.id` that already identifies a record in the manager (whether
`ACTIVE` or retained `REMOVED`) MUST throw and MUST NOT mutate the manager.

#### Scenario: spawning with a colliding active id throws
- **GIVEN** an entity already spawned with `id = 5`
- **WHEN** `spawn(typeId, dimension, transform, { id: 5 })` is called again
- **THEN** it throws and the original entity at `id = 5` is unchanged

#### Scenario: spawning with a removed id's collision still throws
- **GIVEN** an entity spawned with `id = 5` and then removed via `manager.remove(5)`
- **WHEN** `spawn(typeId, dimension, transform, { id: 5 })` is called
- **THEN** it throws (the id slot is not resurrectable via explicit collision)

### Requirement: query surfaces reflect only active entities
`getAll()` and `getInDimension(dimension)` MUST return exactly the `ACTIVE` entities (in the
dimension, for the latter) in spawn order; `size` MUST equal `getAll().length` at all times.
`get(id)` MUST return the stored instance regardless of its lifecycle state, and `undefined` only
for an id that was never spawned by this manager.

#### Scenario: getAll and size exclude a removed entity but get still resolves it
- **GIVEN** two spawned entities, one of which is then removed
- **WHEN** `getAll()`, `size`, and `get(removedId)` are queried
- **THEN** `getAll()` has length 1 and excludes the removed entity, `size === 1`, and
  `get(removedId)` returns the instance with `state === 'REMOVED'`

#### Scenario: getInDimension filters by dimension value, not reference
- **GIVEN** two entities spawned with distinct `ResourceId` object instances that both stringify to
  `minecraft:overworld`, and one spawned into `minecraft:nether`
- **WHEN** `getInDimension(anotherOverworldResourceIdInstance)` is called
- **THEN** it returns exactly the two overworld entities

### Requirement: mutators are safe no-ops off an active entity, and never write invalid data
`setTransform`, `setVelocity`, and `changeDimension` MUST return `false` and perform no write when
`id` is unknown or `REMOVED`. `setTransform`/`setVelocity` MUST additionally return `false` and
perform no write when the supplied transform/velocity holds a non-finite field, even for a
known/`ACTIVE` id. On success each MUST return `true` and the stored instance MUST reflect a
defensive copy of the new value.

#### Scenario: setTransform/setVelocity succeed on an active entity and are visible via get
- **GIVEN** an `ACTIVE` entity
- **WHEN** `setTransform(id, newTransform)` and `setVelocity(id, newVelocity)` are called
- **THEN** both return `true`, and `get(id)` reflects `newTransform`/`newVelocity`

#### Scenario: mutators no-op on an unknown or removed id
- **GIVEN** an unknown id and a removed id
- **WHEN** `setTransform`, `setVelocity`, and `changeDimension` are called on each
- **THEN** every call returns `false` and no entity state changes

#### Scenario: setTransform/setVelocity reject a non-finite field on an active entity
- **GIVEN** an `ACTIVE` entity
- **WHEN** `setTransform(id, { ...transform, pitch: NaN })` is called
- **THEN** it returns `false` and the entity's stored transform is unchanged

### Requirement: remove is idempotent and never reverses state
`remove(id)` MUST return `true` and set `state = 'REMOVED'` exactly once for a currently `ACTIVE`
id, excluding it from `getAll`/`getInDimension`/`size` from that point on. `remove` called again on
the same id, or on any id that was never `ACTIVE`, MUST return `false` and perform no further state
change.

#### Scenario: remove is idempotent
- **GIVEN** an `ACTIVE` entity
- **WHEN** `remove(id)` is called twice in a row
- **THEN** the first call returns `true`, the second returns `false`, and the entity's `state`
  remains `'REMOVED'` (not toggled back)

## Error and failure behavior
- `spawn` throws (never returns a partial/invalid instance) on: unregistered `typeId`, non-finite
  transform field, non-finite velocity field, or a colliding explicit `opts.id`.
- `get`/`setTransform`/`setVelocity`/`changeDimension`/`remove` never throw; they return
  `undefined`/`false` for any invalid target (unknown id, removed id) or invalid payload
  (non-finite field on the setters).

## Performance and resource bounds
- `spawn`, `get`, `setTransform`, `setVelocity`, `changeDimension` are O(1) amortized (`Map`
  operations plus, for `spawn`, an array push).
- `getAll`/`getInDimension` are O(n) in the number of ever-spawned entities (matching the existing
  `ItemEntityManager` cost model); `remove` is O(n) for its `indexOf`/`splice` against the
  insertion-order list.
- No unbounded growth: `clear()` resets both the id map and insertion-order list and the id counter.

## Compatibility and migration
- Purely additive: two new files, no edits to any existing module, no schema/save-format change.
- No consumer exists yet; `ItemEntityManager`/`XpOrbManager`/`Game` are unmodified by this change.

## Security and integrity
- Every stored `transform`/`velocity` is validated finite before being written, so a caller can never
  push `NaN`/`Infinity` into manager state through any code path (`spawn`, `setTransform`,
  `setVelocity`).
- Defensive copying on write means later external mutation of a caller's transform/velocity object
  cannot retroactively corrupt a stored instance.

## Observability
- `get(id)` exposes the complete instance including `state`, so a removed entity's final position/
  velocity/dimension remains inspectable until the manager is cleared.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 spawn creates a valid active entity | `tests/unit/EntityManager.test.ts` spawn valid/invalid cases |
| REQ-2 explicit id collision rejected | `tests/unit/EntityManager.test.ts` id-collision (active + removed) |
| REQ-3 query surfaces reflect only active entities | `tests/unit/EntityManager.test.ts` getAll/getInDimension/size/get |
| REQ-4 mutators safe no-ops / reject invalid data | `tests/unit/EntityManager.test.ts` setTransform/setVelocity/changeDimension |
| REQ-5 remove is idempotent | `tests/unit/EntityManager.test.ts` remove idempotency |
