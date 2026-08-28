# Tasks: 082-fluid-collision-movement

> VERIFIED. Entry gate confirmed (081 VERIFIED; baseline 916 unit / 19 e2e green).

- [x] 1. Confirm entry gate (081 VERIFIED; baseline 916 unit / 19 e2e green).
- [x] 2. Add `src/simulation/FluidMovement.ts` (`FluidMovementWorld`, `FluidImmersion`, `fluidDragFactor` (clamp(1.1 - 0.3d)), `applyFluidDrag` (factor^tickDelta, input untouched), `buoyancyAcceleration` (g*max(0, 1-ed/fd)), `eyeFluid`, `fluidHeightAt` (topmost fluid top in window), `submergedFraction` (clamped), `isFullySubmerged`, `immersion`).
- [x] 3. Add `tests/unit/FluidMovement.test.ts` (drag factors/clamp/validation, compounding, identity, buoyancy, eye-fluid, height scan, submersion cases, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
