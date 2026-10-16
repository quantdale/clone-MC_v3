# Proposal: 126-farmland-moisture

## Problem
Crops (wheat) grow deterministically via random ticks (change 125) but have no farmland to
grow on, and there is no farmland block, hydration, moisture, reversion, or trampling. Survival
farming therefore has no foundation: there is no way to prepare soil, keep it hydrated for faster
growth, or destroy it by jumping. Change 126 introduces the **Farmland** block and the rules
around it.

## Goals
- Add a stateful **Farmland** block (`BlockId.Farmland = 35`) with a `moisture` integer property
  in `0..7` (default `0` = dry). It is solid, opaque, breakable, shovel-minable, and drops dirt
  on break.
- Detect hydration: farmland is hydrated when any `BlockId.Water` source is within the horizontal
  Chebyshev radius `|dx| <= 4, |dz| <= 4` and vertical offsets `dy in {-1, 0}` relative to the
  farmland block.
- Evolve moisture deterministically on random ticks: hydrated farmland rises toward `7`, dry
  farmland falls toward `0`.
- Revert farmland to dirt when it is dry and empty (no crop above), and when a solid block is
  placed directly above it. Never revert while a wheat crop sits on top.
- Trample farmland back to dirt when the player lands on it (feet block is farmland and the
  player transitions to landing).
- Crop support: hydrated farmland makes wheat above it grow faster (an extra growth step per
  farmland random tick) without changing the change-125 `age` mechanics.
- Additive compatibility: new block id `35`; no persistence-format change.

## Non-goals
- **Bonemeal / fertilization.** That is change 127 (`127-bonemeal-growth-hooks`).
- **Fire behavior.** Change 128.
- **Adding new crops.** Only wheat (from 125) is supported here.
- **Tilling dirt into farmland** via a hoe/tool interaction and **farmland placement UX**. This
  change introduces the block and its simulation rules; a hoe item and tilling interaction are a
  later progression concern. Farmland becomes reachable in the world through direct block writes
  and the simulation rules; it drops dirt when broken.
- **Persisting `moisture` across a page reload.** Like crop `age` (125), moisture is tracked in
  the World in-memory block-state overlay and is not yet written into the persistent edit
  snapshot format (deferred storage concern).
- **Weather/rain-driven hydration.** There is no weather system yet (change 196); rain is treated
  as absent, so hydration comes only from nearby water.

## Preconditions
- Change 125 (`crop-growth`) is VERIFIED and published: `BlockId.Wheat = 34`, `ItemId.WheatSeeds
  = 32`, `ItemId.Wheat = 33`, `CropGrowth`, `CropBlockBehavior`, `WorldBlockAccess`,
  `BlockBehavior`/`BlockBehaviorRegistry`, `World.setBlockState`/`getBlockState` and the random-tick
  dispatch in `Game` exist.
- Changes 006/007/048/050 (property schema, state registry, random-tick selector, behavior
  dispatch) are implemented and verified.
- `origin/main == HEAD`.

## Proposed change
- Add `BlockId.Farmland = 35` and `FARMLAND_SCHEMA` (`moisture` integer `0..7`, default `0`) to
  `src/world/BlockRegistry.ts`, registered in `createDefaultBlockRegistry` as a solid, opaque,
  breakable, shovel-minable block that drops dirt (`dropItem: rid('dirt')`,
  `lootTable: rid('loot/dirt')`).
- Add a pure `src/simulation/FarmlandBehavior.ts` module with `isFarmlandHydrated`,
  `nextMoisture`, `parseMoisture`, `isCropAbove`, `hasSolidCoverAbove`, `shouldRevertToDirt`, and
  `trampleFarmland`, plus a `FarmlandBlockBehavior` implementing `onRandomTick` and
  `onNeighborChanged`. Pure functions take a minimal `{ getBlock }` / `{ getBlock, setBlock }`
  world sampler so they are unit-testable without a full `World`.
- Refactor `src/simulation/CropBehavior.ts` to export a reusable `growCropAt(world, x, y, z,
  blockId)` step (the exact growth logic from 125) and have `CropBlockBehavior.onRandomTick`
  delegate to it. `FarmlandBlockBehavior` calls `growCropAt` on the wheat directly above when
  hydrated.
- Wire `Game` to register `FarmlandBlockBehavior` against the farmland block so the random-tick
  dispatch reaches it; rename the internal eligibility predicate from `isCropAt` to
  `isRandomTickEligible` since farmland now also has an `onRandomTick`.
- Trample from player physics: in `PlayerPhysics.resolve`, on a downward (landing) collision,
  call `trampleFarmland(world, x, y, z)` for the feet voxel.

## Compatibility and migration
- New block id `35` is additive; no existing block/item id changes. No farmland item is added
  (farmland drops dirt), so the item registry is unchanged.
- `FarmlandBlockBehavior` reuses the existing random-tick dispatch; no new interface methods are
  required on `BlockWorldAccess`/`WorldAccess` (the behavior reads neighbors via `getBlockId` and
  the pure helpers accept a sampler).
- `growCropAt` preserves change-125 crop-growth behavior exactly.
- No persistent snapshot/serialization format change; `moisture` is tracked in the World
  in-memory block-state overlay only.

## Risks
- Moisture dynamics and reversion run on every farmland random tick. The hydration scan is
  bounded to the `9 x 3` (dx × dy) neighborhood (≤ 81 cells), and reversion/growth writes only
  change legal block/state values. This must not throw out of the frame loop.
- Reversion must never destroy a growing crop: the crop check guards all reversion paths.
- The hydration rule (dy in {-1, 0}) differs from a naive "vertical ±1"; it is the documented,
  tested canonical rule.

## Rollback strategy
- A single implementation commit; reverting removes the farmland block, the farmland behavior,
  the `growCropAt` refactor, and the trampling hook without touching the persistent format or
  change-125 crop-growth behavior.

## Definition of Done
- Farmland has 8 enumerated states (moisture 0..7); `isFarmlandHydrated`, `nextMoisture`,
  `shouldRevertToDirt`, `trampleFarmland`, and `FarmlandBlockBehavior` behave per the spec and are
  unit-tested; the full gate (typecheck/lint/test/build/e2e) is green; existing unit suite stays
  green.

## Advancement gate
- 100% task completion; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` all green; no failed MUST/SHALL requirement.
