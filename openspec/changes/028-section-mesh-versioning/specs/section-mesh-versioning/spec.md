# Spec: section-mesh-versioning

## Contract

`section-mesh-versioning` adds a monotonic per-section `meshVersion` to `ChunkSection` (023) and exposes it
through `ChunkColumn` (024) so a queued section mesh job can detect — and discard — stale work when the
section was mutated again before the job ran. It is the finer-than-chunk versioning counterpart to the
streaming `World.ts` chunk-level guard, delivered as a reusable storage primitive.

## Definitions

- **meshVersion**: a per-`ChunkSection` counter, starting at `0`, incremented by exactly `1` on every
  mutation.
- **Stale job**: a mesh job whose captured `sectionMeshVersion` no longer equals the section's current
  version when the job runs.

## Invariants

- `ChunkSection.meshVersion` MUST start at `0` and increase by `1` on every `set` call (the only mutation
  entry point); `setAt`/`setStateId`/`fill` MUST all bump it.
- An untouched section's version MUST be `0`.
- `ChunkColumn.sectionMeshVersion(sy)` MUST return `0` for an untouched section, else its current version.
- `isSectionStale(sy, captured)` MUST equal `sectionMeshVersion(sy) !== captured`.

## Requirements

### Requirement: section mesh version increments on every mutation
`ChunkSection.meshVersion` MUST start at `0` and MUST increase by `1` each time its block data is mutated
through any public mutator.

#### Scenario: fresh section
- **GIVEN** a new `ChunkSection`
- **THEN** `meshVersion` is `0`

#### Scenario: each mutator bumps once
- **GIVEN** a `ChunkSection`
- **WHEN** `set`, `setAt`, `setStateId`, and `fill` are each called once
- **THEN** `meshVersion` is `4`

### Requirement: untouched sections read as version 0 through the column
`ChunkColumn.sectionMeshVersion(sy)` MUST return `0` for a section that has never been written.

#### Scenario: untouched section
- **GIVEN** a `ChunkColumn` with no writes
- **WHEN** `sectionMeshVersion(2)` is read
- **THEN** it returns `0`

### Requirement: stale-job guard detects post-queue mutation
`isSectionStale(sy, captured)` MUST return true when the section changed after `captured` was recorded, and
false when it is unchanged.

#### Scenario: mutated after capture
- **GIVEN** a `ChunkColumn` with a written section at `sy`
- **WHEN** the version is captured, then the section is mutated again
- **THEN** `isSectionStale(sy, captured)` is `true`

#### Scenario: unchanged after capture
- **GIVEN** a `ChunkColumn` with a written section at `sy`
- **WHEN** the version is captured and no further mutation occurs
- **THEN** `isSectionStale(sy, captured)` is `false`

### Requirement: serialization does not persist the runtime version
`serialize`/`deserialize` MUST round-trip block data without carrying `meshVersion`; a deserialized section
restarts at version `0`.

#### Scenario: round-trip resets version
- **GIVEN** a mutated `ChunkSection`
- **WHEN** it is serialized and deserialized
- **THEN** the deserialized section's `meshVersion` is `0`

## Error and failure behavior

- Reading the version of a never-touched section → `0` (no allocation, no throw).
- `isSectionStale` on an out-of-range `sy` → `sectionMeshVersion` returns `0`, so a captured `0` is not stale
  and a captured non-zero is stale.

## Performance and resource bounds

O(1) version read/bump and stale check; one extra number per section; no allocation on read.

## Compatibility and migration

Additive; no persisted or call-site changes. 023/024 public APIs unchanged.

## Security and integrity

No external input; the counter is local state.

## Observability

`meshVersion` is a plain number readable by the mesher to decide job validity.

## Verification mapping

- All scenarios → `tests/unit/SectionMeshVersioning.test.ts`
- Full gate → typecheck, lint, unit, build, e2e
