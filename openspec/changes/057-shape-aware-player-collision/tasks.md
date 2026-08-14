# Tasks: 057-shape-aware-player-collision

> IMPLEMENTED. 056 was VERIFIED; 057 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (056 VERIFIED; baseline 681 unit / 19 e2e green).
- [x] 2. Add `src/world/CollisionResolver.ts` (`ShapeWorld`, `CollisionBox`, `MovementResult`, `CollisionResolver` with `move` (X→Y→Z axis-separated face snapping + flags)/`collides`; epsilon handling, deterministic).
- [x] 3. Add `tests/unit/CollisionResolver.test.ts` (wall stop, floor landing, slab top at 0.5, axis separation, empty space, collides query).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
