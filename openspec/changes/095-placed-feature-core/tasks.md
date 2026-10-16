# Tasks: 095-placed-feature-core

> VERIFIED. Entry gate confirmed (094 VERIFIED; baseline 1044 unit / 19 e2e green).

- [x] 1. Confirm entry gate (094 VERIFIED; baseline 1044 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/PlacedFeature.ts` (`PlacementModifier` union count/rarity/heightRange/biomeFilter/survivalFilter, `PlacedFeature`, `PlacementContext`, deterministic `placeFeature`, strict `validatePlacementModifier`/`validatePlacedFeature` incl. one-count and survival-after-heightRange invariants, `PlacedFeatureRegistry` with atomic rejection).
- [x] 3. Add `tests/unit/PlacedFeature.test.ts` (modifier matrix, chain order, determinism with fixed-seed SeedRng, validation matrix incl. chain-invariant rejections, registry lifecycle/atomicity).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
