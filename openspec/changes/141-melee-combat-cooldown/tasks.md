# Tasks: 141-melee-combat-cooldown

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/melee-combat-cooldown/spec.md`) and
      validate it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/simulation/MeleeCombat.ts`: `attackCooldownProgress`,
      `cooldownDamageMultiplier`, `computeAttackDamage`, `computeKnockback`,
      `InvulnerabilityTracker`, `resolveMeleeAttack` per design.md.

- [x] **3.1** Write `tests/unit/MeleeCombat.test.ts`: cooldown-progress bounds/monotonicity;
      damage-multiplier endpoints (0.2/0.4/1.0); knockback direction/magnitude/halving plus the
      degenerate same-position case; `InvulnerabilityTracker` gate/hit/clear; `resolveMeleeAttack`'s
      full composition (blocked case registers no hit; successful case matches the underlying
      formulas and registers exactly one hit). 13 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
