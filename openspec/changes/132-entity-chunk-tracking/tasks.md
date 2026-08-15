# Tasks: 132-entity-chunk-tracking

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/entity-chunk-tracking/spec.md`) and
      validate it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Add `forgetChunk(cx, cz)` to `src/simulation/EntityManager.ts` per design.md (evicts
      any-lifecycle-state entities in the chunk from the id map and insertion-order list; frees ids
      for reuse).

- [x] **3.1** Create `src/simulation/EntityChunkTracking.ts`: `selectTickingEntities(manager,
      isChunkTicking)`, `deactivateChunk(manager, cx, cz)`, `activateChunk(manager, cx, cz, records)`.

- [x] **4.1** Extend `tests/unit/EntityManager.test.ts` with `forgetChunk` coverage (evicts active +
      removed in-chunk entities, leaves other chunks untouched, frees ids for reuse). 3 new tests.

- [x] **5.1** Write `tests/unit/EntityChunkTracking.test.ts`: `selectTickingEntities` predicate
      filtering; `deactivateChunk` persist-then-forget (persistent record captured, both
      persistent/non-persistent entities forgotten); `activateChunk` matching `deserializeChunk`'s
      contract (success + rejection cases) and a full deactivate→activate round trip. 8 tests.

- [x] **6.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **7.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
