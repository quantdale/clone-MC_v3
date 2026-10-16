# Tasks: 078-water-flow-simulation

> VERIFIED. Entry gate confirmed (077 VERIFIED; baseline 868 unit / 19 e2e green).

- [x] 1. Confirm entry gate (077 VERIFIED; baseline 868 unit / 19 e2e green).
- [x] 2. Add `src/simulation/WaterFlowEngine.ts` (`WaterWorldAccess`, `WaterStepResult`, `WATER_FLOW_INTERVAL 5`, `MAX_FLOW_LEVEL 7`, `FALLING_LEVEL 8`, `stepWaterCell`: downward spawn, falling-to-flowing conversion, horizontal spread with cap/improvement/falling protection, source formation, decay ladder with feeder/above guards; fixed neighbor order; affected reporting).
- [x] 3. Add `tests/unit/WaterFlowEngine.test.ts` (downward scenarios, ground conversion, spread scenarios, source formation, decay, non-water no-op, affected correctness, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
