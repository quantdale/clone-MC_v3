# Design: 083-fluid-surface-meshing

## Context / current state

Fluids are modeled (076-082) but invisible: no level-aware surface or side geometry exists.

## Target state

`meshFluidSurface(world, fluidId, light, x, y, z)` returns the fluid cell's surface quads
(deterministic, 062-shaped, 070/071-lit); `meshFluidSurfaces` batches over positions in input
order.

## Invariants

- Top face plane: `y + fluidSurfaceHeight(level)` (076 — source/falling 1.0; flowing
  `(8 - level) / 8`).
- Top face emitted only when the cell above is not the same fluid.
- Side face (neighbor `n`): same fluid with `surface(n) >= surface(this)` → none; same fluid with
  lower surface → spans `[nY + surface(n), y + surface(this)]`; non-same fluid or air → spans
  `[y, y + surface(this)]`. Zero-height sides are never emitted.
- Quad `blockId` is the fluid id; emission order per cell: up, then `-x, +x, -z, +z`.
- Light/AO sampled via 070/071 with the face's own cell as context.

## API and data model

```ts
// src/rendering/FluidSurfaceMesher.ts (NEW)
export interface FluidSurfaceWorld {
  getFluidState(x: number, y: number, z: number): FluidState | null;
}
export function meshFluidSurface(
  world: FluidSurfaceWorld, fluidId: number, light: LightSampler,
  x: number, y: number, z: number,
): OpaqueFaceQuad[];
export function meshFluidSurfaces(
  world: FluidSurfaceWorld, fluidId: number, light: LightSampler,
  positions: ReadonlyArray<[number, number, number]>,
): OpaqueFaceQuad[];
```

## Control / data flow

1. The wiring enumerates fluid cells (or waterlogged surfaces) and calls `meshFluidSurfaces`.
2. Each cell emits its top + side quads; the renderer consumes them like opaque quads (074
   partitions translucent sets).
3. Light/AO are sampled per quad corner via 070/071 `quadVertexLights`/`quadVertexAO`.

## Detailed behavior

- `meshFluidSurface` reads the cell's state; no fluid or a different fluid id → `[]`.
- Top: `above = getFluidState(x, y+1, z)`; emit when `above` is null or `above.fluidId !==
  fluidId`; the up quad at `(x, y + surface, z)` width/height 1.
- Sides: for each neighbor in fixed order, `nState`; `nTop = nState && nState.fluidId === fluidId
  ? nY + fluidSurfaceHeight(nState.level) : y`; `ownTop = y + fluidSurfaceHeight(level)`; skip
  when `nTop >= ownTop`; else emit the side quad spanning `[nTop, ownTop]` (plane at the neighbor
  side; in-plane axes per 062 conventions; width 1 along the u axis, height `ownTop - nTop`).
- Falling cells (surface 1.0) emit full-height sides like sources.

## Failure modes

- None: reads are total; world accessors are trusted.

## Compatibility / migration

Additive; no existing modules touched.

## Performance / resource constraints

Per cell: ≤ 5 neighbor reads; ≤ 5 quads emitted (up + 4 sides).

## Testing seams

- `tests/unit/FluidSurfaceMesher.test.ts` (NEW): top-face presence/absence and plane per level
  class; side faces vs air, block, different fluid, lower same-fluid (step), equal/higher same
  fluid (none); zero-height skip; empty/different-fluid cells; light/AO attachment; emission
  order; batch determinism.

## Observability / debugging

Quads are plain data; tests assert exact planes and extents.

## Affected files / symbols

- `src/rendering/FluidSurfaceMesher.ts` — NEW.
- `tests/unit/FluidSurfaceMesher.test.ts` — NEW.

## Rejected alternatives

- *Custom fluid quad type*: the renderer consumes one quad shape (062); reusing it with
  `blockId = fluidId` keeps the pipeline uniform.
- *Down faces*: underwater geometry is a later refinement; the change scope names surfaces and
  side heights.

## Downstream dependencies

084 fluid regression fixtures cover surface output; the renderer wires these quads through 074
translucent ordering.
