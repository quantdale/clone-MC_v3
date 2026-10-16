# Tasks: 150-villager-professions

## Implementation
- [x] `src/data/EntityType.ts`: add `villager` `CREATURE` definition (health 20) to
      `createDefaultEntityRegistry()`.
- [x] `src/simulation/VillagerProfession.ts`: `VillagerProfession` interface;
      `VillagerProfessionRegistry` class (003-based: `get`/`getOptional`/`has`/`getByKey`/
      `entries`/`finalized`/`size`).
- [x] `createDefaultVillagerProfessionRegistry` (farmer/librarian/weaponsmith).
- [x] `VillagerSchedulePhase` type; `scheduleForHour` pure function.
- [x] `VillagerAssignment` interface; `VillagerProfessionSystem` class (`assignProfession`,
      `unassign`, `getAssignment`).

## Tests
- [x] `tests/unit/EntityType.test.ts`: update default-registry size (12) and sorted key-list
      assertion to include `villager`; update the fixed `item` runtime-id expectation (10 → 11).
- [x] `tests/unit/VillagerProfession.test.ts`: `VillagerProfessionRegistry` construction/lookup
      cases.
- [x] `assignProfession` claims the only available profession's workstation case.
- [x] `assignProfession` earlier-priority-wins-over-nearer-later-priority case.
- [x] `assignProfession` no-available-workstation returns null, claims nothing case.
- [x] `assignProfession` already-assigned villager is not reassigned case.
- [x] `unassign` releases the claimed POI and clears the assignment case.
- [x] `unassign` on an unassigned villager is a no-op case.
- [x] `scheduleForHour` boundary cases across all three phases.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (10/10).
- [x] Full `npm test` passes (173 files, 1952/1952 — prior 1942 + 10 new).
- [x] `npm run build` passes (103 modules, unchanged — additive/unconsumed, mirroring 148/149's
      own identical evidence).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — nothing wired into the live
      game).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 151-villager-trading).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
