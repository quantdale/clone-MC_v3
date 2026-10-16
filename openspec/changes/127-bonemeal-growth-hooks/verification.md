# Verification: 127-bonemeal-growth-hooks

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 bone meal item id 34, non-placeable, resolvable | `tests/unit/Bonemeal.test.ts` (id/key/resource lookup, stack 64, no placeBlock/food/tool/enchant); `BlockItemSeparation.test.ts` `[34,'wheat','bone_meal']` | PASS |
| REQ-2 applyBonemeal grows wheat / no-op on air & unfertilizable | `tests/unit/Bonemeal.test.ts` (wheat 1→3 true; air & stone false, no writes) | PASS |
| REQ-3 bonemealNextAge clamp + fertilizeWheat 0->7 progression, mature no-op | `tests/unit/Bonemeal.test.ts` (bonemealNextAge clamp/normalize; fertilizeWheat grow/mature/non-wheat/capability-less/throwing-read; 0→2→4→6→7 in 4 uses then false) | PASS |
| REQ-4 'use' emission + bonemealTarget consume-on-success | `tests/unit/Bonemeal.test.ts` (bonemealTarget consume once on success, none on mature/air); `tests/unit/PlayerInteraction.test.ts` (bone meal emits `'use'`, no place; non-bonemeal item no `'use'`) | PASS |
| REQ-5 FertilizerRegistry validation + default composition | `tests/unit/Bonemeal.test.ts` (invalid/duplicate rejection, unregistered → undefined, default registry = wheat only) | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1654/1654 (prior 1631 + 23 new: Bonemeal 21, PlayerInteraction +2) |
| `npm run build` | PASS | `tsc --noEmit && vite build`; 82 modules transformed (was 81; +Bonemeal) |
| `npm run test:e2e` | PASS | 21/21 |

## Edge/adversarial validation
- Malformed/non-integer/negative `age` → `bonemealNextAge` returns 0; a throwing `getBlockState` →
  `fertilizeWheat`/`applyBonemeal` return `false` without writing or throwing (Bonemeal.test.ts, PASS).
- Access without `getBlockState`/`setBlockState` → `false`, no write, no throw (Bonemeal.test.ts, PASS).
- Mature wheat (`age = 7`) and air/unfertilizable blocks → `false`, no write (Bonemeal.test.ts, PASS).
- `bonemealTarget` consumes exactly once on success and never on a no-op; the player never loses bone
  meal on a failed/unfertilizable target (Bonemeal.test.ts, PASS).
- `FertilizerRegistry.register` rejects non-integer/negative ids, non-functions, and duplicates with a
  descriptive `Error` and no partial entry (Bonemeal.test.ts, PASS).

## Migration/compatibility validation
- New item id `ItemId.BoneMeal = 34` is additive; existing item ids 0..33 and all block ids unchanged.
  Item 34 shares its numeric id with `BlockId.Wheat`, consistent with the existing shared ids 32/33
  (`BlockItemSeparation.test.ts` `[34,'wheat','bone_meal']`, PASS).
- No block id, block-state, or state-enumeration change; `createDefaultBlockStateRegistry` size
  unchanged. No persistent snapshot/serialization format change and no migration required.

## Performance/resource validation
- `applyBonemeal` is O(1) (one `getBlockId`, one `getBlockState`, optional one `setBlockState`, one map
  lookup) and runs only on a player right-click, not per-frame/per-tick. The default fertilizer
  registry has exactly one entry.

## Regressions
- 1654/1654 unit + 21/21 e2e. Break/place/craft/harvest/wheat-growth/farmland paths unaffected;
  `CropBehavior`/`CropGrowth`/`FarmlandBehavior` suites still green. `BlockItemSeparation` preserved-id
  table updated for the new item only.

## Incomplete tasks
- None.

## Advancement Exception
Not applicable (100% completion).

## Final decision
VERIFIED. All five requirements implemented and covered by unit tests; full gate green
(typecheck/lint/test/build/e2e). No MUST/SHALL requirement unmet. Bone Meal (item 34), the
registry-backed fertilization interface (`applyBonemeal`/`FertilizerRegistry`), deterministic wheat
bonemeal (`WHEAT_GROW_STEP = 2`, clamped to maturity), and the `'use'` wiring that consumes one item
only on successful growth are implemented and tested. Full tree/sapling bonemeal is explicitly
**deferred** (no Sapling block or growth-stage state exists in the catalog; adding one is content
work for a later change); the interface is extensible so it can be added without a persistence or
interface change.
