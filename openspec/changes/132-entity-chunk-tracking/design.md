# Design: 132-entity-chunk-tracking

## Context/current state
- `EntityManager.getAll()` (129) returns every `ACTIVE` entity, unfiltered by location.
- `EntityManager.serializeChunk`/`deserializeChunk` (131) bridge persistent entities to the 037
  envelope, chunk-scoped, but nothing evicts an entity from live memory after serializing it —
  `remove()` (129) marks `REMOVED` and *retains* the record specifically to block id reuse, which is
  the wrong tool for "this chunk unloaded, forget it, the id may come back via `deserializeChunk`
  later."
- Two independent chunk-liveness mechanisms already exist: `ChunkTicketManager` (031, data-model
  only, no consumer yet) and `RenderSimulationDistance` (032, the one `World.isChunkSimulating`
  actually uses for block random-tick gating). Neither is imported by this change; both are valid
  predicate sources for a caller.

## Target state
- `EntityManager.forgetChunk(cx, cz)` added to `src/simulation/EntityManager.ts`.
- `src/simulation/EntityChunkTracking.ts` provides `selectTickingEntities` (predicate-filtered live
  query) and the `activateChunk`/`deactivateChunk` pair (load/unload orchestration primitives), built
  only on `EntityManager`'s existing public surface.

## Invariants
- `forgetChunk(cx, cz)` removes exactly the entities (any lifecycle state) whose `transform`'s chunk
  (`sectionIndex(x)`, `sectionIndex(z)`) equals `(cx, cz)`; entities in any other chunk are untouched,
  regardless of lifecycle state.
- After `forgetChunk` evicts an id, that id is fully available for reuse: a subsequent `spawn`/
  `deserializeChunk` with the same explicit id succeeds (no collision, unlike a `remove()`d id).
- `selectTickingEntities` never mutates the manager; it is a pure filter over `getAll()`'s existing
  `ACTIVE`-only, insertion-order result.
- `deactivateChunk` never loses a persistent entity's data: it always calls `serializeChunk` before
  `forgetChunk`, so every persistent entity in the chunk is captured in the returned array before
  being evicted.
- `activateChunk` has exactly `deserializeChunk`'s contract (atomic validate-then-spawn); it adds no
  behavior of its own beyond the call.

## API and data model
Added to `src/simulation/EntityManager.ts`:
```ts
/** Permanently evict every entity (any lifecycle state) in chunk (cx, cz); frees their ids. */
forgetChunk(cx: number, cz: number): number;
```
`src/simulation/EntityChunkTracking.ts` (new):
```ts
export function selectTickingEntities(
  manager: EntityManager,
  isChunkTicking: (cx: number, cz: number) => boolean,
): EntityInstance[];

/** Serialize then forget a chunk's entities; returns the persistent records to hand to a save sink. */
export function deactivateChunk(manager: EntityManager, cx: number, cz: number): SerializedEntity[];

/** Restore a chunk's entities from persisted records (alias for EntityManager.deserializeChunk, kept
 *  for activate/deactivate naming symmetry). */
export function activateChunk(manager: EntityManager, cx: number, cz: number, records: unknown[]): number;
```

## Control/data flow
1. `forgetChunk(cx, cz)`:
   a. Iterate every `[id, entity]` in the manager's id map (both `ACTIVE` and retained `REMOVED`).
   b. For each whose `sectionIndex(entity.transform.x) === cx && sectionIndex(entity.transform.z) === cz`:
      delete from the id map; if present in the insertion-order list, splice it out.
   c. Return the count removed.
2. `selectTickingEntities(manager, isChunkTicking)`:
   a. `manager.getAll()` (already `ACTIVE`-only, insertion order).
   b. Filter to entities whose `(sectionIndex(transform.x), sectionIndex(transform.z))` satisfies
      `isChunkTicking(cx, cz)`.
3. `deactivateChunk(manager, cx, cz)`:
   a. `const records = manager.serializeChunk(cx, cz)`.
   b. `manager.forgetChunk(cx, cz)` (discards non-persistent entities too — intentional).
   c. Return `records`.
