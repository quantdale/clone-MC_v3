# Design: 070-light-aware-meshing

## Context / current state

062/063 produce `OpaqueFaceQuad`s (geometry + blockId). 065 ships them over the worker protocol from
plain `cells`/`opaqueIds` payloads. 066-069 define light storage and propagation, but no mesh carries
light.

## Target state

Every `OpaqueFaceQuad` carries `vertexLights: [VertexLight × 4]` (per-corner `{sky, block}` integers
in [0, 15], fixed corner order). Both meshers and the worker pipeline produce lit quads
deterministically; the worker request carries per-section light arrays.

## Invariants

- Corner order is fixed: `(minU, minV)`, `(maxU, minV)`, `(minU, maxV)`, `(maxU, maxV)`.
- A corner's light = `round(average(sample cells))`; sample cells are the cells adjacent to the
  corner in the outward layer (1-4 cells); opaque cells contribute 0 and are counted; out-of-section
  cells are skipped; if no cell is in section the corner is `(0, 0)`.
- Outward layer: along the face normal axis — for `isMax` faces the layer at `planeCoord` when
  `planeCoord` is an integer cell boundary, else `cellCoord + 1`; for min faces `planeCoord - 1`
  when integer, else `cellCoord`.
- Fractional in-plane corner positions sample only the containing cell on that axis
  (`{floor(c)}`); integer positions sample `{c - 1, c}`.
- Light values are never invented: absent light is 0.

## API and data model

```ts
// src/rendering/GreedyMesher.ts (additions)
export interface VertexLight { sky: number; block: number; }
export interface OpaqueFaceQuad {
  face: ModelFace; x: number; y: number; z: number; width: number; height: number; blockId: number;
  vertexLights: [VertexLight, VertexLight, VertexLight, VertexLight];
}
export interface LightSampler {
  inBounds(x: number, y: number, z: number): boolean;
  isOpaque(x: number, y: number, z: number): boolean;
  getSkyLight(x: number, y: number, z: number): number;
  getBlockLight(x: number, y: number, z: number): number;
}
export function greedyMergeOpaqueFaces(getCell, isOpaque, faceKey, light: LightSampler): OpaqueFaceQuad[];
export function enumerateOpaqueFacesNaive(getCell, isOpaque, faceKey, light: LightSampler): OpaqueFaceQuad[];

// src/rendering/VertexLighting.ts (NEW)
export interface FaceLightContext {
  axis: 0 | 1 | 2;
  isMax: boolean;
  /** Face plane coordinate along `axis`, in world units (integer for greedy; fractional for model faces). */
  planeCoord: number;
  /** World cell the face belongs to (used for the fractional-plane outward-layer fallback). */
  cellX: number; cellY: number; cellZ: number;
}
export function sampleCornerLight(light: LightSampler, ctx: FaceLightContext, u: number, v: number): VertexLight;
export function quadVertexLights(
  light: LightSampler, ctx: FaceLightContext,
  minU: number, minV: number, width: number, height: number,
): [VertexLight, VertexLight, VertexLight, VertexLight];

// src/rendering/TemplateMesher.ts
export function meshBlockModel(model, blockId, x, y, z, isOpaqueCell, light: LightSampler): OpaqueFaceQuad[];

// src/rendering/WorkerMeshing.ts
export interface MeshSectionRequestPayload {
  sectionX: number; sectionY: number; sectionZ: number;
  cells: Array<number | null>;
  opaqueIds: number[];
  skyLight: number[];   // 4096 entries, 0-15
  blockLight: number[]; // 4096 entries, 0-15
}
```

## Control / data flow

1. Worker receives `MeshSectionRequestPayload`; validates `cells`, `skyLight`, `blockLight`.
2. Builds `LightSampler` over the section (local index = `dx + 16*(dy + 16*dz)`; `inBounds` is the
   section box; `isOpaque` is the opaque-id set; `getSkyLight`/`getBlockLight` read the arrays).
