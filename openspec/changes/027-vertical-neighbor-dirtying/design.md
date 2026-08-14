# Design: 027-vertical-neighbor-dirtying

## Context / current state

026 `VerticalWorldAccess.setBlockState` writes `column.setBlockState(...)`, which marks only the written
section dirty inside that column. Neighboring sections — in another column (horizontal) or the section
above/below (vertical, same column) — are not flagged, so their meshes would not be regenerated when a
shared face changes. 024 `ChunkColumn` exposes `isDirty`/`dirtySectionIndices`/`clearDirty` but no way to
mark an arbitrary section dirty.

## Target state

A `markSectionDirty` primitive on `ChunkColumn` plus neighbor-dirty propagation in `VerticalWorldAccess`
so every boundary write flags all six adjacent sections that share a face.

## Invariants

- `markSectionDirty(sy)` MUST add `sy` to the column dirty set iff `0 <= sy < sectionCount`; otherwise no-op
  and never throw. It MUST NOT materialize the section.
- After a boundary write, the four horizontal neighbor columns' sections at the same `sy`, and the same
  column's `sy-1` (when localY == 0) and `sy+1` (when localY == 15), MUST be marked dirty.
- Non-boundary writes MUST NOT mark any neighbor dirty.
- Propagation MUST only touch neighbor columns that already exist (`getColumn` guard); non-existent
  neighbors are not materialized.
- The written section itself MUST remain dirty (unchanged 026 behavior).

## API and data model

```ts
// 024 ChunkColumn (additive)
export class ChunkColumn {
  markSectionDirty(sy: number): void; // new
}

// 026 VerticalWorldAccess (extends setBlockState)
export class VerticalWorldAccess {
  setBlockState(x, y, z, state): void; // now also marks neighbor sections
}
```

## Control / data flow

`setBlockState` validates and writes as in 026, then calls a private `markNeighborSectionsDirty(x, y, z)`:
- `chunkX = sectionIndex(x)`, `localX = localCoord(x)`; same for Z; `sy = sectionIndex(y) - minSectionY`;
  `localY = localCoord(y)`.
- If `localX === 0`: `markNeighborDirty(chunkX - 1, chunkZ, sy)`.
- If `localX === SECTION_SIZE - 1`: `markNeighborDirty(chunkX + 1, chunkZ, sy)`.
- If `localZ === 0`: `markNeighborDirty(chunkX, chunkZ - 1, sy)`.
- If `localZ === SECTION_SIZE - 1`: `markNeighborDirty(chunkX, chunkZ + 1, sy)`.
- If `localY === 0`: `markNeighborDirty(chunkX, chunkZ, sy - 1)`.
- If `localY === 15`: `markNeighborDirty(chunkX, chunkZ, sy + 1)`.

`markNeighborDirty(nx, nz, nsy)` is a no-op when `nsy` is out of `[0, sectionCount)`; otherwise it fetches
`this.getColumn(nx, nz)` and, if present, calls `column.markSectionDirty(nsy)`.

## Detailed behavior

- `markSectionDirty` on `ChunkColumn` is O(1): `if (sy >= 0 && sy < sectionCount) this.dirtySections.add(sy)`.
- Vertical boundaries stay within the same column; `sy-1`/`sy+1` can be out of range at the dimension's top/
  bottom section, in which case `markNeighborDirty` no-ops (no neighbor section exists).
- Horizontal neighbors are other columns; only existing ones are flagged.
- `dirtyColumns()` (026) then reports every column whose `dirtySectionIndices` includes a propagated index.

## Failure modes

- Out-of-range `nsy` → no-op (no throw, no memory growth).
- Non-existent neighbor column → no-op (no materialization).
- Non-boundary write → no neighbor flagged.

## Compatibility / migration

Additive; `ChunkColumn` existing API untouched; `VerticalWorldAccess` behavior strictly extends.

## Performance / resource constraints

O(1) per boundary write (a few map lookups + set adds). No new columns allocated by propagation.

## Testing seams

`tests/unit/VerticalNeighborDirtying.test.ts` covers: non-boundary write leaves neighbors clean; each of
the six faces flags the correct neighbor section; vertical top/bottom propagation; out-of-range top/bottom
no-op; non-existent horizontal neighbor no-op; the written section itself stays dirty; and
`markSectionDirty` range safety on `ChunkColumn`.

## Affected files / symbols

- `src/world/ChunkColumn.ts` (add `markSectionDirty`)
- `src/world/VerticalWorldAccess.ts` (neighbor propagation in `setBlockState`)
- `tests/unit/VerticalNeighborDirtying.test.ts` (new)

## Rejected alternatives

- **Re-mesh whole columns on any write**: far too coarse; per-section dirtiness is the unit of work.
- **Auto-create neighbor columns to always mark them**: leaks empty columns and memory; absence of a
  neighbor already means no mesh to update.
- **Track dirtiness at world level instead of per-column**: duplicates 024's existing per-section set.

## Downstream dependencies

028 (section mesh versioning) consumes `dirtySectionIndices` to schedule re-meshing of exactly the affected
sections, including newly propagated ones.
