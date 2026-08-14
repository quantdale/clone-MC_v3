# Design: 065-worker-section-meshing

## Context / current state

064 defines the protocol; meshing is still main-thread.

## Target state

A pure `processMeshSectionRequest` (worker-executable) and a `MeshWorkerClient` (main-thread side)
correlating jobs to callbacks over 064.

## Invariants

- Request/result payloads are structured-clone-safe (plain arrays/numbers only).
- `processMeshSectionRequest` is a pure function: identical payloads → identical quads, and its
  output equals `greedyMergeOpaqueFaces` on equivalent inputs (cells → sampler, opaqueIds → predicate,
  merge key = block id).
- `requestSection` returns a job id and registers the callback; `handleMessage` validates + resolves
  through the 064 `WorkerJobClient` and invokes the callback exactly once on success; stale/invalid
  messages invoke nothing and return `null`.
- `cancel` removes a pending job (late results stale); `pendingCount` reflects pending jobs.

## API and data model

```ts
// src/rendering/WorkerMeshing.ts
export interface MeshSectionRequestPayload {
  sectionX: number; sectionY: number; sectionZ: number;
  cells: Array<number | null>; // 4096 entries; null = air
  opaqueIds: number[];         // block ids treated as opaque
}
export interface MeshSectionResultPayload {
  sectionX: number; sectionY: number; sectionZ: number;
  quads: OpaqueFaceQuad[];
}
export function processMeshSectionRequest(payload: MeshSectionRequestPayload): MeshSectionResultPayload;

export class MeshWorkerClient {
  constructor(opts?: { version?: number });
  requestSection(payload: MeshSectionRequestPayload, onResult: (result: MeshSectionResultPayload) => void): string;
  handleMessage(input: unknown): MeshSectionResultPayload | null;
  cancel(jobId: string): boolean;
  get pendingCount(): number;
}
```

## Control / data flow

1. The game (later wiring) calls `client.requestSection({ sectionX, sectionY, sectionZ, cells,
   opaqueIds }, onResult)` → job id; the worker executes `processMeshSectionRequest` and posts a 064
   `WorkerResult` whose payload is the result payload.
2. `handleMessage(input)` validates via the 064 client; on success it looks up the callback, invokes
   it with the result payload, and returns it; stale → `null`.

## Detailed behavior

- `processMeshSectionRequest`: builds a sampler from `cells` (index `x + 16*(y + 16*z)` → world cell
  offset by section origin), `isOpaque` from a Set of `opaqueIds`, `faceKey = (id) => String(id)`,
  then delegates to `greedyMergeOpaqueFaces`; quads are world-unit (cell coordinates included).
- `requestSection` wraps the payload in a 064 `WorkerRequest` envelope (version, kind
  `'mesh-section'`).

## Failure modes

- Malformed/version-mismatched messages → `null` from `handleMessage` (no callback, no throw).
- Malformed payloads (wrong cells length) → `processMeshSectionRequest` throws (worker-side error is
  reported by the wiring as a failed result).

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

Processing is O(6 × 16³) worst case (062); client bookkeeping is O(1).

## Testing seams

- `tests/unit/WorkerMeshing.test.ts`:
  - processing equivalence with 062 on fixture sections (empty, single cube, plain);
  - client: request → handleMessage with a matching result → callback invoked once with the result;
  - stale: unknown job id, duplicate resolve, cancelled job → `null`, no callback;
  - validation: version mismatch / malformed → `null`, pendingCount unchanged;
  - `pendingCount` lifecycle.

## Observability / debugging

`pendingCount` exposes in-flight mesh jobs.

## Affected files / symbols

- `src/rendering/WorkerMeshing.ts` — NEW.
- `tests/unit/WorkerMeshing.test.ts` — NEW.

## Rejected alternatives

- *Serializing closures to workers*: impossible (structured clone); the plain-payload design is the
  only transferable-safe shape.

## Downstream dependencies

The world mesh queue (later wiring) drives `MeshWorkerClient`; 070 (light-aware meshing) extends the
payload/result shapes.
