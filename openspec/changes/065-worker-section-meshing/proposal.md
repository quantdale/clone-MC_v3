# Proposal: 065-worker-section-meshing

## Problem

064 provides the worker message protocol, but section meshing still runs on the main thread. Moving
it off-thread needs a worker-executable job processor and a main-thread dispatcher with correlation.

## Goals

- Provide a pure, structured-clone-safe `processMeshSectionRequest`: turn a section's cells into
  merged `OpaqueFaceQuad`s via 062 (greedy merge), with the request/result payloads fully
  transferable (no functions — opacity is a plain id list).
- Provide a `MeshWorkerClient` that submits section jobs over the 064 protocol, resolves results via
  `WorkerJobClient` (stale rejection), and dispatches outcomes to per-job callbacks.

## Non-goals

- Instantiating real browser `Worker`s (game wiring; 065 is the headless-testable primitive).
- Lighting/vertex emission (070+); 065 meshes quad lists only.
- Job scheduling/budgeting (a later concern; the world's mesh queue stays as-is).

## Preconditions

- Change 064 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 064 baseline (730 unit / 19 e2e).

## Dependencies

- 064 protocol (`WorkerJobClient`, envelopes, validators).
- 062 `greedyMergeOpaqueFaces` (`OpaqueFaceQuad`).

## Proposed change

- `src/rendering/WorkerMeshing.ts` (NEW): `MeshSectionRequestPayload`, `MeshSectionResultPayload`,
  `processMeshSectionRequest(payload)`, `MeshWorkerClient`
  (`requestSection`/`handleMessage`/`cancel`/`pendingCount`).
- `tests/unit/WorkerMeshing.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Payloads must stay structured-clone-safe: `cells` is a plain array of `number | null`; `opaqueIds`
  a plain `number[]`; no functions or class instances.

## Rollback strategy

Revert the commit; the meshing layer is additive.

## Definition of Done

- `processMeshSectionRequest` returns quads identical to `greedyMergeOpaqueFaces` on equivalent
  inputs (equivalence test).
- `MeshWorkerClient.requestSection` registers a job + callback; `handleMessage` resolves via 064,
  invokes the callback once with the result, and returns it; stale/invalid messages return `null`
  without invoking callbacks.
- `cancel` makes a late result stale; `pendingCount` reflects pending jobs.
- Unit tests cover processing equivalence, client dispatch, stale rejection, cancel, and validation.
- Full gate green; 065 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 065 suite; E2E stays 19/19.
