# Proposal: 313-world-meshing-deferral-and-async-dispose-guards

## Problem

Post-312 codebase verification identified three concrete lifecycle and state-machine defects across `src/world/World.ts` and `src/engine/Game.ts`:

1. **`World.processMeshing` (`src/world/World.ts`) checks `!chunk || !chunk.generated` AFTER `pipeline.beginStage(job.key, 'mesh', job.version)`**:
   - Calling `pipeline.beginStage('mesh')` first either rejects an `Allocated`/`Generated`/`Features` chunk as `invalid-transition` and discards the job on `continue`, OR (when `record.status === ChunkLifecycleStage.Lighted`) adds `'mesh'` to `record.inFlight` and advances status to `MeshQueued` before `!chunk || !chunk.generated` re-enqueues the job intact. Because `'mesh'` remains in `record.inFlight`, the next `pipeline.dequeue('mesh')` treats the re-enqueued job as stale and drops it, leaving `'mesh'` permanently stranded in `inFlight`.
   - Similarly, `World.processCanonicalSectionMeshing` returns early when `!column` without calling `pipeline.failStage(..., 'mesh')` even though `'mesh'` is already in flight for `record.generation === generation`.
2. **`World.beginEditHydration` (`src/world/World.ts`) mutates disposed state on async resolution**:
   - `beginEditHydration` clears `hydrationPending` in `.finally()`, but its `.then((changes) => ...)` continuation does not check `if (this.disposed) return;`. If `World.dispose()` clears `editOverlay`, `editOverlayAccessOrder`, and storage before `loadCommittedChunkEdits` settles, the resolved promise resurrects entries in `editOverlay`, `editOverlayAccessOrder`, and canonical storage on an already-disposed `World`.
3. **`Game` async persistence callbacks (`src/engine/Game.ts`) lack `this.disposed` guards**:
   - Unlike downstream `this.selfOpenPromise.then(...)` subscribers (which guard `if (this.disposed) return;`), the primary `composed.open().then(...)` and `.catch(...)` handlers in `Game` constructor (`selfOpenPromise`) and `savePlayerStateDurable()` (`p.flush().then(...)`) apply world/player/block-entity hydration, spawn resolution, and DOM status updates without checking `if (this.disposed) return;`. If `Game.dispose()` runs while `composed.open()` or `flush()` is still pending, teardown invariants are violated when those callbacks settle.

## Goals

- Check generation currency and `!chunk || !chunk.generated` BEFORE `pipeline.beginStage('mesh')` in `World.processMeshing`, and roll back `'mesh'` on early `!column` exit in `World.processCanonicalSectionMeshing` so `inFlight` cannot strand and ungenerated deferrals preserve intact queue entries.
- Guard `World.beginEditHydration`'s `.then(...)` handler against `this.disposed === true` so post-dispose hydration resolution performs zero mutations on storage, `editOverlay`, `editOverlayAccessOrder`, or chunks.
- Guard `Game`'s `selfOpenPromise` primary `.then`/`.catch` handlers and `savePlayerStateDurable`'s `.then` handler against `this.disposed === true`.

## Non-goals

- Changing chunk lifecycle transition tables, worker pool contracts, or storage persistence schemas.
- Altering gameplay, rendering pipelines, visual goldens, or headed GPU certification (Change 258 remains BLOCKED).

## Preconditions

- Change 312 is VERIFIED and published on `origin/main` at `b91b5ace2474259f500ca58be236741fc9c679d2`.
- Working tree is clean.

## Dependencies

- `src/world/World.ts`
- `src/engine/Game.ts`

## Proposed change

- Reorder `World.processMeshing` to check stale generation and defer `!chunk || !chunk.generated` BEFORE invoking `pipeline.beginStage('mesh')`, and add explicit `failStage('mesh')` rollback when `processCanonicalSectionMeshing` encounters a missing column while `record.generation === generation`.
- Add `if (this.disposed) return;` inside `World.beginEditHydration`'s `.then((changes) => ...)` continuation.
- Add `if (this.disposed) return;` inside `Game`'s `composed.open().then(...)`, `composed.open().catch(...)`, and `p.flush().then(...)` callbacks.

## Compatibility and migration

Zero persisted schema, wire-format, or public API changes.

## Risks

- Checking `!chunk || !chunk.generated` before `beginStage` assumes `pipeline.dequeue('mesh')` returned a job whose generation matches `record.generation`; checking `record.generation !== job.version` immediately before guarantees stale tokens still drop on `continue` rather than re-enqueueing.

## Rollback strategy

Revert via Git commit; zero persisted state changes.

## Definition of Done

- Failing-first tests prove the meshing deferral `inFlight` leak, post-dispose `beginEditHydration` mutation, and post-dispose `Game` callback guard gaps before production edits and pass after.
- Full `verify:all` gate suite (13 gates), Playwright E2E, and isolated `test:perf:multiplayer` pass cleanly.
- OpenSpec records, `PARITY_MATRIX.md` (`C313`), `PROGRAM_STATE.*`, and `file-audit-manifest.json` updated, committed, and pushed directly to `origin/main`.

## Advancement gate

100% of tasks completed, all mandatory requirements verified, 0 regressions, and complete evidence recorded in `verification.md`.