4. `activateChunk(manager, cx, cz, records)`: `return manager.deserializeChunk(cx, cz, records)`.

## Detailed behavior
- `forgetChunk` evicting a `REMOVED` entity is the one case that actually changes observable
  behavior versus 129/131: a `get(id)` that used to return the retained `REMOVED` record now returns
  `undefined`, and a `spawn`/`deserializeChunk` with that same explicit `id` now succeeds instead of
  throwing. This is the whole point of the method (freeing ids that will never be reused for a live
  entity but that a save/load cycle for a *different* chunk's entity might otherwise want).
- `selectTickingEntities`'s predicate is called once per `ACTIVE` entity (via its current chunk), not
  cached — cheap chunk math (`sectionIndex` is O(1)), and the predicate itself is the caller's
  responsibility to make cheap (e.g. a `ChunkTicketManager`/`RenderSimulationDistance` lookup, both
  O(1) or O(radius) respectively).

## Failure modes
- `forgetChunk` never throws; an empty/non-existent chunk returns `0`.
- `selectTickingEntities` never throws for a well-typed predicate; a throwing predicate propagates
  (not caught/suppressed — the caller's predicate bug should surface, not be silently swallowed).
- `deactivateChunk`/`activateChunk` inherit `serializeChunk`'s (never throws) and `deserializeChunk`'s
  (throws on the documented invalid-batch cases, 131) failure behavior unchanged.

## Compatibility/migration
- One additive `EntityManager` method plus one new file; no edits to `ChunkTicketManager`,
  `RenderSimulationDistance`, 037/038, or `Game`. No schema/save-format change; no migration.

## Performance/resource constraints
- `forgetChunk` is O(n) over all stored entities (active + removed) in the manager — matching the
  existing O(n) cost model of `getAll()`/`serializeChunk`; no per-chunk index is introduced.
- `selectTickingEntities` is O(n) over `ACTIVE` entities plus one predicate call each.

## Testing seams
- `forgetChunk`/`selectTickingEntities`/`deactivateChunk`/`activateChunk` are all exercised directly
  against an `EntityManager` constructed with `createDefaultEntityRegistry()` — no `Game`/`World`/
  `ChunkTicketManager`/`RenderSimulationDistance` needed; `selectTickingEntities`'s predicate is a
  small hand-written function per test case.

## Observability/debugging
- `forgetChunk`'s return count and `deactivateChunk`'s returned records make it straightforward to
  assert exactly what an unload step captured and discarded.

## Affected files/symbols
- `src/simulation/EntityManager.ts` (edit: `forgetChunk`).
- `src/simulation/EntityChunkTracking.ts` (new).
- Tests: `tests/unit/EntityManager.test.ts` (extended for `forgetChunk`),
  `tests/unit/EntityChunkTracking.test.ts` (new).

## Rejected alternatives
- **Importing `ChunkTicketManager` or `RenderSimulationDistance` directly into `selectTickingEntities`**:
  rejected — the codebase has two live mechanisms for "is this chunk ticking" and picking one would
  either duplicate the other's logic or silently prefer the unconsumed one (031) over the one `Game`
  actually uses (032). A predicate keeps 132 correct under either, and under a future consolidation
  of the two.
- **`forgetChunk` mutating `remove()`'s semantics** (e.g. having `remove()` itself free the id):
  rejected — `remove()`'s retained-record/id-blocking behavior is a deliberate, already-VERIFIED
  129 contract (an intentionally-dead entity's id should never resurrect); `forgetChunk` is a new,
  explicitly-named, opt-in operation instead of silently changing existing behavior.
- **Automatic loaded/unloaded chunk-set diffing in this change**: rejected (see proposal Non-goals) —
  no real per-frame caller exists yet; building the diff loop now would be exercised only by
  contrived tests.

## Downstream dependencies
- A future `Game`-wiring change will call `selectTickingEntities` each simulation tick (using
  whichever of `ChunkTicketManager`/`RenderSimulationDistance` it settles on) and call
  `deactivateChunk`/`activateChunk` on real chunk-lifecycle transitions, persisting `deactivateChunk`'s
  returned records via 038's existing `DirtySaveQueue`/`RepositorySaveSink`.
