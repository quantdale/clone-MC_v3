# Proposal: 127-bonemeal-growth-hooks

## Problem
The player can grow wheat only via slow random ticks (125) accelerated by hydrated farmland (126).
There is no player-driven way to accelerate crop growth, and no general fertilization interface on
which future fertilizable blocks (saplings/trees, other crops) can be built.

## Goals
- Add a **Bone Meal** inventory item (`ItemId.BoneMeal = 34`), non-placeable, stack 64.
- Add a pure, registry-backed **fertilization interface**: `applyBonemeal(world, x, y, z)` returns
  whether growth was applied, and a `FertilizerRegistry` maps block id → growth function.
- Wire the existing `'use'` interaction (120) so right-clicking while holding bone meal targets the
  block under the crosshair, applies growth, and consumes exactly one bone meal **only** on success.
- Implement the **first crop behavior**: bone meal advances wheat `age` by a fixed, documented step
  (`WHEAT_GROW_STEP = 2`), clamped to maturity — deterministic and unit-testable.
- Document the **tree/sapling behavior** as deferred and keep the interface extensible so it can be
  added later without a persistence/interface change.

## Non-goals
- **Full sapling/tree bonemeal generation is deferred.** There is no Sapling block, sapling item, or
  sapling growth-stage state in the current block catalog (`src/world/BlockRegistry.ts`). Adding one
  is content work (new block + item + tree-generator wiring) better scoped to a later content change,
  and is only documented here.
- No crafting/recipe for bone meal, no particle effects, no bone-meal-on-anything-else behavior, no
  fertilizer for other crops yet.
- No persisting of any new state; no new block ids; no rendering art for bone meal beyond an atlas
  tile index mirroring the existing wheat items' pattern.
- Fire (128) and any other fertilization target are out of scope.

## Preconditions
- Change 125 (wheat `age` 0..7, `growCropAt`, `World.setBlockState`) is VERIFIED.
- Change 126 (farmland moisture, `BlockId.Farmland = 35`) is VERIFIED.
- Change 120 added the `InteractionAction 'use'` plumbing used here.
- `origin/main` head equals the local `HEAD` (`307e09e`).

## Dependencies
- `src/world/CropGrowth.ts` (`MAX_AGE`, `isMature`, `nextCropAge`).
- `src/simulation/CropBehavior.ts` (`CROP_AGE_PROPERTY`), `growCropAt` (unchanged).
- `src/simulation/BlockBehavior.ts` (`BlockWorldAccess`).
- `src/simulation/WorldBlockAccess.ts` (adapter used by `Game`).
- `src/inventory/ItemRegistry.ts` (`ItemId`, `ItemTypeDefinition`, `createDefaultItemRegistry`).
- `src/player/PlayerInteraction.ts` (`InteractionAction`, `'use'` emission).
- `src/engine/Game.ts` (`onInteractionAction`, `worldBlockAccess`, `inventory.consumeSelected`,
  `interaction.getTarget()`).

## Proposed change
1. `ItemId.BoneMeal = 34` + a bone meal definition in `createDefaultItemRegistry` (no
   `placeBlock`, not food/tool, `stackSize 64`, `iconTile 36`).
2. New `src/simulation/Bonemeal.ts`:
   - `WHEAT_GROW_STEP = 2`, `bonemealNextAge(age)`.
   - `fertilizeWheat(world, x, y, z): boolean` (the registered wheat rule).
   - `FertilizerRegistry` + `createDefaultFertilizerRegistry()`.
   - `applyBonemeal(world, x, y, z, registry?)`.
   - `bonemealTarget(world, x, y, z, consume, registry?)` (apply-then-consume seam).
3. `PlayerInteraction.update`: when the selected item is bone meal and a block is targeted, emit
   `'use'` (blocking placement), mirroring the enchanting-table branch.
4. `Game.onInteractionAction`: on `'use'`, if the selected item is bone meal call `useBonemeal()`
   (target via `interaction.getTarget()`, `bonemealTarget` with `inventory.consumeSelected`),
   otherwise keep the enchanting-table path.

## Compatibility and migration
- Additive item id 34 only; no block/state/persistence change; no migration. See spec.

## Risks
- Branching `'use'` on the selected item could interact with the enchanting-table path. Mitigation:
  bone-meal `'use'` is emitted only when bone meal is selected, and the enchanting-table `'use'`
  only when an enchanting table is targeted, so the two never collide; `Game` branches on the
  selected item id.
- Item loss on a no-op target. Mitigation: consumption happens only after `applyBonemeal` returns
  `true` (`bonemealTarget`).

## Rollback strategy
The change is additive (new item, new module, new branches). Reverting is a single commit revert;
removing the bone meal item and `'use'` branch restores prior behavior with no persistence impact.

## Definition of Done
- Bone meal item id 34 registered and resolvable; wheat `bonemealNextAge`/`fertilizeWheat` correct.
- `applyBonemeal` returns `true`/`false` correctly for wheat, mature wheat, air, and
  non-fertilizable blocks, without throwing.
- `'use'` emits for bone meal; consumption happens exactly once per successful fertilization.
- Full tree/sapling generation documented as deferred (no sapling block/stage exists).
- Unit tests cover the interface, wheat rule, registry validation, `'use'` emission, and the
  consumption path.
- Full gate green: typecheck, lint, unit (existing 1631 + new), build, e2e (21/21).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
