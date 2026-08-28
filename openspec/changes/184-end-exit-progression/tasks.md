# Tasks: 184-end-exit-progression

## Implementation
- [x] `src/simulation/EndExitProgression.ts`: `END_EXIT_PORTAL_RING_SIZE` (5) /
      `END_EXIT_PORTAL_VERSION` (1).
- [x] `DragonCompletionRecord` / `SerializedDragonCompletion`.
- [x] `endExitPortalCells` (21 cells: 5×5 minus corners).
- [x] `endExitPortalSpawns` (identity on gatewayOpen).
- [x] `endExitDestination` (finite pass-through, null otherwise).
- [x] `markDragonDefeated` (record exactly on 183's `dragonDefeated`).
- [x] `dragonCompletionIsDefeated` / `endExitPortalRemains`.
- [x] `serializeDragonCompletion` / `deserializeDragonCompletion` (versioned, validated).

## Tests
- [x] `tests/unit/EndExitProgression.test.ts`: exit portal exactly 21 distinct cells, all four
      corners absent, edges/interior present.
- [x] Spawn rule both values; portal-remains for defeated/living/null records.
- [x] Return destination finite pass-through and non-finite null.
- [x] `markDragonDefeated` null before defeat, record with tick on defeat; `dragonCompletionIsDefeated`.
- [x] Serialize/deserialize round-trip.
- [x] Malformed payloads rejected (null, bad version, empty key, non-boolean, negative tick).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2452/2452 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated — **End arc (181-184) CLOSED**; next change
      pointer to 185-advancement-framework.
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
