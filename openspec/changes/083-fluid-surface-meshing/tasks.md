# Tasks: 083-fluid-surface-meshing

> VERIFIED. Entry gate confirmed (082 VERIFIED; baseline 935 unit / 19 e2e green).

- [x] 1. Confirm entry gate (082 VERIFIED; baseline 935 unit / 19 e2e green).
- [x] 2. Add `src/rendering/FluidSurfaceMesher.ts` (`FluidSurfaceWorld`, `meshFluidSurface`, `meshFluidSurfaces`; top face at 076 surface height when uncovered; side faces vs air/block/different fluid full-depth and vs lower same-fluid step heights; zero-height skip; fixed emission order; 062-shaped quads with 070/071 corner data, blockId = fluidId).
- [x] 3. Add `tests/unit/FluidSurfaceMesher.test.ts` (top-face presence/plane per level class, side scenarios, identity, light/AO, order, batch determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
