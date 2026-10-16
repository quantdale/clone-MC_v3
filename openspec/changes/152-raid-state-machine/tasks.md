# Tasks: 152-raid-state-machine

## Implementation
- [x] `src/simulation/RaidStateMachine.ts`: `RaidStatus`, `RaidWaveEntry`, `RaidState`,
      `SerializedRaid` types; `RAID_BASE_WAVES`, `RAID_MAX_WAVES`, `RAID_TIMEOUT_TICKS`,
      `RAID_RECORD_VERSION` constants.
- [x] `startRaid` (bad-omen-derived, clamped `totalWaves`).
- [x] `waveComposition` (deterministic escalating roster, zero-count entries omitted, negative
      inputs clamped).
- [x] `spawnWave` (advance + seed `raidersRemaining`; refuse when terminal or past the final wave).
- [x] `recordRaiderDeath` (decrement, floor at 0, non-`ACTIVE` no-op).
- [x] `tickRaid` (tick advance; next-wave spawn; `VICTORY` after the final wave; `DEFEAT` on
      timeout; terminal no-op).
- [x] `serializeRaid` / `deserializeRaid` (strict `version: 1` envelope, atomic validation
      including the `waveIndex <= totalWaves` cross-field check).

## Tests
- [x] `tests/unit/RaidStateMachine.test.ts`: `startRaid` base-wave-count case.
- [x] `startRaid` clamped-at-`RAID_MAX_WAVES` case.
- [x] `waveComposition` determinism case.
- [x] `waveComposition` escalation case.
- [x] `waveComposition` no-zero-count-entries case.
- [x] `spawnWave` first-wave advance + raider seeding case.
- [x] `spawnWave` refusal past the final wave case.
- [x] `recordRaiderDeath` decrement case.
- [x] `recordRaiderDeath` floor-at-zero case.
- [x] `recordRaiderDeath` terminal-raid no-op case.
- [x] `tickRaid` cleared-wave-spawns-next case.
- [x] `tickRaid` in-progress-wave-not-interrupted case.
- [x] `tickRaid` final-wave-cleared-yields-`VICTORY` case.
- [x] `tickRaid` timeout-yields-`DEFEAT` case.
- [x] `tickRaid` terminal-raid no-op case.
- [x] `serializeRaid`/`deserializeRaid` round-trip case.
- [x] `deserializeRaid` bad-schema-version rejection case.
- [x] `deserializeRaid` inconsistent-`waveIndex` rejection case.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (28/28).
- [x] Full `npm test` passes (175 files, 2003/2003 — prior 1975 + 28 new).
- [x] `npm run build` passes (103 modules, unchanged — additive/unconsumed, mirroring 148-151's
      own identical evidence).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — nothing wired into the live
      game).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 153-boss-framework).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
