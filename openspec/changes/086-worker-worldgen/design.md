# Design: 086-worker-worldgen

## Context / current state

064 provides a generic worker job protocol; 065 wraps it for meshing. Worldgen has no worker
framework.

## Target state

`WorldgenWorkerClient` submits versioned worldgen jobs over 064 and resolves exactly-once,
identity-validated results. `processWorldgenRequest` is the pure worker-side job (envelope only —
stage bodies follow in 087+).

## Invariants

- `generationVersion === WORLDGEN_PROTOCOL_VERSION` in every result.
- Results echo the request identity (`columnX`, `columnZ`, `seed`, `stage`).
- `validateWorldgenRequest`/`validateWorldgenResult` reject malformed payloads with descriptive
  errors.
- The client rejects stale (064), duplicate, and identity-mismatched results without invoking
  callbacks; a mismatch consumes the job (caller re-submits); valid results invoke the callback
  exactly once.

## API and data model

```ts
// src/worldgen/WorkerWorldgen.ts (NEW)
export const WORLDGEN_PROTOCOL_VERSION = 1;
export interface WorldgenRequestPayload {
  columnX: number; columnZ: number; seed: number; stage: string;
}
export interface WorldgenResultPayload {
  columnX: number; columnZ: number; seed: number; stage: string;
  generationVersion: number;
}
export function validateWorldgenRequest(input: unknown): WorldgenRequestPayload;
export function validateWorldgenResult(input: unknown): WorldgenResultPayload;
export function processWorldgenRequest(payload: WorldgenRequestPayload): WorldgenResultPayload;
export class WorldgenWorkerClient {
  submit(payload: WorldgenRequestPayload, onResult: (result: WorldgenResultPayload) => void): string;
  handleMessage(input: unknown): WorldgenResultPayload | null;
  cancel(jobId: string): boolean;
  get pendingCount(): number;
  static resultMessage(jobId: string, payload: WorldgenResultPayload): unknown;
}
```

## Control / data flow

1. The wiring submits column requests (`stage` from 085 pipeline status).
2. Workers run `processWorldgenRequest` (validation + envelope).
3. The client validates every result: protocol shape via `validateWorldgenResult`, then identity
   against the stored request payload; mismatches are dropped (stale).
4. Valid results dispatch to the per-job callback exactly once. Identity mismatches consume the
   job (064 resolves on any structurally valid result) but invoke no callback — the caller
   re-submits.

## Detailed behavior

- Validation: integer `columnX`/`columnZ`, integer `seed`, known 085 stage, exact
  `generationVersion` (results only).
- `processWorldgenRequest` returns `{ ...identity, generationVersion: 1 }` — deterministic.
- The client stores the submitted payload per job id; `handleMessage` resolves via 064 and then
  compares identity; non-matching payloads return null and invoke nothing.

## Failure modes

- Malformed payloads throw at validation (worker side) or are dropped (client side, like 065
  stale results).
- No partial dispatch: a result either resolves fully or not at all.

## Compatibility / migration

Additive; 064/085 reused unchanged.

## Performance / resource constraints

O(1) per job; identity comparison is field equality.

## Testing seams

- `tests/unit/WorkerWorldgen.test.ts` (NEW): request/result validation matrices; pure
  `processWorldgenRequest` (identity echo, determinism); client dispatch (exactly-once,
  identity-mismatch rejection, stale/duplicate/cancel via 064 semantics, pendingCount).

## Observability / debugging

Rejected results return null (observable); tests assert exact callbacks.

## Affected files / symbols

- `src/worldgen/WorkerWorldgen.ts` — NEW.
- `tests/unit/WorkerWorldgen.test.ts` — NEW.

## Rejected alternatives

- *Extend 065's client*: meshing-specific; a dedicated worldgen client keeps concerns separate
  while reusing 064.
- *No identity validation*: versioned results are the change's contract; identity checks make
  stale cross-column results impossible.

## Downstream dependencies

087+ fill stage bodies inside `processWorldgenRequest`; the world wiring drives the client from
the 085 pipeline.
