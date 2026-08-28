# Verification: 123-brewing-stand

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Brewing recipe table matches known pairs, null otherwise | `BrewingRecipes.test.ts`: water+nether_wart→awkward base empty effects; awkward+redstone/glowstone/reagents/fermented_spider_eye resolve; 5 unknown pairs return null | PASS |
| Blaze powder is fuel; brewTicks deterministic | `BrewingRecipes.test.ts`: `fuelBurnTicks(blaze_powder)=1200>0`; non-fuels `0`; `brewTicks()=400` | PASS |
| BrewingState immutable + deterministic tick | `BrewingStandBlockEntity.test.ts`: `tickBrewing` returns a new state (pure); round-trip; no mutation of input | PASS |
| Fuel consumed only when brewing can progress | `BrewingStandBlockEntity.test.ts`: water+nether_wart lights fuel (consumes 1, `fuelBurnTime>0`); water+glowstone (no recipe) leaves fuel unchanged | PASS |
| Brew completes: writes potion, consumes ingredient, resets timers | `BrewingStandBlockEntity.test.ts`: redstone cycle (400 ticks) writes `speed 1x480`, base stays awkward, ingredient −1, timers reset to 0 | PASS |
| Modifier (redstone) extends duration; glowstone boosts amplifier | `BrewingRecipes.test.ts`: redstone→`speed 1x480`; glowstone→`speed 1x120, amp 2` | PASS |
| Missing/invalid bottle potion → safe pause (no throw) | `BrewingStandBlockEntity.test.ts`: empty bottle slot pauses, no throw, fuel still burns down; malformed `potion_contents` treated as no potion | PASS |
| Serialize/deserialize round-trips + re-validates | `BrewingStandBlockEntity.test.ts`: full state round-trip equals original; malformed payload throws | PASS |
| MenuSlot.components additive (109/122 regression) | `MenuTransaction.ts` adds optional `components?`; full suite 1568 green incl. Furnace/Menu/PotionData | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1568/1568 (prior 1545 + 23 new: BrewingRecipes 9, BrewingStandBlockEntity 14) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 69 modules |
| `npm run test:e2e` | PASS | 21/21 |

## Edge / adversarial validation

- Brewing with an empty bottle slot is a no-op pause (fuel still burns down). ✓ tested
- Brewing with an ingredient that has no recipe is a pause (fuel not lit). ✓ tested
- A bottle whose `potion_contents` is malformed is treated as no valid potion (safe pause). ✓ tested
- `validateBrewingState` rejects `brewTime > brewTimeTotal`, `fuelBurnTime > fuelBurnTimeTotal`, and negative timers. ✓ tested
- A recipe output that cannot form a valid potion (e.g. empty effects) is caught by `applyMatch` via `createPotionContents` and treated as a pause (no consumption, no write) — `tickBrewing` never throws for valid inputs.

## Migration / compatibility validation

- `MenuSlot.components` optional; furnace/chest/menu code unaffected. 109 and 122 suites stay
  green (FurnaceBlockEntity, MenuTransaction, PotionItemData, StackDataComponents all exercised
  by the 1568-unit gate). No persisted-schema field changed.

## Performance / resource validation

- `tickBrewing` O(ticks), O(1) per tick, no IO/registry mutation. `serialize/deserialize` are
  pure and lossless; block-entity helpers wrap `BlockEntityInstance` unchanged.

## Regressions

- `FurnaceBlockEntity.test.ts` and `PotionItemData.test.ts` (and the full 1568-unit suite,
  including 109/110 furnace and 122 potion suites) remain green.

## Incomplete tasks

- None. All 6 task groups complete.

## Advancement Exception

Not applicable (100% completion).

## Final decision

Change 123 is **VERIFIED** at 100%. All five mandatory gates are green (typecheck, lint, 1568
unit tests, production build, 21/21 E2E). The brewing-stand engine, recipe context, fuel/timing,
and persistence are implemented and tested; `MenuSlot.components` is additive. Advance to 124.
