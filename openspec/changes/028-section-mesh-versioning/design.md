# Design: 028-section-mesh-versioning

## Context / current state

023 `ChunkSection` funnels all mutations through a single `set(localIndex, state)` method (`setAt`/
`setStateId`/`fill` call it). 024 `ChunkColumn` groups sections and tracks dirty indices (027) but has no
version counter per section. The streaming `World.ts` has a chunk-level `meshVersion` stale guard, but the
storage stack lacks a section-level equivalent, so a queued section mesh job cannot detect that its section
changed again before it ran.

## Target state

`ChunkSection` carries a `meshVersion` that increments on every mutation; `ChunkColumn` exposes the version
per section and a `isSectionStale` predicate for stale-job protection.

## Invariants

- `ChunkSection.meshVersion` MUST start at `0` and MUST increase by exactly `1` on every `set` call (the only
  mutation entry point).
- An untouched/air section's version MUST be `0`.
- `ChunkColumn.sectionMeshVersion(sy)` MUST return `0` when the section at `sy` is untouched, else the
  section's current `meshVersion`.
- `isSectionStale(sy, captured)` MUST return `sectionMeshVersion(sy) !== captured`.

## API and data model

```ts
// 023 ChunkSection (additive)
export class ChunkSection {
  private meshVersionInternal = 0;
  get meshVersion(): number;
}

// 024 ChunkColumn (additive)
export class ChunkColumn {
  sectionMeshVersion(sy: number): number;
  isSectionStale(sy: number, capturedVersion: number): boolean;
}
```

## Control / data flow

`ChunkSection.set(localIndex, state)` performs `this.storage.set(...)` then `this.meshVersionInternal++`.
All higher-level mutators (`setAt`, `setStateId`, `fill`) call `set`, so they all bump the version without
duplication. `ChunkColumn.sectionMeshVersion` reads `this.sections.get(sy)?.meshVersion ?? 0`
(noUncheckedIndexedAccess-safe via optional chaining). `isSectionStale` compares against the captured value.

## Detailed behavior

- Serialization (`serialize`/`deserialize`) is unchanged; `meshVersion` is runtime-only and not persisted.
- A mesh job captures `column.sectionMeshVersion(sy)` at queue time and, before building geometry, checks
  `column.isSectionStale(sy, captured)`; if stale, the job is dropped and re-queued with the new version
  (the same discipline the streaming `World.ts` already applies at chunk granularity).
- Over-bumping (e.g. re-setting the same value) only invalidates a queued job; the resulting re-mesh reflects
  the current data, which is correct and bounded.

## Failure modes

- Reading the version of a never-touched section → `0` (no throw, no allocation).
- `isSectionStale` with an out-of-range `sy` → `sectionMeshVersion` returns `0`, so a captured `0` is not
  stale and a captured non-zero is stale (the section never existed at queue time).

## Compatibility / migration

Additive; no persisted or call-site changes. 023/024 existing APIs untouched.

## Performance / resource constraints

O(1) version read/bump and stale check; zero extra memory per section (one number).

## Testing seams

`tests/unit/SectionMeshVersioning.test.ts` covers: version starts at 0; increments once per `set`/`setAt`/
`setStateId`/`fill`; untouched section reads 0 via the column; `isSectionStale` true after a later mutation and
false when unchanged; serialize round-trip does not preserve the runtime version (fresh 0).

## Affected files / symbols

- `src/world/ChunkSection.ts` (add `meshVersion`)
- `src/world/ChunkColumn.ts` (add `sectionMeshVersion`/`isSectionStale`)
- `tests/unit/SectionMeshVersioning.test.ts` (new)

## Rejected alternatives

- **Chunk-level version only**: too coarse; sections mutate independently and a single changed section should
  not invalidate a whole column's mesh jobs.
- **Persist the version**: pointless; it is a runtime rebuild guard, not world data.
- **Equality-check before bumping**: subtle and error-prone; over-bumping is safe, so unconditional bump is
  simpler and correct.

## Downstream dependencies

029+ (section meshing) consumes `sectionMeshVersion`/`isSectionStale` to drop stale section mesh jobs.
