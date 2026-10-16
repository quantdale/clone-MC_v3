# Spec: template-partial-block-meshing

## Contract

Partial-block models (slabs, stairs, panes, doors) MUST mesh into world-unit quads from their 059
`BlockModel` geometry, without full-cube assumptions. `meshBlockModel` MUST emit one quad per model
face at its computed plane, spanning `(to - from) / 16` on the in-plane axes, and MUST cull boundary
faces whose outward neighbor is opaque while never culling interior faces. `isFullCubeModel` MUST
detect the canonical full cube.

## Definitions

- **Face plane**: `down` = `from.y/16`, `up` = `to.y/16`, `north` = `from.z/16`, `south` = `to.z/16`,
  `west` = `from.x/16`, `east` = `to.x/16`.
- **Boundary face**: a face whose plane is at local 0 or 1.
- **Outward neighbor**: `cell + face normal`.

## Invariants

- Boundary faces are culled iff the outward neighbor is opaque; interior faces are never culled.
- Quad position/extents derive from `from`/`to` ÷ 16 (world units).
- Output order: model element order, then the model's face key order (deterministic).

## Requirements

### Requirement: full-cube model
A canonical full-cube model MUST mesh to six 1×1 boundary quads when isolated, and to zero quads when
every neighbor is opaque.

#### Scenario: isolated and buried
- **GIVEN** a full-cube model at a cell with no opaque neighbors, and at a cell fully surrounded
- **WHEN** `meshBlockModel` runs
- **THEN** the first yields six quads at the six planes and the second yields none.

### Requirement: slab model
A slab model (`[0,0,0]..[16,8,16]`) MUST mesh to a top quad at `y + 0.5` (1×1), a bottom quad at `y`,
and four side quads; an opaque neighbor MUST cull only the facing side quad.

#### Scenario: slab with an opaque neighbor
- **GIVEN** a slab model at `(0, 0, 0)` with an opaque cell at `(0, 0, -1)` (north)
- **WHEN** `meshBlockModel` runs
- **THEN** it yields 5 quads (top, bottom, south, east, west) — the north face is culled.

### Requirement: multi-element models
A two-element model MUST emit quads from both elements.

#### Scenario: stair-like model
- **GIVEN** a model with a lower and an upper element
- **WHEN** `meshBlockModel` runs
- **THEN** quads from both elements are present with correct planes.

### Requirement: interior faces are never culled
A face whose plane is not on the block boundary MUST be emitted even when its outward direction
touches an opaque cell.

#### Scenario: interior underside
- **GIVEN** an element with an `up` face at `from.y = 8` (plane 0.5, interior) and an opaque cell above
- **WHEN** `meshBlockModel` runs
- **THEN** the interior face is still emitted.

### Requirement: full-cube detection
`isFullCubeModel` MUST be true only for the canonical full cube.

#### Scenario: detection
- **GIVEN** a full-cube model, a slab model, and an empty model
- **WHEN** `isFullCubeModel` runs on each
- **THEN** the results are `true`, `false`, `false`.

## Error and failure behavior

- Sampler exceptions propagate (caller bug).

## Performance and resource bounds

O(elements × faces) per block.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Deterministic plane math prevents mesh drift; boundary-only culling prevents disappearing geometry.

## Observability

Quad lists are directly inspectable.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Full-cube model | isolated → 6 quads; buried → 0 |
| Slab model | top at y+0.5; neighbor culls only the facing side |
| Multi-element models | quads from both elements |
| Interior faces never culled | interior face emitted with opaque neighbor |
| Full-cube detection | true/false fixtures |
