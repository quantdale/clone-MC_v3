# Tasks: 129-entity-core

- [ ] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/entity-core/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [ ] **2.1** Create `src/world/Entity.ts`: `EntityTransform`, `EntityVelocity`, `ZERO_VELOCITY`,
      `EntityLifecycleState`, `EntityInstance`, `isValidTransform`, `isValidVelocity`.

- [ ] **3.1** Create `src/simulation/EntityManager.ts`: `EntityManager` bound to an `EntityRegistry`
      with `spawn`/`get`/`getAll`/`getInDimension`/`setTransform`/`setVelocity`/`changeDimension`/
      `remove`/`size`/`clear`, per design.md's validation and lifecycle rules.

- [ ] **4.1** Write `tests/unit/EntityManager.test.ts`: valid spawn; unregistered-type rejection;
      non-finite transform/velocity rejection (spawn and setters); explicit id-collision rejection
      (active and removed); getAll/getInDimension/size/get lifecycle visibility; setTransform/
      setVelocity/changeDimension no-ops on unknown/removed ids; remove idempotency; clear() reset.

- [ ] **5.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure. (No existing file is touched, so no
      regression is expected, but the gate must still be run and recorded.)

- [ ] **6.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
