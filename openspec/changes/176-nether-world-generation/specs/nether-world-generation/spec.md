# Spec: nether-world-generation

## Contract
This capability adds the Nether's deterministic terrain generator: `generateNetherColumn` produces a
sparse 16×16×height `TerrainColumn` (088's shape) with Nether rules — bedrock floor and full bedrock
roof, no water, lava filling every cell below the lava level that is not terrain, and a spongy
netherrack body from a 3D density field centered on the lava level. Defaults match 175's
`NETHER_DIMENSION_TYPE` bounds (0..255).

## Definitions
- **Lava level**: the Y below which air becomes lava (`31` by default).
- **Ceiling**: the flat bedrock roof layer (`127` by default); cells above it are air.

## Invariants
- Bedrock occupies exactly `minY` (floor) and `ceilingY` (roof) for every (x, z).
- No cell is the water id; every cell with `minY < y < lavaLevel` is non-air.
- `density = (lavaLevel − y) / 64 + noise` with `noise ∈ [−1, 1]`; netherrack where `density > 0`.
- Deterministic per (seed, columnX, columnZ); configs must satisfy
  `minY < lavaLevel < ceilingY < maxY`.

## Requirements

### Requirement: defaults match the Nether dimension bounds
`DEFAULT_NETHER_TERRAIN_CONFIG` MUST have `minY 0`, `maxY 256`, `lavaLevel 31`, `ceilingY 127` —
the 175 `NETHER_DIMENSION_TYPE` bounds and vanilla's lava sea and ceiling.

#### Scenario: default config
- **GIVEN** `DEFAULT_NETHER_TERRAIN_CONFIG`
- **THEN** `minY` equals `NETHER_DIMENSION_TYPE.minY`, `maxY` equals
  `NETHER_DIMENSION_TYPE.minY + NETHER_DIMENSION_TYPE.height`, `lavaLevel` is 31, and `ceilingY` is
  127

### Requirement: bedrock floor and roof are complete
`generateNetherColumn` MUST place bedrock at `minY` and at `ceilingY` for every local (x, z), and
MUST leave every cell above `ceilingY` as air.

#### Scenario: floor, roof, and open roof area
- **GIVEN** `generateNetherColumn(42, 0, 0)`
- **THEN** `getBlock(x, 0, z)` and `getBlock(x, 127, z)` are the bedrock id for all x/z, and
  `getBlock(x, 200, z)` and `getBlock(x, 255, z)` are null

### Requirement: no water; lava fills below the lava level
The generated column MUST never contain the water id (8), MUST have every cell with
`minY < y < lavaLevel` non-air (netherrack or lava), and MUST contain at least one lava cell.

#### Scenario: water-free lava sea
- **GIVEN** `generateNetherColumn(42, 0, 0)`
- **THEN** no cell equals 8; all cells with `1 <= y < 31` are non-air; at least one cell equals the
  lava id (20)

### Requirement: a spongy netherrack body exists below the roof
The column MUST contain netherrack cells with a topmost non-roof solid in `[32, 126]`, and MAY leave
air pockets in that band (caverns).

#### Scenario: terrain band
- **GIVEN** `generateNetherColumn(42, 0, 0)`
- **THEN** `blockCount` is positive and the highest non-null cell strictly below `ceilingY` is
  between 32 and 126

### Requirement: deterministic per (seed, columnX, columnZ)
Two calls with identical inputs MUST produce identical columns.

#### Scenario: repeatability
- **GIVEN** `generateNetherColumn(7, 3, -2)` twice
- **THEN** both columns have identical non-air cell contents

### Requirement: caller-supplied block ids are honored
When ids are supplied, the generator MUST write exactly those ids for netherrack/lava/bedrock.

#### Scenario: custom ids
- **GIVEN** ids `{ netherrack: 99, lava: 88, bedrock: 77 }`
- **THEN** the floor/roof cells are 77, netherrack cells are 99, lava cells are 88, and no cell is
  the water id

### Requirement: invalid configs are rejected
Configs violating `minY < lavaLevel < ceilingY < maxY` MUST throw a descriptive error before any
generation.

#### Scenario: invalid ordering
- **GIVEN** `minY >= maxY`, `lavaLevel <= minY`, `ceilingY >= maxY`, or `ceilingY <= lavaLevel`
- **THEN** `generateNetherColumn` throws

## Error and failure behavior
- Invalid configs/ids throw before generation; valid inputs never throw and never emit cells
  outside the column's volume.

## Performance and resource bounds
- One column = 65 536 cell evaluations, O(1) noise per cell (~0.5 ms in tests).

## Compatibility and migration
- One new worldgen file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `TerrainColumn.blockCount` and per-cell lookups make columns inspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 default config | `tests/unit/NetherTerrain.test.ts` › defaults |
| REQ-2 floor/roof/roof area | › bedrock floor/roof; open roof area |
| REQ-3 no water + lava sea | › no-water/lava cases |
| REQ-4 terrain band | › netherrack band |
| REQ-5 determinism | › determinism |
| REQ-6 custom ids | › caller-supplied ids |
| REQ-7 config validation | › invalid configs |
