# Spec: vertical-neighbor-dirtying

## Contract

`vertical-neighbor-dirtying` makes a boundary block write propagate the dirty flag to every adjacent
section that shares a face with the written block, across all six directions (the four horizontal
chunk-neighbor sections and the two vertical above/below sections), building on 024 `ChunkColumn` dirty
tracking and 026 `VerticalWorldAccess` writes. It is the bookkeeping that lets 028 re-mesh only the
affected sections.

## Definitions

- **Boundary block**: a block whose local X/Z/Y is `0` or `SECTION_SIZE - 1`, i.e. on a section face.
- **Neighbor section**: the section in an adjacent column (horizontal) or the section directly above/below
  in the same column (vertical) that shares the touched face, at the same in-column `sy` for horizontal
  neighbors and `sy ± 1` for vertical neighbors.

## Invariants

- `ChunkColumn.markSectionDirty(sy)` MUST add `sy` to the column's dirty set iff `0 <= sy < sectionCount`
  and MUST NOT materialize the section; out-of-range `sy` MUST be a no-op.
- A boundary write MUST mark the four horizontal neighbor columns' sections at the same `sy`, plus the same
  column's `sy - 1` (when `localY === 0`) and `sy + 1` (when `localY === SECTION_SIZE - 1`).
- A non-boundary write MUST NOT mark any neighbor section dirty.
- Propagation MUST only touch neighbor columns that already exist (`getColumn` guard); it MUST NOT
  materialize absent neighbor columns.
- The written section itself MUST remain dirty (026 behavior unchanged).

## Requirements

### Requirement: ChunkColumn exposes a safe markSectionDirty primitive
`ChunkColumn` MUST provide `markSectionDirty(sy)` that flags an in-range section without allocating it.

#### Scenario: in-range section flagged
- **GIVEN** a `ChunkColumn` with `sectionCount = 4`
- **WHEN** `markSectionDirty(2)` is called
- **THEN** `dirtySectionIndices()` includes `2` and `isDirty` is `true`

#### Scenario: out-of-range section ignored
- **GIVEN** a `ChunkColumn` with `sectionCount = 4`
- **WHEN** `markSectionDirty(99)` and `markSectionDirty(-1)` are called
- **THEN** the dirty set is unchanged and no section is materialized

### Requirement: a boundary write propagates to all six neighbor sections
A write on any section face MUST flag the adjacent section in each of the six directions.

#### Scenario: horizontal boundary faces
- **GIVEN** an overworld `VerticalWorldAccess` with neighbor columns created
- **WHEN** `setBlockState(0, y, 8, stone)` is written (localX == 0)
- **THEN** the column at `chunkX - 1` has its section at `sy` marked dirty

#### Scenario: vertical boundary faces
- **GIVEN** an overworld `VerticalWorldAccess`
- **WHEN** `setBlockState(8, Y, 8, stone)` is written at `localY === 15` and at `localY === 0`
- **THEN** the same column's `sy + 1` and `sy - 1` sections are respectively marked dirty

### Requirement: a non-boundary write leaves neighbors clean
A write strictly inside a section MUST NOT mark any neighbor.

#### Scenario: interior write
- **GIVEN** an overworld `VerticalWorldAccess` with all six neighbor columns created
- **WHEN** `setBlockState(8, y, 8, stone)` is written (localX/localY/localZ all interior)
- **THEN** only the written column's written section is dirty; no neighbor is flagged

### Requirement: propagation only touches existing neighbor columns
Absent neighbor columns MUST NOT be created by dirty propagation.

#### Scenario: absent horizontal neighbor
- **GIVEN** an overworld `VerticalWorldAccess` with a single column
- **WHEN** `setBlockState(0, y, 8, stone)` is written at a horizontal boundary
- **THEN** no new column is materialized and `size` stays `1`

### Requirement: out-of-range vertical neighbor is a no-op
At the dimension's top/bottom section, the vertical neighbor is out of range and MUST NOT be flagged.

#### Scenario: top-of-world vertical neighbor
- **GIVEN** an overworld `VerticalWorldAccess` with the top section materialized
- **WHEN** a block is written at the top local Y of the highest section
- **THEN** no `sy + 1` section is flagged (none exists)

## Error and failure behavior

- Out-of-range `sy` (vertical top/bottom) → no-op.
- Non-existent neighbor column → no-op; no allocation.

## Performance and resource bounds

O(1) per boundary write (bounded map lookups + set adds). No new columns allocated by propagation.

## Compatibility and migration

Additive; no persisted or call-site changes to 024/026 APIs beyond the new `markSectionDirty` method.

## Security and integrity

No external input; coordinate math is local and range-checked.

## Observability

`Column.dirtySectionIndices()` and `VerticalWorldAccess.dirtyColumns()` reflect propagated dirtiness.

## Verification mapping

- All scenarios → `tests/unit/VerticalNeighborDirtying.test.ts`
- Full gate → typecheck, lint, unit, build, e2e
