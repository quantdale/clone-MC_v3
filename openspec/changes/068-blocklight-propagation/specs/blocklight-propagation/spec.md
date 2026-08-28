# Spec: blocklight-propagation

## Contract

Block light MUST be computed deterministically from luminance sources: every cell whose block emits
light (`getLuminance > 0`) is seeded with its luminance (clamped to 15) even when opaque, and light
propagates through non-opaque neighbors falling off by 1 per block (FIFO BFS, fixed neighbor order).
Sources MUST never be dimmed by propagation; identical worlds MUST produce identical results.

## Definitions

- **BlockLightWorld**: `{ getLuminance, isOpaque, getBlockLight, setBlockLight, minY, maxY }`.
- **Source**: a cell with `getLuminance > 0`.
- **Neighbor order**: `-x, +x, -y, +y, -z, +z`.

## Invariants

- Sources are seeded regardless of opacity (glowstone emits from a solid block).
- Propagation only raises values (≤ 15), so the BFS terminates.
- A source's final value equals its luminance.
- Identical inputs produce identical outputs.

## Requirements

### Requirement: source falloff
A source in open air MUST light its neighbors with −1 per block until 0.

#### Scenario: torch room
- **GIVEN** a torch (luminance 14) at `(8, 8, 8)` in an all-air world
- **WHEN** `computeBlockLight` runs
- **THEN** the torch cell reads 14, cells at distance 1 read 13, ..., distance 14 reads 0.

### Requirement: opaque sources emit
A source whose block is opaque MUST still emit its luminance.

#### Scenario: glowstone
- **GIVEN** an opaque cell with luminance 15
- **WHEN** `computeBlockLight` runs
- **THEN** the source cell reads 15 and its air neighbors read 14.

### Requirement: propagation around corners
Light MUST bend around opaque obstacles through non-opaque cells.

#### Scenario: corner
- **GIVEN** a source in a room with an opaque wall and an air cell around the corner
- **WHEN** `computeBlockLight` runs
- **THEN** the around-corner cell is lit (reduced, nonzero).

### Requirement: opaque walls block light
Opaque cells MUST NOT propagate light and MUST read 0 unless they are sources.

#### Scenario: wall
- **GIVEN** an opaque wall between a source and a far cell
- **WHEN** `computeBlockLight` runs
- **THEN** the far cell reads 0 and the wall cells read 0.

### Requirement: determinism
Identical worlds MUST produce identical results.

#### Scenario: repeatability
- **GIVEN** a fixture world
- **WHEN** `computeBlockLight` runs twice (on identical copies)
- **THEN** every cell reads the same value in both runs.

## Error and failure behavior

- World accessor exceptions propagate (caller bug).

## Performance and resource bounds

O(cells × 15) worst case; emitters are typically sparse.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Deterministic computation keeps lighting stable across runs.

## Observability

The returned lit-cell count plus per-cell reads expose the result.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Source falloff | torch 14 → 0 by −1 per block |
| Opaque sources emit | glowstone reads 15; neighbors 14 |
| Propagation around corners | around-corner cell lit |
| Opaque walls block light | far cell and wall read 0 |
| Determinism | identical runs identical |
