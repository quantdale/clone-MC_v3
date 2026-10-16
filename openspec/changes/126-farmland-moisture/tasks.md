# Tasks: 126-farmland-moisture

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/farmland-moisture/spec.md`) and validate
      it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Add `BlockId.Farmland = 35` to `src/world/BlockRegistry.ts` with `FARMLAND_SCHEMA`
      (`moisture` integer 0..7), `defaultState { moisture: 0 }`, `dropItem: rid('dirt')`,
      `lootTable: rid('loot/dirt')`, solid/opaque/breakable, preferredTool Shovel. Register it in
      `createDefaultBlockRegistry`. No farmland item is added.

- [x] **3.1** Create `src/simulation/FarmlandBehavior.ts` with pure helpers `isFarmlandHydrated`,
      `nextMoisture`, `parseMoisture`, `isCropAbove`, `hasSolidCoverAbove`, `shouldRevertToDirt`,
      and `trampleFarmland` (over a minimal `BlockSampler`/`FarmlandWorld`), plus a
      `FarmlandBlockBehavior` implementing `onRandomTick` and `onNeighborChanged`. Deterministic
      and unit-testable without a full World.

- [x] **4.1** Refactor `src/simulation/CropBehavior.ts` to export `growCropAt(world, x, y, z,
      blockId)` (the change-125 growth step) and have `CropBlockBehavior.onRandomTick` delegate to
      it. Farmland reuses `growCropAt` for the wheat above when hydrated.

- [x] **5.1** Wire `src/engine/Game.ts`: construct `FarmlandBlockBehavior`, register it against the
      farmland key in `behaviorRegistry`; rename the random-tick eligibility predicate `isCropAt`
      to `isRandomTickEligible` (farmland now also has `onRandomTick`).

- [x] **5.2** Wire trampling in `src/player/PlayerPhysics.ts`: on a downward (landing) Y collision
      in `resolve`, call `trampleFarmland(world, x, y, z)` for the feet voxel.

- [x] **6.1** Write `tests/unit/FarmlandBehavior.test.ts` (pure helpers: hydration in/out/dy-band,
      nextMoisture clamping, shouldRevertToDirt, trampleFarmland revert/no-op, growCropAt reuse)
      and `tests/unit/FarmlandBehavior.test.ts` behavior tests (onRandomTick rise/fall, dry+empty
      reversion, no reversion with crop, solid-cover reversion via onNeighborChanged + random-tick
      fallback, hydrated crop growth, dry no-growth).

- [x] **6.2** Write `tests/unit/FarmlandMoistureState.test.ts` (8-state enumeration via
      `createDefaultBlockStateRegistry`; set/get moisture round-trip via World; default moisture 0).

- [x] **7.1** Update existing tests for the new stateful block: `BlockRegistry.test.ts`
      (`[BlockId.Farmland, 'farmland']`, count 24), `BlockStateRegistry.test.ts` (22 single-state +
      8 wheat + 8 farmland; farmland excluded from EMPTY_SCHEMA), `BlockPropertySchema.test.ts`
      (farmland excluded from EMPTY_SCHEMA), `BlockItemSeparation.test.ts` (`[35, 'farmland', null]`).

- [x] **8.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [x] **9.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
