# Tasks: 070-light-aware-meshing

> VERIFIED. Entry gate confirmed (069 VERIFIED; baseline 779 unit / 19 e2e green).

- [x] 1. Confirm entry gate (069 VERIFIED; baseline 779 unit / 19 e2e green).
- [x] 2. Add `VertexLight`/`LightSampler`/`vertexLights` to `src/rendering/GreedyMesher.ts`; add `light: LightSampler` param to `greedyMergeOpaqueFaces` and `enumerateOpaqueFacesNaive` (emit lit quads).
- [x] 3. Add `src/rendering/VertexLighting.ts` (`FaceLightContext`, `sampleCornerLight`, `quadVertexLights`; outward-layer rule, opaque→0, out-of-section skip, fractional corners, fixed corner order).
- [x] 4. Add `light: LightSampler` param to `meshBlockModel` in `src/rendering/TemplateMesher.ts` (emit lit quads, fractional extents).
- [x] 5. Add `skyLight`/`blockLight` (4096, 0-15) to `MeshSectionRequestPayload`; validate in `processMeshSectionRequest`; build section-local sampler; emit lit quads.
- [x] 6. Add `tests/unit/VertexLighting.test.ts` (hand-computed corner fixtures, opaque neighbors, section edges, fractional faces, gradient, determinism, corner order); update GreedyMesher/TemplateMesher/WorkerMeshing test call sites and add worker light-array validation tests.
- [x] 7. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
