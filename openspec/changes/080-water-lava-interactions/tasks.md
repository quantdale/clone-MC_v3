# Tasks: 080-water-lava-interactions

> VERIFIED. Entry gate confirmed (079 VERIFIED; baseline 896 unit / 19 e2e green).

- [x] 1. Confirm entry gate (079 VERIFIED; baseline 896 unit / 19 e2e green).
- [x] 2. Add `src/simulation/FluidInteraction.ts` (`FluidContactResult`, `resolveFluidContact` classic MC table with falling-as-flowing, `InteractionBlockIds`, `FluidInteractionWorld`, `applyFluidContact` clearing both fluids and placing the block at the lava cell).
- [x] 3. Add `tests/unit/FluidInteraction.test.ts` (full resolver matrix, apply per result kind, NONE non-mutation, falling classifications, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
