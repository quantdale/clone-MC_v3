# Tasks: 091-surface-rule-engine

> VERIFIED. Entry gate confirmed (090 VERIFIED; baseline 1013 unit / 19 e2e green).

- [x] 1. Confirm entry gate (090 VERIFIED; baseline 1013 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/SurfaceRuleEngine.ts` (`SurfaceCondition` union always/biome/height/noise/not/and/or; `SurfaceRule` with depth; `SurfaceRuleContext` with noise sampler; `evaluateSurfaceCondition`; `applySurfaceRules` first-match with depth semantics; `validateSurfaceRules` strict with 64-depth cap).
- [x] 3. Add `tests/unit/SurfaceRuleEngine.test.ts` (condition matrix, first-match/depth/no-match, validation matrix, purity).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
