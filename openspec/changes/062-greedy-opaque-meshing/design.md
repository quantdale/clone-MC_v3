# Design: 062-greedy-opaque-meshing

## Context / current state

Opaque chunk meshes are face-by-face. Adjacent identical faces can merge into rectangles.

## Target state

`greedyMergeOpaqueFaces` scans a 16³ section per face and slice, builds a visibility grid
(opaque cell whose outward neighbor is not opaque), and greedily extends maximal rectangles of cells
sharing the same `faceKey`, emitting `OpaqueFaceQuad`s. `enumerateOpaqueFacesNaive` emits one quad
per exposed face for equivalence testing.

## Invariants

- A face is exposed iff the cell is opaque (`isOpaque`) and the neighbor across the face is not
  opaque (or outside the section → exposed).
- Cells merge only when their `faceKey(id, face)` values are equal.
- Quads are emitted deterministically: faces in order `down, up, north, south, east, west`; slices in
  increasing order; rectangles expanded row-major.
- Merged coverage equals naive coverage (equivalence); merged quad count ≤ naive count.

## API and data model

```ts
// src/rendering/GreedyMesher.ts
export interface OpaqueFaceQuad {
  face: ModelFace;
  x: number; y: number; z: number;  // min corner in block units (face plane included)
  width: number; height: number;    // extent along the two in-plane axes
  blockId: number;
}
export type FaceCellSampler = (x: number, y: number, z: number) => number | null;
export type OpaquePredicate = (id: number) => boolean;
export type FaceKeyFn = (id: number, face: ModelFace) => string;

export function greedyMergeOpaqueFaces(
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
): OpaqueFaceQuad[];

export function enumerateOpaqueFacesNaive(
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
): OpaqueFaceQuad[]; // one 1x1 quad per exposed face
```

## Control / data flow

1. For each face, for each slice along the face's axis:
   - Build a 16×16 visibility grid: `visible[u][v] = (key, id) | null`.
   - Greedily scan: at the first unconsumed visible cell, extend width along `u` while the row
     matches, then extend height along `v` while every cell in the next row matches; emit the quad;
     consume the rectangle.
2. The quad's position uses the face plane's block-unit coordinate (e.g. `up` at slice `y` sits at
   `y + 1`).

## Detailed behavior

- Face planes: `down`/`up` → slices over y, plane at y / y+1, u = x, v = z; `north`/`south` → slices
  over z, plane at z / z+1, u = x, v = y; `west`/`east` → slices over x, plane at x / x+1, u = z,
  v = y.
- Out-of-section neighbors are treated as not opaque (faces on the section boundary are exposed).
- `blockId` on a merged quad is the id of the first consumed cell (all share the same key).

## Failure modes

- Sampler/predicate exceptions propagate (caller bug).

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

O(6 × 16 × 16 × 16 × key-comparisons) worst case; typical solid plains merge to a handful of quads.

## Testing seams

- `tests/unit/GreedyMesher.test.ts` with an in-memory 16³ sampler:
  - empty section → [];
  - single opaque cube → 6 quads, each 1×1, correct planes;
  - a 2×1×1 slab → top/sides merge (6 quads vs 10 naive faces);
  - a flat 16×16 plain at y=0 → 1 quad per exposed face kind;
  - key separation: adjacent cells with different ids do not merge;
  - equivalence: for several fixture grids, merged coverage area == naive area and merged count ≤
    naive count;
  - determinism: identical inputs → identical quad lists.

## Observability / debugging

Quad lists are directly inspectable (face, position, extent).

## Affected files / symbols

- `src/rendering/GreedyMesher.ts` — NEW.
- `tests/unit/GreedyMesher.test.ts` — NEW.

## Rejected alternatives

- *Per-chunk global merging across sections*: sections are the meshing unit (023); per-section merging
  keeps jobs independent.

## Downstream dependencies

063 (template meshing) reuses the quad model; the mesher (later wiring) consumes `OpaqueFaceQuad`s
for vertex emission.
