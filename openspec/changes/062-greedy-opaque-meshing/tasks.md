# Tasks: 062-greedy-opaque-meshing

> IMPLEMENTED. 061 was VERIFIED; 062 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (061 VERIFIED; baseline 711 unit / 19 e2e green).
- [x] 2. Add `src/rendering/GreedyMesher.ts` (`OpaqueFaceQuad`, `FaceCellSampler`, `OpaquePredicate`, `FaceKeyFn`, `greedyMergeOpaqueFaces`, `enumerateOpaqueFacesNaive`; per-face/slice visibility grids, row-major greedy rectangles, deterministic).
- [x] 3. Add `tests/unit/GreedyMesher.test.ts` (empty, single cube, slab merge, key separation, equivalence matrix, determinism).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
