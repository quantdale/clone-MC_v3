# Design: 131-entity-persistence-runtime

## Context/current state
- 037 defines `SerializedEntity { schemaVersion, typeKey, x, y, z, data }` and `EntityChunkRecord`
  (chunk-grouped); `EntityRepository` (037) persists/reads these per `(worldId, chunkX, chunkZ)`.
- 038's `DirtySaveQueue`/`RepositorySaveSink` already treat `'entities'` as a first-class
  `SaveUnitKind` whose `payload` is `SerializedEntity[]`, routed to
  `EntityRepository.putChunkEntities` — this plumbing requires no changes.
- `ItemEntityManager.serializeAll`/`deserializeAll` (111) and
  `BlockEntityManager.serializeChunk`/`deserializeChunk` (052) are the two existing precedents for a
  manager ↔ 03x-envelope bridge; `BlockEntityManager`'s chunk-scoped pair is the closer template since
  129's `EntityManager` is also chunk-groupable by position.
- 129 `EntityManager` has `getAll()`/`get()`/`spawn()` but no serialize/deserialize bridge at all.

## Target state
- `EntityManager.serializeChunk(cx, cz)` and `EntityManager.deserializeChunk(cx, cz, entities)` added
  to the existing `src/simulation/EntityManager.ts`, following the validate-then-mutate atomicity
  convention used throughout this codebase's persistence bridges.

## Invariants
- `serializeChunk` includes exactly the `ACTIVE` entities whose registered type has
  `isPersistent === true` and whose transform's chunk (`sectionIndex(transform.x)`,
  `sectionIndex(transform.z)`) equals `(cx, cz)`. A `REMOVED` or non-persistent entity is never
  included.
- `deserializeChunk` is atomic: either every record in the batch is valid and all are spawned, or the
  call throws and the manager's observable state (`get`/`getAll`/`size`/id-minting counter) is
  unchanged.
- A round-trip (`serializeChunk` then `deserializeChunk` into a fresh manager) preserves `id`,
  `typeId`, `dimension`, `transform` (`x`/`y`/`z`/`yaw`/`pitch`), and `velocity` exactly.
- `deserializeChunk` never spawns an entity whose `(x, z)` chunk (per the persisted, floored
  `x`/`z` fields) does not match the requested `(cx, cz)` — the whole batch is rejected instead.
- `deserializeChunk` never spawns an entity whose id collides with another record in the same batch
  or with any id already present in the manager (`ACTIVE` or retained `REMOVED`), matching
  `spawn`'s own collision contract (129).

## API and data model
Added to `src/simulation/EntityManager.ts`:
```ts
serializeChunk(cx: number, cz: number): SerializedEntity[];
deserializeChunk(cx: number, cz: number, entities: unknown[]): number;
```
Per-entity `data` payload shape (opaque to 037, defined and owned here):
```ts
interface EntityPersistedData {
  id: number;
  dimension: string;   // resourceIdToString(entity.dimension)
  transform: EntityTransform;
  velocity: EntityVelocity;
}
```
The envelope's `typeKey` field carries `resourceIdToString(entity.typeId)`; the envelope's `x`/`y`/`z`
carry `Math.floor(transform.x/y/z)` (matching `ItemEntityManager`'s existing floor-for-position,
full-precision-in-`data` convention) while `data.transform` carries the exact float transform.

## Control/data flow
1. `serializeChunk(cx, cz)`:
   a. Iterate `getAll()` (already `ACTIVE`-only).
   b. Skip any entity whose `registry.get(typeId).isPersistent` is not `true`.
   c. Skip any entity whose `(sectionIndex(x), sectionIndex(z))` does not equal `(cx, cz)`.
   d. Map each surviving entity to a `SerializedEntity` per the data model above.
