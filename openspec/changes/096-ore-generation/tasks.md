# Tasks: 096-ore-generation

> VERIFIED. Entry gate confirmed (095 VERIFIED; baseline 1061 unit / 19 e2e green).

- [x] 1. Confirm entry gate (095 VERIFIED; baseline 1061 unit / 19 e2e green).
- [x] 2. Extend `src/worldgen/ConfiguredFeature.ts` with the `ore` config member (`blockId`, `size`, `discardChanceOnAirExposure` in [0,1], non-empty `targetTags`) and its strict validation; add `src/worldgen/OreFeature.ts` (`OreBlockTag`/`validateOreBlockTag`, `OreBlockTagRegistry` with atomic rejection, deterministic `resolveOreTargetBlockIds`, `createDefaultOreBlockTags`, `createDefaultOreConfiguredFeatures`, `createDefaultOrePlacedFeatures`).
- [x] 3. Update `tests/unit/ConfiguredFeature.test.ts` unknown-type stand-in (`ore` -> `portal`); add `tests/unit/OreFeature.test.ts` (ore config validation matrix, tag validation matrix, registry lifecycle/atomicity, resolution order/dedupe/unknown-tag errors, defaults exact values and determinism, cross-check default targets resolve).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
