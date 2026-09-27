# Tasks: 295-throwable-splash-potion-entities

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/295-throwable-splash-potion-entities/` (proposal, design,
  tasks, verification, capability spec, OVERRIDE_DRAFT); pass
  SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 295 is the sole ACTIVE change; 258 stays BLOCKED; 259–294 stay VERIFIED.

## B. Pure rules

- [ ] T3. Implement `src/simulation/SplashPotion.ts`: throw vectors,
  `SplashPotionSystem` over `stepProjectile`, splash intensity,
  instant/duration application plan, witch choice + deterministic roll,
  witch contents, `isThrowableSplash`.
- [ ] T4. Unit tests `tests/unit/SplashPotion.test.ts`: player/witch throw
  vectors, gravity arc + drag, block hit shatter, entity hit (direct = 1),
  owner immunity, expiry, cap, radius falloff (edge, vertical band),
  instant harming/healing amounts, duration scaling + 1 s floor, unknown ids,
  witch choice table + roll determinism, SPLASH-only throwability.

## C. Witch integration

- [ ] T5. `RaiderCombatSystem`: remove `WITCH_RANGED_FALLBACK_DAMAGE`; witch
  profile base damage 0; RANGED witch branch calls `throwWitchPotion` with a
  `chooseWitchPotion` choice and `witchPotionThrowVelocity`; cooldown on
  acceptance; `potionsThrown` result; pillager arrows unchanged.
- [ ] T6. Update 288 tests/docs asserting the fallback
  (`RaiderCombatBehavior.test.ts`, 288 proposal/design/spec/tasks/
  verification annotations, PARITY C288 note).

## D. Game + player wiring

- [ ] T7. `PlayerInteraction.onUseItem` hook (no target, or non-container
  non-bone-meal target before placement); Game
  `tryThrowSelectedSplashPotion` with consume rules; tick 5.10
  `tickSplashPotions` applying shatters to player / raid raiders / patrol
  members; witch sink + player potion status in `tickRaiderCombat`; clear on
  world reset/dispose; seams.
- [ ] T8. `src/rendering/SplashPotionRenderer.ts` + Game render sync +
  resource tracking; `tests/unit/SplashPotionRenderer.test.ts`. Shatter
  particle skipped (no live ParticleSystem path) — documented.

## E. Tests

- [ ] T9. `tests/unit/LiveSplashPotion.test.ts`: composition (player throw at
  feet applies effect; creative no consume; spectator refused; harming kills a
  raid raider through exactly-once death; witch potion applies poison to the
  player through the combat sink) + Game source guards.
- [ ] T10. `tests/e2e/splash-potion.spec.ts`: self splash applies poison with
  scaled duration and consumes the potion; creative keeps it; a raid witch's
  potion applies its effect to the player; renderer shows the in-flight
  potion.

## F. Gates and release

- [ ] T11. Focused + full baseline: typecheck, lint, `npm test`, build,
  `npm run test:e2e`, file-audit, validate-state; document visual:176
  SwiftShader variance honestly (no golden churn); enchanting:227 green;
  reconcile docs; C295 exact in PARITY_MATRIX.
- [ ] T12. VERIFIED 100%; fast-forward onto main; `git push origin HEAD:main`
  (no force); confirm local = origin; sync localHead/publishedHead;
  nextExactAction → author 296 package with candidate topics (not started).
