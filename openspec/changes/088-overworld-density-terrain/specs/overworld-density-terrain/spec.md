# Spec: overworld-density-terrain

## Contract

`generateTerrainColumn(seed, columnX, columnZ, config?, ids?)` MUST produce a deterministic
16×16×height `TerrainColumn` from a density function: solid stone where density > 0, water filling
air below `seaLevel`, bedrock at `minY`, air elsewhere. Identical inputs MUST produce identical
columns; different seeds MUST (almost surely) produce differing terrain. `TerrainColumn` MUST
expose `getBlock(localX, localY, localZ)`, `blockCount`, and `surfaceHeightAt(localX, localZ)`.

## Definitions

- **Density**: `surface(x, z) = 64 + 12 · fbm(surface noise at (wx·0.01, 0, wz·0.01))`;
  `density(x, y, z) = (surface - y) / 32 + 0.25 · detailNoise(wx, wy, wz)`; solid when
  `density > 0`.
- **Local index**: `x + 16 · (y - minY) + 16 · height · z`.
- **Surface height**: the highest local y holding a solid cell (`minY - 1` when none).

## Invariants

- Every non-air cell is stone, water, or bedrock.
- Water appears only at `y < seaLevel`.
- Bedrock appears exactly at `y === minY` (all 256 footprint cells).
- No cells outside `[minY, maxY)`.
- Generation loop order is x, z, y ascending; output is deterministic.

## Requirements

### Requirement: determinism
Identical (seed, column) inputs MUST produce identical columns.

#### Scenario: repeated generation
- **GIVEN** a seed and column
- **WHEN** generation runs twice
- **THEN** the columns are deeply equal (block map, counts, surface heights).

### Requirement: seed sensitivity
Different seeds MUST produce differing terrain (spot-checked).

#### Scenario: seed change
- **GIVEN** two seeds
- **WHEN** columns are generated
- **THEN** at least one cell differs (over a sampled set of columns).

### Requirement: classification
Cells MUST follow the classification rules.

#### Scenario: bedrock floor
- **GIVEN** any column
- **WHEN** inspected at `minY`
- **THEN** all 256 footprint cells are bedrock.

#### Scenario: water only below sea level
- **GIVEN** any column
- **WHEN** water cells are inspected
- **THEN** their y is below `seaLevel`.

#### Scenario: nothing outside the volume
- **GIVEN** any column
- **WHEN** queried below `minY` or at/above `maxY`
- **THEN** `getBlock` returns null.

### Requirement: surface heights
`surfaceHeightAt` MUST return the highest solid y, or `minY - 1` when the column has no solid
cell.

#### Scenario: surface queries
- **GIVEN** generated columns
- **WHEN** heights are queried
- **THEN** the cell at the returned height is solid, the cell above is not solid, and the value
  is within `[minY, maxY)` (or `minY - 1` for empty columns).

### Requirement: index math
`getBlock` MUST round-trip a generated cell.

#### Scenario: round-trip
- **GIVEN** a generated column and a known non-air cell
- **WHEN** queried by local coordinates
- **THEN** the returned id equals the classified id (stone/water/bedrock).

### Requirement: config validation
Invalid configs MUST throw.

#### Scenario: bad configs
- **GIVEN** non-integer values, `minY >= maxY`, or `seaLevel` outside `(minY, maxY)`
- **WHEN** generation runs
- **THEN** it throws a descriptive error.

## Error and failure behavior

- Invalid configs/ids throw; generation is otherwise total.

## Performance and resource bounds

O(16 · 16 · height) evaluations; sparse output.

## Compatibility and migration

Additive; the game's placeholder terrain untouched.

## Security and integrity

Not applicable: no I/O; inputs validated.

## Observability

Columns expose block lookups and surface heights; tests assert invariants.

## Verification mapping

- `tests/unit/OverworldTerrain.test.ts` — determinism, seed sensitivity, classification
  invariants, surface heights, index round-trip, config validation.
