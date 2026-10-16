# Design: 063-template-partial-block-meshing

## Context / current state

062 merges full-cube faces. Partial blocks need model-based meshing.

## Target state

`meshBlockModel` converts a 059 `BlockModel` at a world cell into world-unit `OpaqueFaceQuad`s:
per element, per face, the quad spans the two in-plane axes from `from/16` to `to/16` at the face
plane (`from/16` for min-side faces, `to/16` for max-side faces). Boundary faces are culled when the
outward neighbor cell is opaque; interior faces are never culled.

## Invariants

- Face planes: `down` at `from.y/16`, `up` at `to.y/16`, `north` at `from.z/16`, `south` at
  `to.z/16`, `west` at `from.x/16`, `east` at `to.x/16`.
- A face is culled only when its plane sits on the block's outer boundary (local 0 or 1) AND the
  outward neighbor (`cell + face normal`) is opaque.
- Quads are emitted in model element order, faces in the model's key order (deterministic).
- `isFullCubeModel` is true iff there is exactly one element covering `[0,0,0]..[16,16,16]` and it
  declares all six faces.

## API and data model

```ts
// src/rendering/TemplateMesher.ts
export type OpaqueCellPredicate = (x: number, y: number, z: number) => boolean;
export function meshBlockModel(
  model: BlockModel,
  blockId: number,
  x: number, y: number, z: number,
  isOpaqueCell: OpaqueCellPredicate,
): OpaqueFaceQuad[];
export function isFullCubeModel(model: BlockModel): boolean;
```

## Control / data flow

1. The mesher (063+ wiring) resolves a block state's model (060), then calls `meshBlockModel`.
2. Each face plane is computed; the outward neighbor is sampled; culled faces are skipped.
3. Emitted quads feed vertex emission (later consumer step).

## Detailed behavior

- Quad position: the plane coordinate in world units is `cell + local`; the two in-plane extents are
  `(to - from) / 16` (world units).
- For `up`/`down`, u = x, v = z; for `north`/`south`, u = x, v = y; for `east`/`west`, u = z, v = y.
- Outward neighbor: `down` → (x, y-1, z), `up` → (x, y+1, z), `north` → (x, y, z-1), `south` → (x,
  y, z+1), `west` → (x-1, y, z), `east` → (x+1, y, z).

## Failure modes

- Sampler exceptions propagate (caller bug).

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

O(elements × faces per element) per block; typical models have 1-4 elements.

## Testing seams

- `tests/unit/TemplateMesher.test.ts`:
  - full cube isolated → 6 quads (1×1) at the six boundary planes;
  - full cube surrounded → 0 quads;
  - slab model → top at y+0.5 (1×1), bottom at y, four side quads; an opaque north neighbor culls
    only the north face;
  - stair-like two-element model → quads from both elements; an interior face (plane not at 0/1) is
    never culled even with an opaque neighbor;
  - `isFullCubeModel` true/false fixtures.

## Observability / debugging

Quad lists are directly inspectable.

## Affected files / symbols

- `src/rendering/TemplateMesher.ts` — NEW.
- `tests/unit/TemplateMesher.test.ts` — NEW.

## Rejected alternatives

- *Special-casing slab/stairs/panes with hard-coded shapes*: models already encode the geometry;
  one generic model mesher serves every template.

## Downstream dependencies

064+ (worker meshing) emit vertices from these quads; 065 (worker section meshing) uses
`meshBlockModel` per block.
