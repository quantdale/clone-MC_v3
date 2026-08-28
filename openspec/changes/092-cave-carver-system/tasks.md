# Tasks: 092-cave-carver-system

> VERIFIED. Entry gate confirmed (091 VERIFIED; baseline 1022 unit / 19 e2e green).

- [x] 1. Confirm entry gate (091 VERIFIED; baseline 1022 unit / 19 e2e green).
- [x] 2. Add `TerrainColumn.removeCell` to `src/worldgen/OverworldTerrain.ts` (additive) + extend its test.
- [x] 3. Add `src/worldgen/CaveCarver.ts` (`CaveCarverConfig` seed/threshold/minY/maxY; `carveValue` documented two-noise formula; `CarvedColumn` sparse mask; `carveColumn`; `applyCarving` pure removal into a new column).
- [x] 4. Add `tests/unit/CaveCarver.test.ts` (carveValue determinism/bounds, mask determinism/seed sensitivity/y-window, applyCarving removal + purity, config validation, nonzero fixture).
- [x] 5. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
