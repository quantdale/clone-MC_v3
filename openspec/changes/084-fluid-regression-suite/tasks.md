# Tasks: 084-fluid-regression-suite

> VERIFIED. Entry gate confirmed (083 VERIFIED; baseline 945 unit / 19 e2e green).

- [x] 1. Confirm entry gate (083 VERIFIED; baseline 945 unit / 19 e2e green).
- [x] 2. Add `tests/unit/FluidRegression.test.ts` (test-local `RegressionWorld` + deterministic 077 wiring: water step → lava-contact checks → waterlogging interception → re-schedule).
- [x] 3. Add the fixture matrix: corridor fill (exact 7 ticks), waterfall pool, source-pool formation, decay after removal, boundaries (edges + walls), unload/reload (047 round-trip equivalence), bounded work (64×64, maxPerTick 50, tick/work bounds, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit test dir; update PROGRAM_STATE; push; advance.
