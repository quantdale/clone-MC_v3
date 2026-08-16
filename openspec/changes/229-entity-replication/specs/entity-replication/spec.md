# Spec: entity-replication

## Contract

Pure headless entity replication framework managing server-side entity interest tracking, delta batch generation (`spawn`, `despawn`, `transform`, `trackedData`), and client-side replica state management.

## Definitions

- **Observer Center**: 3D coordinate point representing the player or client camera position.
- **Tracking Range**: Maximum Euclidean distance from the observer center within which entities are considered in-scope for replication.
- **Entity Spawn Descriptor**: Complete initial snapshot of an entity entering tracking range (ID, type, position, rotation, velocity, and initial tracked data).
- **Transform Delta**: Position, rotation, or velocity update for an already-tracked entity.
- **Tracked Data Delta**: Key-value pairs of dirty synched properties for an already-tracked entity.
- **Replication Batch**: Consolidated set of spawns, despawns, transform deltas, and tracked-data deltas for a specific tick.

## Invariants

- **Range Invariant**: An entity is in tracking range if and only if its Euclidean distance squared to the observer center is `<= trackingRange * trackingRange`.
- **Single Spawn Invariant**: An entity produces a `spawned` record exactly once when transitioning from untracked to tracked.
- **Single Despawn Invariant**: An entity produces a `despawned` record exactly once when transitioning from tracked to untracked or when removed from the world.
- **Order Invariant**: Entities in replication batches are ordered deterministically (e.g. by entity ID ascending).
- **Consumption Invariant**: `collectUpdates(tick)` clears dirty flags and pending transitions so subsequent calls do not duplicate updates.

## Requirements

### Requirement: REQ-1 Entity Registration and Observer Interest

The server `EntityReplicationManager` SHALL maintain registered entities and evaluate whether each entity is within the observer's tracking range based on the observer center.

#### Scenario: Entity enters tracking range on center update
- **GIVEN** an `EntityReplicationManager` with tracking range 64 and an entity at `(10, 0, 10)`.
- **WHEN** `setCenter(0, 0, 0)` is called and `collectUpdates(1)` is executed.
- **THEN** the entity MUST be included in the `spawned` array of the batch.

#### Scenario: Entity outside tracking range is not spawned
- **GIVEN** an `EntityReplicationManager` with tracking range 64 and an entity at `(100, 0, 100)`.
- **WHEN** `setCenter(0, 0, 0)` is called and `collectUpdates(1)` is executed.
- **THEN** the entity MUST NOT be in `spawned` and `spawned` MUST be empty.

---

### Requirement: REQ-2 Despawn on Leaving Range or Removal

The `EntityReplicationManager` SHALL generate despawn records when a previously tracked entity moves out of tracking range or is removed.

#### Scenario: Entity removed from server world
- **GIVEN** an entity currently tracked by the observer.
- **WHEN** `removeEntity(id)` is called and `collectUpdates(2)` is executed.
- **THEN** the entity's ID MUST appear in `despawned`.

#### Scenario: Observer moves away from entity
- **GIVEN** an entity at `(0, 0, 0)` and observer at `(0, 0, 0)`.
- **WHEN** `setCenter(200, 0, 200)` is called and `collectUpdates(2)` is executed.
- **THEN** the entity's ID MUST appear in `despawned`.

---

### Requirement: REQ-3 Transform Delta Replication

The `EntityReplicationManager` SHALL collect position, rotation, and velocity changes for tracked entities and emit them as `transforms` in replication batches.

#### Scenario: Tracked entity moves
- **GIVEN** an entity already spawned and tracked by the client.
- **WHEN** `updateTransform(id, { position: { x: 5, y: 1, z: 5 }, yaw: 90 })` is called and `collectUpdates(3)` is executed.
- **THEN** the batch's `transforms` array MUST contain an entry for `id` with the new position and yaw.

#### Scenario: Untracked entity moves
- **GIVEN** an entity outside the observer's tracking range.
- **WHEN** `updateTransform(id, { position: { x: 500, y: 1, z: 500 } })` is called and `collectUpdates(3)` is executed.
- **THEN** no transform update MUST be generated for this entity.

---

### Requirement: REQ-4 Tracked Data Delta Replication

The `EntityReplicationManager` SHALL collect dirty tracked-data entries for tracked entities and emit them as `trackedData` in replication batches.

#### Scenario: Synched entity property modified
- **GIVEN** an entity already spawned and tracked by the client.
- **WHEN** `updateTrackedData(id, [{ id: 0, value: 20 }])` is called and `collectUpdates(4)` is executed.
- **THEN** the batch's `trackedData` array MUST contain an entry for `id` with the updated property.

---

### Requirement: REQ-5 Client Entity Store State Application

The `ClientEntityStore` SHALL apply `EntityReplicationBatch` updates accurately, maintaining a synchronized mirror of world entities.

#### Scenario: Apply spawn batch
- **GIVEN** an empty `ClientEntityStore`.
- **WHEN** `applyBatch` is called with a batch containing a spawned entity.
- **THEN** `hasEntity(id)` MUST return true and `getEntity(id)` MUST return the complete entity state.

#### Scenario: Apply transform and tracked-data batch
- **GIVEN** a `ClientEntityStore` containing entity 1.
- **WHEN** `applyBatch` is called with transform and tracked-data deltas for entity 1.
- **THEN** entity 1's position and tracked data in the store MUST reflect the updated values.

#### Scenario: Apply despawn batch
- **GIVEN** a `ClientEntityStore` containing entity 1.
- **WHEN** `applyBatch` is called with entity 1 in `despawned`.
- **THEN** `hasEntity(1)` MUST return false and `getEntity(1)` MUST return null.

---

### Requirement: REQ-6 Input Validation and Error Handling

All public methods of `EntityReplicationManager` and `ClientEntityStore` MUST validate arguments strictly, throwing descriptive errors on malformed inputs without corrupting state.

#### Scenario: Non-finite coordinates or invalid IDs throw
- **GIVEN** an `EntityReplicationManager`.
- **WHEN** an entity is registered with `NaN` coordinates or a negative ID.
- **THEN** it MUST throw an error matching `EntityReplication:` and internal state MUST remain unchanged.

---

## Error and failure behavior

- Throws on invalid construction options (negative tracking range, negative or non-integer `maxTracked`).
- Throws on invalid ticks (`tick < 0` or non-integer).
- Throws on exceeding `maxTracked`.

## Performance and resource bounds

- O(N) operations where N is the number of tracked entities.
- Zero memory leaks; removed entities are cleared from internal maps.

## Compatibility and migration

- Pure additive module in `src/simulation/EntityReplication.ts`.

## Security and integrity

- All incoming numbers are validated for finiteness and integer safety.

## Observability

- `trackedCount`, `isTracking(id)`, `getEntity(id)` accessors.

## Verification mapping

- Tests in `tests/unit/EntityReplication.test.ts` verify all scenarios and requirements.
