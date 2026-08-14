# Tasks: 033-vertical-streaming

> VERIFIED. All 5 tasks complete; advanced to 034.

- [x] 1. Confirm entry gate (032 VERIFIED; baseline 478 unit / 19 e2e green).
- [x] 2. Add `DimensionType` import + `dimension?` opts to `World`; derive `minChunkY`/`chunkLayerCount`; add `getMinChunkY`/`getChunkLayerCount` accessors.
- [x] 3. Iterate the vertical window in `ensureChunks`, `preloadChunks`, and `getReadyProgress` (default 1 layer → unchanged behavior); keep queue bounds correct per layer.
- [x] 4. Write `tests/unit/VerticalStreaming.test.ts` (default single-layer parity + two-layer streaming/preload/readiness).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
