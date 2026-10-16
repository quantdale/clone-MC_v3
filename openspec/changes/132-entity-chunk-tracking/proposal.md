# Proposal: 132-entity-chunk-tracking

## Problem
129's `EntityManager.getAll()` returns every `ACTIVE` entity regardless of where it is in the world;
nothing yet limits ticking to entities near loaded/simulating chunks, and nothing evicts an entity
from live memory when its chunk stops being tracked (after persisting it via 131's
`serializeChunk`) or restores it when the chunk becomes tracked again (131's `deserializeChunk`).
The codebase already has two chunk-liveness mechanisms — `ChunkTicketManager` (031, an unconsumed
data model) and `RenderSimulationDistance` (032, the mechanism `World`/`Game` actually use for block
random-tick gating) — and this change must not hard-couple entity tracking to either one specifically.

## Goals
- `selectTickingEntities(manager, isChunkTicking)`: filter `EntityManager.getAll()` to the entities
  whose current chunk satisfies a caller-supplied `isChunkTicking(cx, cz): boolean` predicate,
  preserving order. The predicate keeps this change decoupled from both `ChunkTicketManager` and
  `RenderSimulationDistance` — a caller can supply either (or a hand-built one in tests).
- `EntityManager.forgetChunk(cx, cz)`: permanently remove every entity (any lifecycle state) located
  in chunk `(cx, cz)` from the manager's storage, freeing their ids for reuse — distinct from
  `remove()` (129), which retains a `REMOVED` record specifically to block id reuse. This is the
  "entity died" vs. "entity's chunk unloaded and was persisted elsewhere" distinction.
- `deactivateChunk(manager, cx, cz)`: the composed "unload" step — serialize the chunk's persistent
  entities (131 `serializeChunk`) then forget the whole chunk (`forgetChunk`), returning the
  persistent records for the caller to hand to a save sink.
- `activateChunk(manager, cx, cz, records)`: the named "load" counterpart — a thin, symmetric wrapper
  around 131's `deserializeChunk`, so activate/deactivate read as a matched pair.

## Non-goals
- **No hard dependency on `ChunkTicketManager` or `RenderSimulationDistance`.** Both are valid
  predicate sources; 132 accepts a plain predicate function instead of importing either module,
  so it does not need to pick (or duplicate) either mechanism.
- **No automatic per-frame diffing/orchestration.** Deciding *which* chunks just transitioned
  loaded↔unloaded and calling `activateChunk`/`deactivateChunk` accordingly is a `Game`-loop
  responsibility; no such loop or state-diffing exists yet for entities in this program, so building
  it now would be untested integration logic with no real caller. That wiring is a later, explicitly
  scoped change.
- **No `EntityRepository`/`DirtySaveQueue` calls.** `deactivateChunk` returns records; persisting them
  is the caller's job via the already-generic 038 plumbing (unmodified here).
- **No AI/spawning.** Deciding whether a dormant (non-ticking-chunk) entity should still exist at all,
  or spawning new entities, is out of scope (136+).

## Preconditions
- Change 131 (`entity-persistence-runtime`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/EntityManager.ts` (129/131) — `getAll`, `serializeChunk`, `deserializeChunk`, and
  the new `forgetChunk`.
- `src/math/SectionCoordinate.ts` (021) — `sectionIndex`.

## Proposed change
1. `src/simulation/EntityManager.ts` (EDIT, additive method):
   - `forgetChunk(cx, cz): number` — iterates every stored entity (regardless of `ACTIVE`/`REMOVED`
     state) whose last-known `transform`'s chunk equals `(cx, cz)`, deletes it from the id map and
     (if present) the insertion-order list, and returns the count removed.
2. `src/simulation/EntityChunkTracking.ts` (NEW):
   - `selectTickingEntities(manager, isChunkTicking): EntityInstance[]`.
   - `deactivateChunk(manager, cx, cz): SerializedEntity[]` (`serializeChunk` then `forgetChunk`).
   - `activateChunk(manager, cx, cz, records): number` (thin wrapper for `deserializeChunk`, kept for
     naming symmetry with `deactivateChunk`).
3. No other file is edited.

## Compatibility and migration
- One additive `EntityManager` method plus one new file; no edits to `ChunkTicketManager`,
  `RenderSimulationDistance`, `EntityRepository`, `DirtySaveQueue`, or `Game`. No schema/save-format
  change; no migration.

## Risks
- **Reusing an evicted id incorrectly.** Mitigation: `forgetChunk` is the only operation that frees an
  id for reuse; `remove()`'s existing collision-blocking behavior for `REMOVED` records is completely
  unaffected — `forgetChunk` is additive, a caller must opt into it explicitly per chunk.
- **`deactivateChunk` discarding non-persistent entities silently.** Mitigation: documented,
  intentional (matches vanilla's non-persistent-entity-despawns-on-unload semantics, same posture as
  131's `serializeChunk` filter); `forgetChunk` evicting a non-persistent entity is exactly the
  intended behavior since it was never going to be saved anyway.
- **Predicate-injection API being under-specified/untestable.** Mitigation: `selectTickingEntities`
  takes a plain function, so both a `ChunkTicketManager`-backed predicate and a
  `RenderSimulationDistance`-backed predicate are exercised directly in tests via small inline
  predicates, without importing either module into production code here.

## Rollback strategy
One additive method plus one new file with zero consumers; reverting removes both with no other
impact.

## Definition of Done
- `EntityManager.forgetChunk` implemented and unit-tested (evicts `ACTIVE` and `REMOVED` entities in
  the target chunk; leaves other chunks/ids untouched; frees ids for a subsequent `spawn`/
  `deserializeChunk` with the same id).
- `selectTickingEntities`/`deactivateChunk`/`activateChunk` implemented and unit-tested.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no `Game` wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
