# Spec: resource-data-loader

## Contract

`resource-data-loader` provides a deterministic, source-agnostic loader that reads named data files
through an injected reader, decodes each with a 019 `VersionedCodec`, collects per-file
errors/warnings without aborting the batch, and can build a 003 `Registry` keyed by 002
`ResourceId`. No game schema is included.

## Definitions

- **ResourceReader**: `(name: string) => string | undefined` — returns file content or undefined when absent.
- **LoadFileError**: a per-file failure with a `reason` of `MISSING` or `DECODE`.
- **LoadedResource**: aggregated load result (`values`, `errors`, `warnings`, `ok`).

## Invariants

- Files are processed strictly in the supplied order; `values` preserve that order.
- A missing file is a `MISSING` error and MUST NOT abort the batch.
- A decode failure is a `DECODE` error and MUST NOT abort the batch; the failing file contributes no value.
- `ok` MUST be `true` iff `errors` is empty.
- `loadIntoRegistry` MUST register only successfully decoded values, keyed by 002 `ResourceId`; a
  duplicate key MUST be surfaced as an error and MUST NOT corrupt the registry.

## Requirements

### Requirement: deterministic ordered load
The loader MUST decode each file in order and return values in that order.

#### Scenario: loads all files in order
- **GIVEN** a loader with files `['a','b','c']` all present and valid
- **WHEN** `load()` is called
- **THEN** `values` has length 3 in order `a,b,c` and `ok` is true

### Requirement: missing files do not abort the batch
A missing file MUST be recorded as a `MISSING` error and other files still load.

#### Scenario: a middle file is missing
- **GIVEN** files `['a','missing','c']`
- **WHEN** `load()` is called
- **THEN** `errors` contains one `MISSING` for `missing`, `values` contains `a` and `c`, and `ok` is false

### Requirement: decode failures do not abort the batch
A decode failure MUST be recorded as a `DECODE` error and other files still load.

#### Scenario: a file fails to decode
- **GIVEN** files `['a','bad','c']` where `bad` is corrupt
- **WHEN** `load()` is called
- **THEN** `errors` contains one `DECODE` for `bad`, `values` contains `a` and `c`, and `ok` is false

### Requirement: registry build keys by ResourceId and rejects duplicates
`loadIntoRegistry` MUST build a 003 `Registry` from loaded values keyed by 002 `ResourceId`, and a
duplicate key MUST be surfaced as an error.

#### Scenario: builds a registry and reports a duplicate key
- **GIVEN** two successfully loaded values that map to the same `ResourceId`
- **WHEN** `loadIntoRegistry` is called
- **THEN** the result `errors` contains a duplicate-key error and the registry has exactly one entry for that id

## Error and failure behavior

All per-file failures are captured as `LoadFileError`s; the batch continues. `loadIntoRegistry`
wraps the 003 `DUPLICATE_ID` as an error.

## Performance and resource bounds

O(total bytes) read + decode; deterministic; no global state; browser-safe (no `fs` import).

## Compatibility and migration

Purely additive infrastructure; no persisted or call-site changes.

## Security and integrity

Integrity is delegated to the 019 codec (checksum) and schema validation; the loader adds ordering
and batch-error collection.

## Observability

`LoadedResource` exposes values, errors, and warnings, making partial loads debuggable.

## Verification mapping

- Ordered load, missing/decode handling, registry build/duplicate -> `tests/unit/ResourceDataLoader.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
