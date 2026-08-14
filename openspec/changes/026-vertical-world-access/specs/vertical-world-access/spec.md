# Spec: vertical-world-access

## Contract

`vertical-world-access` provides a gameplay-free `VerticalWorldAccess` facade that maps a full world
`(x, y, z)` coordinate to a `ChunkColumn` (024) whose vertical section layout is derived from an active
`DimensionType` (025) via 021 coordinate math. It is the single dimension-aware read/write path that
removes the legacy 0–63 Y slab: the accessible vertical span is `[dimension.minY, dimension.maxY]`.

## Definitions

- **Column**: a `ChunkColumn` at a fixed `(chunkX, chunkZ)`, spanning all Y via 16-tall sections.
- **minSectionY / sectionCount**: derived once from `dimension.minSectionY` / `dimension.sectionCount`.
- **Accessible Y range**: `[dimension.minY, dimension.maxY]` (inclusive).

## Invariants

- Horizontal chunking MUST use section width 16: `chunkX = floor(x/16)`, `localX = ((x%16)+16)%16`, and
  the same for Z; `worldY = y` is passed unchanged to the column (the column owns vertical routing).
- `minSectionY === dimension.minSectionY` and `sectionCount === dimension.sectionCount`.
- `getBlockState` MUST return air when no column exists for `(chunkX, chunkZ)` OR when
  `!dimension.containsY(y)`.
- `setBlockState` MUST be a no-op when coordinates are non-integer, when `!dimension.containsY(y)`, or
  when `state` is not a valid `BlockState`.
- Columns MUST be materialized lazily on the first `setBlockState`; reads MUST NOT create columns.
- The accessible vertical span MUST be `[dimension.minY, dimension.maxY]` — never clamped to `[0, 64)`.

## Requirements

### Requirement: full vertical access derives routing from the active dimension
`VerticalWorldAccess` MUST derive `minSectionY`/`sectionCount` from `dimension` and route chunk X/Z via
16-wide section math, delegating the world Y to the column.

#### Scenario: overworld layout
- **GIVEN** a `VerticalWorldAccess` built on the overworld `DimensionType`
- **THEN** its `dimension.minSectionY` is `-4`, `sectionCount` is `24`, and `maxY` is `319`

#### Scenario: nether layout
- **GIVEN** a `VerticalWorldAccess` built on the nether `DimensionType`
- **THEN** its `maxY` is `127` and `sectionCount` is `8`

### Requirement: reads return air for empty or out-of-range coordinates
`getBlockState` MUST return the air state for an ungenerated column and for any Y outside the dimension.

#### Scenario: empty column
- **GIVEN** a fresh `VerticalWorldAccess` with no writes
- **WHEN** `getBlockState(0, 0, 0)` is read
- **THEN** it returns the air state

#### Scenario: out-of-range Y
- **GIVEN** an overworld `VerticalWorldAccess`
- **WHEN** `getBlockState(0, 1000, 0)` and `getBlockState(0, -1000, 0)` are read
- **THEN** both return air

### Requirement: writes place a block at any in-range Y and lazily create the column
`setBlockState` MUST create the column on first in-range write and MUST no-op outside the dimension or
for non-integer coordinates.

#### Scenario: negative Y write
- **GIVEN** an overworld `VerticalWorldAccess`
- **WHEN** `setBlockState(0, -64, 0, stone)` is called and then read back
- **THEN** `getBlockState(0, -64, 0)` is `stone`

#### Scenario: high Y write
- **GIVEN** an overworld `VerticalWorldAccess`
- **WHEN** `setBlockState(0, 319, 0, stone)` is called and then read back
- **THEN** `getBlockState(0, 319, 0)` is `stone`

#### Scenario: out-of-range write no-op
- **GIVEN** an overworld `VerticalWorldAccess`
- **WHEN** `setBlockState(0, 320, 0, stone)` is called
- **THEN** the world stays empty and no column is materialized

#### Scenario: non-integer guard
- **GIVEN** an overworld `VerticalWorldAccess`
- **WHEN** `setBlockState(0, 0.5, 0, stone)` is called
- **THEN** the world stays empty

### Requirement: cross-column routing at chunk boundaries
A write in one chunk MUST be readable only through that chunk's column; adjacent world X/Z MUST route to
different columns.

#### Scenario: adjacent chunks
- **GIVEN** an overworld `VerticalWorldAccess`
- **WHEN** `setBlockState(15, 40, 0, stone)` and `setBlockState(16, 40, 0, dirt)` are written
- **THEN** `getBlockState(15, 40, 0)` is `stone`, `getBlockState(16, 40, 0)` is `dirt`, and the world has
  two columns

### Requirement: column management and dirty aggregation
The facade MUST expose column lookup/iteration/count and aggregate dirty state across columns.

#### Scenario: column management
- **GIVEN** an overworld `VerticalWorldAccess` with one written column
- **THEN** `size` is `1`, `hasColumn` is `true` for that chunk, `isDirty` is `true`, and
  `clearDirty()` makes `isDirty` `false`

### Requirement: deterministic serialization round-trips across full vertical range
`serialize()` / `deserialize()` MUST restore every in-range block state, including negative and high Y.

#### Scenario: round-trip
- **GIVEN** an overworld `VerticalWorldAccess` with blocks at `y = -64` and `y = 319`
- **WHEN** it is serialized and deserialized
- **THEN** both blocks read back unchanged and `size` is preserved

## Error and failure behavior

- Out-of-range `y`, non-integer coordinates, or invalid `state` → `setBlockState` no-op; `getBlockState`
  returns air. The column `RangeError` is never reached for guarded inputs.
- `deserialize` with `minSectionY`/`sectionCount` mismatching `dimension` → throws.

## Performance and resource bounds

O(1) per access (map lookup + column delegation). Unwritten world holds zero columns.

## Compatibility and migration

Additive; no persisted or call-site changes to the legacy streaming `World.ts`.

## Security and integrity

No external input; coordinates are validated locally before delegation.

## Observability

`size`, `isDirty`, and `dirtyColumns()` expose storage state without rendering.

## Verification mapping

- Layout, air default, negative/high Y read/write, cross-column routing, guards →
  `tests/unit/VerticalWorldAccess.test.ts`
- Serialization round-trip → `tests/unit/VerticalWorldAccess.test.ts`
- Full gate → typecheck, lint, unit, build, e2e
