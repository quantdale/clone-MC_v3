# Tasks: 088-overworld-density-terrain

> VERIFIED. Entry gate confirmed (087 VERIFIED; baseline 990 unit / 19 e2e green).

- [x] 1. Confirm entry gate (087 VERIFIED; baseline 990 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/OverworldTerrain.ts` (`OverworldTerrainConfig` defaults -64..320/63, `TerrainBlockIds` defaults, `TerrainColumn` with `getBlock`/`blockCount`/`surfaceHeightAt`, `generateTerrainColumn` with the documented density formula, sparse deterministic output, config validation).
- [x] 3. Add `tests/unit/OverworldTerrain.test.ts` (determinism, seed sensitivity, classification invariants, surface heights, index round-trip, config validation).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
