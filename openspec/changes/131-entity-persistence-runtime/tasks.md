# Tasks: 131-entity-persistence-runtime

- [ ] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/entity-persistence-runtime/spec.md`) and
      validate it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [ ] **2.1** Add `serializeChunk(cx, cz)` and `deserializeChunk(cx, cz, entities)` to
      `src/simulation/EntityManager.ts`, per design.md's data model and validate-then-mutate
      atomicity contract.

- [ ] **3.1** Extend `tests/unit/EntityManager.test.ts` with `serializeChunk`/`deserializeChunk`
      coverage: active+persistent+in-chunk filtering (and exclusion of removed/non-persistent/
      out-of-chunk entities); full round-trip identity/state preservation; chunk-membership
      mismatch rejection; malformed typeKey/dimension/transform/velocity rejection; duplicate-id
      rejection (within batch and against the live manager), each verified atomic (no partial
      spawn).

- [ ] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [ ] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
