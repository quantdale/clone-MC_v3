# Tasks: 069-incremental-light-updates

> VERIFIED. Entry gate confirmed (068 VERIFIED; baseline 754 unit / 19 e2e green).

- [x] 1. Confirm entry gate (068 VERIFIED; baseline 754 unit / 19 e2e green).
- [x] 2. Add `src/rendering/LightUpdateEngine.ts` (`LightUpdateWorld`, `updateLightAfterEdit`; removal BFS zeroing dependent light without crossing opaque cells, re-add BFS from surviving light + source seeding, deterministic).
- [x] 3. Add `tests/unit/LightUpdateEngine.test.ts` (placement darkens, breaking lights up, new source propagates, equivalence with full recompute, determinism).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
