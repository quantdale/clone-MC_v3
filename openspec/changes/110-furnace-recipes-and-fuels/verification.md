# Verification: 110-furnace-recipes-and-fuels

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| Strict `FuelValueRegistry` (atomic duplicate/invalid rejection) | `tests/unit/FurnaceRecipes.test.ts` "FuelValueRegistry" — duplicate and invalid burnTicks throw; size/all deterministic | PASS |
| `createDefaultFuelValues` = coal 1600 / wood 300 / planks 300 / stick 100 | `tests/unit/FurnaceRecipes.test.ts` "createDefaultFuelValues" asserts exact burn ticks | PASS |
| `createFurnaceContext` wires recipes+fuel, rejects duplicate processing inputs | `tests/unit/FurnaceRecipes.test.ts` "createFurnaceContext" — resolves cookTicks/resultOf/experienceOf; duplicate-input registry throws atomically | PASS |
| `takeFurnaceXp` drains integer floor, carries fraction | `tests/unit/FurnaceRecipes.test.ts` "takeFurnaceXp" — 1.7→1/0.7, 2.0→2/0, 0.3→0/0.3, 0→0/0; negative/NaN/Infinity throw | PASS |
| `FurnaceState.xp` validated (finite >=0, absent->0) + envelope includes `xp` | `tests/unit/FurnaceBlockEntity.test.ts` empty-state literal carries `xp: 0`; `tests/unit/FurnaceRecipes.test.ts` "backward compatibility" round-trips xp and loads legacy payloads as 0 | PASS |
| Optional `experienceOf` on `FurnaceContext`; atomic XP grant on cook completion | `src/world/FurnaceBlockEntity.ts` `tickOnce` returns `xp: state.xp + experience`; `tests/unit/FurnaceRecipes.test.ts` end-to-end asserts xp 0.1/0.2/0.7 | PASS |
| `smelt_raw_iron` processing recipe + `iron_ingot` item id 27 + atlas tile 29 | `src/inventory/TypedRecipe.ts` default recipes (size now 5); `src/inventory/ItemRegistry.ts` `IronIngot = 27`; `src/rendering/TextureAtlas.ts` `ironIngot: 29` + painter | PASS |
| `tests/unit/FurnaceRecipes.test.ts` covering fuel/context/XP/end-to-end/backward-compat | 14 new tests, all passing | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1267 unit tests pass (123 files); baseline was 1253, +14 from FurnaceRecipes.test.ts |
| `npm run build` | PASS | `tsc --noEmit && vite build`; dist emitted |
| `npm run test:e2e` | PASS | 19/19 e2e tests pass (1.5m) |

## Edge / adversarial validation
- `FuelValueRegistry.register`: empty/non-string item, non-positive-integer/zero/negative/decimal burnTicks all throw; duplicate item throws; registry size unchanged after a throwing call (atomic).
- `createFurnaceContext`: two `processing` recipes sharing an input throw `FurnaceRecipes: duplicate processing input` atomically.
- `takeFurnaceXp`: negative, `NaN`, and `Infinity` throw; non-negative finite fractions drain floor and carry remainder deterministically.
- `deserializeFurnaceState` of a payload without `xp` validates to `xp: 0` (pre-110 saves load unchanged); `validateFurnaceState` of the same shape does not throw.
- `tickFurnace` XP: only completed cooks grant XP (mid-cook state carries `xp: 0`); output-full pause preserves accumulated `xp`.

## Migration / compatibility validation
- Furnace payload gains optional `xp`; legacy 109 payloads (no `xp`) validate as 0 — verified by the backward-compatibility test.
- `FurnaceContext.experienceOf` is optional; `createFurnaceContext` always supplies it, but a context without it (e.g. 109 tests) keeps prior behavior (grants 0 XP). 109 suite still green.

## Performance / resource validation
- No hot-path allocations added; `createFurnaceContext` indexes processing recipes once into a `Map` (O(recipes)); `FurnaceRecipes` functions are pure over plain data.

## Regressions
- None. Full unit suite 1267/1267 green (incl. 109 FurnaceBlockEntity 24 tests and 105 CraftingTable updated for the new 5th default recipe). E2E 19/19 green.

## Incomplete tasks
- None. All 6 tasks complete.

## Advancement Exception
Not applicable — 100% completion; all MUST/SHALL requirements implemented and verified; no data-loss, corruption, determinism, compatibility, security, or regression blocker.

## Final decision
VERIFIED. Advance to 111-item-entity-drops.
