# Design: 071-ambient-occlusion

## Context / current state

070 gives every `OpaqueFaceQuad` per-corner `vertexLights` (rounded average of outward-layer cells).
Quads still have no notion of local occlusion, so block corners near other blocks are as bright as
open-air corners.

## Target state

Every `OpaqueFaceQuad` carries `vertexAO: [AOLevel × 4]` (0-3, Minecraft scale) in the same corner
order as `vertexLights`, computed from the 3-cell neighborhood (two in-plane sides + diagonal) in
the outward layer with the classic Minecraft table. Meshers and the worker pipeline emit it
deterministically; the 070 light rule is untouched.

## Invariants

- AO values are exactly `0 | 1 | 2 | 3`.
- AO uses the same corner order as 070 `vertexLights` and the same outward-layer rule
  (`FaceLightContext`).
- For a corner, `side1 = (floor(u) - 1, floor(v))`, `side2 = (floor(u), floor(v) - 1)`,
  `corner = (floor(u) - 1, floor(v) - 1)` in the outward layer (integer corners reduce to the
  classic Minecraft rule).
- Table: both sides opaque → 0; one side opaque and corner opaque → 1; one side opaque and corner
  not → 2; no sides opaque and corner opaque → 2; nothing → 3.
- Out-of-section cells never occlude (treated as non-opaque); the cell directly in front of the
  corner (`(floor(u), floor(v))`) is never sampled for AO.

## API and data model

```ts
// src/rendering/GreedyMesher.ts (additions)
export type AOLevel = 0 | 1 | 2 | 3;
export interface OpaqueFaceQuad {
  // ... existing fields ...
  vertexLights: [VertexLight, VertexLight, VertexLight, VertexLight];
  /** Per-corner ambient occlusion, same corner order as vertexLights (071). */
  vertexAO: [AOLevel, AOLevel, AOLevel, AOLevel];
}

// src/rendering/AmbientOcclusion.ts (NEW)
export function sampleCornerAO(light: LightSampler, ctx: FaceLightContext, u: number, v: number): AOLevel;
export function quadVertexAO(
  light: LightSampler, ctx: FaceLightContext,
  minU: number, minV: number, width: number, height: number,
): [AOLevel, AOLevel, AOLevel, AOLevel];
```

## Control / data flow

1. Meshers build the per-quad `FaceLightContext` (as in 070) and call `quadVertexAO` alongside
   `quadVertexLights`.
2. `quadVertexAO` computes the four corner levels via `sampleCornerAO`.
3. `sampleCornerAO` reads `side1`, `side2`, `corner` opacity through `light.inBounds` /
   `light.isOpaque` and applies the 0-3 table.
4. Worker section meshing needs no payload change: `opaqueIds` already carry opacity.

## Detailed behavior

- The outward layer and in-plane axes come from `FaceLightContext` (same as 070).
- Fractional corner coordinates (partial-block faces) snap to `floor()` before the 3-cell lookup —
  deterministic and equal to the classic rule for integer corners.
- The sampled cell directly in front of the corner is never consulted (Minecraft rule).

## Failure modes

- None new: sampling is total; out-of-section cells simply do not occlude.

## Compatibility / migration

`OpaqueFaceQuad` gains a required field; every producer and test call site in the repo is updated in
this change. No worker payload or stored-data changes.

## Performance / resource constraints

AO costs at most 3 opacity reads per corner (12 per quad) — same order as 070 light sampling.

## Testing seams

- `tests/unit/AmbientOcclusion.test.ts` (NEW): the five table cases (0/1/2/2/3), out-of-section
  cells never occlude, corner order matches 070, fractional corners, determinism.
- Greedy/Template/Worker tests: updated call sites; integration assertions that quads carry
  `vertexAO` (e.g., a block next to a wall has darker shared corners); equivalence checks compare
  full quads including AO.

## Observability / debugging

`vertexAO` is plain data per quad; tests assert exact corner tuples.

## Affected files / symbols

- `src/rendering/GreedyMesher.ts` — `AOLevel`, `OpaqueFaceQuad.vertexAO`.
- `src/rendering/AmbientOcclusion.ts` — NEW: `sampleCornerAO`, `quadVertexAO`.
- `src/rendering/TemplateMesher.ts` — emits `vertexAO`.
- `src/rendering/WorkerMeshing.ts` — no change (AO flows through the mesher).
- Tests: `AmbientOcclusion.test.ts` NEW; `GreedyMesher.test.ts`, `TemplateMesher.test.ts`,
  `WorkerMeshing.test.ts` updated.

## Rejected alternatives

- *Combine AO into `vertexLights`*: couples two orthogonal shading inputs; the renderer must be
  able to apply them independently.
- *1D (0-1) AO factor*: loses the Minecraft 4-level granularity used by the classic table.
- *Sample the front cell too*: diverges from Minecraft's rule and blurs the distinction between
  light (front cell) and AO (side/corner cells).

## Downstream dependencies

A later rendering change combines `vertexLights` (070) and `vertexAO` (071) into final vertex
shading.
