# Proposal: 070-light-aware-meshing

## Problem

Generated quads (062 greedy mesher, 063 template mesher) carry geometry only. Section meshes must
carry per-vertex sky/block light values so the renderer can shade surfaces with Minecraft-style
blocky lighting. The worker pipeline (065) has no light data at all today.

## Goals

- `OpaqueFaceQuad` carries four per-corner `(sky, block)` light values (0-15, integers).
- Deterministic corner sampling: rounded average of the air cells adjacent to the corner in the
  outward layer; opaque cells count as 0; out-of-section cells are skipped.
- Both meshers (greedy + template) and the worker section pipeline emit lit quads.
- Worker request payloads carry per-section sky/block light arrays, validated.

## Non-goals

- Rendering/interpolation of light in the scene (a later rendering change).
- Ambient occlusion (071-ambient-occlusion handles vertex AO separately).
- Cross-section light sampling: the sampler is caller-supplied, so a future wiring MAY provide
  neighbor-section light; the worker itself only knows its own section (boundary faces sample 0
  outside the section — documented in the spec).

## Preconditions

- Change 069 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 069 baseline (779 unit / 19 e2e).

## Dependencies

- 062 `OpaqueFaceQuad`/greedy meshing; 063 template meshing; 065 worker payload; 066 light storage
  data shape; 067/068 light value semantics (0-15 nibbles).

## Proposed change

- `src/rendering/GreedyMesher.ts`: add `VertexLight`, `LightSampler` (world-coordinate cell sampling:
  `inBounds`/`isOpaque`/`getSkyLight`/`getBlockLight`), and required `vertexLights` on
  `OpaqueFaceQuad`; `greedyMergeOpaqueFaces`/`enumerateOpaqueFacesNaive` take a required
  `light: LightSampler` parameter and emit lit quads.
- `src/rendering/VertexLighting.ts` (NEW): `FaceLightContext`; `sampleCornerLight(light, ctx, u, v)`;
  `quadVertexLights(light, ctx, minU, minV, width, height)` returning the fixed 4-corner tuple.
- `src/rendering/TemplateMesher.ts`: `meshBlockModel` takes a required `light: LightSampler`
  parameter and emits lit quads (fractional in-plane extents supported).
- `src/rendering/WorkerMeshing.ts`: `MeshSectionRequestPayload` gains `skyLight: number[]` and
  `blockLight: number[]` (4096 entries each, values 0-15, validated like `cells`);
  `processMeshSectionRequest` builds a section-local `LightSampler` and returns lit quads.
- `tests/unit/VertexLighting.test.ts` (NEW); 062/063/065 test call sites updated for the new params.

## Compatibility and migration

Additive data-model change; `OpaqueFaceQuad` gains a required field, so every producer/consumer in
the repo is updated in this change. No stored data changes. The worker request shape changes; there
are no live producers/consumers outside the repo yet.

## Risks

- Corner semantics for fractional (partial-block) faces differ from full-block faces; the rule is
  explicit in the spec and covered by tests (template mesher slab fixtures).
- Section-boundary faces cannot see neighbor-section light; they sample 0 outside the section.
  Deterministic and documented; the sampler abstraction allows a future wiring to supply it.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Every quad produced by `greedyMergeOpaqueFaces`, `enumerateOpaqueFacesNaive`, `meshBlockModel`, and
  `processMeshSectionRequest` carries a 4-corner `vertexLights` tuple in the documented order.
- Corner values are integers in [0, 15]; opaque cells contribute 0; out-of-section cells are skipped;
  fractional corners use the containing cell.
- Worker rejects malformed light arrays (wrong length or out-of-range values).
- Deterministic: identical inputs produce identical quads (greedy vs naive equivalence keeps
  geometry equality and light equality).
- Unit tests cover hand-computed corner fixtures, gradient fixtures, section boundaries, fractional
  faces, worker validation, and determinism.
- Full gate green; 070 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 070 suite; E2E stays 19/19.
