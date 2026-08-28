# Tasks: 153-boss-framework

## Implementation
- [x] `src/simulation/BossFramework.ts`: `BossPhase`, `BossDefinition`, `BossStatus`, `BossState`,
      `BossBarSnapshot`, `SerializedBoss` types; `BOSS_SPAWN_TICKS`, `BOSS_RECORD_VERSION`
      constants.
- [x] `BossRegistry` class (003-based) with full definition validation; `createDefaultBossRegistry`
      (ender_dragon + wither).
- [x] `startBossFight`; `phaseForHealthFraction` (clamped, last-qualifying-phase lookup).
- [x] `damageBoss` (`BossDamageResult` with `phaseChanged`/`defeated`; health floor; defeat once;
      no-op for non-positive amount or defeated boss).
- [x] `healBoss` (cap at `maxHealth`, phase recompute, no revival, no-op for non-positive amount).
- [x] `tickBossFight` (`SPAWNING` → `ACTIVE` promotion, defeated no-op).
- [x] `bossBarSnapshot`.
- [x] `serializeBoss` / `deserializeBoss` (strict `version: 1` envelope, atomic validation).

## Tests
- [x] `tests/unit/BossFramework.test.ts`: default-registry build + `getByKey` case.
- [x] Registry rejects non-positive `maxHealth`.
- [x] Registry rejects an empty phase list.
- [x] Registry rejects non-descending thresholds.
- [x] Registry rejects a first threshold below 1.
- [x] Registry rejects a threshold outside `[0, 1]`.
- [x] `phaseForHealthFraction` full-health case.
- [x] `phaseForHealthFraction` at-threshold case.
- [x] `phaseForHealthFraction` below-last-threshold case.
- [x] `phaseForHealthFraction` out-of-range clamping case.
- [x] `startBossFight` initial-state case.
- [x] `damageBoss` reduces health without a phase change case.
- [x] `damageBoss` reports a phase change when crossing a threshold.
- [x] `damageBoss` lethal damage defeats exactly once (second call reports `defeated: false`).
- [x] `damageBoss` non-positive/non-finite amount no-op case.
- [x] `healBoss` restores an earlier phase case.
- [x] `healBoss` caps at `maxHealth` case.
- [x] `healBoss` never revives a defeated boss case.
- [x] `tickBossFight` promotes `SPAWNING` → `ACTIVE` after `BOSS_SPAWN_TICKS`.
- [x] `tickBossFight` defeated no-op case.
- [x] `bossBarSnapshot` half-health projection case.
- [x] `serializeBoss`/`deserializeBoss` round-trip case.
- [x] `deserializeBoss` rejection cases (bad version, unknown status, negative health).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (31/31).
- [x] Full `npm test` passes (176 files, 2034/2034 — prior 2003 + 31 new).
- [x] `npm run build` passes (103 modules, unchanged — additive/unconsumed, mirroring 148-152's
      own identical evidence).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — nothing wired into the live
      game).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 154-redstone-signal-core).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
