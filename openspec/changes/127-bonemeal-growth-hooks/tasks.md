# Tasks: 127-bonemeal-growth-hooks

- [x] **1.1** Author the OpenSpec package (`proposal.md`, `design.md`, `tasks.md`,
      `verification.md` at NOT VERIFIED / 0%, and `specs/bonemeal-growth-hooks/spec.md`) and validate
      it against `SPEC_AUTHORING_PROTOCOL.md` before writing production code.

- [x] **2.1** Add `ItemId.BoneMeal = 34` to `src/inventory/ItemRegistry.ts` and a definition in
      `createDefaultItemRegistry` (`minecraft:bone_meal`, `bone_meal`, stack 64, `iconTile 36`, no
      `placeBlock`/food/tool/enchantment fields).

- [x] **3.1** Create `src/simulation/Bonemeal.ts` with `WHEAT_GROW_STEP`, `bonemealNextAge`,
      `fertilizeWheat`, `FertilizerRegistry`, `createDefaultFertilizerRegistry`, `applyBonemeal`, and
      `bonemealTarget`. Deterministic, unit-testable without a full World.

- [x] **4.1** Wire `src/player/PlayerInteraction.ts`: when the selected item is `ItemId.BoneMeal`
      and a block is under the crosshair, emit `'use'` instead of placing.

- [x] **4.2** Wire `src/engine/Game.ts`: add `useBonemeal()` (target via `interaction.getTarget()`,
      call `bonemealTarget` with `inventory.consumeSelected`) and branch `onInteractionAction('use')`
      on the selected item (bone meal vs enchanting table).

- [x] **5.1** Write `tests/unit/Bonemeal.test.ts`: item definition, `bonemealNextAge`,
      `fertilizeWheat` (grow / mature / non-wheat / capability-less / malformed-read), `applyBonemeal`
      (grow / air / stone no-op), `bonemealTarget` (consume-on-success, no consume on no-op),
      `FertilizerRegistry` (duplicate/invalid rejection, default composition).

- [x] **5.2** Extend `tests/unit/PlayerInteraction.test.ts` with a `'use'`-emission test for bone
      meal (target present) and a no-target/other-item guard if applicable.

- [x] **6.1** Update existing tests: `BlockItemSeparation.test.ts` row `[34, 'wheat', 'bone_meal']`
      and the non-placeable key list (`'bone_meal'`).

- [x] **7.1** Run the full regression gate: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run test:e2e`. Fix any failure.

- [x] **8.1** Update `verification.md` with real evidence; reconcile every artifact against the
      final implementation; mark `VERIFIED` only when 100% of tasks pass and the gate is green.
