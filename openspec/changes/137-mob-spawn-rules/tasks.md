# Tasks: 137-mob-spawn-rules

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/mob-spawn-rules/spec.md`) and validate it
      against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Create `src/simulation/MobSpawnRules.ts`: `SpawnWorld`, constants
      (`MONSTER_MAX_LIGHT`/`CREATURE_MIN_LIGHT`/`MIN_SPAWN_DISTANCE`/`MAX_SPAWN_DISTANCE`),
      `lightLevelAt`, `isValidSpawnDistance`, `isValidSpawnBiome`, `isValidSpawnLight`,
      `isValidSpawnBlock` (reusing 134's `canStandAt`), `canSpawn`.

- [x] **3.1** Write `tests/unit/MobSpawnRules.test.ts`: distance boundary cases; biome
      water/land/other-category partitioning; light category thresholds (monster/ambient/creature/
      water-independent); block delegation to `canStandAt` for land categories + water-block
      requirement for water categories; `canSpawn`'s exact conjunction (one failing predicate fails
      the whole check, all four passing succeeds). 14 tests.

- [x] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. All green (see verification.md).

- [x] **5.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
