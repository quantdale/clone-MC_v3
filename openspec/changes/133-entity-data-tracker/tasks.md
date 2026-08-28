# Tasks: 133-entity-data-tracker

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/entity-data-tracker/spec.md`) and validate
      it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/data/EntityDataTracker.ts`: `DataAccessor<T>`, `DataAccessorRegistry`
      (`define`/`has`/`size`), `DataTrackerEntry`, `EntityDataTracker` (`define`/`has`/`get`/`set`/
      `isDirty`/`getDirty`/`getAll`/`clearDirty`) per design.md.

- [x] **3.1** Write `tests/unit/EntityDataTracker.test.ts`: registry dense-id assignment + duplicate
      name rejection; tracker define seeding + duplicate-id rejection; set dirty-on-change /
      no-op-on-same-value / throws-on-undefined-accessor; getDirty/getAll/clearDirty sync contract.
      12 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
