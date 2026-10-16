# Tasks: 142-projectile-core

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/projectile-core/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code. `hitBlock`'s wording was
      refined (embedded resting cell, not necessarily the solid neighbor) after implementation
      review, per AGENTS.md's "amend the spec first" rule.

- [x] **2.1** Create `src/simulation/ProjectileCore.ts`: `ProjectileState`, `ProjectileOptions`,
      `ProjectileTarget`, `ProjectileStepResult`, `stepProjectile` per design.md.

- [x] **3.1** Write `tests/unit/ProjectileCore.test.ts`: gravity/drag ordering on a clear-flight
      tick; block collision (embed, zeroed velocity, reported cell); entity collision taking
      priority over a simultaneously-qualifying block hit; owner immunity (not hit within the
      window, hit afterward); age-based expiration freezing physics. 6 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
