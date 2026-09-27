# Verification: 296-periodic-status-effect-ticks

Status: VERIFIED
Completion: 100% (12/12)
Advancement allowed: true

Base: `origin/main` `218aabd` (295 VERIFIED). Worktree
`/workspace/mc-worktrees/296`, branch `wt/296-periodic-status-effect-ticks`.
Package commit `b606011` precedes all implementation.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| Vanilla schedule | `PeriodicStatusEffects.test.ts`: bases 25/50/40; interval table amp 0–6 (poison 25/12/6/3/1/1/1, regeneration 50/25/12/6/3/1/1, wither 40/20/10/5/2/1/1); clamps (amp 32/255 → 1, floor 1.9, negative/NaN → base, unknown kind → 0); rounding (45 s → 900, 44.999999 → 900, 0.05 → 1, ≤0/NaN/∞ → 0); predicate (900/875 yes, 899/0 no); hit counts per 900-tick poison 36/75/150/300/900, regeneration 18/36/75/150/300, per 200-tick wither 5/10/20/40/100; Poison I 100 ticks → 16 HP (remaining 900/875/850/825, first tick hits before count-down). E2E: first 100 ticks after a real splash → exactly 16 HP. |
| Poison floor | Unit: decision null at 1 HP; full 45 s Poison II → exactly 1 HP, every action magic. Composition: 45 s splash-strength poison monotone to exactly 1 HP, no death, effect expired; Poison V from 1 HP for 1200 ticks never kills. E2E: 1000 status ticks after a player splash → samples monotone, min and final 1, poison gone, no death screen. |
| Regeneration | Unit: heals below max only; 18 HP + Regeneration II 10 s → 20 with exactly 2 heals. Composition: 14 → 15 on tick 1 → 20 cap. E2E: from 1 HP, Regeneration II heals on tick 1 (2), 12 after 251 ticks, capped at 20. |
| Wither kills | Unit: wither damages at 1 HP; 3 HP → 0. Composition: one death with reason `wither`, death card "Wither", respawn 20 HP, all effects (incl. speed) cleared, no further deaths. E2E: Wither II from 20 HP → death screen opens after exactly 400 ticks (20th hit on tick 381), cause "Wither", outcome respawned, 20 HP, wither cleared. |
| Mode and armor | Composition: creative and spectator take no poison/wither damage, durations still count down (5 s → 2 s after 60 ticks), regeneration still heals; adventure takes damage; heavy armor: poison and wither hits exactly 1 HP with no armor wear; 295 harming (`magic`) 6 exact through armor while a `mob` hit is mitigated. `DamageType.test.ts`: `magic` registered with BYPASS_ARMOR. Source guard: `hurtPlayer` 265 gate. E2E: creative + Wither III 400 ticks → 20 HP, duration 30 → 10 s. |
| Pause and persistence | Composition: paused `FixedTickDriver` over 10 s of frames → no ticks, HP and duration unchanged; resume → hit. Reload: effects serialized through the 292 codec + JSON and restored produce the identical 400-tick health trace as the uninterrupted owner. E2E: real game without pointer lock (paused driver) for 1.5 s → HP 20, poison duration unchanged. |
| Order / determinism / death mid-pass | Unit: poison → regeneration → wither with live health; effects cleared by an earlier action are skipped; identical inputs → identical logs. |
| Game integration | `LivePeriodicStatusEffects.test.ts` source guards: pass after `survival.update` and before `playerEffects.tick(dt)` in `runFixedTick`; exactly two call sites (fixed tick + seam); damage → `hurtPlayer`, heal → `survival.heal`, `PLAYER_MAX_HEALTH` cap; `WITHER_EFFECT_PERIOD_TICKS` and the `tickWithers` `hurtPlayer(1, 'wither')` stand-in gone; seam order i-frames → pass → count-down with the 20 000 cap. |

## Hunger effect

No `hunger` entry exists in `createDefaultStatusEffectRegistry` (only the
hunger *stat* in `SurvivalSystem`), so there is nothing to tick; exhaustion
drain is skipped per the scope ("only if registered/cheap") and remains a
candidate.

