# Tasks: 145-passive-mob-baseline

## Implementation
- [x] `src/simulation/PassiveMobBaseline.ts`: `PassiveMobWorldAdapter` (`getCollisionShape`,
      `getBlockId`, `getSkyLight`, `getBlockLight`, `getBiomeDefinition`, `getSurfaceHeightAt`).
- [x] `PIG_BOUNDING_BOX`, `SPAWN_CAP`, `SPAWN_ATTEMPTS_PER_CHUNK`, `SPAWN_CYCLE_INTERVAL_TICKS`
      constants.
- [x] `PassiveMobSystem` class: constructor (registry, seed), `spawnCycle`, `tick`,
      `getActivePigs`.
- [x] `src/rendering/PassiveMobRenderer.ts`: `PassiveMobRenderer` class (`sync`, `dispose`).
- [x] `src/engine/Game.ts`: construct `PassiveMobWorldAdapter`/`PassiveMobSystem`/
      `PassiveMobRenderer`; track renderer for disposal; throttled spawn-cycle sweep call; per-frame
      `tick`/`sync` calls in `update(dt)`.

## Tests
- [x] `tests/unit/PassiveMobBaseline.test.ts`: adapter collision-shape solid/air cases.
- [x] Adapter sky-light open-column/overhang cases.
- [x] Adapter biome-definition bridging for all four legacy keys.
- [x] `PassiveMobSystem.spawnCycle` cap-enforcement case (more attempts than cap never exceeds it).
- [x] `PassiveMobSystem.tick` ticking-set gating case (non-ticking entity untouched).
- [x] `PassiveMobSystem.tick` goal-selector assignment + gravity/physics composition case.
- [x] `tests/unit/PassiveMobRenderer.test.ts`: sync add/update/remove-to-match-live-set case.
- [x] `PassiveMobRenderer.dispose` empties the scene case.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test files pass in isolation (17/17: 14 PassiveMobBaseline + 3 PassiveMobRenderer).
- [x] Full `npm test` passes (167 files, 1883/1883).
- [x] `npm run build` passes (98 modules, up from 83 — confirms new consumer wiring).
- [x] `npm run test:e2e` passes (22/22 — 21 existing + new "spawns a live, simulated pig entity"
      assertion confirming a real `passive-mob-pig` mesh appears in the live scene).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [ ] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 146-hostile-mob-baseline).
- [ ] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
