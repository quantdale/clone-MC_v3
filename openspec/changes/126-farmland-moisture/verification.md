# Verification: 126-farmland-moisture

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 farmland moisture states 0..7, solid/breakable/drops dirt | `tests/unit/FarmlandMoistureState.test.ts` (8 states moisture 0..7, default 0, solid/opaque/breakable, dropItem dirt); `BlockRegistry.test.ts` (farmland, count 24) | PASS |
| REQ-2 hydration within/outside neighborhood | `tests/unit/FarmlandBehavior.test.ts` (in-radius dy -1/0 true, out-of-radius false, dy +1 false) | PASS |
| REQ-3 moisture rise when hydrated / fall when dry + clamp | `tests/unit/FarmlandBehavior.test.ts` nextMoisture (0→1, 5→4, 7→7, 0→0) + onRandomTick (moisten 0→7 then stop; dry 5→4) | PASS |
| REQ-4 dry+empty reverts; crop prevents reversion | `tests/unit/FarmlandBehavior.test.ts` (dry+empty→Dirt; crop above stays farmland, no dirt write) | PASS |
| REQ-5 solid block placed above reverts | `tests/unit/FarmlandBehavior.test.ts` onNeighborChanged (stone above→Dirt; crop above no revert; non-above neighbor ignored) + onRandomTick fallback (moisture 5 + stone above→Dirt) | PASS |
| REQ-6 trample reverts / no-op on non-farmland | `tests/unit/FarmlandBehavior.test.ts` trampleFarmland (revert, no-op on grass); `src/player/PlayerPhysics.ts` resolve landing hook | PASS |
| REQ-7 hydrated grows crop above / dry does not | `tests/unit/FarmlandBehavior.test.ts` (hydrated age 3→4; dry age unchanged; mature crop stays 7) | PASS |
| REQ-8 growCropAt preserves 125 semantics | `tests/unit/CropBehavior.test.ts` existing suite still green (increments to 7, stops, malformed, missing capability); `CropBlockBehavior.onRandomTick` delegates to `growCropAt` | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1631/1631 (prior 1601 + 30 new: FarmlandBehavior 24, FarmlandMoistureState 6) |
| `npm run build` | PASS | `tsc --noEmit && vite build`; 81 modules transformed (was 80; +FarmlandBehavior) |
| `npm run test:e2e` | PASS | 21/21 |

## Edge / adversarial validation
- Malformed/non-numeric `moisture` treated as 0; a throwing `getBlockState` skips the tick; missing state capability no-ops (FarmlandBehavior.test.ts, PASS).
- `nextMoisture` clamps at bounds (7→7 hydrated, 0→0 dry); `parseMoisture` normalizes `'9'`/`'abc'`/`undefined` to 0.
- `onNeighborChanged` ignores neighbor changes that are not directly above; does not revert when the crop is placed above.
- `trampleFarmland` is a no-op on non-farmland (grass stays).
- Farmland never reverts while wheat is on top (dry + crop → stays farmland).

## Migration / compatibility validation
- New block id additive: `BlockId.Farmland = 35`; existing block/item ids unchanged; no farmland item added; item registry untouched (`BlockItemSeparation.test.ts` `[35,'farmland',null]` preserved-id table green).
- No new methods on `BlockWorldAccess`/`WorldAccess`; `FarmlandBlockBehavior` reads neighbors via `getBlockId` and pure helpers accept a sampler.
- `growCropAt` preserves change-125 growth behavior exactly; `CropBlockBehavior` tests unchanged and green.
- No persistent snapshot/serialization format change; farmland `moisture` is tracked in the World in-memory block-state overlay only (documented).

## Performance / resource validation
- Hydration scan is bounded to the 9×3 Chebyshev neighborhood (≤ 81 `getBlockId` reads) per farmland random tick, over simulating sections only.
- `nextMoisture`, `parseMoisture`, `shouldRevertToDirt`, `isCropAbove`, `hasSolidCoverAbove`, `trampleFarmland`, and `growCropAt` are O(1).
- State overlay grows by at most the number of farmed/wheat cells the player maintains.

## Regressions
- Existing single-state invariant updated for the two new stateful blocks (`BlockStateRegistry.test.ts`: 22 single-state + 8 wheat + 8 farmland); `BlockPropertySchema.test.ts` excludes farmland from EMPTY_SCHEMA; `BlockRegistry.test.ts` count 24.
- 1631/1631 unit + 21/21 e2e; break/place/craft/harvest paths unaffected.

## Incomplete tasks
- None.

## Advancement Exception
Not applicable (100% completion).

## Final decision
VERIFIED. All eight requirements implemented and covered by unit tests; full gate green
(typecheck/lint/test/build/e2e). No MUST/SHALL requirement unmet. Farmland is solid/opaque/
breakable and drops dirt; moisture 0..7, hydration within the documented `|dx|<=4,|dz|<=4,
dy∈{-1,0}` neighborhood, deterministic moisture rise/fall, dry+empty and solid-cover reversion,
player trampling, and hydrated crop support are implemented and tested. Bonemeal (127), fire
(128), a hoe/tilling interaction, and persisting moisture across a page reload are explicitly out
of scope.
