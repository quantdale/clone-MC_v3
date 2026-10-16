# Design: 149-point-of-interest-system

## Context/current state
- No block position anywhere is tracked as a "point of interest" today; nothing resembling a
  claim/free state for a block exists.
- `EntityManager` (129) is the closest existing precedent for this shape: strict id/position
  validation on write, chunk-scoped `serializeChunk`/`deserializeChunk`/`forgetChunk` via
  `sectionIndex` (021), atomic all-or-nothing batch validation on deserialize. 149 reuses that exact
  shape for a POI's block position instead of an entity's continuous transform.
- There is no existing IndexedDB object store for anything POI-shaped; 034-043 (`Persistent world
  storage`) predates this concept entirely. Unlike 131 (`entity-persistence-runtime`), which bridged
  into 037's already-existing store, there is nothing yet for 149 to bridge into — its
  serialize/deserialize contract is therefore self-contained (own envelope type), not yet wired to
  a live repository.

## Target state
- `src/simulation/PointOfInterest.ts`: `PointOfInterestManager`, a chunk-scoped, in-memory store of
  `PointOfInterestRecord`s keyed by integer block position, with claim/release, nearest-unclaimed
  query, and a serialize/deserialize contract ready for a future persistence-wiring change.

## Invariants
- At most one POI record exists per distinct `(x, y, z)` integer position at any time; `add`
  throws if a record already exists at that position (defensive — callers must `remove` first to
  replace one).
- A freshly `add`ed POI is always `claimed: false`.
- `claim(x, y, z)` returns `true` and sets `claimed: true` only when a record exists at that
  position and is currently unclaimed; otherwise returns `false` and changes nothing.
- `release(x, y, z)` returns `true` and sets `claimed: false` only when a record exists and is
  currently claimed; otherwise returns `false` and changes nothing.
- `findNearestUnclaimed(type, x, y, z, maxDistance)` only ever returns a record whose `type` matches
  (compared by resource-id string equality), `claimed` is `false`, and whose Euclidean distance from
  `(x, y, z)` is `<= maxDistance`; among tied-nearest candidates, the one registered earliest wins.
- `serializeChunk(cx, cz)` includes every record whose position falls in that chunk (via
  `sectionIndex`), and is pure (never mutates the manager). `deserializeChunk` either adds every
  record in a batch or none of them (validated up front; duplicate positions within the batch or
  against the manager are rejected atomically).

## API and data model
```ts
// src/simulation/PointOfInterest.ts

export interface PointOfInterestRecord {
  readonly type: ResourceId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly claimed: boolean;
}

export const POI_RECORD_VERSION = 1;

export interface SerializedPoi {
  readonly schemaVersion: 1;
  readonly typeKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly claimed: boolean;
}

export function validateSerializedPoi(input: unknown): SerializedPoi; // throws on malformed input

export class PointOfInterestManager {
  add(type: ResourceId, x: number, y: number, z: number): PointOfInterestRecord;
  remove(x: number, y: number, z: number): boolean;
  get(x: number, y: number, z: number): PointOfInterestRecord | undefined;
  getAll(): readonly PointOfInterestRecord[];
  getInChunk(cx: number, cz: number): readonly PointOfInterestRecord[];
  claim(x: number, y: number, z: number): boolean;
  release(x: number, y: number, z: number): boolean;
  findNearestUnclaimed(
    type: ResourceId,
    x: number,
    y: number,
    z: number,
    maxDistance: number,
  ): PointOfInterestRecord | null;
  serializeChunk(cx: number, cz: number): SerializedPoi[];
  deserializeChunk(cx: number, cz: number, records: unknown[]): number;
  forgetChunk(cx: number, cz: number): number;
  clear(): void;
}
```

## Control/data flow
1. **Registration** (a future world-generation/block-placement consumer): `manager.add(bedType,
   x, y, z)` — validates finite integer coordinates and rejects a duplicate position, then stores
   an unclaimed record keyed by a `"x,y,z"` string key internally (exact-integer position equality,
   no floating rounding ambiguity).
