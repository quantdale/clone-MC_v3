# Tasks: 079-lava-flow-simulation

> VERIFIED. Entry gate confirmed (078 VERIFIED; baseline 886 unit / 19 e2e green).

- [x] 1. Confirm entry gate (078 VERIFIED; baseline 886 unit / 19 e2e green).
- [x] 2. Add `src/simulation/LavaFlowEngine.ts` (`LAVA_FLOW_INTERVAL 30`, `FALLING_LEVEL 8`, `stepLavaCell` with validated `spreadRange`; corrected 078 rule order: ground conversion to `spreadRange - 1`, spread `L+1` only below `spreadRange`, removal at `spreadRange`; reuses 078 types).
- [x] 3. Add `tests/unit/LavaFlowEngine.test.ts` (spread chains 3/7, edge never spreads, ground conversion + pool, downward spawn, source formation, decay/removal, invalid ranges, cross no-ops, determinism, cadence constant).
- [x] 4. Correctness amendment to 078 (with 079): ground conversion → level 6 (max − 1); level-7 cells never spread; engine, tests, design.md, spec.md, verification.md updated.
- [x] 5. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
