# Tasks: 097-tree-feature-system

> VERIFIED. Entry gate confirmed (096 VERIFIED; baseline 1075 unit / 19 e2e green).

- [x] 1. Confirm entry gate (096 VERIFIED; baseline 1075 unit / 19 e2e green).
- [x] 2. Extend `src/worldgen/ConfiguredFeature.ts` with the `tree` config member (`trunk` blockId/minHeight/maxHeight with minHeight <= maxHeight; `foliage` blockId/shape/radius; strict validation); add `src/worldgen/TreeFeature.ts` (`TreeShape`, `TreeTrunkConfig`/`TreeFoliageConfig`/`TreeBlock`, deterministic `buildTreeBlocks` with documented round/flatTop/spruce layer tables, `createDefaultTreeConfiguredFeatures` registering `overworld/oak_tree` trunk 7/4-5 foliage 8/round/2).
- [x] 3. Rewire `src/world/TerrainGenerator.ts` to build trees via `buildTreeBlocks` over the default oak (density/biome gating and rng draw sequence unchanged; owner-based chunk writes preserved; `CANOPY_HALF_WIDTH` replaced by the foliage radius; fail-fast default resolution; trunk base mapped to surface+1 via `wy = surface + dy`); add `tests/unit/TreeFeature.test.ts` (validation matrix, exact layouts per shape, height sampling bounds, determinism, defaults) and a terrain regression test (leaves present, bit-identical determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
