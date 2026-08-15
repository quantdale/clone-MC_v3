# Tasks: 149-point-of-interest-system

## Implementation
- [x] `src/simulation/PointOfInterest.ts`: `PointOfInterestRecord` interface; `POI_RECORD_VERSION`;
      `SerializedPoi` interface; `validateSerializedPoi`.
- [x] `PointOfInterestManager` class: `add` (duplicate-position rejection), `remove`, `get`,
      `getAll`, `getInChunk`.
- [x] `claim`/`release` (success/failure-reporting semantics).
- [x] `findNearestUnclaimed` (type/claimed/distance filtering, deterministic tie-breaking).
- [x] `serializeChunk`/`deserializeChunk` (atomic batch validation), `forgetChunk`, `clear`.

## Tests
- [x] `tests/unit/PointOfInterest.test.ts`: `add` at a free position succeeds, unclaimed by
      default.
- [x] `add` at an occupied position throws, manager unchanged.
- [x] `claim` on an unclaimed POI succeeds.
- [x] `claim` on an already-claimed POI fails.
- [x] `release` on an unclaimed POI fails.
- [x] `claim`/`release` on a nonexistent position both fail.
- [x] `findNearestUnclaimed` returns the nearer of two qualifying POIs.
- [x] `findNearestUnclaimed` excludes a nearer claimed POI.
- [x] `findNearestUnclaimed` excludes a nearer different-type POI.
- [x] `findNearestUnclaimed` excludes an out-of-range POI (returns null).
- [x] `serializeChunk`/`deserializeChunk` round-trip case.
- [x] `deserializeChunk` rejects a malformed batch atomically.
- [x] `forgetChunk` evicts only the targeted chunk's POIs.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (17/17).
- [x] Full `npm test` passes (172 files, 1942/1942 — prior 1925 + 17 new).
- [x] `npm run build` passes (103 modules, unchanged — additive/unconsumed, mirroring 148's own
      identical evidence).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — nothing wired into the live
      game).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 150-villager-professions).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
