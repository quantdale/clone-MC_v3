# Proposal: 229-entity-replication

## Problem

Multiplayer Minecraft requires the server to replicate entities to clients within an interest/tracking distance. When an entity enters a client's tracking range or spawns, a spawn descriptor must be replicated. When an entity moves or rotates, transform deltas must be replicated. When an entity's synched properties change, tracked-data deltas must be replicated. When an entity leaves range or is destroyed, a despawn notification must be replicated. Client replicas must receive and apply these batches deterministically. Change 229 builds this pure, headless entity replication framework.

## Goals

- Server-side entity replication manager (`EntityReplicationManager`) with interest/tracking radius around an observer center.
- Entity registration/upsert and removal in the server tracker (`upsertEntity`, `removeEntity`, `updateTransform`, `updateTrackedData`).
- Replication batch generation (`collectUpdates(tick)`):
  - `spawned`: newly tracked or spawned entities with full initial transform, type, and tracked data.
  - `despawned`: entity IDs that left tracking range or were removed.
  - `transforms`: transform deltas (position, yaw, pitch, velocity) for currently tracked entities.
  - `trackedData`: synched data entries for currently tracked entities with dirty properties.
- Client-side entity replica store (`ClientEntityStore`):
  - `applyBatch(batch)` applying spawns, despawns, transform updates, and tracked-data updates in deterministic order.
  - Entity queries (`getEntity`, `hasEntity`, `getAll`).
- Strict validation: malformed IDs, non-finite coords/rotations/velocities, negative ticks, duplicate entries throw with descriptive `EntityReplication: <detail>` messages without corrupting state.
- Determinism: identical event sequences yield identical replication batches and client replica states.
- Pure headless simulation module with zero DOM or external dependencies.

## Non-goals

- No network wire transport or socket IO (223 codecs; 230+ packet framing).
- No direct coupling to Three.js meshes or rendering instances.
- No player movement prediction/reconciliation (227 MovementAuthority and 228 MovementReconciler own that).
- No block or combat interaction networking (230 and 232 own those).

## Preconditions

- 228 `client-prediction-reconciliation` VERIFIED.
- 133 `EntityDataTracker` available for tracked-data modeling.

## Dependencies

- Pure TypeScript module in `src/simulation/EntityReplication.ts`. Follows patterns from 222-228 (`Module: <detail>` throws, bounded limits, strict input validation, deterministic order).

## Proposed change

- New module `src/simulation/EntityReplication.ts`:
  - `EntityId`: safe integer alias.
  - `EntityPosition`: `{ x: number, y: number, z: number }`.
  - `EntityRotation`: `{ yaw: number, pitch: number }`.
  - `EntityVelocity`: `{ vx: number, vy: number, vz: number }`.
  - `TrackedDataValue`: `{ id: number, value: unknown }`.
  - `EntitySpawnDescriptor`: `{ id, type, position, yaw?, pitch?, velocity?, trackedData? }`.
  - `EntityTransformUpdate`: `{ id, position?, yaw?, pitch?, velocity? }`.
  - `EntityDataUpdate`: `{ id, entries }`.
  - `EntityReplicationBatch`: `{ tick, spawned, despawns, transforms, trackedData }`.
  - `EntityReplicationOptions`: `{ trackingRange?: number, maxTracked?: number }`.
  - `EntityReplicationManager`: observer center management, entity tracking, delta accumulation, and `collectUpdates(tick)`.
  - `ClientEntityStore`: client-side mirror consuming batches and providing query access.

## Compatibility and migration

Pure addition. Zero registry changes, no save schema migrations, no runtime regressions.

## Risks

- Despawn/spawn race when entity enters and leaves range rapidly -> pinned: manager accurately tracks observer interest transitions and consumes deltas cleanly.
- Dirty tracking accumulation -> pinned: updates are consumed exactly once on `collectUpdates(tick)`.

## Rollback strategy

Delete `src/simulation/EntityReplication.ts` and `tests/unit/EntityReplication.test.ts`.

## Definition of Done

Spec requirements REQ-1..REQ-6 verified by unit tests; baseline gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all PASS; OpenSpec state updated.

## Advancement gate

100% task completion; all mandatory MUST/SHALL requirements verified; regression gate green.
