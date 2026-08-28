# Tasks: 086-worker-worldgen

> VERIFIED. Entry gate confirmed (085 VERIFIED; baseline 965 unit / 19 e2e green).

- [x] 1. Confirm entry gate (085 VERIFIED; baseline 965 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/WorkerWorldgen.ts` (`WORLDGEN_PROTOCOL_VERSION`, `WorldgenRequestPayload`/`WorldgenResultPayload`, `validateWorldgenRequest`/`validateWorldgenResult` strict, `processWorldgenRequest` pure identity-echoing envelope, `WorldgenWorkerClient` over 064 with identity-validated exactly-once dispatch and stale/duplicate/cancel rejection).
- [x] 3. Add `tests/unit/WorkerWorldgen.test.ts` (validation matrices, pure job, client dispatch scenarios, pendingCount).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
