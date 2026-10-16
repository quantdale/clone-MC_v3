# Design: 074-translucent-surface-rendering

## Context / current state

Quads are layer-agnostic: 062 emits geometry, 070/071 decorate light/AO. 061 defines the
`translucent` layer vocabulary and a per-block registry, but nothing partitions or orders
translucent geometry.

## Target state

A caller can partition a quad batch into solid/translucent sets (via a blockId → layer resolver)
and obtain a deterministic far-first ordering of the translucent set for any camera position. Pure
functions; no scene wiring.

## Invariants

- Partition buckets preserve input order.
- `translucent` is exactly layer `'translucent'`; every other layer lands in `opaque`.
- Sort order: descending `distanceSq(quadCentroid(q), camera)`; equal distances keep input order
  (explicit stable tie-break by input index).
- Sorting never mutates its input and is deterministic for identical (quads, camera).

## API and data model

```ts
// src/rendering/TranslucentGeometry.ts (NEW)
import type { RenderLayer } from './RenderLayer';
import type { OpaqueFaceQuad } from './GreedyMesher';

export type QuadLayerResolver = (blockId: number) => RenderLayer;

export interface QuadPartition {
  opaque: OpaqueFaceQuad[];
  translucent: OpaqueFaceQuad[];
}

export function partitionQuadsByLayer(quads: readonly OpaqueFaceQuad[], layerOf: QuadLayerResolver): QuadPartition;
export function quadCentroid(quad: OpaqueFaceQuad): [number, number, number];
export function sortTranslucentBackToFront(
  quads: readonly OpaqueFaceQuad[],
  cameraX: number, cameraY: number, cameraZ: number,
): OpaqueFaceQuad[];
```

## Control / data flow

1. Meshing produces quads with `blockId` (062).
2. The caller resolves each quad's layer via `layerOf(blockId)` (061 registry backed) and calls
   `partitionQuadsByLayer`.
3. Solid quads go to the opaque pass; translucent quads go to `sortTranslucentBackToFront` with the
   current camera position.
4. The renderer draws the returned list far-to-near (painter's algorithm).

## Detailed behavior

- Centroid: the quad's min corner advanced by half-extents along the two in-plane axes
  (`inPlaneAxes` from 070): up/down → `(x + w/2, y, z + h/2)`; north/south →
  `(x + w/2, y + h/2, z)`; east/west → `(x, y + h/2, z + w/2)`.
- Distance: squared Euclidean distance from the centroid to the camera (monotone with depth,
  cheaper; deterministic).
- Tie-break: quads with equal distance keep their input order (explicit stable sort).
- Partition buckets are fresh arrays; the input array is never mutated.

## Failure modes

None: pure functions over quad data; no I/O, no state.

## Compatibility / migration

Additive. 062/070/071 unchanged; the layer resolver is caller-supplied so existing producers need
no edits.

## Performance / resource constraints

Partition: O(n). Sort: O(n log n) with O(n) extra memory; distances computed once per quad.

## Testing seams

- `tests/unit/TranslucentGeometry.test.ts` (NEW):
  - partition: mixed layers split correctly, order preserved, empty input;
  - centroid: one quad per face plane kind with known extents;
  - sort: far-first order on hand-computed distances, tie stability, determinism, input immutability.

## Observability / debugging

Partition/sort outputs are plain arrays; tests assert exact orders.

## Affected files / symbols

- `src/rendering/TranslucentGeometry.ts` — NEW.
- `tests/unit/TranslucentGeometry.test.ts` — NEW.

## Rejected alternatives

- *Stamping the layer onto `OpaqueFaceQuad`*: forces churn in 062/070/071 producers; the resolver
  keeps the quad model layer-free and the mapping caller-owned.
- *View-space depth sorting*: requires a camera matrix; squared world distance is deterministic and
  sufficient for per-quad painter's order.
- *Incremental re-sort on camera move*: premature; full re-sort is O(n log n) and simple.

## Downstream dependencies

The scene renderer (later) consumes `partitionQuadsByLayer` + `sortTranslucentBackToFront`; 075
measures the resulting draw costs.
