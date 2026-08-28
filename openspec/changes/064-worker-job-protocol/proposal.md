# Proposal: 064-worker-job-protocol

## Problem

Moving meshing off the main thread (065) needs a safe message contract: versioned requests/results
with per-job correlation. Without a protocol, malformed or *stale* worker messages (a result for a
job that was cancelled or already resolved) can corrupt the main-thread state.

## Goals

- Define a versioned `WorkerRequest`/`WorkerResult` envelope (`WORKER_PROTOCOL_VERSION = 1`) with
  validation.
- Provide a `WorkerJobClient` that tracks pending jobs by id, resolves results once, and **rejects
  stale results** (unknown/cancelled/already-resolved job ids) deterministically.
- `cancel(jobId)` removes a pending job so its late result is treated as stale.

## Non-goals

- Actual worker plumbing (065 wires the protocol into workers).
- Transferable-object lists (the envelope carries `payload`; transfer lists are a transport concern
  handled by the wiring).
- Retry/timeout policies (a later concern).

## Preconditions

- Change 063 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 063 baseline (724 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/rendering/WorkerJobProtocol.ts` (NEW): `WORKER_PROTOCOL_VERSION`, `WorkerRequest`,
  `WorkerResult`, `validateWorkerRequest`, `validateWorkerResult`, `WorkerJobClient`
  (`submit`/`resolveResult`/`cancel`/`pendingCount`).
- `tests/unit/WorkerJobProtocol.test.ts` (NEW).

## Compatibility and migration

Additive; versioned for future protocol evolution.

## Risks

- Stale-result handling must be strictly deterministic: a result for an unknown, cancelled, or
  already-resolved job id is dropped (returns `null`).

## Rollback strategy

Revert the commit; the protocol is additive.

## Definition of Done

- `submit` registers a pending job and returns its id; `pendingCount` reflects it.
- `resolveResult` validates version/shape, resolves the matching pending job exactly once, and returns
  the outcome; stale results return `null` and are never dispatched twice.
- `cancel` removes a pending job; its late result is stale.
- Unit tests cover submit/resolve, duplicate resolution, unknown ids, version mismatch, malformed
  messages, cancel, and pendingCount.
- Full gate green; 064 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 064 suite; E2E stays 19/19.
