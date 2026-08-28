# Spec: worker-worldgen

## Contract

Worldgen jobs MUST travel over 064 with a versioned envelope: `WorldgenRequestPayload
{ columnX, columnZ, seed, stage }` and `WorldgenResultPayload { identity..., generationVersion }`.
`validateWorldgenRequest`/`validateWorldgenResult` MUST strictly validate both shapes.
`processWorldgenRequest` MUST be pure and MUST return the identity-echoing envelope with
`generationVersion === WORLDGEN_PROTOCOL_VERSION`. `WorldgenWorkerClient` MUST dispatch valid,
identity-matching results exactly once and MUST reject stale, duplicate, and identity-mismatched
results without invoking callbacks.

## Definitions

- **Identity**: `{ columnX, columnZ, seed, stage }`.
- **generationVersion**: `WORLDGEN_PROTOCOL_VERSION` (1).

## Invariants

- Results always carry `generationVersion === 1`.
- Results always echo the request identity.
- Client dispatch is exactly-once per valid result; mismatches are dropped.
- Validation rejects non-integer columns, non-integer seeds, unknown 085 stages, and wrong
  versions with descriptive errors.

## Requirements

### Requirement: request validation
`validateWorldgenRequest` MUST accept exactly the valid shape.

#### Scenario: valid request
- **GIVEN** integer columns, an integer seed, and a known 085 stage
- **WHEN** validation runs
- **THEN** it returns the same value (narrowed).

#### Scenario: malformed requests rejected
- **GIVEN** fractional columns, a fractional/NaN seed, an unknown stage, or a non-object
- **WHEN** validation runs
- **THEN** it throws naming the field.

### Requirement: pure job
`processWorldgenRequest` MUST return the versioned identity-echoing envelope deterministically.

#### Scenario: envelope
- **GIVEN** a valid request
- **WHEN** the job runs
- **THEN** the result echoes identity, has `generationVersion: 1`, and identical requests produce
  identical results.

### Requirement: result validation
`validateWorldgenResult` MUST reject malformed or wrong-version results.

#### Scenario: version mismatch
- **GIVEN** a result with `generationVersion: 99` or a malformed shape
- **WHEN** validation runs
- **THEN** it throws.

### Requirement: client dispatch
The client MUST resolve valid identity-matching results exactly once and drop everything else.

#### Scenario: valid dispatch
- **GIVEN** a submitted request and a matching result message
- **WHEN** the message is handled
- **THEN** the callback runs once with the result, the job leaves the pending set, and the
  returned payload is the result.

#### Scenario: identity mismatch dropped
- **GIVEN** a submitted request for column (1, 2) and a result for column (9, 9)
- **WHEN** the message is handled
- **THEN** it returns null, invokes nothing, and the job is consumed (the caller re-submits; 064 resolves on any structurally valid result).

#### Scenario: stale and duplicate dropped
- **GIVEN** an unknown job id, a duplicate result, and a cancelled job
- **WHEN** their messages are handled
- **THEN** each returns null with no callback.

## Error and failure behavior

- Worker-side validation throws; client-side validation drops (returns null) — no partial
  dispatch.

## Performance and resource bounds

O(1) per job.

## Compatibility and migration

Additive; 064 and 085 reused unchanged.

## Security and integrity

Not applicable: no I/O; payloads validated.

## Observability

Rejected messages return null; tests assert exact callback sequences.

## Verification mapping

- `tests/unit/WorkerWorldgen.test.ts` — request/result validation, pure job, client dispatch
  (valid/mismatch/stale/duplicate/cancel), pendingCount.
