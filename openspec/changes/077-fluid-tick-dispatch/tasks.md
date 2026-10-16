# Tasks: 077-fluid-tick-dispatch

> VERIFIED. Entry gate confirmed (076 VERIFIED; baseline 860 unit / 19 e2e green).

- [x] 1. Confirm entry gate (076 VERIFIED; baseline 860 unit / 19 e2e green).
- [x] 2. Add `src/simulation/FluidTickDispatcher.ts` (`FluidTickHandler`, `FluidTickDispatchReport`, `DEFAULT_MAX_FLUID_TICKS_PER_TICK`, `FluidTickDispatcher` with validated budget, relative scheduling via 047, bounded deterministic dispatch with deferral, pendingCount/clear).
- [x] 3. Add `tests/unit/FluidTickDispatcher.test.ts` (scheduling/dedupe, deterministic order, budget exceeded/within, handler args + self-rescheduling, not-yet-due, lifecycle, budget validation, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
