# Tasks: 071-ambient-occlusion

> VERIFIED. Entry gate confirmed (070 VERIFIED; baseline 792 unit / 19 e2e green).

- [x] 1. Confirm entry gate (070 VERIFIED; baseline 792 unit / 19 e2e green).
- [x] 2. Add `AOLevel` and required `vertexAO` (4-tuple, 070 corner order) to `OpaqueFaceQuad` in `src/rendering/GreedyMesher.ts`.
- [x] 3. Add `src/rendering/AmbientOcclusion.ts` (`sampleCornerAO`, `quadVertexAO`; Minecraft 0-3 table, 3-cell outward-layer neighborhood, out-of-section non-occlusion, floor-snap for fractional corners).
- [x] 4. Emit `vertexAO` in `greedyMergeOpaqueFaces`/`enumerateOpaqueFacesNaive` (`src/rendering/GreedyMesher.ts`) and `meshBlockModel` (`src/rendering/TemplateMesher.ts`); worker pipeline inherits it (no payload change).
- [x] 5. Add `tests/unit/AmbientOcclusion.test.ts` (five table cases, out-of-section, corner order, fractional corners, determinism); update GreedyMesher/TemplateMesher/WorkerMeshing test call sites; add AO integration assertions (wall darkens shared corners).
- [x] 6. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
