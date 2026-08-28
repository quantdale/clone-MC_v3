# Tasks: 146-hostile-mob-baseline

## Implementation
- [x] `src/simulation/HostileMobBaseline.ts`: `HostileMobWorld` interface; `PlayerTarget`,
      `ChunkCoord` interfaces; constants (`ZOMBIE_BOUNDING_BOX`, `HOSTILE_SPAWN_CAP`,
      `HOSTILE_SPAWN_ATTEMPTS_PER_CHUNK`, `HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS`,
      `HOSTILE_DETECTION_RADIUS`, `HOSTILE_FORGET_RADIUS`, `HOSTILE_ATTACK_RANGE`,
      `HOSTILE_CHASE_SPEED`, `HOSTILE_KNOCKBACK_STRENGTH`, `DEFAULT_HOSTILE_ATTACK_DAMAGE`,
      `HOSTILE_ATTACKS_PER_SECOND`, `HOSTILE_ATTACK_TICKS_SINCE_LAST`, `PLAYER_SENTINEL_ID`).
- [x] `HostileMobSystem` class: constructor (registry, seed; throws without a `zombie` definition),
      `getManager`, `spawnCycle`, `tick` (goal-bundle assignment, physics, melee-attack resolution
      via the shared `InvulnerabilityTracker`), `getActiveZombies`.
- [x] `src/rendering/HostileMobRenderer.ts`: `HostileMobRenderer` class (`sync`, `dispose`),
      visually distinct from `PassiveMobRenderer`.
- [x] `src/engine/Game.ts`: construct `HostileMobSystem`/`HostileMobRenderer` (reusing the existing
      `passiveMobWorld` adapter instance); track renderer for disposal; throttled spawn-cycle sweep
      call (reusing the enumerated ticking-chunk list); per-frame `tick`/`sync` calls in
      `update(dt)`; `onPlayerDamaged` wired to `this.survival.damage(amount, 'mob')`.

## Tests
- [x] `tests/unit/HostileMobBaseline.test.ts`: constructor throws without a `zombie` definition /
      does not throw with the default registry.
- [x] `HostileMobSystem.spawnCycle` cap-enforcement case (more attempts than cap never exceeds it).
- [x] `HostileMobSystem.tick` ticking-set gating case (non-ticking entity untouched).
- [x] `HostileMobSystem.tick` goal-bundle assignment + gravity/physics composition case (no player
      target available).
- [x] Melee-attack case: an in-range acquired target triggers exactly one `onPlayerDamaged` call
      with a positive amount.
- [x] Melee-attack case: a target beyond detection range never triggers `onPlayerDamaged`.
- [x] Invulnerability case: an immediately-following tick does not re-hit the same shared tracker
      window.
- [x] Invulnerability case: two zombies in range the same tick land only one hit.
- [x] `tests/unit/HostileMobRenderer.test.ts`: sync add/update/remove-to-match-live-set case.
- [x] `HostileMobRenderer.dispose` empties the scene case.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test files pass in isolation (13/13: 10 HostileMobBaseline + 3 HostileMobRenderer).
- [x] Full `npm test` passes (169 files, 1896/1896 — prior 1883 + 13 new).
- [x] `npm run build` passes (102 modules, up from 98 — confirms `Game.ts` consumes the new
      modules).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — no natural zombie spawn is
      asserted, per the proposal's Definition of Done).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 147-animal-breeding).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
