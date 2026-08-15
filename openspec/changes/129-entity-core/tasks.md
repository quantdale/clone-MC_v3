# Tasks: 129-entity-core

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/entity-core/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/world/Entity.ts`: `EntityTransform`, `EntityVelocity`, `ZERO_VELOCITY`,
      `EntityLifecycleState`, `EntityInstance`, `isValidTransform`, `isValidVelocity`.

- [x] **3.1** Create `src/simulation/EntityManager.ts`: `EntityManager` bound to an `EntityRegistry`
      with `spawn`/`get`/`getAll`/`getInDimension`/`setTransform`/`setVelocity`/`changeDimension`/
      `remove`/`size`/`clear`, per design.md's validation and lifecycle rules.

- [x] **4.1** Write `tests/unit/EntityManager.test.ts`: valid spawn; unregistered-type rejection;
      non-finite transform/velocity rejection (spawn and setters); explicit id-collision rejection
      (active and removed); getAll/getInDimension/size/get lifecycle visibility; setTransform/
      setVelocity/changeDimension no-ops on unknown/removed ids; remove idempotency; clear() reset.
      20 tests.

- [x] **5.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **6.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
