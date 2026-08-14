# Tasks: 090-biome-source

> VERIFIED. Entry gate confirmed (089 VERIFIED; baseline 1007 unit / 19 e2e green).

- [x] 1. Confirm entry gate (089 VERIFIED; baseline 1007 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/BiomeSource.ts` (`biomeClimateTargets` documented mapping from 016 definitions; `BiomeSource` with injectable sampler, nearest-target selection, registration-order tie-break, `getBiome`/`getBiomeKey`).
- [x] 3. Add `tests/unit/BiomeSource.test.ts` (target mapping hand-computed, exact/nearest/tie selections, determinism, registry bound).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
