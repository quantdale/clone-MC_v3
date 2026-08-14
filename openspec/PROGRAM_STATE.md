# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **070-light-aware-meshing — VERIFIED 100%**
- Active implementation change: **070-light-aware-meshing — VERIFIED**
- Next change: **071-ambient-occlusion — NOT YET ACTIVE (artifacts pending)**
- 070 task ledger: **7 total tasks, 7 completed**
- 070 completion: **100%**
- 070 mandatory light-aware-meshing requirements: **PASS**
- 070 required-test gate: **PASS — unit 792/792, E2E 19/19**
- 070 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `06356e95c96e96f8e0ac63ab520bd1706de36de0`
- Next exact action: **Advance to 071-ambient-occlusion. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (071 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement Minecraft-like vertex AO factors on generated quads (deterministic, per-vertex, orthogonal to 070 light), verify full gate, commit + push, advance program state.**

## What 070 implemented

Change 070 makes per-vertex light enter every generated mesh.

- `src/rendering/VertexLighting.ts` (NEW) — `FaceLightContext`, `sampleCornerLight`,
  `quadVertexLights`: a corner's sky/block light is the rounded average of the outward-layer cells
  adjacent to it (integer corner coordinates sample the `{c-1, c}` pair per in-plane axis,
  fractional coordinates the containing cell); opaque cells contribute 0 and count; out-of-section
  cells are skipped; all-out-of-section corners are `(0, 0)`. Outward layer: integer planes sample
  `planeCoord` (max) / `planeCoord - 1` (min); fractional planes sample `cell + 1` / own cell.
- `src/rendering/GreedyMesher.ts` — `VertexLight`, `LightSampler`, required
  `OpaqueFaceQuad.vertexLights` (fixed corner order `(minU,minV), (maxU,minV), (minU,maxV),
  (maxU,maxV)`); `greedyMergeOpaqueFaces`/`enumerateOpaqueFacesNaive` take a required
  `light: LightSampler`.
- `src/rendering/TemplateMesher.ts` — `meshBlockModel` takes a required `light: LightSampler`
  (fractional extents supported).
- `src/rendering/WorkerMeshing.ts` — `MeshSectionRequestPayload` gains `skyLight`/`blockLight`
  (4096 entries, integers in [0, 15], validated); `sectionLightSampler(payload)` builds the
  section-local sampler; results carry lit quads.
- `tests/unit/VertexLighting.test.ts` (NEW) — 9 tests: hand-computed corner averages, opaque
  contribution, section edges, all-out-of-bounds corners, fractional corners, min-face layers with
  negative Y, corner order, gradient, determinism. GreedyMesher/TemplateMesher/WorkerMeshing tests
  updated (13 new tests total).

## Validation evidence (070)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 792/792 (prior 779 + 13 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 070 is **VERIFIED** at 7/7 (100%). All gates are green: typecheck, lint, the new 070 suites,
the full unit suite (792/792, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 071 (pending artifacts)

`071-ambient-occlusion` is named in `CHANGE_SEQUENCE.md` with scope "Minecraft-like local ambient
occlusion at block vertices." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 070 verification.
Change 071 is the next change; its artifacts must be authored and validated before implementation
begins.
