# Tasks: 087-density-noise-router

> VERIFIED. Entry gate confirmed (086 VERIFIED; baseline 975 unit / 19 e2e green).

- [x] 1. Confirm entry gate (086 VERIFIED; baseline 975 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/DensityNoise.ts` (`hashNoise3D` FNV-1a [0,1); `smoothstep`/`lerp`; `ValueNoise3D` trilinear periodic value noise in [-1,1]; `fbm3D` octave sum with defaults 4/2/0.5).
- [x] 3. Add `src/worldgen/DensityComposition.ts` (`DensityNode` union: constant/yGradient/noise/add/multiply/scale/offset/min/max/clamp; `DensityContext`; `evaluateDensity` pure with fixed child order; `validateDensityNode` strict with 64-depth cap).
- [x] 4. Add `tests/unit/DensityNoise.test.ts` and `tests/unit/DensityComposition.test.ts` (range/determinism/lattice/period/fbm; per-node hand-computed fixtures, nested trees, validation matrix, purity).
- [x] 5. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
