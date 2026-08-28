# Spec: entity-chunk-tracking

## Contract
This capability adds chunk-scoped activation/deactivation and ticking-set selection for 129
`EntityInstance`s: `EntityManager.forgetChunk` permanently evicts a chunk's entities (freeing their
ids, unlike `remove()`), and `selectTickingEntities`/`deactivateChunk`/`activateChunk`
(`src/simulation/EntityChunkTracking.ts`) compose `forgetChunk` with 131's `serializeChunk`/
`deserializeChunk` and a caller-supplied chunk-ticking predicate. No hard dependency on
`ChunkTicketManager` or `RenderSimulationDistance`, and no `Game`/persistence-repository wiring — see
the proposal's Non-goals.

## Definitions
- **Entity chunk**: `(sectionIndex(transform.x), sectionIndex(transform.z))` (021 `sectionIndex`),
  same convention as 131.
- **Forget**: permanently remove an entity from an `EntityManager`'s storage (id map and, if present,
  the insertion-order list), regardless of its lifecycle state (`ACTIVE` or `REMOVED`), freeing its id
  for reuse by a later `spawn`/`deserializeChunk` call with that same explicit id.
- **Chunk-ticking predicate**: a caller-supplied `(cx: number, cz: number) => boolean` answering
  whether that chunk should currently tick entities. Sourced by the caller from `ChunkTicketManager`,
  `RenderSimulationDistance`, or any other mechanism; this capability is agnostic to the source.
- **Deactivate**: persist a chunk's persistent entities (via `serializeChunk`) and then forget every
  entity in that chunk (persistent or not).
- **Activate**: restore a chunk's entities from previously persisted records (via
  `deserializeChunk`).

## Invariants
- `forgetChunk(cx, cz)` removes exactly the entities (any lifecycle state) whose entity chunk is
  `(cx, cz)`; every entity in any other chunk is untouched, and its lifecycle state (`ACTIVE`/
  `REMOVED`) is irrelevant to whether it is evicted.
- After `forgetChunk` evicts an id, a subsequent `spawn`/`deserializeChunk` with that exact id
  succeeds (no collision) — the evicted id is fully free.
- `selectTickingEntities` never mutates the manager and never includes a `REMOVED` entity (it filters
  `getAll()`, which is already `ACTIVE`-only).
- `deactivateChunk` always serializes before forgetting, so no persistent entity in the target chunk
  is lost from the returned records even though it is evicted from the live manager in the same call.

## Requirements

### Requirement: forgetChunk evicts every entity in a chunk regardless of lifecycle state, freeing ids
`EntityManager.forgetChunk(cx, cz)` MUST remove every entity (whether `ACTIVE` or retained `REMOVED`)
whose entity chunk is `(cx, cz)` from the manager's storage, leaving entities in other chunks
untouched, and MUST return the count removed. After eviction, `get(id)` for an evicted id MUST return
`undefined`, and a subsequent `spawn`/`deserializeChunk` supplying that exact id as `opts.id` MUST
succeed (no collision).

#### Scenario: forgetChunk evicts both an active and a removed entity in the target chunk
- **GIVEN** an `EntityManager` with one `ACTIVE` entity and one `REMOVED` entity both in chunk
  `(0, 0)`, and one `ACTIVE` entity in chunk `(1, 0)`
- **WHEN** `forgetChunk(0, 0)` is called
- **THEN** it returns `2`, `get` on both evicted ids returns `undefined`, and the chunk-`(1,0)` entity
  is unaffected (`get` still resolves it, `getAll()` still includes it)

#### Scenario: an evicted id can be reused by a later spawn
- **GIVEN** an entity spawned with explicit `id = 9` in chunk `(0, 0)`, then evicted via
  `forgetChunk(0, 0)`
- **WHEN** `spawn(typeId, dimension, transform, { id: 9 })` is called afterward
- **THEN** it succeeds (no collision error), unlike spawning over a `remove()`d (not forgotten) id

