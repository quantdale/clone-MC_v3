# Tasks: 032-render-vs-simulation-distance

> VERIFIED. All 5 tasks complete; advanced to 033.

- [x] 1. Confirm entry gate (031 VERIFIED; baseline 467 unit / 19 e2e green).
- [x] 2. Add `CONFIG.simulationDistance` (+ `headless.simulationDistance`) and the new pure module `src/world/RenderSimulationDistance.ts` (radii, chebyshev, isWithinRenderDistance/isWithinSimulationDistance, fromConfig, negative-radius guard).
- [x] 3. Integrate into `World`: store `simulationDistance` separately; add `getRenderDistance`/`getSimulationDistance`/`isChunkSimulating` (uses stream center); keep `ensureChunks`/`unloadChunks`/`getReadyProgress` on the render radius. Wire `Game.runtimeSimulationDistance()` into `World`; `Environment` keeps the render radius.
- [x] 4. Write `tests/unit/RenderSimulationDistance.test.ts` (pure classifier + `World` integration with distinct render/sim radii).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
