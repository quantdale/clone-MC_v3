# Tasks: 045-render-interpolation

> IMPLEMENTED. 044 was VERIFIED; 045 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (044 VERIFIED; baseline 598 unit / 19 e2e green).
- [x] 2. Add `src/engine/RenderInterpolator.ts` (`RenderState`, `alphaFromAccumulator` clamped to [0,1], `RenderInterpolator` with `setState`/`interpolate`/`hasState`/`reset`; copy-on-set, mismatch fallback, first-state passthrough).
- [x] 3. Add `tests/unit/RenderInterpolator.test.ts` (endpoints, midpoint, clamping matrix, first state, reset, mismatch fallback, immutability).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