## Legacy alignment

- `tickWithers` global `simTick % 40` wither-effect damage (252) retired;
  wither-effect damage now runs even without a live boss, per vanilla.
- 295 proposal/design/verification annotated: poison now costs HP (never
  below 1 HP); harming's `magic` damage now bypasses armor. PARITY C295 note
  updated.
- `DamageType.test.ts` (6 types incl. `magic`), `DeathRespawnPresentation.test.ts`
  (`magic` → "Magic").
- The 292 `debugTickStatusEffects(seconds)` seam stays a duration-only bulk
  advance (it never applied periodic effects; 292 E2E unchanged).
- Design amendment: no `getPlayerHealth()` seam was added — E2E reads the
  existing public `survival.health`.

## Commands

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | 0 errors / 85 warnings (unchanged; none in 296 files) |
| `npx vitest run` | 473 files, 5669 passed + 1 skipped (was 471 / 5637) |
| `npm run build` | PASS, 265 modules |
| `node scripts/validate-file-audit.mjs …/file-audit-manifest.json` | PASS, 3020 rows |
| `npm run validate-state` | PASS |
| `npx playwright test tests/e2e/periodic-status-effects.spec.ts` | 2/2 isolated (3.5 s + 1.7 s) |
| `npm run test:e2e` (full) | 135 passed / 1 failed of 136 (33.5 m); the one failure is visual:176; periodic-status-effects 2/2, splash-potion 3/3, enchanting:227 green |

## visual:176 SwiftShader drift (documented, not hidden)

Goldens untouched; 296 changes no rendering, scene, HUD or UI (the visual
matrix never has active effects and runs paused).

| Run | fail / pass | band (failing) |
|---|---|---|
| 295 full run (`e55aaba`) | 32 / 28 | 0.0219–0.0619 |
| **296 full run** | **30 / 30** | 0.0202–0.0619 |
| 296 isolated visual rerun | 29 / 31 | 0.0222–0.0619 |
| origin/main `218aabd` isolated visual rerun | 31 / 29 | 0.0203–0.0619 |

Cell-by-cell: 52 of 60 fractions are byte-identical between the 295 and 296
full runs; across all four runs every low/medium cell (40) and 6 of the 10
high/1280x720 cells are byte-identical (the other 4 vary in fraction but
never change status). Every status flip is a `high/1920x1080` cell:

| cell | 295 full | 296 full | 296 rerun | main rerun |
|---|---|---|---|---|
| container-ui/high/1920x1080 | fail 0.0268 | pass 0.0173 | fail 0.0254 | pass 0.0173 |
| crosshair/high/1920x1080 | fail 0.0311 | pass 0.0184 | pass 0.0184 | fail 0.0203 |
| environment-day/high/1920x1080 | fail 0.0332 | fail 0.0201 | pass 0.0186 | fail 0.0253 |
| start-overlay/high/1920x1080 | fail 0.0218 | fail 0.0311 | pass 0.0184 | fail 0.0203 |
| hud / render-world / render-world-no-hud (high/1920x1080) | fail | fail | fail | fail (fractions vary) |
| debug-overlay / environment-night / hotbar (high/1920x1080) | pass | pass | pass | pass (identical) |

The same cells flip between two isolated runs of the *same* 296 build and
between isolated runs of unmodified origin/main, with identical fraction
values recurring across builds (e.g. 0.01842 / 0.01733 / 0.02541), so the
flips are run-order / SwiftShader timing variance of the high-profile
captures, not a 296 effect. The 296 full-run pass/fail set is identical to
the 294-main filtered baseline (`295-visual-baseline-main.log`, 30/30).

## Divergences (documented)

- Hunger effect not registered → no exhaustion drain.
- i-frames unchanged (0.55 s ≈ vanilla 10-tick cooldown): as in vanilla,
  Poison III/IV intervals shorter than the window lose some hits.
- Mobs have no status-effect managers; effects tick only for the player.
- Wither boss skull/explosion damage keeps its existing `wither` reason
  (armor-bypassing), unchanged by 296.
