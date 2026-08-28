# Verification: 125-crop-growth

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 wheat age states 0..7 | `tests/unit/WorldBlockState.test.ts` (8 states age 0..7); `BlockStateRegistry.test.ts` update | PASS |
| REQ-2 nextCropAge clamping / isMature | `tests/unit/CropGrowth.test.ts` (clamp, 7-step maturity, invalid input) | PASS |
| REQ-3 onRandomTick increments to 7 and stops | `tests/unit/CropBehavior.test.ts` (0→7, stops at 7, malformed, missing capability) | PASS |
| REQ-4 random-tick selects only crops | `tests/unit/CropRandomTick.test.ts`; `src/engine/Game.ts` `tickRandomBlocks` | PASS |
| REQ-5 crop loot mature/immature/absent age | `tests/unit/WheatLoot.test.ts` (mature wheat+seeds, immature/absent seeds) | PASS |
| REQ-6 finishBreak passes age into loot context | `src/player/PlayerInteraction.ts` `finishBreak` populates `properties` from `getBlockState`; e2e 21/21 regression | PASS |
| REQ-7 World set/get state + stale-clear | `tests/unit/WorldBlockState.test.ts` (round-trip, default age 0, setBlock clears override, no-op guard) | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1601/1601 (prior 1579 + 22 new: CropGrowth 5, CropBehavior 5, CropRandomTick 3, WorldBlockState 5, WheatLoot 4) |
| `npm run build` | PASS | `tsc --noEmit && vite build`; 80 modules transformed |
| `npm run test:e2e` | PASS | 21/21 |

## Edge / adversarial validation
- Non-numeric `age` state treated as age 0; a throwing `getBlockState` is caught and growth skipped (CropBehavior.test.ts, PASS).
- Access without `getBlockState`/`setBlockState` → no write, no throw (CropBehavior.test.ts, PASS).
- `setBlockState` with out-of-bounds y or unregistered block id → no-op (WorldBlockState.test.ts, PASS).
- `selectEligible` over an all-ineligible section returns empty, bounded, no hang (CropRandomTick.test.ts, PASS).
- A plain `setBlock` clears a stale state override so no wheat age leaks onto another block (WorldBlockState.test.ts, PASS).

## Migration / compatibility validation
- New ids additive: `BlockId.Wheat = 34`, `ItemId.WheatSeeds = 32`, `ItemId.Wheat = 33`; existing ids unchanged (`BlockItemSeparation.test.ts` preserved-id table + 34/wheat added).
- `LootContext.properties` and access `getBlockState`/`setBlockState` are optional/additive; existing tables, conditions, mocks, and the harvest path unchanged (LootTable.test.ts, PlayerInteraction.test.ts green).
- No persistent snapshot/serialization format change; crop age is tracked in the World in-memory overlay only (documented in proposal/design).

## Performance / resource validation
- Random-tick dispatch is bounded by `RandomTickSelector.selectEligible` (3 cells × ≤256 candidate attempts per section) and runs only over simulating chunks when `simulationActive`.
- `getBlockState`/`setBlockState` are O(1) map operations; the state overlay is bounded by grown cells (wheat only) and cleared on `World.dispose`.

## Regressions
- Existing single-state invariant updated for the new stateful block (`BlockStateRegistry.test.ts`); `BlockRegistry.test.ts` (23), `BlockPropertySchema.test.ts` (wheat excluded from EMPTY_SCHEMA), `BlockItemSeparation.test.ts` (wheat item/seeds), `LootTable.test.ts` green.
- 1601/1601 unit + 21/21 e2e; break/place/craft/harvest paths unaffected.

## Incomplete tasks
- None.

## Advancement Exception
Not applicable (100% completion).

## Final decision
VERIFIED. All seven requirements implemented and covered by unit tests; full gate green
(typecheck/lint/test/build/e2e). No MUST/SHALL requirement unmet. Farmland hydration/trampling
(126), bonemeal (127), and persisting crop `age` across a page reload are explicitly out of
scope.
