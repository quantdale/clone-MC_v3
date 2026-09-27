# Verification: 295-throwable-splash-potion-entities

Status: VERIFIED
Completion: 100% (12/12)
Advancement allowed: true

Base: `origin/main` `b25dbc1` (294 VERIFIED). Worktree
`/workspace/mc-worktrees/295`, branch
`wt/295-throwable-splash-potion-entities`. Package commit `8199c61` precedes
all implementation.

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| Throw and flight | `tests/unit/SplashPotion.test.ts`: player vector (speed 0.5, −20° lift on the vertical component only, yaw −Z/east), straight-down throw, spawn at eye − 0.1, witch vector `(dx, dy + 0.2·d3, dz)` at 0.75, non-finite refused; first step y −0.05 / vy −0.0495 / vx 0.495 then accelerating fall (gravity 0.05, drag 0.99); level throw lands 2–10 blocks ahead at y 64.125; owner immune for 5 ticks; expiry at 1200 ticks never splashes; cap 64 and NORMAL/LINGERING/NaN spawns refused. E2E `splash-potion.spec.ts` test 1: thrown potion is live with thrower `player` and its effect list. | PASS |
| Shatter and splash falloff | `SplashPotion.test.ts`: block shatter at the feet (intensity 1 − 0.125/4), direct raider hit intensity 1 with 6 damage, neighbour falls off (`floor(i·6 + 0.5)`), 9-block raider unaffected; `splashIntensity` 0.5 at 2 blocks, 0 at 4, > 0 at 3.99, vertical band (−2 below feet → 0, +2 above → 0.5), NaN → 0; witch potions pass through raiders and affect only the player; a witch throw 5 blocks away on flat ground is a direct hit (poison 45 s). Hit spheres use `height/2 + 0.3` (vanilla pick margin). E2E test 1: shatter cause `block`, player intensity in (0.5, 1]. | PASS |
| Effect application | `SplashPotion.test.ts`: harming 6/3/2 at i = 1/0.5/0.25, amp 1 → 12; healing 4/2, amp 1 → 8; poison 45 s × 0.5 → 22.5 s amp kept; 1 s at i = 1 (20 ticks) skipped, 1.1 s kept; 18 ticks skipped; mixed instant + duration; unknown ids passed through (Game skips unregistered ids). `LiveSplashPotion.test.ts`: self poison 40–45 s; healing heals; harming kills a 4-HP raid pillager through the exactly-once death callback; source guards pin `hurtPlayer(damage, 'magic')` (no shield source), `survival.heal`, `playerEffects.add`, `raiderCombat.damageRaider → onRaidEntityRemoved`, `pillagerPatrol.damageMember`. E2E test 1: poison applied with duration equal to the shatter record (1 < d ≤ 45); test 2: harming splash costs 5–6 HP in survival. | PASS |
| Player use and consume rules | `SplashPotion.test.ts` `splashThrowDecision`: survival/adventure consume, creative does not, spectator / death screen / empty hand / non-potion / NORMAL / LINGERING / missing contents refused. `LiveSplashPotion.test.ts`: consume one then empty hand refused; creative keeps it and takes no harming damage; spectator cannot throw and is not a splash target; regular potion not throwable. Source guards: decision → spawn → `if (!spawned) return false` → consume only when `decision.consume`; `PlayerInteraction.onUseItem` after container/bone-meal uses and before `placeBlock`, plus the air branch. E2E test 1: stack 1 → 0 in survival; test 2: creative stack stays 1, HP unchanged. | PASS |
| Witch potions replace the fallback | `RaiderCombatBehavior.test.ts`: witch base damage 0 (even with registry damage 99); without a sink no hits and no projectiles over 100 ticks; with a sink one throw on the first tick then every 60 ticks (3 in 130), `potionsThrown` counted, choice poison at 3 blocks / 20 HP, SPLASH poison contents, speed 0.75, spawn y 65.52; slowness at 10 blocks; harming when poisoned and at 6 HP; refused throws do not start the cooldown. `SplashPotion.test.ts`: full choice table incl. weakness roll < 0.25 at ≤ 3 blocks, deterministic roll in [0,1) (~25% below 0.25), vanilla contents (harming instant_damage, poison 45 s, slowness 90 s, weakness 90 s). `LiveSplashPotion.test.ts`: raid witch throws poison through the sink, splash affects only the player, player gets poison; no-sink witch never harms. Source guards: no `WITCH_RANGED_FALLBACK_DAMAGE` anywhere in Game/combat. E2E test 3: `debugStartRaid(3)` witch throws (owner is a live wave witch, choice `poison`, accepted), potion in flight, shatter affects only the player and the player has poison 11.15 s (landed 3 blocks away on terrain, intensity 0.248). | PASS |
| Rendering | `SplashPotionRenderer.test.ts`: tint mapping (instant aliases, default), one two-part `splash-potion` group per key, position follow, tint rebuild, NaN skipped, empty set removes all; visibility for current + later groups; no allocation over 20 syncs, 11 shared resources (2 geometries + 9 materials) each disposed exactly once, idempotent dispose, sync after dispose adds nothing; source guards: no lights/fog/background/atlas/texture/camera, no `new THREE.*` in sync, Game tracks the renderer and syncs it before `renderer.render()`, no ParticleSystem wiring. E2E test 1: one in-scene poison-tinted two-child mesh while in flight, none after the shatter. | PASS |

