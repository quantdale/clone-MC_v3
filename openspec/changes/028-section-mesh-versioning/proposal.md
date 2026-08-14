# Proposal: 028-section-mesh-versioning

## Problem

027 gives per-section dirty tracking so a mesher can target the few sections that changed. But there is no
per-section version counter: a mesh job queued for a section cannot tell whether the section was mutated
again before the job ran. Without section-level versioning, a stale job can rebuild geometry from outdated
block data, producing flicker or wrong faces, and there is no cheap guard to drop such jobs.

## Goals

- Add a monotonically increasing `meshVersion` to `ChunkSection` that increments on every mutation.
- Expose the version at the column level (`sectionMeshVersion(sy)`) and a stale-job guard
  (`isSectionStale(sy, capturedVersion)`).

## Non-goals

- No actual meshing, geometry generation, or rendering (029+ covers that). This change only provides the
  versioning primitive and stale-job predicate.
- No change to the existing chunk-level `meshVersion` in the streaming `World.ts`; this is the finer
  section-level counterpart.

## Preconditions

027 is VERIFIED. Depends on 023 (`ChunkSection`), 024 (`ChunkColumn`).

## Dependencies

- `src/world/ChunkSection.ts` (023)
- `src/world/ChunkColumn.ts` (024)

## Proposed change

- `ChunkSection` gains a `meshVersion` field (starts at 0) and a `get meshVersion()` accessor; every
  mutation path (`set`/`setAt`/`setStateId`/`fill`) bumps it.
- `ChunkColumn` gains `sectionMeshVersion(sy)` (returns the section's version, or 0 for an untouched
  section) and `isSectionStale(sy, capturedVersion)` (true when the current version differs from a captured
  one).

## Compatibility and migration

Additive; no call-site or persisted-data changes. Serialization is unaffected (the version is runtime-only).

## Risks

- Over-bumping on no-op writes would invalidate an otherwise-valid mesh job. Mitigated by accepting
  over-bumping: a stale-discarded job only triggers a redundant re-mesh of genuinely changed data, which is
  safe and bounded.
- Confusing a section's baseline version with a non-zero value. Mitigated by defining untouched sections as
  version 0 and bumping only on actual mutation calls.

## Rollback strategy

Additive fields/methods; reverting the commit removes them with no downstream impact (029 not yet implemented).

## Definition of Done

`ChunkSection.meshVersion` increments on mutation; `ChunkColumn.sectionMeshVersion`/`isSectionStale` behave;
unit tests cover bumps, untouched-zero, and stale detection; full regression gate is green.

## Advancement gate

029 starts only after 028 is 100% complete and VERIFIED.
