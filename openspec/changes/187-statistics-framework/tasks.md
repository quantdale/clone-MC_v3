# Tasks: 187-statistics-framework

## Implementation
- [x] `src/simulation/StatisticsFramework.ts`: `STATISTICS_VERSION` (1);
      `DEFAULT_STATISTIC_KEYS` (the 7 counters); `StatisticKey` / `StatisticEvent` /
      `StatisticStore` / `SerializedStatisticStore`.
- [x] `createStatisticStore` (all 0).
- [x] `incrementStatistic` (finite positive floored increment → new store; identity no-op
      otherwise).
- [x] `getStatistic`.
- [x] `applyStatisticEvent` (all seven event mappings; walk/damage floored).
- [x] `statisticsSnapshot` (fresh copy).
- [x] `serializeStatisticStore` / `deserializeStatisticStore` (validated).

## Tests
- [x] `tests/unit/StatisticsFramework.test.ts`: zero-initialized 7-key store.
- [x] Accumulation + immutability of the original store.
- [x] Invalid increments (0, negative, NaN, Infinity) are identity no-ops.
- [x] Every event mapping (floored walk 3.7 → 3; damage 4 → 4; kill/break/death/jump/tick → 1).
- [x] Death recorded; non-positive walk identity.
- [x] UI snapshot is a copy (mutation does not leak).
- [x] Serialize/deserialize round-trip.
- [x] Malformed payloads rejected (null, bad version, negative, non-integer, missing keys,
      unknown keys).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2474/2474 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated — **meta-progression trio (185-187) CLOSED**;
      next change pointer to 188-world-difficulty.
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