## Legacy alignment (T6)
- `src/simulation/RaiderCombatBehavior.ts`: `WITCH_RANGED_FALLBACK_DAMAGE`
  removed; witch profile base damage 0; witch branch uses the potion sink.
- `tests/unit/RaiderCombatBehavior.test.ts`: fallback assertions replaced by
  the no-sink / sink cadence / choice / refusal tests.
- 288 `proposal.md`, `design.md`, `tasks.md`, `verification.md` and
  `specs/raider-combat-behavior/spec.md`: "superseded in part by 295" banner;
  fallback definition, role table row, profile scenario line, fallback
  scenario and design rationale annotated as retired (history kept).
- `PARITY_MATRIX.md` C288 row: "witch ranged fallback (no potion entity;
  retired by C295 …)".
- `tests/e2e/raider-combat.spec.ts` asserted only "player HP drops" (raid of
  omen 1 has no witch) and passes unchanged (2/2).

## Shatter particle
Skipped by design: `src/simulation/ParticleSystem.ts` has no consumer in
`src/` (no live particle render path in Game or any renderer), so there is
nothing to emit into. Guarded by a source test.

## Item availability
Splash potions are Potion items whose `potion_contents` kind is `SPLASH`
(122 data). No gunpowder item exists (last ItemId `Smoker = 72`), so no
splash brewing recipe was added; availability is the test/debug seam
`testGrantSplashPotion(effectKey, seconds, amp)` plus any stored SPLASH stack.

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | exit 0 |
| npm run lint | PASS | 0 errors / 85 warnings (unchanged baseline) |
| npm test | PASS | 471 files, 5637 passed + 1 skipped (294: 468 / 5592+1; +3 files, +45 tests) |
| npm run build | PASS | 264 modules transformed (+2) |
| npx playwright test tests/e2e/splash-potion.spec.ts | PASS isolated (3/3, ≈1.6–1.7 s each) | plus one witch-only diagnostic rerun (choice poison, intensity 0.248) |
| npm run test:e2e | 133 passed / 1 failed (134) in 33.3 min | only failure visual:176 (below); splash-potion 3/3; raider-combat 2/2; enchanting:227 green |
| file-audit | PASS | 3010 rows (+12) |
| npm run validate-state | PASS | |

## visual:176 SwiftShader drift (documented, not hidden)
`tests/e2e/visual-regression.spec.ts:176` fails on Linux headless SwiftShader
with the same class as 291–294. Full-suite run: 32 fail / 28 pass of 60
cells, fail band 0.0219–0.0619, max pass 0.0187; max per-cell fraction delta
vs 294 0.0126; 7 cells changed fraction (292→293: 8, 293→294: 6).
**Two cells flipped pass → fail vs 294:** `start-overlay/high/1920x1080`
(0.0184 → 0.0219) and `container-ui/high/1920x1080` (0.0173 → 0.0268). A
standalone rerun of the matrix on 295 reproduced both (0.0203 / 0.0254), so
they were investigated rather than waved through:
- A standalone matrix run on unmodified `main` (`b25dbc1`, no 295 code) also
  failed `start-overlay/high/1920x1080` (0.0341) and flipped
  `crosshair/high/1920x1080` fail → pass — the high/1920×1080 cells move
  between runs with or without 295.
- Filtered runs on 295 (`SCREEN_FILTER=container-ui`, twice, and
  `SCREEN_FILTER=start-overlay`) reproduce **byte-identical** fractions to
  the 294 full run for all 12 cells (container-ui/high/1920x1080 0.017329…,
  start-overlay/high/1920x1080 0.018418…, all pass).
- The container-ui diff is the crafting panel text wrap / backdrop over the
  world, i.e. capture-state variance under long-matrix load; 295 adds no DOM,
  CSS, HUD or font change and its renderer adds nothing to the scene while no
  potion is live.
Classification: environment/run-order variance, not a 295 rendering change.
Goldens untouched. Change 258 stays BLOCKED.

## Divergences (documented)
- No throw inaccuracy (vanilla 1.0 player / 8.0 witch spread), no thrower
  velocity inheritance, no witch target lead (deterministic).
- Very close witches (≤ ~3 blocks) can lob over the target on flat ground
  (vanilla aim geometry); the radius still catches near misses.
- Duration effects and healing do not apply to mobs (no per-mob effect
  managers); witch potions neither hit nor affect raiders (vanilla witches
  heal raiders instead, not modelled); zombies/pigs are not splash targets.
- Poison is still a marker effect (no poison damage ticks), so a witch's
  poison has no HP effect yet.
- Splash potions are obtainable only via the test/debug seam (no gunpowder,
  no splash brewing, no creative menu); lingering potions not throwable.
- No shatter particle or sound; in-flight potions are not persisted.
