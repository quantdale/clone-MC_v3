# Spec: worker-job-protocol

## Contract

Worker communication MUST use a versioned request/result envelope with per-job correlation and
deterministic stale-result rejection. `WorkerRequest`/`WorkerResult` MUST validate strictly; a
`WorkerJobClient` MUST track pending jobs by id, resolve each exactly once, MUST return `null` for
stale (unknown/cancelled/already-resolved) results, and MUST support `cancel`.

## Definitions

- **WorkerRequest**: `{ protocolVersion: 1, jobId, kind, payload }`.
- **WorkerResult**: `{ protocolVersion: 1, jobId, ok, payload?, error? }` — `payload` only when
  `ok`; `error` only when not `ok`.
- **Stale result**: a result whose job id is unknown, cancelled, or already resolved.

## Invariants

- Requests/results carry `WORKER_PROTOCOL_VERSION`; mismatched versions are rejected.
- `submit` returns a unique non-empty job id and registers the job pending.
- `resolveResult` validates first (no mutation on invalid input), resolves a pending job exactly once,
  and returns `null` for stale results.
- `cancel` removes a pending job; its late result is stale.
- `pendingCount` reflects pending jobs.

## Requirements

### Requirement: submission and unique ids
`submit(kind, payload)` MUST register a pending job and return a unique id.

#### Scenario: multiple submissions
- **GIVEN** a fresh client
- **WHEN** `submit` runs twice
- **THEN** both ids are non-empty and distinct, and `pendingCount` is 2.

### Requirement: single resolution
`resolveResult` MUST resolve a pending job exactly once, returning its outcome; a second resolution of
the same id MUST return `null`.

#### Scenario: duplicate resolve
- **GIVEN** a submitted job `jobId`
- **WHEN** `resolveResult` runs twice with a valid result for `jobId`
- **THEN** the first returns the outcome and `pendingCount` drops by 1; the second returns `null`.

### Requirement: stale rejection
Results for unknown or cancelled jobs MUST return `null`.

#### Scenario: unknown and cancelled
- **GIVEN** a client with no pending job `'ghost'`, and a submitted job that is then cancelled
- **WHEN** `resolveResult` runs for `'ghost'` and for the cancelled job
- **THEN** both return `null` and `pendingCount` is unchanged.

### Requirement: validation
Version mismatches and malformed shapes MUST be rejected without mutating the client.

#### Scenario: invalid messages
- **GIVEN** results with wrong `protocolVersion`, missing `jobId`, and `ok: false` without `error`
- **WHEN** `resolveResult` runs on each
- **THEN** each returns `null` and no pending job is removed.

### Requirement: outcome payload rules
`ok: true` results MUST carry `payload`; `ok: false` results MUST carry `error`.

#### Scenario: outcomes
- **GIVEN** submitted jobs
- **WHEN** resolved with `ok: true` and `ok: false` results
- **THEN** the returned outcomes carry the payload and error respectively.

## Error and failure behavior

- Invalid messages → `null` from `resolveResult` (never throws).

## Performance and resource bounds

Submit/resolve/cancel are O(1).

## Compatibility and migration

Additive; versioned for future protocol evolution.

## Security and integrity

Strict validation + stale rejection prevent out-of-order or duplicate worker messages from corrupting
main-thread state.

## Observability

`pendingCount` exposes in-flight work.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Submission and unique ids | distinct ids, pendingCount |
| Single resolution | outcome once; second null |
| Stale rejection | unknown/cancelled → null |
| Validation | version/shape mismatches rejected without mutation |
| Outcome payload rules | payload on ok; error on failure |
