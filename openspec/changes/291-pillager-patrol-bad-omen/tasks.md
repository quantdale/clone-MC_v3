# Tasks: 291-pillager-patrol-bad-omen

## A. Control plane

- [x] T1. Author complete OpenSpec package under
  `openspec/changes/291-pillager-patrol-bad-omen/` (proposal, design, tasks,
  verification, capability spec, OVERRIDE_DRAFT); pass SPEC_AUTHORING_PROTOCOL
  quality gate.
- [x] T2. Add CHANGE_SEQUENCE row + live OVERRIDES addendum; set PROGRAM_STATE
  so 291 is the sole ACTIVE change; 258 stays BLOCKED; 259–290 stay VERIFIED.

## B. Pure rules + patrol system

- [x] T3. Implement `src/simulation/PillagerPatrol.ts`: constants,
  `decidePatrolAttempt` (gate precedence, normative draw order, anchor tries,
  group 2–4 with exactly one captain, member omission), `nextPatrolCooldown`,
  and `PillagerPatrolSystem` (cooldown, roster over `RaidEntityBackend`,
  rollback, `consumeDeath`, distance despawn, dedicated `RaiderCombatSystem`,
  `forceSpawn`, `clear`, `snapshot`).
- [x] T4. Unit tests `tests/unit/PillagerPatrol.test.ts`: every gate reason +
  precedence + no-draw-on-skip; chance/NO_SURFACE (4 probes); offset bounds;
  sizes/captain uniqueness over 200 seeds; member omission; determinism
  (same/different seed); rate limit over 30000 ticks; PATROL_ALIVE; spawn
  rollback; duplicate death; despawn/clear grant nothing; pillagers damage
  the player via reused combat.

## C. Game wiring

- [x] T5. Game: construct patrol `EntityManager` + system (stream
  `'pillager-patrol'`); tick once per unpaused fixed tick after the 285 omen
  evaluate with a lazy context (gamerule, difficulty, spectator,
  `time_played`, day tick, raid ACTIVE, live village query, loaded-surface
  predicate); melee request only when no raid is ACTIVE.
- [x] T6. Game: captain death → `grantBadOmen(1)` + `Bad Omen <level>` toast;
  `startRaidAt` dismisses live patrol (`raid-start`); dispose/pagehide clear;
  debug seams `getPatrolState`, `debugRunPatrolAttempt`, `debugSpawnPatrol`,
  `debugDamagePatrolEntity`, `debugTickPatrols` (disposed-safe).
- [x] T7. Integration unit tests `tests/unit/LivePillagerPatrol.test.ts`
  (Game-composition oracle over real modules): captain kill 0→1, cap 5,
  non-captain no grant, raid state reference untouched by patrol deaths, raid
  wave kills never grant, raid start dismisses patrol.

## D. Browser E2E

- [x] T8. Add `tests/e2e/pillager-patrol.spec.ts`: fresh world natural attempt
  → `WORLD_TOO_YOUNG`; forced patrol has 2–4 pillagers with exactly one
  captain; patrol combat damages player; non-captain kill keeps omen; captain
  kill → omen 1 with raid state untouched; cap 5; raid kills never grant;
  reload clears patrol and omen (ephemeral).

## E. Gates and release

- [x] T9. Focused unit + e2e green; record commands in verification.md.
- [x] T10. Full baseline: typecheck, lint, `npm test`, build,
  `npm run test:e2e`, file-audit, validate-state; document visual:176
  SwiftShader variance honestly (no golden churn); enchanting:227 green.
- [x] T11. Reconcile artifacts; C291 exact in PARITY_MATRIX; file-audit rows;
  VERIFIED 100%; fast-forward onto main; `git push origin HEAD:main` (no
  force); confirm local = origin; sync localHead/publishedHead; nextExactAction
  → author 292 package with 3–5 candidate topics (not started).
