# Tasks: 183-ender-dragon-boss

## Implementation
- [x] `src/simulation/EnderDragon.ts`: `ENDER_DRAGON_MAX_HEALTH` (200) / `ENDER_DRAGON_PHASE_THRESHOLDS`
      ([1, 0.5, 0.2]) / `ENDER_DRAGON_BITE_DAMAGE` (3) / `ENDER_DRAGON_BITE_RANGE` (4).
- [x] `MAX_END_CRYSTALS` (10) / `END_CRYSTAL_HEAL_PER_TICK` (1) / `DRAGON_CRYSTAL_SUMMON_FRACTIONS`
      ([0.8, 0.5, 0.2]).
- [x] `ENDER_DRAGON_DEFINITION` (vanilla-keyed `BossDefinition` over 153).
- [x] `summonEndCrystals` (1/4/7/10 progression; non-finite → 10).
- [x] `endCrystalHealAmount` (1 while any crystal lives, else 0).
- [x] `dragonDamageTowardsPlayer` (3 within exclusive range 4).
- [x] `dragonDefeated` / `dragonReturnGatewayOpen` (182 composition).

## Tests
- [x] `tests/unit/EnderDragon.test.ts`: definition vanilla fields (key, name, maxHealth, phases,
      color, constants).
- [x] 153's default registry carries a builtin dragon (presence, maxHealth 200).
- [x] Fight lifecycle: SPAWNING start; phase 1 at 50%; phase 2 at 20%; defeat at 0; no-revive on
      further damage.
- [x] Heal-back: 30 → 90 restores phase 1.
- [x] Crystal summoning at 1/0.9/0.8/0.5/0.2/0/NaN.
- [x] Per-crystal heal: 1 with live crystals, 0 without.
- [x] Bite: 3 at distance < 4, 0 at ≥ 4.
- [x] Return gateway: false before defeat, true exactly on defeat.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2444/2444 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 184-end-exit-progression).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
