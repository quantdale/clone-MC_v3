# Tasks: 138-mob-spawn-cycle

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/mob-spawn-cycle/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/simulation/MobSpawnCycle.ts`: `SpawnCategoryConfig`,
      `countLiveByCategory`, `selectSpawnCandidate`, `runSpawnCycleForChunk` per design.md.

- [x] **3.1** Write `tests/unit/MobSpawnCycle.test.ts`: `countLiveByCategory` mixed-category/removed
      counting; `selectSpawnCandidate` determinism + in-chunk-footprint bounds (including negative
      chunk coordinates); a category already at cap making zero attempts; a category reaching cap
      mid-cycle stopping early; a successful spawn appearing in the `EntityManager` at the expected
      position; an entirely-ineligible-world config spawning nothing without error. 7 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
