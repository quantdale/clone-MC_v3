# Spec: light-aware-meshing

## Contract

Generated section meshes MUST carry per-corner sky/block light: every `OpaqueFaceQuad` produced by
the greedy mesher, the naive enumerator, the template mesher, and the worker section pipeline MUST
include a `vertexLights` tuple of four `VertexLight` values (integers in [0, 15]) in the fixed
corner order, computed by the deterministic corner-sampling rule below. Identical inputs MUST
produce identical quads including light. The worker request MUST carry per-section sky/block light
arrays and MUST reject malformed ones.

## Definitions

- **VertexLight**: `{ sky: number; block: number }`, each an integer in [0, 15].
- **Corner order**: for a quad with in-plane extent `[minU, maxU] × [minV, maxV]`, the tuple order
  is `(minU, minV)`, `(maxU, minV)`, `(minU, maxV)`, `(maxU, maxV)`.
- **Outward layer**: the cell layer one step from the face along its normal. For an `isMax` face at
  integer `planeCoord` it is the layer at `planeCoord`; for an `isMax` face at fractional
  `planeCoord` it is `cellCoord + 1`. For a min face at integer `planeCoord` it is `planeCoord - 1`;
  for a min face at fractional `planeCoord` it is `cellCoord` (the face's own cell).
- **LightSampler**: world-coordinate accessor with `inBounds`, `isOpaque`, `getSkyLight`,
  `getBlockLight`.

## Invariants

- Light values are never invented: a corner with no in-section sample cells MUST be `(0, 0)`.
- Opaque sample cells contribute 0 and are counted in the average; out-of-section sample cells are
  dropped from the average.
- All arithmetic is fixed-order and uses `Math.round` for averages (deterministic).
- Geometry merging rules (062) are unchanged: merge keys stay id/face based; light does not affect
  which faces merge.

## Requirements

### Requirement: quad data model
Every `OpaqueFaceQuad` MUST carry `vertexLights` with exactly four entries in corner order.

#### Scenario: every producer emits four corners
- **GIVEN** any input to `greedyMergeOpaqueFaces`, `enumerateOpaqueFacesNaive`, `meshBlockModel`, or
  `processMeshSectionRequest` that yields quads
- **WHEN** the quads are inspected
- **THEN** each quad has `vertexLights.length === 4` with integer `sky`/`block` in [0, 15], and the
  first entry corresponds to `(minU, minV)`.

### Requirement: corner sampling rule
A corner's light MUST be `round(average)` of the cells adjacent to the corner in the outward layer:
for each in-plane axis, adjacent cell indices are `{c - 1, c}` when the corner coordinate `c` is an
integer and `{floor(c)}` otherwise; the sample set is the Cartesian product with the outward layer
coordinate fixed. Opaque cells contribute 0 (counted); out-of-section cells are skipped.

#### Scenario: open-air corner averages four cells
- **GIVEN** an all-air section and a quad with an integer corner away from section edges
- **WHEN** the corner is sampled
- **THEN** the corner light equals `round((L1 + L2 + L3 + L4) / 4)` where `L1..L4` are the sky/block
  light values of the four outward-layer cells around the corner.

#### Scenario: opaque neighbor darkens a corner
- **GIVEN** a corner whose outward-layer neighborhood includes an opaque cell with light 0
- **WHEN** the corner is sampled
- **THEN** the opaque cell contributes 0 to the average (the corner may be darker than the
  open-air case).

#### Scenario: section edge skips out-of-bounds cells
- **GIVEN** a quad corner at the section boundary
- **WHEN** the corner is sampled
- **THEN** out-of-section cells are not counted, and a corner with zero in-section cells is `(0, 0)`.

#### Scenario: fractional corner uses the containing cell
- **GIVEN** a template-meshed face whose in-plane corner coordinate `c` is fractional (e.g., `8/16`)
- **WHEN** the corner is sampled
- **THEN** the axis contributes only `{floor(c)}` to the sample set.

### Requirement: outward layer selection
The outward layer MUST follow the rule in Definitions for both meshers.

#### Scenario: full-cube faces sample the neighbor layer
- **GIVEN** a full cube at world cell `(0, 0, 0)` in an all-air section
- **WHEN** its `up` face (plane `y = 1`) and `down` face (plane `y = 0`) are sampled
- **THEN** the up face samples layer `y = 1` and the down face samples layer `y = -1`.

#### Scenario: slab top face samples the cell above
- **GIVEN** a slab (element `[0,0,0]..[16,8,16]`) at world cell `(0, 0, 0)`
- **WHEN** its `up` face (plane `y = 0.5`) is sampled
- **THEN** the outward layer is `y = 1` (the cell above the block).

### Requirement: worker payload carries light
`MeshSectionRequestPayload` MUST include `skyLight` and `blockLight` arrays of 4096 entries with
integer values in [0, 15]; `processMeshSectionRequest` MUST reject arrays with wrong length or
out-of-range values, and MUST produce quads whose `vertexLights` come from those arrays.

#### Scenario: malformed light arrays rejected
- **GIVEN** a payload with `skyLight.length !== 4096`, or a value outside [0, 15]
- **WHEN** `processMeshSectionRequest` runs
- **THEN** it throws a validation error and returns no partial result.

#### Scenario: light flows into quads
- **GIVEN** a payload with cells, `opaqueIds`, and light arrays
- **WHEN** `processMeshSectionRequest` runs
- **THEN** every resulting quad's corner values match the payload light arrays at the corner's
  outward-layer cells (per the sampling rule), and equal the output of `greedyMergeOpaqueFaces`
  with an equivalent sampler.

### Requirement: determinism
Identical inputs to any quad producer MUST produce identical quads, including `vertexLights`.

#### Scenario: repeated calls agree
- **GIVEN** identical section data and light arrays
- **WHEN** the producer runs twice
- **THEN** the outputs are deeply equal.

## Error and failure behavior

- Malformed light arrays in the worker payload throw, mirroring the existing `cells` validation
  (no partial results, no state).
- No other failure modes: sampling is total — any corner either averages ≥ 1 in-section cells or
  yields `(0, 0)`.

## Performance and resource bounds

- Corner sampling costs at most 4 cell reads per corner (16 per quad).
- Worker payload grows by 2 × 4096 numbers; the producer validates them in one pass.

## Compatibility and migration

`OpaqueFaceQuad` gains a required field and the meshing functions gain a required `light` parameter;
all producers/consumers in the repository are updated in this change. Worker payload shape changes;
no external producers exist. No stored data or serialization changes.

## Security and integrity

Not applicable beyond validation: light arrays are length- and range-checked before use; sampling
never indexes out of bounds (cell reads are guarded by `inBounds`).

## Observability

`vertexLights` is plain immutable data on every quad; tests assert exact tuples. Deterministic by
construction.

## Verification mapping

- `tests/unit/VertexLighting.test.ts` — corner sampling rule, outward layer selection, fractional
  corners, section edges, gradient fixture, determinism, corner order.
- `tests/unit/GreedyMesher.test.ts` — updated fixtures keep geometry equivalence; quads carry
  `vertexLights` from the supplied sampler.
- `tests/unit/TemplateMesher.test.ts` — slab/full-cube faces carry light sampled per the rule.
- `tests/unit/WorkerMeshing.test.ts` — payload validation (length/range) and equivalence between
  `processMeshSectionRequest` and `greedyMergeOpaqueFaces` with an equivalent sampler.
