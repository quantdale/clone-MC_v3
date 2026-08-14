# Tasks: 058-shape-aware-raycast

> IMPLEMENTED. 057 was VERIFIED; 058 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (057 VERIFIED; baseline 688 unit / 19 e2e green).
- [x] 2. Add `src/world/ShapeRaycast.ts` (`SelectionShapeWorld`, `ShapeRayHit`, `raycastSelection`; DDA cell traversal + per-box slab intersection, entry-face normals, maxDistance, degenerate-input guards).
- [x] 3. Add `tests/unit/ShapeRaycast.test.ts` (full-cube hit, slab pass-through + slab hit, nearest cell, maxDistance, degenerate inputs).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