2. **Query** (a future villager goal, analogous to 140's `TargetAcquisitionGoal` callback
   injection): `manager.findNearestUnclaimed(type, entityX, entityY, entityZ, radius)` scans
   `getAll()`, filters by type/claimed/distance, and returns the minimum-distance match (first
   encountered wins a tie, matching `getAll()`'s stable insertion order).
3. **Claim/release** (a future villager goal's `start()`/`stop()`): `manager.claim(x, y, z)` /
   `manager.release(x, y, z)`.
4. **Chunk lifecycle** (a future chunk-unload/reload integration, analogous to 132's
   `deactivateChunk`/`activateChunk`): `serializeChunk`/`forgetChunk` on unload,
   `deserializeChunk` on reload from a persisted record set.

## Detailed behavior
- Position keys are built as a plain template `` `${x}|${y}|${z}` `` over the already-integer-
  validated coordinates — simple and collision-free since `x`/`y`/`z` are each validated as finite
  integers before the key is built, so no float-rounding ambiguity (e.g. `-0` vs `0`) can arise.
- `findNearestUnclaimed` compares `type` via `resourceIdToString` equality (matching how
  `PassiveMobSystem`/`HostileMobSystem` compare `entity.typeId` structurally elsewhere) rather than
  object identity, so a caller-reconstructed `ResourceId` value still matches.
- `deserializeChunk` mirrors `EntityManager.deserializeChunk`'s exact validation shape: parse every
  record via `validateSerializedPoi` first (throws immediately on the first malformed record, no
  partial state change), check chunk membership (`sectionIndex(record.x) === cx` etc.), reject a
  duplicate position within the batch or against the manager, then commit all adds in one pass only
  after every record has passed validation.

## Failure modes
- `add` throws when a record already exists at the exact position, or when `x`/`y`/`z` are not
  finite integers.
- `deserializeChunk` throws (manager unchanged) for a malformed record, an out-of-chunk position, or
  a duplicate position within the batch/against the manager.
- No other method throws for well-formed inputs; `claim`/`release`/`remove` on a nonexistent
  position simply return `false`.

## Compatibility/migration
- One new, additive file. No existing module edited; no schema/save-format change (no real
  persistence store exists yet for this data); no migration.

## Performance/resource constraints
- `findNearestUnclaimed` is O(n) over the live POI count; acceptable until a real villager consumer
  makes it measurable (flagged as a future optimization, not required now).
- `serializeChunk`/`getInChunk` are O(n) filters over the live set (matching
  `EntityManager.serializeChunk`'s own O(n) precedent).

## Testing seams
- The entire module is tested standalone with plain `ResourceId`/coordinate inputs — no `World`,
  `EntityManager`, or `Game` dependency of any kind.

## Observability/debugging
- `getAll()`/`getInChunk()` expose the full live set for a future debug-overlay hook (not added in
  this change).

## Affected files/symbols
- `src/simulation/PointOfInterest.ts` (new).
- Tests: `tests/unit/PointOfInterest.test.ts` (new).

## Rejected alternatives
- **Wiring a real IndexedDB store now (bumping `WORLD_DB_VERSION`)**: rejected — no real consumer
  exists yet to need cross-session persistence; matches 129's own precedent of shipping the runtime
  model well before 037/131 wired real storage in a dedicated, later change.
- **A multi-claimant "free ticket count" per POI** (vanilla's actual bed-sleeping model): rejected
  for this baseline — a single claimed/unclaimed boolean is simpler and sufficient until a future
  change's requirements demand more; upgrading the field later is a small, additive change.
- **A spatial grid/octree acceleration structure for `findNearestUnclaimed`**: rejected — premature
  optimization with no measurable workload yet (no real consumer); a linear scan is simple, correct,
  and easy to reason about.

## Downstream dependencies
- 150 (`villager-professions`) is the first real consumer: workstation-type POIs registered near
  placed workstation blocks, claimed by a profession-assignment goal.
- 198 (`sleep-and-time-skip`) will likely register bed positions as POIs and use
  `findNearestUnclaimed` for spawn-point assignment.
