# Tasks: 081-waterlogging-state

> VERIFIED. Entry gate confirmed (080 VERIFIED; baseline 905 unit / 19 e2e green).

- [x] 1. Confirm entry gate (080 VERIFIED; baseline 905 unit / 19 e2e green).
- [x] 2. Add `src/world/Waterlogging.ts` (`WaterloggedCell`, `validateWaterloggingLevel` (0 or 8-15 only), `waterlog`, `waterloggingLevelFromFluid` (flowing→0), `fluidLevelFromWaterlogging`, `withWaterLevel` (null → null), `isWaterloggable` set membership).
- [x] 3. Add `tests/unit/Waterlogging.test.ts` (level validation, construction, conversion directions, transitions, membership, purity).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
