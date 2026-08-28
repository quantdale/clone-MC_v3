# Tasks: 130-entity-collision-and-physics

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/entity-collision-and-physics/spec.md`) and
      validate it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/simulation/EntityPhysics.ts`: `EntityPhysicsBox`, `EntityPhysicsOptions`,
      `EntityPhysicsStepResult`, `DEFAULT_GRAVITY`, `DEFAULT_TERMINAL_VELOCITY`,
      `computeEntityPhysicsStep` (gravity + 057 `CollisionResolver` integration, collided-axis
      velocity zeroing, `onGround` reporting), and `tickEntityPhysics` (129 `EntityManager`
      read/write wrapper with the documented no-op contract).

- [x] **3.1** Write `tests/unit/EntityPhysics.test.ts`: free-fall gravity + terminal-velocity clamp;
      floor landing (`onGround`, vy zeroed, position clamped to face); horizontal wall collision
      (only that axis zeroed, `onGround` false); ceiling collision (vy zeroed, `onGround` false);
      `tickEntityPhysics` no-ops (unknown id, removed id, `dt <= 0`) and successful tick persisting
      through the `EntityManager`. 8 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
