# Spec: World Meshing Deferral and Async Dispose Guards

## Contract

`World` meshing deferral and canonical section meshing MUST preserve accurate `ChunkPipeline` `inFlight` state, and asynchronous persistence continuations in both `World` and `Game` MUST become no-ops once the owning instance has been disposed.

## Definitions

- **Deferral**: Re-enqueueing a dequeued `mesh` job without starting or failing the stage when `!chunk || !chunk.generated`.
- **Disposed instance**: A `World` or `Game` instance on which `dispose()` has set `this.disposed = true`.

## Invariants

- **INV-WMD-1**: Deferring an ungenerated `mesh` job in `World.processMeshing` leaves `'mesh'` absent from `record.inFlight`, leaves `record.status` untouched, and leaves the job queued in `'mesh'`.
- **INV-WMD-2**: Early exit on missing canonical column in `World.processCanonicalSectionMeshing` when `record.generation === generation` clears `'mesh'` from `record.inFlight` via `failStage`.
- **INV-WMD-3**: Late resolution of `World.beginEditHydration` after `World.dispose()` performs zero writes to `storage`, `editOverlay`, or `editOverlayAccessOrder`.
- **INV-WMD-4**: Settling `Game`'s `composed.open()` primary `.then`/`.catch` handlers or `savePlayerStateDurable()` `.then` handler after `Game.dispose()` returns immediately without mutating world/game state or DOM.

## Requirements

### Requirement: REQ-WMD-1 Pre-Stage Ungenerated Mesh Deferral in `World.processMeshing`

`World.processMeshing` MUST validate `record.generation === job.version` and check `chunk?.generated` BEFORE calling `pipeline.beginStage(job.key, 'mesh', job.version)` so ungenerated or absent chunks are re-enqueued cleanly without corrupting `record.inFlight` or `record.status`, or dropping the job at `beginStage`.

#### Scenario: Deferring an ungenerated Lighted/Allocated chunk preserves intact mesh queueability
- **GIVEN** a `World` whose `ChunkPipeline` has a queued `'mesh'` job for a chunk that is not yet `chunk.generated` (whether `Lighted` or `Allocated`)
- **WHEN** `processMeshing` dequeues that job during `world.update()`
- **THEN** the job is re-enqueued intact onto `'mesh'` and `'mesh'` is NOT added to `record.inFlight`
- **AND** once `chunk.generated` becomes `true`, a subsequent `world.update()` dequeues and completes meshing without dropping the job as stale

### Requirement: REQ-WMD-2 Missing-Column In-Flight Rollback in `World.processCanonicalSectionMeshing`

When `World.processCanonicalSectionMeshing` exits early because `this.storage.getColumn(...)` is missing while `record` exists at the matching `generation`, it MUST roll back the in-flight `'mesh'` stage via `failStage(..., 'mesh')` so the stage is not left permanently in flight.

#### Scenario: Missing canonical column rolls back in-flight mesh stage
- **GIVEN** an explicit-dimension `World` with `'mesh'` begun at `generation` whose canonical column is absent from `storage`
- **WHEN** `processCanonicalSectionMeshing` executes for that chunk
- **THEN** `'mesh'` is no longer in `record.inFlight` afterward

### Requirement: REQ-WMD-3 Post-Dispose Async Guard in `World.beginEditHydration`

`World.beginEditHydration`'s `.then((changes) => ...)` continuation MUST return immediately when `this.disposed` is true without writing to `this.storage`, `this.editOverlay`, `this.editOverlayAccessOrder`, or `chunk`, while `.finally` still cleans up `this.hydrationPending`.

#### Scenario: Committed edit lookup resolving after `World.dispose()` mutates nothing
- **GIVEN** a `World` whose `beginEditHydration` issued a pending `loadCommittedChunkEdits` promise
- **WHEN** `world.dispose()` runs and then the pending promise resolves with non-empty edits
- **THEN** `editOverlay.size`, `editOverlayAccessOrder.length`, and `hydrationPending.size` remain `0` and `storage.getBlock` remains air

### Requirement: REQ-WMD-4 Post-Dispose Async Guards on `Game` Open/Flush Continuations

`Game`'s primary `composed.open().then(...)` and `.catch(...)` callbacks (`selfOpenPromise`) and `savePlayerStateDurable()` `p.flush().then(...)` callback MUST return immediately when `this.disposed` is true so torn-down world, player, block-entity, or HUD DOM state is never mutated asynchronously.

#### Scenario: Disposed `Game` ignores late `composed.open()` and flush continuations
- **GIVEN** `Game` has a pending `selfOpenPromise` (`composed.open().then(...).catch(...)`) or `savePlayerStateDurable()` flush continuation
- **WHEN** `this.disposed` becomes `true` before settlement
- **THEN** entry into those handlers returns immediately before applying initial world data, startup safety, player/block-entity hydration, `bootSaveDegraded`, or `refreshSaveStatus`

## Error and failure behavior

- Rejected `loadCommittedChunkEdits` promises clear `hydrationPending` via `.finally` without throwing.
- Rejected `composed.open()` after `Game.dispose()` skips UI/status updates cleanly.

## Performance and resource bounds

Zero additional allocations or per-frame loops; checks are O(1) boolean/field reads.

## Compatibility and migration

Fully backward compatible; zero public API or stored data format changes.

## Security and integrity

Prevents stalled chunk meshing (`inFlight` deadlock) and use-after-dispose state corruption.

## Observability

Pipeline `inFlight` and durability maps stay consistent with actual runtime ownership.

## Verification mapping

| Requirement | Target | Tests |
|---|---|---|
| REQ-WMD-1 | `src/world/World.ts` (`processMeshing`) | `tests/unit/WorldStreamingSaturation.test.ts` |
| REQ-WMD-2 | `src/world/World.ts` (`processCanonicalSectionMeshing`) | `tests/unit/WorldStreamingSaturation.test.ts` |
| REQ-WMD-3 | `src/world/World.ts` (`beginEditHydration`) | `tests/unit/WorldEditDurability.test.ts` |
| REQ-WMD-4 | `src/engine/Game.ts` (`selfOpenPromise`, `savePlayerStateDurable`) | `tests/unit/GameLifecycleTeardown.test.ts` |
