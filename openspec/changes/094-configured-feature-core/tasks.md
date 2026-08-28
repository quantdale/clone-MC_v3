# Tasks: 094-configured-feature-core

> VERIFIED. Entry gate confirmed (093 VERIFIED; baseline 1038 unit / 19 e2e green).

- [x] 1. Confirm entry gate (093 VERIFIED; baseline 1038 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/ConfiguredFeature.ts` (`ConfiguredFeatureConfig` union simpleBlock/blockPatch, `ConfiguredFeature`, strict `validateConfiguredFeatureConfig`/`validateConfiguredFeature`, `ConfiguredFeatureRegistry` with atomic rejection, `createDefaultConfiguredFeatures`).
- [x] 3. Add `tests/unit/ConfiguredFeature.test.ts` (validation matrix, registry lifecycle/atomicity, defaults, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
