# Tasks: 061-render-layer-model

> IMPLEMENTED. 060 was VERIFIED; 061 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (060 VERIFIED; baseline 705 unit / 19 e2e green).
- [x] 2. Add `src/rendering/RenderLayer.ts` (`RenderLayer`, `RENDER_LAYERS` pinned order, `isRenderLayer`/`parseRenderLayer`/`compareLayers`, `RenderLayerRegistry` with `setLayer`/`getLayer`/`has`/`size`/`clear`, default opaque, unknown-layer rejection).
- [x] 3. Add `tests/unit/RenderLayer.test.ts` (layer set, parse matrix, ordering, registry round-trip + validation).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
