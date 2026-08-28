# Spec: ambient-occlusion

## Contract

Every `OpaqueFaceQuad` MUST carry `vertexAO`: four AO levels in `{0, 1, 2, 3}` in the same corner
order as `vertexLights` (070). AO MUST be computed deterministically from the 3-cell neighborhood
(two in-plane side cells and the diagonal corner cell) in the face's outward layer using the
Minecraft 0-3 table; out-of-section cells MUST NOT occlude; the cell directly in front of the corner
MUST NOT be consulted. Identical inputs MUST produce identical quads including AO, and 070 light
sampling MUST be unchanged.

## Definitions

- **AOLevel**: `0 | 1 | 2 | 3` (Minecraft scale; 3 = unoccluded, 0 = fully occluded).
- **Outward layer** and **corner order**: as defined in 070 (spec: light-aware-meshing).
- **AO neighborhood**: for a corner at in-plane coordinates `(u, v)` with
  `fu = floor(u)`, `fv = floor(v)`, in the outward layer: `side1 = (fu - 1, fv)`,
  `side2 = (fu, fv - 1)`, `corner = (fu - 1, fv - 1)`.

## Invariants

- AO levels are integers in `{0, 1, 2, 3}`.
- Out-of-section cells never occlude.
- AO never consults the front cell `(fu, fv)`.
- The AO rule is fixed: `side1 && side2 → 0`; `(side1 || side2) && corner → 1`;
  `(side1 || side2) && !corner → 2`; `!side1 && !side2 && corner → 2`;
  `!side1 && !side2 && !corner → 3`.

## Requirements

### Requirement: quad data model
Every `OpaqueFaceQuad` MUST carry `vertexAO` with exactly four entries in `{0,1,2,3}` in 070 corner
order.

#### Scenario: every producer emits AO
- **GIVEN** any input to `greedyMergeOpaqueFaces`, `enumerateOpaqueFacesNaive`, `meshBlockModel`, or
  `processMeshSectionRequest` that yields quads
- **WHEN** the quads are inspected
- **THEN** each quad has `vertexAO.length === 4` with every value in `{0, 1, 2, 3}`, and the first
  entry corresponds to `(minU, minV)`.

### Requirement: Minecraft AO table
`sampleCornerAO` MUST return the level from the fixed rule above.

#### Scenario: fully occluded corner
- **GIVEN** a corner whose `side1` and `side2` are both opaque
- **WHEN** the corner is sampled
- **THEN** the level is 0.

#### Scenario: side plus diagonal
- **GIVEN** a corner with exactly one opaque side and an opaque diagonal corner cell
- **WHEN** the corner is sampled
- **THEN** the level is 1.

#### Scenario: side without diagonal
- **GIVEN** a corner with exactly one opaque side and a non-opaque diagonal corner cell
- **WHEN** the corner is sampled
- **THEN** the level is 2.

#### Scenario: diagonal only
- **GIVEN** a corner with no opaque sides and an opaque diagonal corner cell
- **WHEN** the corner is sampled
- **THEN** the level is 2.

#### Scenario: unoccluded corner
- **GIVEN** a corner whose side and corner cells are all non-opaque
- **WHEN** the corner is sampled
- **THEN** the level is 3.

### Requirement: out-of-section cells never occlude
Out-of-section neighborhood cells MUST be treated as non-opaque.

#### Scenario: section-edge corner stays bright
- **GIVEN** a quad corner at the section boundary whose in-section neighborhood cells are air
- **WHEN** the corner is sampled
- **THEN** the level is 3 (out-of-section cells do not darken it).

### Requirement: fractional corners
Fractional corner coordinates MUST snap with `floor()` before the 3-cell lookup.

#### Scenario: partial-block face corner
- **GIVEN** a template-meshed face with a fractional in-plane corner coordinate
- **WHEN** the corner is sampled
- **THEN** the neighborhood uses `floor(u)` / `floor(v)` (identical to the integer rule at that
  boundary).

### Requirement: determinism and orthogonality
Identical inputs MUST produce identical AO, and 070 light sampling MUST be unchanged.

#### Scenario: repeated calls agree
- **GIVEN** identical section data
- **WHEN** a producer runs twice
- **THEN** the outputs are deeply equal, including `vertexAO` and `vertexLights`.

## Error and failure behavior

None new: AO sampling is total; no validation failures, no exceptions.

## Performance and resource bounds

AO costs at most 3 opacity reads per corner (12 per quad), each guarded by `inBounds`.

## Compatibility and migration

`OpaqueFaceQuad` gains a required field; all producers/consumers in the repository are updated in
this change. No worker payload or stored-data changes. 070 `vertexLights` values are unaffected.

## Security and integrity

Not applicable beyond bounds-guarded sampling (no out-of-range reads).

## Observability

`vertexAO` is plain immutable data per quad; tests assert exact corner tuples.

## Verification mapping

- `tests/unit/AmbientOcclusion.test.ts` — all five table cases, out-of-section non-occlusion,
  corner order, fractional corners, determinism.
- `tests/unit/GreedyMesher.test.ts` — quads carry `vertexAO`; a block beside a wall darkens the
  shared corners; greedy-vs-naive equivalence now also compares AO.
- `tests/unit/TemplateMesher.test.ts` — full-cube and slab faces carry AO.
- `tests/unit/WorkerMeshing.test.ts` — AO flows from `opaqueIds`; equivalence between
  `processMeshSectionRequest` and `greedyMergeOpaqueFaces`.
