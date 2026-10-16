# Proposal: 131-entity-persistence-runtime

## Problem
The persistence *store* side is already fully built and generic: 037 `EntityRepository` persists
`SerializedEntity[]` grouped per chunk, and 038's `DirtySaveQueue`/`RepositorySaveSink` already
recognize `'entities'` as a `SaveUnitKind` and route its payload to
`EntityRepository.putChunkEntities`. What is missing is the bridge on the *runtime* side: 129's
`EntityManager` has no way to turn its live `EntityInstance`s into `SerializedEntity` records (or
back), so nothing can ever call `markDirty({ kind: 'entities', ... })` or reload a chunk's entities
after a restart. `ItemEntityManager` (111) and `BlockEntityManager` (052) each already have exactly
this bridge for their own kind; 129's general model has none.

## Goals
- `EntityManager.serializeChunk(cx, cz)`: return the 037 `SerializedEntity[]` for every **persistent**
  (017 `EntityTypeDefinition.isPersistent === true`) `ACTIVE` entity whose transform currently falls
  in chunk `(cx, cz)`.
- `EntityManager.deserializeChunk(cx, cz, entities)`: validate a whole batch of `SerializedEntity`
  payloads (envelope, chunk membership, registered type, well-formed `dimension`/`transform`/
  `velocity`, no duplicate id against the batch or the manager) before spawning any of them; on any
  rejection the manager is left unchanged.
- Preserve full identity/state on round-trip: the entity's own `id`, `typeId`, `dimension`,
  `transform` (including `yaw`/`pitch`), and `velocity` all survive a serialize→deserialize cycle
  exactly.

## Non-goals
- **No `Game` tick-loop wiring.** Nothing yet spawns non-player entities during gameplay or calls
  `markDirty`/`DirtySaveQueue.drain` for entities; that begins once a mob-spawning consumer exists
  (137+) or an explicit follow-up wiring change.
- **No changes to `EntityRepository`, `DirtySaveQueue`, or `RepositorySaveSink`.** All three already
  support the `'entities'` kind generically (038) and are unmodified by this change.
- **No non-persistent entity handling beyond documented exclusion.** A non-persistent entity (e.g. an
  entity type with `isPersistent: false` or absent, matching 017's existing default) is silently
  excluded from `serializeChunk`'s output — it is simply not carried across a save, same as vanilla
  Minecraft's non-persistent flag semantics. No despawn/cleanup behavior is added here.
- **No migration of `ItemEntityManager`/`XpOrbManager` onto this bridge.** Both keep their own
  established serialize/deserialize methods; unifying them is out of scope.
- **No chunk-unload/chunk-load orchestration.** Deciding *when* to call `serializeChunk`/
  `deserializeChunk` against a chunk lifecycle is 132's scope (`entity-chunk-tracking`).

## Preconditions
- Change 130 (`entity-collision-and-physics`) is VERIFIED.
- Change 037 (`EntityRepository`/`SerializedEntity`) and change 038 (`DirtySaveQueue`/
  `RepositorySaveSink`, already `'entities'`-aware) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/EntityManager.ts` (129) — the class this change extends.
- `src/storage/EntityRecord.ts` (037) — `SerializedEntity`, `ENTITY_RECORD_VERSION`,
  `validateSerializedEntity`.
- `src/math/SectionCoordinate.ts` (021) — `sectionIndex` for chunk-coordinate conversion.
- `src/data/ResourceId.ts` — `resourceIdToString`/`tryParseResourceId` for the `typeKey`/`dimension`
  round-trip.
- `src/data/EntityType.ts` (017) — `EntityTypeDefinition.isPersistent` filter.

## Proposed change
1. `src/simulation/EntityManager.ts` (EDIT, additive methods only):
   - `serializeChunk(cx, cz): SerializedEntity[]` — filters `getAll()` to `ACTIVE` + persistent
     entities in chunk `(cx, cz)` (via `sectionIndex` on `transform.x`/`transform.z`), mapping each
     to `{ schemaVersion: ENTITY_RECORD_VERSION, typeKey: resourceIdToString(typeId), x, y, z (floored),
     data: { id, dimension, transform, velocity } }`.
   - `deserializeChunk(cx, cz, entities: unknown[]): number` — validates the whole batch (envelope via
     037's `validateSerializedEntity`, chunk membership, registered `typeKey`, well-formed
     `dimension`/`transform`/`velocity`, no duplicate id) before spawning any entity; throws (manager
     unchanged) on the first invalid record; returns the count added on success.
2. No other file is edited.

## Compatibility and migration
- Additive methods only; no existing `EntityManager` method's behavior changes. No edits to 037/038.
  No schema/save-format change (the 037 envelope is unchanged; this change only produces/consumes it
  from a new source).

## Risks
- **Silent data loss for non-persistent entities.** Mitigation: this is documented, intentional
  (matches vanilla's `isPersistent` semantics), and `createDefaultEntityRegistry()`'s persistent flags
  are already established by 017 — 131 does not change which entities are persistent.
- **Chunk-membership drift between serialize and deserialize.** Mitigation: `deserializeChunk` MUST
  validates every incoming record's `(x, z)` maps to the requested `(cx, cz)` via the same
  `sectionIndex` used by `serializeChunk`, and rejects the whole batch otherwise (mirrors
  `BlockEntityManager.deserializeChunk`'s existing convention).
- **Id collision between a restored batch and already-live entities.** Mitigation: pre-validated
  against the full batch and the manager's existing id map before any spawn runs, so the failure is
  atomic (all-or-nothing), consistent with `EntityManager.spawn`'s own id-collision contract (129).

## Rollback strategy
Two additive methods on one existing file, exercised only by their own new tests; removing them
reverts the change with no other impact (nothing else calls them yet).

## Definition of Done
- `serializeChunk`/`deserializeChunk` implemented per design.md/spec.md.
- Unit tests cover: round-trip identity preservation, persistent-only filtering, chunk-membership
  rejection, malformed-payload rejection (bad typeKey, bad dimension, bad transform/velocity),
  duplicate-id rejection (within batch and against the live manager), and atomicity (a rejected batch
  leaves the manager fully unchanged).
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no `Game` wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
