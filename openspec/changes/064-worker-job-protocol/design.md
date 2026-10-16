# Design: 064-worker-job-protocol

## Context / current state

No worker message contract exists; 065 will move meshing off-thread.

## Target state

A versioned request/result envelope and a `WorkerJobClient` that correlates results to pending jobs
and rejects stale ones deterministically.

## Invariants

- `WORKER_PROTOCOL_VERSION = 1`; requests and results carry it; mismatched versions are rejected.
- `WorkerRequest`: `{ protocolVersion: 1, jobId, kind, payload }` — `jobId` non-empty string, `kind`
  non-empty string.
- `WorkerResult`: `{ protocolVersion: 1, jobId, ok: boolean, payload?, error? }` — `error` present
  only when `ok` is false; `payload` present only when `ok` is true.
- `WorkerJobClient.submit` registers a pending job (unique jobId, monotonic counter) and returns it.
- `resolveResult(message)` validates; for a pending job id it resolves once (removes it) and returns
  `{ jobId, ok, payload?, error? }`; for unknown/cancelled/already-resolved ids it returns `null`
  (stale rejection).
- `cancel(jobId)` removes a pending job; a later result for it is stale.
- Validation rejects malformed shapes without mutating the client.

## API and data model

```ts
// src/rendering/WorkerJobProtocol.ts
export const WORKER_PROTOCOL_VERSION = 1;
export interface WorkerRequest {
  protocolVersion: 1;
  jobId: string;
  kind: string;
  payload: unknown;
}
export interface WorkerResult {
  protocolVersion: 1;
  jobId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}
export interface ResolvedOutcome {
  jobId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}
export function validateWorkerRequest(input: unknown): WorkerRequest;
export function validateWorkerResult(input: unknown): WorkerResult;
export class WorkerJobClient {
  constructor(opts?: { version?: number });
  submit(kind: string, payload: unknown): string;
  resolveResult(input: unknown): ResolvedOutcome | null;
  cancel(jobId: string): boolean;
  get pendingCount(): number;
}
```

## Control / data flow

1. The main thread calls `submit('mesh-section', data)` → `jobId = 'job-1'`, stored in a pending map.
2. The worker processes and posts back a `WorkerResult`; the client calls `resolveResult(message)`.
3. Valid + pending → outcome returned once (pending removed). Anything else → `null`.

## Detailed behavior

- Job ids: `job-<counter>` starting at 1; ids are unique per client instance.
- `resolveResult` runs `validateWorkerResult` first (invalid → `null`, no mutation).
- `cancel` returns whether the job was pending.

## Failure modes

- Malformed/version-mismatched messages → rejected with `null` (never thrown from `resolveResult`).
- Stale results → `null`.

## Compatibility / migration

Additive; versioned for future evolution.

## Performance / resource constraints

Submit/resolve are O(1) (Map).

## Testing seams

- `tests/unit/WorkerJobProtocol.test.ts`:
  - submit returns unique ids and increments pendingCount;
  - resolveResult returns the outcome and decrements pendingCount;
  - duplicate resolution → second call returns `null` (stale);
  - unknown jobId → `null`;
  - version mismatch / malformed shapes → `null` without mutation;
  - cancel removes pending; its late result is stale;
  - `ok: false` results carry `error`; `ok: true` results carry `payload`.

## Observability / debugging

`pendingCount` exposes in-flight work.

## Affected files / symbols

- `src/rendering/WorkerJobProtocol.ts` — NEW.
- `tests/unit/WorkerJobProtocol.test.ts` — NEW.

## Rejected alternatives

- *Unversioned ad-hoc messages*: no evolution path and no validation; the versioned envelope is the
  minimal safe contract.

## Downstream dependencies

065 (worker section meshing) uses the protocol; 238 (stress) drives many concurrent jobs through it.