2. `deserializeChunk(cx, cz, entities)`:
   a. `entities.map(validateSerializedEntity)` — throws immediately on a malformed envelope (037's
      existing contract).
   b. For each parsed record: verify `(sectionIndex(record.x), sectionIndex(record.z)) === (cx, cz)`;
      throw otherwise.
   c. Parse `record.typeKey` via `tryParseResourceId`; throw if unparsable or unregistered
      (`!registry.has(typeId)`).
   d. Validate `record.data` shape: `id` a non-negative integer, `dimension` a string parseable via
      `tryParseResourceId`, `transform`/`velocity` objects passing `isValidTransform`/
      `isValidVelocity`; throw on any failure.
   e. Track `id`s seen in this batch in a `Set`; throw on a duplicate within the batch or a collision
      with `this.byId` (mirrors `spawn`'s collision check, checked up front for atomicity).
   f. Only after every record passes (a)-(e): call `this.spawn(typeId, dimension, transform, { id,
      velocity })` for each, in batch order. Returns the count spawned.

## Detailed behavior
- Step (e)'s up-front id-collision check is necessary for atomicity: `spawn` itself would already
  throw on a colliding id, but only after some earlier records in the batch had already been spawned,
  violating the "manager unchanged on any rejection" invariant. Pre-checking the whole batch avoids
  that partial-mutation window.
- `serializeChunk`'s "floor the persisted x/y/z" step mirrors `ItemEntityManager.serializeAll`'s
  existing convention exactly (`x: Math.floor(e.x)`), so the two managers' persisted shapes stay
  stylistically consistent even though their `data` payloads differ.

## Failure modes
- `deserializeChunk` throws (manager unchanged) on: a malformed envelope (037's own validation), a
  record whose chunk doesn't match `(cx, cz)`, an unparsable/unregistered `typeKey`, a malformed
  `data` payload (missing/wrong-typed `id`/`dimension`/`transform`/`velocity`, or a non-finite
  transform/velocity field), or a duplicate id (within the batch or against the manager).
- `serializeChunk` never throws — it is a pure filter over already-valid live state.

## Compatibility/migration
- Two additive methods on an existing class; the 037 envelope shape and 038's `SaveUnitKind`
  plumbing are unchanged. No migration.

## Performance/resource constraints
- `serializeChunk` is O(n) over all `ACTIVE` entities in the manager (matching `getAll()`'s existing
  cost model — no per-chunk index is introduced, consistent with 129 not adding one either).
- `deserializeChunk` is O(m) over the incoming batch (two passes: validate, then spawn), plus O(m) set
  operations for duplicate-id tracking.

## Testing seams
- Both methods are exercised directly against an `EntityManager` constructed with
  `createDefaultEntityRegistry()` (129's existing seam) — no `EntityRepository`/IndexedDB involved,
  since that boundary is already covered by 037/038's own tests and is unmodified here.

## Observability/debugging
- `deserializeChunk`'s thrown `Error` messages name the specific invalid field/id/chunk mismatch, so
  a persistence bug surfaces with enough context to locate the bad record without a debugger.

## Affected files/symbols
- `src/simulation/EntityManager.ts` (edit: two new methods).
- Tests: `tests/unit/EntityManager.test.ts` (extended with new `describe` blocks for
  `serializeChunk`/`deserializeChunk`).

## Rejected alternatives
- **A separate `EntityPersistenceBridge` module wrapping `EntityManager`**: rejected — `serializeChunk`/
  `deserializeChunk` are simple, self-contained methods with no dependency beyond what
  `EntityManager` already has (its own registry and id map); adding a wrapper class would only
  indirect the same two calls without simplifying anything, unlike `RepositorySaveSink` which
  genuinely dispatches across four different repositories.
- **Persisting `data` with the same key names as `ItemEntity`'s payload** (`item`/`count` etc.):
  rejected — `EntityInstance` has a different, more general shape; reusing unrelated key names would
  be misleading. `EntityPersistedData` names its own fields.
- **Wiring `Game`/`DirtySaveQueue` in this change**: rejected (see proposal Non-goals) — no consumer
  yet spawns non-player entities during gameplay, so wiring now would be dead code exercised only by
  contrived tests instead of a real call site.

## Downstream dependencies
- 132 (`entity-chunk-tracking`) will decide when to call `serializeChunk` (chunk unload /
  autosave) and `deserializeChunk` (chunk load), and will be the first real caller of both.
