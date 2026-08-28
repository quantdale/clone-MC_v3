# Tasks: 068-blocklight-propagation

> IMPLEMENTED. 067 was VERIFIED; 068 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (067 VERIFIED; baseline 749 unit / 19 e2e green).
- [x] 2. Add `src/rendering/BlockLightEngine.ts` (`BlockLightWorld`, `computeBlockLight`; luminance-source seeding incl. opaque sources, FIFO BFS falloff with fixed neighbor order, sources never dimmed, deterministic).
- [x] 3. Add `tests/unit/BlockLightEngine.test.ts` (torch falloff, opaque glowstone source, corner propagation, wall blocking, determinism).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
