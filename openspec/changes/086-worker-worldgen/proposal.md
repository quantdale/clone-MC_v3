# Proposal: 086-worker-worldgen

## Problem

Worldgen stages (087+) must run off the main thread with versioned, validated results. No worker
framework exists for worldgen jobs; 064/065 cover meshing only.

## Goals

- A versioned worldgen job protocol: `WorldgenRequestPayload` (column + seed + 085 stage) and a
  `WorldgenResultPayload` envelope carrying `generationVersion`, validated strictly on both sides.
- `processWorldgenRequest`: the pure worker-side job (validates, echoes the versioned envelope —
  stage bodies land in 087+).
- `WorldgenWorkerClient` over 064: submit/handleMessage/cancel/pendingCount with stale rejection
  AND result-identity validation (column/seed must match the request; mismatches are rejected as
  stale, mirroring 065).

## Non-goals

- Stage implementations (087-097).
- Multiple worker pools/priorities (a later wiring concern).
- Actual terrain data in results (stage outputs arrive with their stages).

## Preconditions

- Change 085 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 085 baseline (965 unit / 19 e2e).

## Dependencies

- 064 `WorkerJobProtocol`/`WorkerJobClient`; 085 `validateGenerationStage`.

## Proposed change

- `src/worldgen/WorkerWorldgen.ts` (NEW): `WORLDGEN_PROTOCOL_VERSION`, `WorldgenRequestPayload`,
  `WorldgenResultPayload`, `validateWorldgenRequest`, `validateWorldgenResult`,
  `processWorldgenRequest`, `WorldgenWorkerClient`.
- `tests/unit/WorkerWorldgen.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Result identity validation must not reject legitimate re-issued jobs (identity = column + seed +
  stage, not the job id — 064 handles job ids).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Requests/results validate strictly (integer columns, integer seed, known 085 stage, exact
  version); validation errors are descriptive.
- `processWorldgenRequest` is pure and deterministic; results echo the request identity and carry
  `generationVersion`.
- The client dispatches exactly-once on valid, identity-matching results; stale/duplicate/
  mismatched results are rejected without callbacks.
- Full gate green; 086 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 086 suite; E2E stays 19/19.
