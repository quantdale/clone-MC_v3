# Spec: end-world-generation

## Contract
This capability adds the End's deterministic terrain generator: `generateEndColumn` produces a
sparse `TerrainColumn` (088's shape) over the End void — an end-stone main island at the origin
(noisy radius around (0, 64)), small end-stone blobs on seeded outer islands beyond distance 1000,
and air everywhere else. Defaults match 180's `END_DIMENSION_TYPE` bounds (0..256).

## Definitions
- **Main island**: the origin blob, radius `45 + 10·fbm(wx, wz)` centered on (0, 64).
- **Outer island**: a column beyond distance 1000 from the origin whose per-column noise exceeds
  0.35 carries a blob of radius `12·(0.5 + 0.5·|noise|)` around y=64.

## Invariants
- Defaults: `minY 0`, `maxY 256` (180's End bounds); configs must satisfy `minY < maxY`.
- The origin column contains the main island; near-but-outside columns are pure void; outer columns
  only ever contain bounded blobs near y=64.
- Water never appears; cells stay inside the column volume; deterministic per (seed, columnX,
  columnZ).

## Requirements

### Requirement: defaults match the End dimension bounds
`DEFAULT_END_TERRAIN_CONFIG` MUST have `minY 0` and `maxY 256` — 180's `END_DIMENSION_TYPE` bounds.

#### Scenario: default config
- **GIVEN** `DEFAULT_END_TERRAIN_CONFIG`
- **THEN** `minY` equals `END_DIMENSION_TYPE.minY` and `maxY` equals
  `END_DIMENSION_TYPE.minY + END_DIMENSION_TYPE.height`

### Requirement: the main island exists at the origin
`generateEndColumn` MUST produce end-stone cells in the origin column near the island center (0, 64).

#### Scenario: origin column
- **GIVEN** `generateEndColumn(42, 0, 0)`
- **THEN** `blockCount` is positive and `getBlock(8, 64, 8)` and `getBlock(8, 60, 8)` are the
  endStone id

### Requirement: the island stays within its vertical profile
Every main-island cell MUST have Y in [0, 127] (the fbm3D 4-octave range bounds the noisy radius).

#### Scenario: profile bounds
- **GIVEN** `generateEndColumn(42, 0, 0)`
- **THEN** every non-air cell's Y is ≤ 127 and ≥ 0

### Requirement: the void surrounds the island
Columns near the origin but outside the island's maximum radius MUST be pure void, and outer-island
columns MUST only contain cells within a small blob around y=64.

#### Scenario: void and outer blobs
- **GIVEN** `generateEndColumn(42, 5, 5)` (world 80, 80) and `generateEndColumn(42, 70, 70)`
  (world 1120, 1120)
- **THEN** the first column is empty and every cell of the second has Y within [42, 86]

### Requirement: the column never emits water and stays in bounds
No cell MAY be the water id (8); all cells MUST lie within the column's volume.

#### Scenario: purity
- **GIVEN** `generateEndColumn(7, -3, 2)`
- **THEN** no cell is 8 and every cell's Y is in [0, 255]

### Requirement: deterministic per (seed, columnX, columnZ)
Two calls with identical inputs MUST produce identical columns.

#### Scenario: repeatability
- **GIVEN** `generateEndColumn(7, 3, -2)` twice
- **THEN** both columns have identical non-air cell contents

### Requirement: caller-supplied ids are honored
When `endStone` is supplied, the generator MUST write exactly that id.

#### Scenario: custom id
- **GIVEN** `{ endStone: 99 }`
- **THEN** origin-column island cells are 99

### Requirement: invalid configs are rejected
Configs with `minY >= maxY` MUST throw before any generation.

#### Scenario: invalid volume
- **GIVEN** `minY = 10, maxY = 10` and `minY = 20, maxY = 10`
- **THEN** `generateEndColumn` throws

## Error and failure behavior
- Invalid configs/ids throw before generation; valid inputs never throw and never emit cells
  outside the column's volume.

## Performance and resource bounds
- One column = 65 536 sphere tests, O(1) noise per cell.

## Compatibility and migration
- One new worldgen file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `TerrainColumn.blockCount` and per-cell lookups make columns inspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 default config | `tests/unit/EndTerrain.test.ts` › defaults |
| REQ-2 main island | › origin column |
| REQ-3 profile | › vertical profile |
| REQ-4 void + outer blobs | › void and outer-island cases |
| REQ-5 purity | › no-water/in-bounds |
| REQ-6 determinism | › repeatability |
| REQ-7 custom ids | › caller-supplied id |
| REQ-8 config validation | › invalid configs |
