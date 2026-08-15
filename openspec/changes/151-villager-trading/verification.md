# Verification: 151-villager-trading

## Status
VERIFIED — 100%

## Task completion
7 / 7 implementation tasks, 15 / 15 test tasks, 6 / 6 verification tasks complete (28/28, 100%).

## Gate evidence
- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit (isolated): PASS 23/23 (`tests/unit/VillagerTrading.test.ts`)
- unit (full suite): PASS 174 files / 1975 tests (`npx vitest run --testTimeout=30000`; prior 1952 +
  23 new)
- build: PASS (`tsc --noEmit && vite build`, 103 modules, unchanged from 150 — confirms this is an
  additive/unconsumed capability with no `Game.ts` consumer, matching 148/149/150's own identical
  validation evidence)
- e2e: PASS 22/22 (`npm run test:e2e`, Playwright; all pre-existing assertions unaffected — nothing
  wired into the live game, per the proposal's Definition of Done)

## Requirement coverage
| Requirement | Test | Result |
|---|---|---|
| REQ-1 createOffersForProfession level-gating | level-1 / higher-level / unknown-key / fresh-objects / all-professions cases | PASS |
| REQ-2 canAcceptTrade validation | sufficient / over-sufficient / insufficient / wrong-item / null / exhausted / missing-second-input / satisfied-second-input cases | PASS |
| REQ-3 applyTrade result/uses/XP | success / ineligible-rejection / out-of-range-index / exhaust-then-reject cases | PASS |
| REQ-4 level threshold + cap | level-up-at-threshold / never-above-max cases | PASS |
| REQ-5 restock resets uses | restock case (level/xp preserved) | PASS |
| REQ-6 buildTradeMenu projection | single-input / two-input / out-of-range-index layout cases | PASS |

## Edge/adversarial validation
- `applyTrade`'s purity is asserted directly: after a successful trade, the *original* state's
  offer still reports full `usesRemaining` and `xp === 0`.
- A rejected trade returns the identical state reference (`toBe`, not `toEqual`), proving no
  defensive copy or partial mutation occurred.
- An out-of-range `offerIndex` is a rejection, not a throw — deliberately divergent from 106's
  `applyMenuTransaction` (which throws on a bad slot index) and documented as such in design.md.
- Draining an offer to exactly `usesRemaining === 0` across `maxUses` successful trades then
  correctly rejects the next attempt.
- `createOffersForProfession` returns fresh objects per call (asserted with `not.toBe` + `toEqual`),
  so two villagers of the same profession can never share mutable offer state.
- A two-input (`librarian` L3) offer is rejected when the required second input is absent and
  accepted when supplied — exercising the optional-`inputB` branch in both directions.

## Migration/compatibility validation
- One new, additive file. No existing module edited (confirmed via the diff — zero lines touched
  outside the new module and its test); 150's `VillagerProfession.ts` is untouched (the offer table
  keys off the profession `key` string rather than extending the profession record). No `Game.ts`
  edit; no schema/save-format change; trade state is session-only.

## Performance/resource validation
- Every function is O(offers) at worst over a small fixed list (3 offers per profession);
  `buildTradeMenu` is O(playerSlots). Not on any hot path (unconsumed).

## Regressions
None. Full 1975-test unit suite green (no prior test modified or broken); all 22 pre-existing e2e
assertions pass unchanged.

## Incomplete tasks
None — 28/28 (100%).

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. Advance. 100% task completion, full gate green (typecheck, lint, 1975-unit suite,
production build, 22/22 e2e), no MUST/SHALL requirement unmet, no regression. This capability is
intentionally additive/unconsumed — nothing spawns a villager yet (150's inherited blocker: no
village/structure generation), and the DOM trading screen is 203's titled scope, mirroring 120's
still-deferred `EnchantingPanel` precedent. Known, documented limitation: `buildTradeMenu`'s result
slot is not write-protected, because 106 has no read-only-slot concept — a future UI must gate it.
Next change: 152-raid-state-machine.
