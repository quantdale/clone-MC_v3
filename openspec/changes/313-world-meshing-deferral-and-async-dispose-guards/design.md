# Design: 313-world-meshing-deferral-and-async-dispose-guards

## Context/current state

Currently:
1. `World.processMeshing` (`src/world/World.ts`):
   - Dequeues a `mesh` job and acquires `mesh-upload` budget.
   - Calls `pipeline.beginStage(job.key, 'mesh', job.version)` BEFORE fetching `chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz)` and checking `!chunk || !chunk.generated`.
   - When `record.status === ChunkLifecycleStage.Lighted` and `!chunk || !chunk.generated`, `beginStage` already added `'mesh'` to `record.inFlight` and changed status to `MeshQueued`; re-enqueueing leaves `'mesh'` in `inFlight`, causing the next `dequeue('mesh')` to discard it as stale (`record.inFlight.has(stage)`) and leaving `'mesh'` stuck in `inFlight`. When `record.status < Lighted` (e.g., `Allocated`/`Generated`), `beginStage` fails `invalid-transition` and discards the job on `continue` instead of deferring it.
   - `World.processCanonicalSectionMeshing` enters with `'mesh'` already in flight and returns early if `!column`, which strands `'mesh'` in `inFlight` whenever `record?.generation === generation`.
2. `World.beginEditHydration` (`src/world/World.ts`):
   - Attaches `.then((changes) => ...)` to `loadCommittedChunkEdits`. Once `World.dispose()` clears `editOverlay`, `editOverlayAccessOrder`, and `hydrationPending`, a late resolution still writes into canonical `this.storage.setBlock`, `this.editOverlay.set`, `this.touchEditOverlay`, `chunk.setProjectionLocal`, and `enqueueMeshWithRetry`.
3. `Game` (`src/engine/Game.ts`):
   - Primary `composed.open().then(...)` / `.catch(...)` (`selfOpenPromise`) and `savePlayerStateDurable()` `p.flush().then(...)` lack `if (this.disposed) return;` guards present on downstream subscribers, allowing post-dispose startup mutations and status updates if torn down mid-open or mid-flush.

## Target state

1. **Pre-Stage Deferral & Missing-Column Rollback (`World.ts`)**:
   - In `processMeshing`: check `if (record.generation !== job.version) continue;`, then fetch `const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz); if (!chunk || !chunk.generated) { pipeline.enqueue('mesh', job.cx, job.cy, job.cz, job.priority, job.priorityDetails); break; }`, and ONLY THEN call `pipeline.beginStage(job.key, 'mesh', job.version)`.
   - In `processCanonicalSectionMeshing`: if `!column` while `record && record.generation === generation`, invoke `this.chunkManager.pipeline.failStage(chunkKey(chunk.cx, chunk.cy, chunk.cz), 'mesh')` before returning.
2. **Post-Dispose Async Guard (`World.ts`)**:
   - In `beginEditHydration`'s `.then((changes) => ...)`: return immediately if `this.disposed` is true (`.finally` still cleans up `hydrationPending`).
3. **Post-Dispose Async Guards (`Game.ts`)**:
   - Guard `composed.open().then(...)`, `composed.open().catch(...)`, and `p.flush().then(...)` at entry with `if (this.disposed) return;`.

## Invariants

- **INV-WMD-1 (No In-Flight Corruption on Deferral)**: Deferring an ungenerated/absent chunk in `processMeshing` MUST NOT mutate `record.inFlight` or `record.status`, and the re-enqueued job MUST remain dispatchable once generated.
- **INV-WMD-2 (Zero Orphaned In-Flight Mesh Stage on Early Canonical Abort)**: When `processCanonicalSectionMeshing` aborts early due to a missing column on the active generation, `record.inFlight` MUST NOT retain `'mesh'`.
- **INV-WMD-3 (Disposed World Async Silence)**: Settling `loadCommittedChunkEdits` after `World.dispose()` leaves `editOverlay.size === 0`, `editOverlayAccessOrder.length === 0`, `hydrationPending.size === 0`, and performs zero `storage.setBlock` writes.
- **INV-WMD-4 (Disposed Game Async Silence)**: Settling `selfOpenPromise` primary handlers or `savePlayerStateDurable` flush continuation after `Game.dispose()` returns immediately with zero state/DOM mutation.

## API and data model

No public method signatures, data types, or persistence schemas change.

## Control/data flow

```
dequeue('mesh') -> check record & record.generation === job.version
                -> !chunk || !chunk.generated ? re-enqueue intact & break (no beginStage!)
                -> else beginStage('mesh', job.version) -> mesh/upload
```

```
beginEditHydration().then(changes):
  if (this.disposed) return;  // zero post-dispose overlay/storage/mesh writes
```

## Detailed behavior

See Requirements REQ-WMD-1 through REQ-WMD-4 in `specs/world-meshing-and-dispose-guards/spec.md`.

## Failure modes

- Rejected `loadCommittedChunkEdits` continues to swallow errors and clear `hydrationPending` via `.catch` / `.finally`.
- Rejected `composed.open()` after `Game.dispose()` skips setting `bootSaveDegraded` or touching disposed status indicators.

## Compatibility/migration

100% backward compatible; zero schema or API changes.

## Performance/resource constraints

No new allocations, timers, or per-frame overhead.

## Testing seams

- `tests/unit/WorldStreamingSaturation.test.ts`
- `tests/unit/WorldEditDurability.test.ts`
- `tests/unit/GameLifecycleTeardown.test.ts`

## Observability/debugging

Existing pipeline counters (`inFlight`, `queueDepth('mesh')`), durability maps, and `Game` dispose state reflect accurate lifecycle state without orphaned markers.

## Affected files/symbols

- `src/world/World.ts`: `processMeshing`, `processCanonicalSectionMeshing`, `beginEditHydration`
- `src/engine/Game.ts`: constructor `selfOpenPromise` chain, `savePlayerStateDurable`

## Rejected alternatives

Calling `failStage` inside the `!chunk || !chunk.generated` deferral branch of `processMeshing` would bump `record.generation`, invalidating any already-captured tokens or tickets needlessly; checking chunk readiness BEFORE `beginStage` matches the method's documented deferral contract cleanly.

## Downstream dependencies

None; pure correctness/lifecycle fixes.
