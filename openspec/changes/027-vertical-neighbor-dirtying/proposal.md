# Proposal: 027-vertical-neighbor-dirtying

## Problem

026 `VerticalWorldAccess` writes a block and marks only the owning column's section dirty. It does not
propagate dirtiness to the neighboring sections across all six faces. When a block sits on a section
boundary, the adjacent section (in another column, or the section directly above/below in the same
column) must also re-mesh, or its exposed face next to the new block stays stale. 026 therefore leaves
vertical and horizontal neighbor boundaries unculled.

## Goals

- Add a primitive to mark an arbitrary in-range section dirty on a `ChunkColumn` (024).
- Make `VerticalWorldAccess.setBlockState` propagate dirtiness to the neighbor sections across all six
  faces: the four horizontal chunk-neighbor sections and the two vertical (above/below) sections,
  including vertical section boundaries.

## Non-goals

- No meshing or rendering (028 covers section mesh versioning). This change only tracks which sections
  need re-meshing.
- No cross-dimension or cross-world dirtiness; exactly one active `DimensionType` (025/026).

## Preconditions

026 is VERIFIED. Depends on 021 (section math), 024 (`ChunkColumn` dirty tracking), 025 (`DimensionType`),
026 (`VerticalWorldAccess`).

## Dependencies

- `src/world/ChunkColumn.ts` (024)
- `src/world/VerticalWorldAccess.ts` (026)
- `src/math/SectionCoordinate.ts` (021)

## Proposed change

- Add `ChunkColumn.markSectionDirty(sy: number): void` — adds `sy` to the column's dirty set when `sy` is
  in `[0, sectionCount)`; no-op otherwise. Does not materialize the section.
- Extend `VerticalWorldAccess.setBlockState` to, after the write, compute the local boundary flags and
  mark the relevant neighbor sections dirty via `markSectionDirty` on the existing neighbor column(s).
  Neighbor columns that do not yet exist are not materialized; their absence already implies no mesh to
  update. Vertical neighbors (localY 0 / 15) map to `sy-1` / `sy+1` in the same column; horizontal
  neighbors (localX/localZ 0 / 15) map to the adjacent column's `sy`.

## Compatibility and migration

Additive; no call-site or persisted-data changes. `ChunkColumn`'s existing dirty API is unchanged.

## Risks

- Marking a non-existent neighbor column dirty would materialize empty columns and leak memory. Mitigated
  by only touching neighbor columns that already exist (`getColumn` guard).
- Marking an out-of-range `sy` wouldcorrupt the dirty set. Mitigated by clamping through
  `markSectionDirty`'s range check.

## Rollback strategy

Additive methods/branches; reverting the commit removes them with no downstream impact (028 not yet implemented).

## Definition of Done

`VerticalWorldAccess` propagates section-dirty flags across all six faces on a boundary write; unit tests
prove each direction including vertical; full regression gate is green.

## Advancement gate

028 starts only after 027 is 100% complete and VERIFIED.
