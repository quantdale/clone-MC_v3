# Design: 229-entity-replication

## Context/current state

The repository has established fixed-tick simulation (044, 224), entity state and metadata tracking (129, 133), and network protocol codecs (223). Changes 225-228 introduced the multiplayer connection lifecycle, chunk streaming, server-authoritative movement, and client prediction reconciler. What is missing is the replication of world entities (mobs, items, projectiles, other players) across the network boundary: when entities enter/leave client tracking range, move, or modify synchronized tracked data.

## Target state

A pure headless entity replication model in `src/simulation/EntityReplication.ts` providing:
1. `EntityReplicationManager`: A server-side per-connection or per-observer manager tracking active entities within a configurable `trackingRange` (default 64 blocks) around an observer center (`setCenter(x, y, z)`), tracking state changes, and producing delta batches via `collectUpdates(tick)`.
2. `ClientEntityStore`: A client-side entity replica container that applies incoming replication batches and maintains local entity state (`id`, `type`, `position`, `yaw`, `pitch`, `velocity`, `trackedData`), supporting queries and snapshots.

## Invariants

- Determinism: Given identical sequences of entity insertions, updates, and center moves, `collectUpdates(tick)` produces identical batch payloads and `ClientEntityStore` ends in identical states.
- Exact-once transition: An entity entering tracking range produces exactly one `spawned` record in the batch; an entity leaving produces exactly one `despawned` record in the batch.
- Monotonic ticks: `collectUpdates(tick)` requires a non-negative safe integer `tick`.
- Input immutability: Passing descriptors and batches returns cloned/defensive data; callers mutating their original objects cannot alter internal manager or store state.
- Bounded capacity: Configurable `maxTracked` limits the maximum number of entities the manager tracks, preventing unbounded memory growth.

## API and data model

```typescript
export type EntityId = number;

export interface EntityPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EntityRotation {
  readonly yaw: number;
  readonly pitch: number;
}

export interface EntityVelocity {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

export interface TrackedDataValue {
  readonly id: number;
  readonly value: unknown;
}

export interface EntitySpawnDescriptor {
  readonly id: EntityId;
  readonly type: string;
  readonly position: EntityPosition;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly velocity?: EntityVelocity;
  readonly trackedData?: readonly TrackedDataValue[];
}

export interface EntityTransformUpdate {
  readonly id: EntityId;
  readonly position?: EntityPosition;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly velocity?: EntityVelocity;
}

export interface EntityDataUpdate {
  readonly id: EntityId;
  readonly entries: readonly TrackedDataValue[];
}

export interface EntityReplicationBatch {
  readonly tick: number;
  readonly spawned: readonly EntitySpawnDescriptor[];
  readonly despawned: readonly EntityId[];
  readonly transforms: readonly EntityTransformUpdate[];
  readonly trackedData: readonly EntityDataUpdate[];
}

export interface EntityReplicationOptions {
  /** Radius in blocks within which entities are replicated (default 64). */
  readonly trackingRange?: number;
  /** Maximum number of entities tracked simultaneously (default 1024). */
  readonly maxTracked?: number;
}

export interface ClientEntityState {
  readonly id: EntityId;
  readonly type: string;
  readonly position: EntityPosition;
  readonly yaw: number;
  readonly pitch: number;
  readonly velocity: EntityVelocity;
  readonly trackedData: ReadonlyMap<number, unknown>;
}
```

## Control/data flow

1. **Server side (`EntityReplicationManager`)**:
   - `setCenter(x, y, z)` updates observer position.
   - `upsertEntity(descriptor)` registers or updates an authoritative entity in the server world pool.
   - `updateTransform(id, transform)` records entity movement.
   - `updateTrackedData(id, entries)` records modified synched properties.
   - `removeEntity(id)` marks entity destroyed on the server.
   - `collectUpdates(tick)` evaluates which entities are in range, computes spawned / despawned / transform / trackedData deltas, clears dirty flags, and returns the `EntityReplicationBatch`.
2. **Client side (`ClientEntityStore`)**:
   - `applyBatch(batch)` processes:
     1. `spawned`: adds new entity replica with initial transform and tracked data.
     2. `transforms`: updates position/rotation/velocity of existing replicas.
     3. `trackedData`: merges updated property values into replica's tracked data map.
     4. `despawned`: removes entity replicas from the store.

## Detailed behavior

- **Range calculation**: Distance from observer center `(cx, cy, cz)` to entity position `(ex, ey, ez)` uses 3D Euclidean distance squared (`dx*dx + dy*dy + dz*dz <= trackingRange*trackingRange`).
- **Initial Observation**: When an observer center is first set, all in-range entities are placed into `spawned`.
- **Despawn on removal or out of range**: When an entity is removed or moves out of `trackingRange`, it is added to `despawned`.
- **Dirty accumulation**: Transforms and tracked data updates for entities that are currently in range and were already spawned are batched into `transforms` and `trackedData`.
- **Empty / No-op cases**: If no center is set, no entities are in range; updates produce empty arrays.

## Failure modes

- Non-safe-integer or negative `id` -> throws `EntityReplication: id must be a non-negative safe integer`.
- Non-finite coordinates (`x`, `y`, `z`, `yaw`, `pitch`, `vx`, `vy`, `vz`) -> throws `EntityReplication: coordinates must be finite numbers`.
- Negative `tick` -> throws `EntityReplication: tick must be a non-negative safe integer`.
- Negative or zero `trackingRange` -> throws `EntityReplication: trackingRange must be a positive finite number`.
- Invalid `maxTracked` -> throws `EntityReplication: maxTracked must be a positive integer`.
- Store exceeding `maxTracked` -> throws `EntityReplication: maxTracked limit exceeded`.
- Applying transform/trackedData to non-existent entity in `ClientEntityStore` -> gracefully skipped or throws depending on validation mode (gracefully ignored by default in tolerant network mode).

## Compatibility/migration

Pure addition to `src/simulation/EntityReplication.ts`.

## Performance/resource constraints

- O(N) where N is number of tracked entities per tick.
- Zero DOM or browser APIs.
- Memory bounded by `maxTracked`.

## Testing seams

- Direct headless unit tests checking range triggers, spawn/despawn transitions, transform updates, tracked-data updates, dirty clearing, client replica application, invalid input handling, and determinism.

## Observability/debugging

- `trackedCount`, `isTracking(id)`, `getEntity(id)` inspectors on manager and client store.

## Affected files/symbols

- `src/simulation/EntityReplication.ts` (NEW).
- `tests/unit/EntityReplication.test.ts` (NEW).

## Rejected alternatives

- *Full snapshot replication every tick*: Excessive network bandwidth; delta updates for transforms and tracked data are standard in Minecraft parity.
- *Coupling directly to Three.js Object3D*: Violates headless separation; presentation layers should read from client store.

## Downstream dependencies

- 230 `block-interaction-networking`, 232 `combat-networking`, 235 `reconnect-state-recovery`, 236 `multiplayer-load-tests`.
