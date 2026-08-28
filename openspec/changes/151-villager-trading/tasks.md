# Tasks: 151-villager-trading

## Implementation
- [x] `src/simulation/VillagerTrading.ts`: `TradeItem`, `TradeOffer`, `VillagerTradeState`
      interfaces; `VILLAGER_MAX_LEVEL`, `XP_PER_VILLAGER_LEVEL` constants.
- [x] Per-profession offer table + `createOffersForProfession` (level-gating, fresh objects per
      call, empty array for an unknown key).
- [x] `createVillagerTradeState`.
- [x] `canAcceptTrade` (item/count/exhaustion/optional-second-input validation).
- [x] `TradeResult` interface; `applyTrade` (pure; rejection returns the same state; uses
      decrement; XP accrual; level-up at threshold; cap at `VILLAGER_MAX_LEVEL`).
- [x] `restock`.
- [x] `buildTradeMenu` (106 `ContainerMenu` projection, `playerSlotStart === 3`).

## Tests
- [x] `tests/unit/VillagerTrading.test.ts`: `createOffersForProfession` level-1 gating case.
- [x] `createOffersForProfession` higher-level unlocks-more case.
- [x] `createOffersForProfession` unknown-profession empty-array case.
- [x] `canAcceptTrade` sufficient-offering accepted case.
- [x] `canAcceptTrade` insufficient-count rejected case.
- [x] `canAcceptTrade` wrong-item rejected case.
- [x] `canAcceptTrade` exhausted-offer rejected case.
- [x] `canAcceptTrade` missing-required-second-input rejected case.
- [x] `applyTrade` success case (result, uses decremented, XP added).
- [x] `applyTrade` ineligible-trade rejection case (state unchanged).
- [x] `applyTrade` out-of-range offer index rejected (not thrown) case.
- [x] Villager level-up at the XP threshold case.
- [x] Villager level capped at `VILLAGER_MAX_LEVEL` case.
- [x] `restock` resets remaining uses case.
- [x] `buildTradeMenu` slot layout/count case.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (23/23).
- [x] Full `npm test` passes (174 files, 1975/1975 — prior 1952 + 23 new).
- [x] `npm run build` passes (103 modules, unchanged — additive/unconsumed, mirroring
      148/149/150's own identical evidence).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected — nothing wired into the live
      game).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 152-raid-state-machine).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
