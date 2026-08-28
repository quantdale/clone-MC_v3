# Spec: translucent-geometry

## Contract

`partitionQuadsByLayer(quads, layerOf)` MUST split a quad batch into `{ opaque, translucent }`
where `translucent` contains exactly the quads whose resolved layer is `'translucent'`, preserving
input order in both buckets and never mutating the input. `sortTranslucentBackToFront(quads, cx, cy,
cz)` MUST return a new array ordered far-to-near by squared distance from the quad centroid to the
camera, with equal distances keeping input order (stable). `quadCentroid` MUST return the quad's
face-plane-aware center. All functions MUST be pure and deterministic.

## Definitions

- **QuadLayerResolver**: `(blockId: number) => RenderLayer` (061 vocabulary).
- **Quad centroid**: min corner advanced by half-extents along the two in-plane axes: up/down →
  `(x + w/2, y, z + h/2)`; north/south → `(x + w/2, y + h/2, z)`; east/west →
  `(x, y + h/2, z + w/2)`.
- **Far-to-near**: descending squared Euclidean distance to the camera.

## Invariants

- `translucent` contains only quads with resolved layer `'translucent'`; all others go to `opaque`.
- Bucket order equals input order.
- Sorting is stable (ties keep input order), deterministic, and returns a new array.
- Distance is squared Euclidean distance to the quad centroid.

## Requirements

### Requirement: partition
`partitionQuadsByLayer` MUST separate translucent quads from all others without reordering.

#### Scenario: mixed batch
- **GIVEN** quads with resolved layers `opaque`, `cutout`, `translucent`, `emissive`, `translucent`
- **WHEN** partition runs
- **THEN** `translucent` holds exactly the two `'translucent'` quads in input order and `opaque`
  holds the other three in input order.

#### Scenario: empty batch
- **GIVEN** an empty quad array
- **WHEN** partition runs
- **THEN** both buckets are empty arrays.

### Requirement: centroid
`quadCentroid` MUST return the face-plane-aware center.

#### Scenario: up face extents
- **GIVEN** an `up` quad at `(5, 1, 5)` with width 2, height 3
- **WHEN** the centroid is computed
- **THEN** it is `(6, 1, 6.5)`.

#### Scenario: north face extents
- **GIVEN** a `north` quad at `(0, 2, 0)` with width 4, height 2
- **WHEN** the centroid is computed
- **THEN** it is `(2, 3, 0)`.

### Requirement: far-to-near sort
`sortTranslucentBackToFront` MUST order quads by descending centroid distance and MUST keep ties in
input order.

#### Scenario: distinct distances
- **GIVEN** three quads at distances 5, 20, and 10 from the camera (input order 5, 20, 10)
- **WHEN** the sort runs
- **THEN** the output order is 20, 10, 5 (far first).

#### Scenario: ties stay in input order
- **GIVEN** two quads at equal distance, input order A then B
- **WHEN** the sort runs
- **THEN** the output keeps A before B.

### Requirement: purity and immutability
The functions MUST be deterministic and MUST NOT mutate their inputs.

#### Scenario: input preserved
- **GIVEN** a quad array
- **WHEN** partition and sort run
- **THEN** the input array and its quads are unchanged, and repeated calls return equal results.

## Error and failure behavior

None: the functions are total over quad data; no I/O, no state.

## Performance and resource bounds

Partition O(n); sort O(n log n) with O(n) extra memory; one distance computation per quad.

## Compatibility and migration

Additive: new module and test file; no changes to 062/070/071 or the worker payload. The layer
resolver is caller-supplied.

## Security and integrity

Not applicable.

## Observability

Outputs are plain arrays; tests assert exact orders and immutability.

## Verification mapping

- `tests/unit/TranslucentGeometry.test.ts` — partition scenarios, centroid per face kind, far-first
  ordering, tie stability, determinism, input immutability.
