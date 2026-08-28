# Spec: tree-feature-system

## Contract

`validateConfiguredFeatureConfig` MUST accept the documented `tree` config
(`trunk { blockId; minHeight; maxHeight }`, `foliage { blockId; shape; radius }`) and MUST reject
malformed ones with descriptive errors. `buildTreeBlocks` MUST produce the documented trunk and
foliage layout deterministically for a given config and rng. `createDefaultTreeConfiguredFeatures`
MUST produce the documented deterministic default. `TerrainGenerator` MUST build its trees through
`buildTreeBlocks` using the default oak feature, keeping its placement gating and draw sequence so
world output is unchanged.

## Definitions

- **tree**: a configured feature whose trunk (a `blockId` column) and foliage (a `blockId`
  canopy) are configurable.
- **Trunk height**: `h = minHeight + floor(nextFloat() * (maxHeight - minHeight + 1))` — one
  draw, uniform over `[minHeight, maxHeight]` inclusive.
- **Foliage layers** (1-based `i`, `dy = h + i`, each layer the full `[-r_i, r_i]^2` square
  including the center):
  - `round`: layers 1..3, radii `[r, r, max(r - 1, 0)]`.
  - `flatTop`: layers 1..3, radii `[r, r, r]`.
  - `spruce`: layers 1..(r + 1), radius of layer `i` = `r - i + 1`.
- **Default oak** (`overworld/oak_tree`): trunk `{ blockId: 7, minHeight: 4, maxHeight: 5 }`,
  foliage `{ blockId: 8, shape: 'round', radius: 2 }`.
- **Block order**: trunk blocks first (dy ascending), then foliage layers (layer, dx ascending,
  dz ascending).

## Invariants

- `trunk.blockId`/`foliage.blockId` are non-negative integers; `minHeight`/`maxHeight` positive
  integers with `minHeight <= maxHeight`; `shape` one of `round`/`flatTop`/`spruce`;
  `radius` a positive integer.
- Unknown types and malformed fields throw.
- Identical `(config, rng)` MUST produce identical block lists.
- TerrainGenerator placement gating (biome density, surface above sea level, owner-based
  cross-chunk writes, air-only overwrites) and the per-column rng draw sequence MUST be
  unchanged.

## Requirements

### Requirement: tree config validation
`validateConfiguredFeatureConfig` MUST accept exactly the documented tree shape.

#### Scenario: valid tree config
- **GIVEN** a tree config with valid trunk and foliage sub-configs (all three shapes)
- **WHEN** validation runs
- **THEN** each passes (narrowed to the `tree` member).

#### Scenario: rejection matrix
- **GIVEN** missing trunk/foliage, negative/fractional block ids, zero/negative/fractional
  heights, `minHeight > maxHeight`, an unknown shape, and zero/negative/fractional radius
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field.

### Requirement: deterministic tree building
`buildTreeBlocks` MUST produce the documented layouts.

#### Scenario: round layout
- **GIVEN** a round config with radius 1, minHeight 1, maxHeight 1
- **WHEN** buildTreeBlocks runs
- **THEN** it returns exactly the trunk block at `(0, 1, 0)` plus foliage layers at
  `dy = 2, 3, 4` with radii `1, 1, 0` (19 foliage blocks), in documented order.

#### Scenario: flatTop and spruce layouts
- **GIVEN** flatTop radius 1 and spruce radius 2 configs
- **WHEN** buildTreeBlocks runs
- **THEN** flatTop yields 3 full 3x3 layers and spruce yields radii `2, 1, 0` layers
  (25 + 9 + 1 foliage blocks).

#### Scenario: height sampling
- **GIVEN** minHeight 3, maxHeight 5 with scripted draws
- **WHEN** buildTreeBlocks runs
- **THEN** draws 0 / 0.5 / 0.999 produce trunk heights 3 / 4 / 5.

#### Scenario: determinism
- **GIVEN** an identical config and scripted rng
- **WHEN** buildTreeBlocks runs twice
- **THEN** the results are identical.

### Requirement: defaults
`createDefaultTreeConfiguredFeatures` MUST produce the documented default deterministically.

#### Scenario: default registry
- **GIVEN** the default registry
- **WHEN** inspected
- **THEN** it contains exactly `overworld/oak_tree` with the documented config, and repeated
  construction yields equal registries.

### Requirement: terrain integration
`TerrainGenerator` MUST place trees through `buildTreeBlocks` with unchanged output.

#### Scenario: tree placement preserved
- **GIVEN** the rewired TerrainGenerator with a fixed seed
- **WHEN** chunks are generated
- **THEN** trees still appear (wood > 0), trunks are anchored on solid terrain, foliage
  surrounds trunk tops, and repeated generation is identical.

## Error and failure behavior

- Validation and default-resolution failures throw descriptive errors; no partial state.

## Performance and resource bounds

`buildTreeBlocks` O(trunk height + foliage area); called once per tree column; canopy anchor
loop reach = foliage radius (2 for the default oak, unchanged).

## Compatibility and migration

Additive union member; TerrainGenerator chunk output bit-identical to the pre-change hard-coded
trees (same draw sequence: density draw then height draw; `4 + nextInt(2)` equals
`4 + floor(next() * 2)`; canopy 5x5x3 with 3x3 top equals round radius 2).

## Security and integrity

Not applicable.

## Observability

Block layouts are plain relative tuples; tests assert exact lists.

## Verification mapping

- `tests/unit/TreeFeature.test.ts` — validation matrix, exact layouts per shape, height
  sampling, determinism, defaults.
- `tests/unit/TerrainGenerator.test.ts` (existing + one regression test) — tree presence,
  anchoring, foliage, determinism.
