# Tasks: 093-aquifer-system

> VERIFIED. Entry gate confirmed (092 VERIFIED; baseline 1030 unit / 19 e2e green).

- [x] 1. Confirm entry gate (092 VERIFIED; baseline 1030 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/AquiferSystem.ts` (`AquiferDecision`, `AquiferConfig` defaults sea 63/lava -54/dry 0.4, `AquiferBlockIds` defaults 8/10, `classifyAquifer` documented table with dryness noise, `applyAquifers` pure fill of carved cells).
- [x] 3. Add `tests/unit/AquiferSystem.test.ts` (exact tables with forced dryness, default determinism, applyAquifers fill/preserve/purity, config validation).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
