# Tasks: 125-crop-growth

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/crop-growth/spec.md`) and validate
      it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Add `BlockId.Wheat = 34` to `src/world/BlockRegistry.ts` with a wheat
      definition: non-solid, non-opaque, breakable, `propertySchema { age: integer 0..7 }`,
      `defaultState { age: 0 }`, `dropItem: rid('wheat_seeds')`, `lootTable: rid('loot/wheat')`.

- [x] **2.2** Add `ItemId.WheatSeeds = 32` (placeable → `rid('wheat')`) and `ItemId.Wheat = 33`
      (non-placeable) to `src/inventory/ItemRegistry.ts` with `stackSize`, `name`, `resourceId`.

- [x] **3.1** Create `src/world/CropGrowth.ts` with `MAX_AGE = 7`, `isMature(age)`, and
      `nextCropAge(age)` (clamps to `MAX_AGE`; deterministic).

- [x] **3.2** Create `src/simulation/CropBehavior.ts` with `CropBlockBehavior(blockId)`
      implementing `onRandomTick`: guard on access capability + block-id match; parse `age`
      defensively; write `{ age: nextCropAge(age) }` via `setBlockState`; stop at maturity;
      never throw.

- [x] **4.1** Extend `BlockWorldAccess` (optional `getBlockState`/`setBlockState`) and
      `WorldAccess` (optional state methods); create `src/simulation/WorldBlockAccess.ts`
      adapter over `World`.

- [x] **4.2** Extend `World`: accept an optional `BlockStateRegistry`, add `stateOverlay`,
      `setBlockState` (resolve via `lookup`, write via `setBlock`, record state, clear stale
      override in `setBlock`), `getBlockState` (overlay else default), and `forEachLoadedChunk`.

- [x] **4.3** Wire `Game`: build the state registry (pass to World), a `BlockBehaviorRegistry`
      with the crop behavior, a `RandomTickSelector`, and the `WorldBlockAccess`; maintain a
      tick counter; in the `simulationActive` block iterate simulating chunks and dispatch
      `onRandomTick` for `selectEligible`-selected cells.

- [x] **5.1** Extend `LootContext` with optional `properties`; add the wheat loot table to
      `buildCurrentLootTables` (pool A seeds always; pool B wheat only when `age === '7'`);
      populate `properties` from the broken block's state in `PlayerInteraction.finishBreak`.

- [x] **6.1** Write `tests/unit/CropGrowth.test.ts` (nextCropAge clamping/maturity).
- [x] **6.2** Write `tests/unit/CropBehavior.test.ts` (fake access increments to 7 and stops).
- [x] **6.3** Write `tests/unit/WorldBlockState.test.ts` (wheat 8-state enumeration; set/get
      round-trip via World; stale-override clear).
- [x] **6.4** Write `tests/unit/CropRandomTick.test.ts` (selectEligible selects only crops).
- [x] **6.5** Write `tests/unit/WheatLoot.test.ts` (mature → wheat+seeds; immature → seeds only).

- [x] **7.1** Update existing tests for the new stateful block/items:
      `BlockRegistry.test.ts` (23 blocks), `BlockStateRegistry.test.ts` (wheat 8 states),
      `BlockItemSeparation.test.ts` (wheat item non-placeable; seeds place wheat),
      `LootTable.test.ts` (wheat special-case).

- [x] **8.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [x] **9.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
