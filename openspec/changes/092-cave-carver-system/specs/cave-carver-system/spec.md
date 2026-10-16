# Spec: cave-carver-system

## Contract

`carveValue(seed, x, y, z)` MUST implement the documented two-noise formula deterministically.
`carveColumn(seed, columnX, columnZ, config?)` MUST produce a sparse `CarvedColumn` of cells where
`carveValue > threshold`, confined to `[minY, maxY)`. `applyCarving(column, carved)` MUST return a
new column with exactly the carved cells removed, leaving the input untouched. `TerrainColumn
.removeCell` MUST remove a stored cell. Identical inputs MUST produce identical masks.

## Definitions

- **Carve formula**: `fbm4(wide, x·0.02, y·0.02, z·0.02) − 0.4 · fbm3(detail, x·0.09, y·0.09,
  z·0.09)`; carved when `> threshold` (default 0.05).
- **Carved index**: `x + 16·(y - minY) + 16·height·z`.

## Invariants

- `carveValue` is deterministic and bounded by the amplitude sums (1 + 0.5 + 0.25 + 0.125 for
  wide, 0.4·(1 + 0.5 + 0.25) for detail).
- Masks only contain worldY in `[minY, maxY)`.
- `applyCarving` preserves every non-carved cell and never mutates its input.
- Config validation: finite threshold, integer `minY < maxY`.

## Requirements

### Requirement: carve value
`carveValue` MUST be deterministic and bounded.

#### Scenario: repeated and bounded
- **GIVEN** fixed seed/coords
- **WHEN** carveValue runs twice
- **THEN** results are equal and within the documented amplitude bound.

### Requirement: carve column
`carveColumn` MUST produce a deterministic sparse mask in the y-window.

#### Scenario: mask properties
- **GIVEN** a seed and column
- **WHEN** carving runs twice
- **THEN** masks are equal; every carved cell's worldY is in `[minY, maxY)`; a low-threshold
  fixture carves a nonzero number of cells; different seeds produce differing masks.

### Requirement: apply carving
`applyCarving` MUST remove exactly the carved cells.

#### Scenario: removal and purity
- **GIVEN** a terrain column and its carve mask
- **WHEN** application runs
- **THEN** the returned column has null at every carved cell and the original blocks elsewhere;
  the input column is unchanged.

### Requirement: removeCell
`TerrainColumn.removeCell` MUST remove a stored cell.

#### Scenario: removal
- **GIVEN** a column with a known cell
- **WHEN** removeCell runs
- **THEN** getBlock returns null and blockCount decreases by one (or stays for absent cells).

### Requirement: config validation
Invalid carver configs MUST throw.

#### Scenario: bad configs
- **GIVEN** non-finite thresholds or `minY >= maxY`
- **WHEN** carving runs
- **THEN** it throws a descriptive error.

## Error and failure behavior

- Invalid configs throw; carving and application are otherwise total.

## Performance and resource bounds

Carving O(16·16·height); application O(cells).

## Compatibility and migration

Additive; `removeCell` is new.

## Security and integrity

Not applicable.

## Observability

Masks expose `has`; tests assert exact removals.

## Verification mapping

- `tests/unit/CaveCarver.test.ts` — carveValue determinism/bounds, mask determinism/seed
  sensitivity/y-window, applyCarving removal + purity, config validation, nonzero fixture.
- `tests/unit/OverworldTerrain.test.ts` — removeCell.
