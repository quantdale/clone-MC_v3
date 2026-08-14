# Tasks: 029-heightmap-storage

> VERIFIED. Started only after 028 was VERIFIED.

- [x] 1. Confirm entry gate and run baseline (typecheck/lint/unit/e2e green at 437 unit / 19 e2e).
- [x] 2. Add heightmap arrays + `minY`/`maxY` + optional `blockRegistry` to `ChunkColumn`; expose `getSurfaceHeight`/`getMotionBlockingHeight`/`recomputeHeightmaps`.
- [x] 3. Wire incremental heightmap update into `setBlockState`; mark stale on `deserialize`.
- [x] 4. Write `tests/unit/HeightmapStorage.test.ts` (empty sentinel, write, raise, top removal rescan, water vs motion, column independence, recompute, deserialize, optional-registry fallback).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, and E2E.
- [x] 6. Record evidence/state; mark VERIFIED; advance PROGRAM_STATE to 029; commit + push; activate 030 only after VERIFIED.
