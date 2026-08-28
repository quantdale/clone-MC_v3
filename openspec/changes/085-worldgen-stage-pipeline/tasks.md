# Tasks: 085-worldgen-stage-pipeline

> VERIFIED. Entry gate confirmed (084 VERIFIED; baseline 954 unit / 19 e2e green).

- [x] 1. Confirm entry gate (084 VERIFIED; baseline 954 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/GenerationPipeline.ts` (`GENERATION_STAGES` ordered vocabulary, `GenerationStageId`, `stageIndex`, `nextStage`, `validateGenerationStage`, `GenerationStageTransition`, `GenerationPipeline` with forward-only `advanceTo`, same-stage no-op, backward throw, `getStage`/`isAtLeast`/`isComplete`, per-column independence).
- [x] 3. Add `tests/unit/GenerationPipeline.test.ts` (vocabulary order/validation, forward/same/backward transitions, status queries, independence, determinism).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
