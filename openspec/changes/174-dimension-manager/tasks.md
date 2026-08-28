# Tasks: 174-dimension-manager

## Implementation
- [x] `src/world/DimensionManager.ts`: `LoadedDimension` interface (key/type/world/tickQueue).
- [x] `registerDimension(type, world, tickQueue?)`: key = `resourceIdToString(type.id)`; duplicate
      rejection (`DUPLICATE_ID`); fresh queue per dimension unless supplied.
- [x] `hasDimension` / `getDimension` / `getWorld` / `getTickQueue` (unknown → `undefined`/`false`).
- [x] `dimensions()` (registration order) / `size` / `removeDimension` (idempotent).
- [x] `tickAll(nowTick)`: independent per-dimension drain, registration order, deterministic map.

## Tests
- [x] `tests/unit/DimensionManager.test.ts`: registration stores keyed by type id with fresh
      independent queues.
- [x] Duplicate registration throws `DUPLICATE_ID`.
- [x] Caller-supplied queue is adopted.
- [x] Lookups round-trip; unknown keys are `undefined`/`false`; removal of unknown key is `false`.
- [x] `dimensions()` preserves registration order; `size` counts.
- [x] `removeDimension` removes exactly the requested key (idempotent).
- [x] `tickAll` drains each dimension's queue independently at its due tick (no leakage).
- [x] `tickAll` is deterministic across identical builds and covers every registered dimension.
- [x] Per-dimension vertical metadata (025): overworld −64/384/24 sections/skylight/containsY bounds;
      nether 0/256/16 sections/no skylight/ultrawarm.
- [x] World-edit isolation: edits in one dimension's world never leak into another's.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2371/2371 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      175-nether-dimension-type).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