3. `greedyMergeOpaqueFaces` runs the existing visibility-grid/merge; each emitted quad gets
   `vertexLights = quadVertexLights(light, greedyCtx(quad), minU, minV, width, height)`.
4. Template meshing likewise per model face with `ctx` from the block position and `planeCoord`
   from `cell[axis] + planeLocal`.
5. Renderer (future) interpolates corner values across each quad.

## Detailed behavior

- Greedy ctx: `axis`/`isMax` from the face plane; `planeCoord = slice + offset`;
  `cellX/Y/Z` = the face's own cell at the quad min corner (axis coord = `planeCoord - offset`,
  other coords from the quad min corner mapped through the plane's in-plane axes).
- Template ctx: `planeCoord = cell[axis] + planeLocal`; `cellX/Y/Z` = block position.
- In-plane axes: `axis 1 → (u=x, v=z)`, `axis 2 → (u=x, v=y)`, `axis 0 → (u=z, v=y)` (matches 062
  and 063 conventions).
- Corner sample cells: for each in-plane axis, adjacent cell indices are `{c - 1, c}` when `c` is an
  integer, else `{floor(c)}`; cells are the Cartesian product of the two sets with the outward layer
  coordinate fixed. Out-of-bounds cells are dropped; opaque cells contribute 0; the average uses
  `Math.round`.

## Failure modes

- Malformed worker payloads (light arrays wrong length or values outside [0, 15]) throw
  `Error`/`RangeError` from `processMeshSectionRequest`, mirroring the existing `cells` validation.
- All-corner-cells out of section → corner light `(0, 0)` (never NaN).

## Compatibility / migration

`OpaqueFaceQuad` gains a required field; all producers/consumers in this repo are updated in this
change. Worker payload gains two required arrays; only this repo's tests construct payloads.
No stored data, no serialization changes.

## Performance / resource constraints

Corner sampling is O(4) cells per corner, 16 samples per quad worst case. Worker payload grows by
8192 numbers (~64 KB structured-clone); bounded and deterministic. No allocation per cell beyond the
quad objects already emitted.

## Testing seams

- `tests/unit/VertexLighting.test.ts` (NEW): hand-computed corner fixtures (open sky, opaque
  neighbors, section edges, fractional faces), gradient fixture across a plain, determinism.
- `tests/unit/GreedyMesher.test.ts` / `TemplateMesher.test.ts` / `WorkerMeshing.test.ts`: updated
  call sites (required light param / payload arrays); greedy-vs-naive equivalence now also compares
  light; worker validation tests for malformed light arrays.

## Observability / debugging

Per-quad `vertexLights` is plain data; tests assert exact corner tuples. Deterministic by
construction (fixed iteration order, `Math.round`).

## Affected files / symbols

- `src/rendering/GreedyMesher.ts` — `VertexLight`, `LightSampler`, `OpaqueFaceQuad.vertexLights`,
  both meshing functions' `light` param.
- `src/rendering/VertexLighting.ts` — NEW: `FaceLightContext`, `sampleCornerLight`,
  `quadVertexLights`.
- `src/rendering/TemplateMesher.ts` — `meshBlockModel` `light` param.
- `src/rendering/WorkerMeshing.ts` — payload fields, validation, sampler wiring.
- Tests: `VertexLighting.test.ts` NEW; `GreedyMesher.test.ts`, `TemplateMesher.test.ts`,
  `WorkerMeshing.test.ts` updated.

## Rejected alternatives

- *Light as a separate side-array per section*: decouples light from quads but invites
  desynchronization; on-quad tuples make "meshes carry light" structural.
- *Uniform per-face light (single value)*: simpler but not per-vertex and prevents the renderer from
  interpolating gradients; the corner average is the classic MC approach.
- *Require neighbor-section light in the worker*: out of scope; the sampler interface leaves the door
  open for the future world wiring.

## Downstream dependencies

071 (ambient occlusion) adds per-vertex AO factors to the same quad data; a later rendering change
consumes `vertexLights` to shade geometry.
