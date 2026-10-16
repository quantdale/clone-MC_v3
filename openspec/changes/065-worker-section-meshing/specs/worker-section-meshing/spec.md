# Spec: worker-section-meshing

## Contract

Section meshing MUST be expressible as a pure, structured-clone-safe job (`processMeshSectionRequest`)
and dispatched through the 064 protocol by a `MeshWorkerClient` that correlates results to per-job
callbacks, resolving each exactly once and rejecting stale results.

## Definitions

- **MeshSectionRequestPayload**: `{ sectionX, sectionY, sectionZ, cells: Array<number | null>,
  opaqueIds: number[] }` — `cells` has 4096 entries (index `x + 16*(y + 16*z)`), `null` = air.
- **MeshSectionResultPayload**: `{ sectionX, sectionY, sectionZ, quads: OpaqueFaceQuad[] }`.
- **Stale result**: a result for an unknown, cancelled, or already-resolved job id.

## Invariants

- Payloads contain only plain arrays/numbers (structured-clone-safe).
- `processMeshSectionRequest` is pure and equals `greedyMergeOpaqueFaces` on equivalent inputs (merge
  key = block id).
- `requestSection` registers a job + callback and returns a unique id.
- `handleMessage` invokes the callback at most once per job (only on a valid, pending resolution) and
  returns the result; stale/invalid messages return `null` without invoking callbacks.
- `cancel` removes a pending job; `pendingCount` reflects pending jobs.

## Requirements

### Requirement: processing equivalence
`processMeshSectionRequest` MUST produce the same quads as `greedyMergeOpaqueFaces` given equivalent
cells/opacity.

#### Scenario: fixtures
- **GIVEN** fixture sections (empty, single cube, 2×1 slab)
- **WHEN** processed via `processMeshSectionRequest` and via `greedyMergeOpaqueFaces` with equivalent
  inputs
- **THEN** the quad lists are equal.

### Requirement: client dispatch
`requestSection` + `handleMessage` MUST deliver the result to the callback exactly once.

#### Scenario: round-trip
- **GIVEN** a submitted section job
- **WHEN** `handleMessage` runs with a valid 064 result whose payload is the result payload
- **THEN** the callback is invoked once with the payload, the returned value equals it, and
  `pendingCount` is 0.

### Requirement: stale rejection
`handleMessage` MUST return `null` without invoking callbacks for stale results.

#### Scenario: unknown, duplicate, cancelled
- **GIVEN** a submitted job
- **WHEN** a result for an unknown id, a second result for the same job, and a result after `cancel`
  are handled
- **THEN** each returns `null` and no callback fires.

### Requirement: validation
Version mismatches and malformed messages MUST return `null` without mutation.

#### Scenario: invalid messages
- **GIVEN** a submitted job
- **WHEN** results with a wrong protocol version, a missing payload, and `null` are handled
- **THEN** each returns `null` and `pendingCount` is unchanged.

### Requirement: pending lifecycle
`pendingCount` MUST track submitted minus resolved/cancelled jobs.

#### Scenario: lifecycle
- **GIVEN** two submissions
- **WHEN** one resolves and the other is cancelled
- **THEN** `pendingCount` is 0.

## Error and failure behavior

- Malformed request payloads throw from `processMeshSectionRequest` (worker-side, reported as a
  failed result by the wiring).
- Invalid messages return `null` from `handleMessage` (never throws).

## Performance and resource bounds

Processing O(6 × 16³) worst case; client bookkeeping O(1).

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Pure processing + stale rejection keep worker results from corrupting main-thread state.

## Observability

`pendingCount` exposes in-flight mesh jobs.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Processing equivalence | fixtures equal to greedyMergeOpaqueFaces |
| Client dispatch | callback once, returned value, pending 0 |
| Stale rejection | unknown/duplicate/cancelled → null, no callback |
| Validation | version/shape mismatches → null, unchanged |
| Pending lifecycle | resolve + cancel → pending 0 |
