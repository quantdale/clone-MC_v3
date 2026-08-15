# Tasks: 145-passive-mob-baseline

## Implementation
- [ ] `src/simulation/PassiveMobBaseline.ts`: `PassiveMobWorldAdapter` (`getCollisionShape`,
      `getBlockId`, `getSkyLight`, `getBlockLight`, `getBiomeDefinition`, `getSurfaceHeightAt`).
- [ ] `PIG_BOUNDING_BOX`, `SPAWN_CAP`, `SPAWN_ATTEMPTS_PER_CHUNK`, `SPAWN_CYCLE_INTERVAL_TICKS`
      constants.
- [ ] `PassiveMobSystem` class: constructor (registry, seed), `spawnCycle`, `tick`,
      `getActivePigs`.
- [ ] `src/rendering/PassiveMobRenderer.ts`: `PassiveMobRenderer` class (`sync`, `dispose`).
- [ ] `src/engine/Game.ts`: construct `PassiveMobWorldAdapter`/`PassiveMobSystem`/
      `PassiveMobRenderer`; track renderer for disposal; throttled spawn-cycle sweep call; per-frame
      `tick`/`sync` calls in `update(dt)`.

## Tests
- [ ] `tests/unit/PassiveMobBaseline.test.ts`: adapter collision-shape solid/air cases.
- [ ] Adapter sky-light open-column/overhang cases.
- [ ] Adapter biome-definition bridging for all four legacy keys.
- [ ] `PassiveMobSystem.spawnCycle` cap-enforcement case (more attempts than cap never exceeds it).
- [ ] `PassiveMobSystem.tick` ticking-set gating case (non-ticking entity untouched).
- [ ] `PassiveMobSystem.tick` goal-selector assignment + gravity/physics composition case.
- [ ] `tests/unit/PassiveMobRenderer.test.ts`: sync add/update/remove-to-match-live-set case.
- [ ] `PassiveMobRenderer.dispose` empties the scene case.

## Verification
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] New test files pass in isolation.
- [ ] Full `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes (21/21 existing, plus any new pig-visibility assertion).

## Checkpoint
- [ ] `verification.md` updated with real evidence; status VERIFIED.
- [ ] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 146-hostile-mob-baseline).
- [ ] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
