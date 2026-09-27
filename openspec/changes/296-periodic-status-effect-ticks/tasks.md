# Tasks: 296-periodic-status-effect-ticks

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/296-periodic-status-effect-ticks/` (proposal, design,
  tasks, verification, capability spec, OVERRIDE_DRAFT); pass
  SPEC_AUTHORING_PROTOCOL quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 296 is the sole ACTIVE change; 258 stays BLOCKED; 259–295 stay VERIFIED.

## B. Pure rules

- [x] T3. Implement `src/simulation/PeriodicStatusEffects.ts`: intervals,
  remaining-tick rounding, schedule predicate, per-kind decision, ordered
  live pass.
- [x] T4. Unit tests `tests/unit/PeriodicStatusEffects.test.ts`: interval
  table per amplifier (incl. defensive clamp), rounding, schedule, poison
  floor, regen cap, wither lethal action, order, death mid-pass skip, guards.

## C. Damage/death plumbing

- [x] T5. `magic` damage type (BYPASS_ARMOR) + `magic` death cause; legacy
  DamageType / death presentation tests updated.
- [x] T6. `SurvivalSystem.tickInvulnerability(dt)` extracted from `update`
  (identical arithmetic).

## D. Game wiring

- [x] T7. `runFixedTick` step 6: pass before `playerEffects.tick(dt)` with
  target → `hurtPlayer` / `survival.heal`; retire the `tickWithers`
  `WITHER_EFFECT_PERIOD_TICKS` block; seams `debugAddPlayerEffect`,
  `debugTickPeriodicStatusEffects`, `getPlayerHealth`.
- [x] T8. Composition tests `tests/unit/LivePeriodicStatusEffects.test.ts`
  (real StatusEffectManager + SurvivalSystem + armor): poison 1-HP floor over
  a full splash, armor ignored, regen cap, wither kill → one death + effects
  cleared, creative refusal, no step = no change (pause), reload continuity,
  Game source guards.
- [x] T9. Browser E2E `tests/e2e/periodic-status-effects.spec.ts`: player
  splash poison lowers health over ticks and stops at 1 HP; regeneration
  heals; wither kills → death screen "Wither"; paused game unchanged.

## E. Docs + closure

- [x] T10. Update 295 notes (witch poison now costs HP), PARITY C295 note +
  C296 row, file-audit manifest.
- [x] T11. Full gates: typecheck, lint, unit, build, file-audit,
  validate-state, full E2E (visual:176 cell-by-cell vs 295 baseline with
  isolation reruns for flips; enchanting:227 green).
- [x] T12. verification.md VERIFIED N/N, control plane VERIFIED, fast-forward
  publish (no force), docs sync.
