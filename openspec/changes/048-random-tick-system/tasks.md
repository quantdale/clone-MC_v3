# Tasks: 048-random-tick-system

> IMPLEMENTED. 047 was VERIFIED; 048 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (047 VERIFIED; baseline 619 unit / 19 e2e green).
- [x] 2. Add `src/simulation/RandomTickSelector.ts` (`RANDOM_TICKS_PER_SUB_CHUNK = 3`, `hash32` FNV-1a, `RandomTickSelector` with `selectForSection`/`selectEligible`; pure seeded selection, bounds, with-replacement sampling, bounded eligibility attempts).
- [x] 3. Add `tests/unit/RandomTickSelector.test.ts` (determinism, bounds, tick/seed variation, count 0, eligibility filtering, never-true terminates).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
