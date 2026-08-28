# Tasks: 198-sleep-and-time-skip

## Implementation
- [x] `src/simulation/SleepFramework.ts`: `DAY_TICKS` / `NIGHT_START_TICK` / `NIGHT_END_TICK`
      constants and the `SleepState` / `BedPosition` types.
- [x] `isNight` / `canSleep` (night window + storm rule).
- [x] `enterBed` (occupancy rejection, sleeping + spawn set) and `leaveBed` (spawn kept).
- [x] `canSkipNight` (all-players rule) and `skipNight` (morning + skipped ticks).
- [x] `spawnPoint` query and `serializeSleepState` / `deserializeSleepState` (version 1,
      validate-before-accept, descriptive throws).

## Tests
- [x] `tests/unit/SleepFramework.test.ts`: defaults; night boundaries (12541/12542/23459/23460/0).
- [x] canSleep matrix (day/night x storm).
- [x] Bed entry (free/occupied); leave keeps spawn; spawn query null/position.
- [x] Occupancy edges ((0,1),(1,1),(1,2),(2,2),(0,0)).
- [x] skipNight (20000 -> 4000; 12542 -> 11458; 0 -> 24000).
- [x] Persistence: round-trip; rejections (non-object, bad version, non-boolean fields, malformed
      spawn incl. NaN, unknown key) each named.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2597/2597 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 199-particle-system).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
