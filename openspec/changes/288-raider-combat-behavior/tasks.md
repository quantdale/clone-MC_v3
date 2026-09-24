# Tasks: 288-raider-combat-behavior

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/288-raider-combat-behavior/` (proposal, design, tasks,
  verification, capability spec, OVERRIDE_DRAFT); pass SPEC_AUTHORING_PROTOCOL
  quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 288 is the sole ACTIVE change; 258 stays BLOCKED; 259–287 stay VERIFIED.

## B. Pure combat rules + system

- [x] T3. Implement `RaiderCombatBehavior` pure helpers (role/profile/constants,
  `forceRaidDefeat`) and `RaiderCombatSystem` (target/home, melee, ranged
  projectiles, health/death, pause clear, projectile cap).
- [x] T4. Unit tests: roles; damage values; attack cadence; target vs home;
  death → onRaiderDied once; pause freeze; witch fallback; projectile hit;
  forceDefeat only from ACTIVE.

## C. Game wiring

- [x] T5. Wire `RaiderCombatSystem` on `raidEntityManager` into the unpaused
  fixed-tick path after wave apply; route damage through `hurtPlayer` (shield
  choke); player melee + `debugDamageRaidEntity`; ACTIVE player death →
  DEFEAT + clear.
- [x] T6. Dispose/clear/terminal/reload clear combat state; no new persistence.
- [x] T7. Keep 284 exactly-once death path; no HostileMobSystem coupling.

## D. Browser E2E

- [x] T8. Add `tests/e2e/raider-combat.spec.ts`: start raid → raiders reduce
  player health; `debugDamageRaidEntity` clears wave toward VICTORY; LOSS via
  player death or documented timeout seam if practical.

## E. Gates and release

- [x] T9. Focused unit + e2e green; record commands in verification.md.
- [x] T10. Full baseline: typecheck, lint, `npm test`, build, `npm run test:e2e`,
  file-audit, validate-state; document visual SwiftShader variance and
  enchanting:227 honestly; kill hung Playwright after ~20 min no progress.
- [x] T11. Reconcile artifacts; mark tasks [x]; VERIFIED 100%; set C288 exact;
  commit; land on main; `git push origin main` (no force); confirm local =
  origin; set nextExactAction to author 289 package (do not author/implement
  289).
