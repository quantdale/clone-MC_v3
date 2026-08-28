# Tasks: 052-block-entity-framework

> IMPLEMENTED. 051 was VERIFIED; 052 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (051 VERIFIED; baseline 644 unit / 19 e2e green).
- [x] 2. Add `src/simulation/BlockEntityManager.ts` (`BlockEntityInstance` with tickable/onTick/data; `BlockEntityManager` add/remove/get/getForChunk/removeChunk/tickAll/serializeChunk/deserializeChunk/size/clear; one-per-position, insertion-order ticking, 036-envelope round-trip).
- [x] 3. Add `tests/unit/BlockEntityManager.test.ts` (lifecycle, duplicate rejection, chunk grouping, deterministic ticking, persistence round-trip + rejection).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
