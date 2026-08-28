# Tasks: 064-worker-job-protocol

> IMPLEMENTED. 063 was VERIFIED; 064 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (063 VERIFIED; baseline 724 unit / 19 e2e green).
- [x] 2. Add `src/rendering/WorkerJobProtocol.ts` (`WORKER_PROTOCOL_VERSION`, `WorkerRequest`, `WorkerResult`, `ResolvedOutcome`, `validateWorkerRequest`/`validateWorkerResult`, `WorkerJobClient` with `submit`/`resolveResult`/`cancel`/`pendingCount`; stale rejection, validate-before-mutate).
- [x] 3. Add `tests/unit/WorkerJobProtocol.test.ts` (submission/ids, single resolution, stale rejection, validation, outcome payload rules).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
