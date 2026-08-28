# Tasks: 098-vegetation-features

> VERIFIED. Entry gate confirmed (097 VERIFIED; baseline 1086 unit / 19 e2e green).

- [x] 1. Confirm entry gate (097 VERIFIED; baseline 1086 unit / 19 e2e green).
- [x] 2. Extend `src/worldgen/PlacedFeature.ts` with the `surfaceHeight` modifier (`PlacementContext.surfaceY` required; y = surfaceY(x, z), no rng draw; survival invariant accepts preceding heightRange OR surfaceHeight); add `src/worldgen/VegetationFeature.ts` (documented id vocabulary 19-23; `createDefaultVegetationConfiguredFeatures` blockPatch defaults for short_grass/poppy/dandelion/red_mushroom/brown_mushroom; `createDefaultVegetationPlacedFeatures` count(+rarity)+surfaceHeight+survivalFilter chains).
- [x] 3. Update `tests/unit/PlacedFeature.test.ts` context helper (surfaceY); add `tests/unit/VegetationFeature.test.ts` (surfaceHeight behavior incl. no-draw and chain-order, invariant accept/reject, vegetation defaults exact values and determinism, all chains validate); amend `openspec/changes/095-placed-feature-core/specs/placed-feature-core/spec.md` invariant line.
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