### Requirement: selectTickingEntities filters live entities by a caller-supplied chunk predicate
`selectTickingEntities(manager, isChunkTicking)` MUST return exactly the `ACTIVE` entities whose
entity chunk satisfies `isChunkTicking(cx, cz)`, in `getAll()`'s insertion order, without mutating
the manager.

#### Scenario: only entities in ticking chunks are selected
- **GIVEN** an `EntityManager` with one entity in chunk `(0, 0)` and one in chunk `(5, 5)`, and a
  predicate that is `true` only for `(0, 0)`
- **WHEN** `selectTickingEntities(manager, predicate)` is called
- **THEN** the result contains only the chunk-`(0,0)` entity

### Requirement: deactivateChunk persists then forgets, losing no persistent entity's data
`deactivateChunk(manager, cx, cz)` MUST return the same records `serializeChunk(cx, cz)` would have
produced immediately before eviction, and MUST leave the manager with every entity that was in chunk
`(cx, cz)` (persistent or not) forgotten afterward.

#### Scenario: deactivating a chunk returns its persistent records and forgets everyone in it
- **GIVEN** a chunk containing one persistent entity and one non-persistent entity
- **WHEN** `deactivateChunk(manager, cx, cz)` is called
- **THEN** the returned array contains exactly one record (the persistent entity's), and afterward
  `manager.getAll()` contains neither entity

### Requirement: activateChunk restores entities with deserializeChunk's exact contract
`activateChunk(manager, cx, cz, records)` MUST behave identically to
`manager.deserializeChunk(cx, cz, records)` — same return value, same atomic rejection behavior on
an invalid batch.

#### Scenario: activating a chunk with deactivateChunk's own output round-trips correctly
- **GIVEN** the records returned by a prior `deactivateChunk(manager, cx, cz)` call
- **WHEN** `activateChunk(manager, cx, cz, records)` is called on the same (now-forgotten) chunk
- **THEN** it returns the count restored, and each restored entity's `id`/`typeId`/`dimension`/
  `transform`/`velocity` match the pre-deactivation values

## Error and failure behavior
- `forgetChunk` never throws; an empty or unknown chunk returns `0`.
- `selectTickingEntities` propagates (does not catch) a throwing predicate.
- `deactivateChunk` never throws (inherits `serializeChunk`'s never-throws + `forgetChunk`'s
  never-throws).
- `activateChunk` throws exactly when `deserializeChunk` would (131's documented rejection cases).

## Performance and resource bounds
- `forgetChunk` is O(n) over all stored entities (active + removed).
- `selectTickingEntities` is O(n) over `ACTIVE` entities plus one predicate call per entity.
- `deactivateChunk` is O(n) (one `serializeChunk` pass + one `forgetChunk` pass, both O(n) over the
  manager's stored entities).

## Compatibility and migration
- One additive `EntityManager` method (`forgetChunk`) plus one new file
  (`src/simulation/EntityChunkTracking.ts`); no edits to `ChunkTicketManager`,
  `RenderSimulationDistance`, `EntityRepository`, `DirtySaveQueue`, `RepositorySaveSink`, or `Game`.
  No schema/save-format change; no migration.

## Security and integrity
- `forgetChunk` only ever removes entities matching the exact requested chunk coordinates (computed
  identically to `serializeChunk`/`deserializeChunk`'s existing `sectionIndex`-based membership
  check), so it cannot accidentally evict an entity from an unrelated chunk.

## Observability
- `forgetChunk`'s return count and `deactivateChunk`'s returned record array make the outcome of an
  unload step directly assertable without additional instrumentation.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 forgetChunk evicts regardless of lifecycle, frees ids | `tests/unit/EntityManager.test.ts` forgetChunk cases |
| REQ-2 selectTickingEntities filters by predicate | `tests/unit/EntityChunkTracking.test.ts` selectTickingEntities cases |
| REQ-3 deactivateChunk persists then forgets | `tests/unit/EntityChunkTracking.test.ts` deactivateChunk cases |
| REQ-4 activateChunk matches deserializeChunk's contract | `tests/unit/EntityChunkTracking.test.ts` activateChunk cases |
