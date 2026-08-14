# Tasks: 030-chunk-status-model

> VERIFIED. Started only after 029 was VERIFIED.

- [x] 1. Confirm entry gate and run baseline (typecheck/lint/unit/e2e green at 449 unit / 19 e2e).
- [x] 2. Add `src/world/ChunkStatus.ts` (ordered enum + `chunkStatusOrdinal`/`isChunkStatusAtLeast`/`compareChunkStatus`/`chunkStatusName`).
- [x] 3. Add runtime-only `status` to `ChunkColumn` with `getStatus`/`setStatus`/`advanceStatusTo` (monotonic; default `Empty`; not serialized).
- [x] 4. Write `tests/unit/ChunkStatus.test.ts` (ordering, isAtLeast, compare, name, default/set/advance, serialize non-persistence).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, and E2E.
- [x] 6. Record evidence/state; mark VERIFIED; advance PROGRAM_STATE to 030; commit + push; activate 031 only after VERIFIED.
