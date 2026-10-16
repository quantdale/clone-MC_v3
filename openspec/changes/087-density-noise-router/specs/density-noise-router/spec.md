# Spec: density-noise-router

## Contract

`hashNoise3D` MUST return deterministic values in [0, 1). `ValueNoise3D` MUST produce lattice
values at integer coordinates, smoothstep-trilinear interpolation between, exact period wrap, and
output in [-1, 1]. `fbm3D` MUST be the documented octave sum, bounded and deterministic.
`evaluateDensity` MUST implement the documented node formulas purely; `validateDensityNode` MUST
reject unknown types, malformed fields, non-finite scalars, and trees deeper than 64.

## Definitions

- **Lattice value**: `hashNoise3D(mod(x, px), mod(y, py), mod(z, pz), seed)` mapped to [-1, 1].
- **fbm**: `Σ_{i=0}^{octaves-1} gain^i · noise(x·l^i, y·l^i, z·l^i)` (defaults: 4 octaves,
  lacunarity 2, gain 0.5).
- **yGradient**: clamped linear ramp between (minY, minValue) and (maxY, maxValue).

## Invariants

- `hashNoise3D` ∈ [0, 1); identical inputs → identical outputs.
- `ValueNoise3D.sample` at integer coordinates equals the lattice value; `sample(x+px) ===
  sample(x)` (period wrap); output ∈ [-1, 1].
- `fbm3D` output is within `±Σ gain^i`.
- Node evaluation: children evaluated in fixed order (a then b); scalars applied after children;
  no mutation.
- Validation depth limit: 64.

## Requirements

### Requirement: hash noise
`hashNoise3D` MUST be deterministic and in [0, 1).

#### Scenario: range and determinism
- **GIVEN** fixed coordinates and seeds
- **WHEN** hashing runs twice
- **THEN** results are equal and in [0, 1); differing seeds or coordinates produce (almost surely)
  differing values (spot-checked).

### Requirement: value noise
`ValueNoise3D` MUST satisfy lattice exactness, period wrap, and range.

#### Scenario: lattice exactness
- **GIVEN** a noise instance and integer coordinates
- **WHEN** sampled
- **THEN** the value equals the lattice value (hash of wrapped coordinates).

#### Scenario: period wrap
- **GIVEN** periods (px, py, pz)
- **WHEN** `sample(x + px, y, z)` runs
- **THEN** it equals `sample(x, y, z)`.

#### Scenario: range
- **GIVEN** any coordinates
- **WHEN** sampled
- **THEN** the value is in [-1, 1].

### Requirement: fbm
`fbm3D` MUST be the octave sum with the documented defaults and bound.

#### Scenario: defaults and bounds
- **GIVEN** a noise instance
- **WHEN** `fbm3D(noise, 4, 2, 0.5, x, y, z)` runs twice
- **THEN** results are equal and within ±(1 + 0.5 + 0.25 + 0.125).

### Requirement: node evaluation
`evaluateDensity` MUST implement each node formula.

#### Scenario: constant and yGradient
- **GIVEN** a constant node and a yGradient node with known endpoints
- **WHEN** evaluated at sample points
- **THEN** the constant returns its value; the gradient clamps at both ends and ramps linearly
  between.

#### Scenario: noise node
- **GIVEN** a noise node with scale/offset
- **WHEN** evaluated
- **THEN** the result equals `noise.sample(x·sx + ox, y·sy + oy, z·sz + oz)`.

#### Scenario: combinators
- **GIVEN** add/multiply/scale/offset/min/max/clamp nodes over hand-computed children
- **WHEN** evaluated
- **THEN** results match the formulas (children evaluated a then b; scalars after).

### Requirement: validation
`validateDensityNode` MUST reject invalid trees.

#### Scenario: rejection matrix
- **GIVEN** unknown node types, malformed fields, non-finite scalars, and a tree deeper than 64
- **WHEN** validation runs
- **THEN** it throws a descriptive error; valid trees pass and evaluate.

### Requirement: purity
Evaluation MUST be deterministic and mutation-free.

#### Scenario: repeated evaluation
- **GIVEN** a fixed tree and sample point
- **WHEN** evaluation runs twice
- **THEN** results are equal and the tree is unchanged.

## Error and failure behavior

- Validation throws descriptive errors; evaluation assumes validated trees.

## Performance and resource bounds

Evaluation O(1) per node; validation O(nodes) with a 64-depth cap.

## Compatibility and migration

Additive.

## Security and integrity

Not applicable: no I/O; inputs validated.

## Observability

Values are plain numbers; tests assert exact fixtures.

## Verification mapping

- `tests/unit/DensityNoise.test.ts` — hash range/determinism/variation, smoothstep/lerp, lattice
  exactness, period wrap, range, fbm bounds/determinism.
- `tests/unit/DensityComposition.test.ts` — per-node hand-computed fixtures, nested trees,
  validation matrix (types/fields/scalars/depth), purity.
