# Spec: skylight-propagation

## Contract

Skylight MUST be computed deterministically over a world volume: per-column initialization (15 at the
world top, −1 per air block downward, 0 from the first opaque block down) plus propagation through
non-opaque neighbors (BFS, fixed neighbor order) that raises darker cells toward `v - 1`. Opaque cells
MUST always read 0, and identical worlds MUST produce identical results.

## Definitions

- **SkyLightWorld**: `{ isOpaque, getSkyLight, setSkyLight, minY, maxY }`.
- **Neighbor order**: `-x, +x, -y, +y, -z, +z` (deterministic).

## Invariants

- Opaque cells have sky light 0.
- Initialization walks each column from the world top down, stopping at the first opaque block.
- Propagation only raises values (each ≤ 15), so the BFS terminates.
- Identical inputs produce identical outputs.

## Requirements

### Requirement: open-sky falloff
An all-air world MUST light from 15 at the top down by 1 per block, reaching 0 at depth 15.

#### Scenario: empty volume
- **GIVEN** an all-air world with `minY = 0`, `maxY = 32`
- **WHEN** `computeSkyLight` runs
- **THEN** `getSkyLight(x, 31, z)` is 15, `getSkyLight(x, 16, z)` is 0, and values decrease by 1 per
  block.

### Requirement: opaque stops light
A solid surface MUST stop direct skylight: air above is lit 15..1 down to the surface; the opaque
block and everything below are 0.

#### Scenario: ground at y=0
- **GIVEN** opaque cells at `y = 0` and air above (`minY = 0`, `maxY = 16`)
- **WHEN** `computeSkyLight` runs
- **THEN** `getSkyLight(x, 15, z)` is 15, `getSkyLight(x, 1, z)` is 1, and
  `getSkyLight(x, 0, z)` is 0.

### Requirement: propagation under overhangs
Light MUST propagate sideways into non-opaque cells under an overhang (reduced by distance).

#### Scenario: cave under overhang
- **GIVEN** an overhanging opaque block with an air cell under it adjacent to open sky
- **WHEN** `computeSkyLight` runs
- **THEN** the sky-exposed air is bright, and the overhang-covered air cell is lit with a reduced
  (but nonzero) value.

### Requirement: determinism
Identical worlds MUST produce identical results.

#### Scenario: repeatability
- **GIVEN** a fixture world
- **WHEN** `computeSkyLight` runs twice (on identical copies)
- **THEN** every cell reads the same value in both runs.

### Requirement: opaque cells never lit
Opaque cells MUST read 0 after computation.

#### Scenario: solid blocks
- **GIVEN** opaque cells at various heights
- **WHEN** `computeSkyLight` runs
- **THEN** every opaque cell reads 0.

## Error and failure behavior

- World accessor exceptions propagate (caller bug).

## Performance and resource bounds

O(cells × 15) worst case; typical columns stop at the first opaque block.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Deterministic computation keeps lighting stable across runs and sessions.

## Observability

The returned lit-cell count plus per-cell reads expose the result.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Open-sky falloff | 15 → 0 by −1 per block |
| Opaque stops light | air lit 15..1; surface and below 0 |
| Propagation under overhangs | overhang-covered air lit reduced, nonzero |
| Determinism | identical runs identical |
| Opaque cells never lit | all opaque cells read 0 |
