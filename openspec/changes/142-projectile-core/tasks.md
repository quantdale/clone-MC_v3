# Tasks: 142-projectile-core

- [ ] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/projectile-core/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [ ] **2.1** Create `src/simulation/ProjectileCore.ts`: `ProjectileState`, `ProjectileOptions`,
      `ProjectileTarget`, `ProjectileStepResult`, `stepProjectile` per design.md.

- [ ] **3.1** Write `tests/unit/ProjectileCore.test.ts`: gravity/drag ordering on a clear-flight
      tick; block collision (embed, zeroed velocity, reported cell); entity collision taking
      priority over a simultaneously-qualifying block hit; owner immunity (not hit within the
      window, hit afterward); age-based expiration freezing physics.

- [ ] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [ ] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
