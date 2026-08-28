# Tasks: 063-template-partial-block-meshing

> IMPLEMENTED. 062 was VERIFIED; 063 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (062 VERIFIED; baseline 717 unit / 19 e2e green).
- [x] 2. Add `src/rendering/TemplateMesher.ts` (`meshBlockModel(model, blockId, x, y, z, isOpaqueCell)`, `isFullCubeModel(model)`; face-plane math, boundary-only culling, deterministic order).
- [x] 3. Add `tests/unit/TemplateMesher.test.ts` (full cube isolated/buried, slab + neighbor culling, multi-element, interior non-culling, full-cube detection).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
