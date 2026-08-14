# Tasks: 074-translucent-surface-rendering

> VERIFIED. Entry gate confirmed (073 VERIFIED; baseline 826 unit / 19 e2e green).

- [x] 1. Confirm entry gate (073 VERIFIED; baseline 826 unit / 19 e2e green).
- [x] 2. Add `src/rendering/TranslucentGeometry.ts` (`QuadLayerResolver`, `partitionQuadsByLayer`, `quadCentroid`, `sortTranslucentBackToFront`; order-preserving buckets, far-first stable sort, input immutability).
- [x] 3. Add `tests/unit/TranslucentGeometry.test.ts` (partition mixed/empty, centroid per face kind, far-first order, tie stability, determinism, immutability).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
