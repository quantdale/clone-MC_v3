# Proposal: 149-point-of-interest-system

## Problem
Villager-like AI (150-151) needs to find and claim specific block positions — a bed to sleep in, a
workstation to path to for a profession — without scanning the whole loaded world every tick.
Nothing in the codebase tracks "this block position is a point of interest of type X" at all.

## Goals
- A `PointOfInterestManager`: register a POI at an integer block position with a caller-supplied
  `ResourceId` type; track a single claimed/unclaimed boolean per POI (vanilla's simplest "one
  claimant" model — a bed or workstation is either free or taken).
- `findNearestUnclaimed(type, x, y, z, maxDistance)`: the nearest unclaimed POI of `type` within
  `maxDistance` of a position — pure, deterministic given identical inputs (ties broken by
  registration order).
- `claim`/`release`: atomic claim-state transitions, each reporting whether it actually changed
  anything (matches `EntityManager.setTransform`'s own true/false success-reporting convention).
- Chunk-scoped bookkeeping (`getInChunk`, `forgetChunk`) and a serialize/deserialize contract
  (`serializeChunk`/`deserializeChunk`) so a future persistence-wiring change can bridge this
  manager to a real store exactly the way 131 bridged 129's `EntityManager` to 037's
  already-existing IndexedDB entity store — without this change needing to add a new IndexedDB
  object store itself.

## Non-goals
- **No real IndexedDB persistence store.** Mirrors 129-133's own precedent inside this same
  "Entity framework and mobs" arc: 129 (`entity-core`) shipped a serializable runtime model years
  before 037/131 wired real storage; 149 ships the identical shape (chunk-scoped manager +
  serialize/deserialize contract) for POIs, deferring an actual `WORLD_DB_VERSION` bump/new object
  store to whichever future change first needs POIs to survive a reload.
- **No villager entity, no profession/workstation type catalog, no bed-sleeping consumer.** 150
  (`villager-professions`)/198 (`sleep-and-time-skip`) are the real consumers; this change is the
  data/query primitive only, mirroring how 134 (`navigation-grid-query`)/136 (`mob-goal-selector`)
  shipped unconsumed before 140/145/146 wired mobs into them.
- **No multi-claimant/"free ticket count" model** (vanilla lets several villagers path toward one
  bed before exactly one claims it) — a single claimed/unclaimed boolean per POI is sufficient for
  a baseline and simpler to reason about; a richer ticket model is deferred if a future change
  needs it.
- **No spatial index/acceleration structure** (octree, grid buckets) — `findNearestUnclaimed` scans
  the live POI set directly; deferred until POI counts are large enough to matter (not measurable
  without a real villager consumer yet).

## Preconditions
- Change 148 (`mob-drop-loot`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/math/SectionCoordinate.ts` (021, `sectionIndex`), `src/data/ResourceId.ts` (002,
  `resourceIdToString`/`tryParseResourceId`).

## Proposed change
1. `src/simulation/PointOfInterest.ts` (NEW): `PointOfInterestRecord` interface (`type`, `x`, `y`,
   `z`, `claimed`); `SerializedPoi` envelope (`schemaVersion: 1`, `typeKey`, `x`/`y`/`z`,
   `claimed`); `validateSerializedPoi`; `PointOfInterestManager` (`add`, `remove`, `get`, `getAll`,
   `getInChunk`, `claim`, `release`, `findNearestUnclaimed`, `serializeChunk`, `deserializeChunk`,
   `forgetChunk`, `clear`).

## Compatibility and migration
- One new, additive file. No `Game.ts`/`World.ts` edit; no `WORLD_DB_VERSION` bump; no existing
  module touched. No migration.

## Risks
- **`findNearestUnclaimed` is a linear scan of the live POI set** — acceptable for this baseline
  (no real consumer yet to generate load); flagged for a future optimization if a villager-heavy
  world makes it measurable.

## Rollback strategy
One additive file; reverting fully removes the feature with no other impact.

## Definition of Done
- All listed classes/functions implemented per design.md/spec.md.
- Unit tests cover: `add`/`remove`/`get`/`getAll`/`getInChunk` bookkeeping (including duplicate-
  position rejection); `claim`/`release` success/failure-reporting semantics; `findNearestUnclaimed`
  type/claimed-state/distance filtering and deterministic tie-breaking; `serializeChunk`/
  `deserializeChunk` round-trip and atomic rejection of a malformed batch; `forgetChunk` chunk-scoped
  eviction.
- Full gate green: typecheck, lint, unit, build (module count unchanged — additive/unconsumed,
  mirroring 148's own identical evidence), e2e (existing 22 assertions unaffected — no regression,
  nothing wired into the live game).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
