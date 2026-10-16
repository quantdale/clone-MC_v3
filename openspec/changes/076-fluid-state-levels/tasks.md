# Tasks: 076-fluid-state-levels

> VERIFIED. Entry gate confirmed (075 VERIFIED; baseline 851 unit / 19 e2e green).

- [x] 1. Confirm entry gate (075 VERIFIED; baseline 851 unit / 19 e2e green).
- [x] 2. Add `src/world/FluidState.ts` (`FluidLevel`, `FluidState`, level constants, `validateFluidLevel`, `createFluidState`, `isFluidSource`, `isFluidFalling`, `fluidSurfaceHeight`, `fluidFallingHeight`; MC level semantics 0 source / 1-7 flowing / 8-15 falling).
- [x] 3. Add `tests/unit/FluidState.test.ts` (level validation matrix, construction, source/falling classification across all 16 levels, height curves, purity).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
