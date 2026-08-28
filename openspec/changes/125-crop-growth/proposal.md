# Proposal: 125-crop-growth

## Problem
Blocks have no age states and nothing in the simulation advances them, and there is no
crop drop pathway. The block-state registry (007) and random-tick selector (048) and block
behavior dispatch (050) all exist but are not wired together for any plant. Wheat seeds and
wheat as items do not exist, so nothing in survival/progression can be grown or harvested.

## Goals
- Introduce a stateful **Wheat** block with an `age` integer property (0–7) and its 8
  canonical states enumerated by the block-state registry.
- Grow wheat deterministically via random ticks: each random tick advances `age` by one,
  clamped to maturity (7).
- Drop crops through the existing loot path: an immature wheat plant drops only its seeds;
  a mature plant drops both wheat and seeds, so the existing `finishBreak` + `evaluate`
  harvest wiring works unchanged.

## Non-goals
- **Farmland hydration/trampling/reversion and crop support rules.** That is change 126
  (`126-farmland-moisture`). Wheat growth here does not depend on farmland state.
- **Bonemeal / fertilization.** That is change 127 (`127-bonemeal-growth-hooks`).
- **Persisting crop `age` across a page reload.** The age state is tracked in a World
  in-memory block-state overlay that survives chunk unload/reload within a session but is
  not yet written into the persistent edit snapshot format. Persisting block-state data is
  a storage concern deferred to a later change.
- **Wheat rendering art / atlas textures.** The block uses a placeholder tile; visual assets
  are out of scope.
- **Player-driven seed planting UX** beyond the existing `placeBlock` path. Placing the
  `wheat_seeds` item already writes the wheat block at its default age 0 through the current
  item-placement path; no new planting UI is added.

## Preconditions
- Changes 006 (`block-property-schema`), 007 (`block-state-runtime-registry`), 011
  (`loot-table-data-model`), 048 (`random-tick-system`), 050 (`block-behavior-dispatch`)
  are implemented and verified. `BlockPropertySchema`/`IntegerPropertySpec`,
  `BlockStateRegistry`, `LootTable`/`LootContext`, `RandomTickSelector`, and
  `BlockBehavior`/`BlockBehaviorRegistry`/`BlockWorldAccess` exist.
- Change 124 is VERIFIED and published (`origin/main` == HEAD).

## Proposed change
- Add `Wheat = 34` to `BlockId` with `propertySchema { age: integer 0..7 }`, default state
  `{ age: 0 }`, a `dropItem` of wheat seeds, and a `loot/wheat` loot table.
- Add `WheatSeeds = 32` and `Wheat = 33` to `ItemId`; seeds place the wheat block (default
  age 0).
- Add a pure `CropGrowth` module (`MAX_AGE`, `isMature`, `nextCropAge`) and a
  `CropBlockBehavior.onRandomTick` that reads the current age from the block state and writes
  the next age via `BlockWorldAccess.setBlockState`, clamped to `MAX_AGE`.
- Extend `BlockWorldAccess` and `WorldAccess` with `getBlockState`/`setBlockState`; `World`
  resolves state ids through the `BlockStateRegistry` and tracks the state in an in-memory
  overlay (mirroring the existing edit-overlay logic).
- Wire a `BlockBehaviorRegistry` (with the crop behavior), a `RandomTickSelector`, and the
  random-tick dispatch into `Game`'s per-tick simulation, bounded by `selectEligible`.
- Extend `LootContext` with an optional `properties` map and add a wheat loot table whose
  mature-drop pool fires only when `age === '7'`.

## Compatibility and migration
- New block/item ids (34/32/33) are additive; existing ids are unchanged.
- `LootContext.properties` is optional and additive; existing tables/conditions and saves are
  unaffected.
- `BlockWorldAccess`/`WorldAccess` gain optional methods; existing implementers/mocks remain
  valid.
- No persistent snapshot/serialization format change in this change.

## Risks
- A random-tick or loot path that reads a malformed/absent `age` must not throw out of the
  frame loop. The behavior wraps state reads defensively and clamps.
- The existing `BlockStateRegistry` test asserting "every block has exactly one state" and
  the `BlockRegistry`/`BlockItemSeparation`/`LootTable` count/special-case tests must be
  updated for the new stateful block and items.

## Rollback strategy
- A single implementation commit; reverting removes the new block/items, the growth module,
  the World state access, the Game wiring, and the loot special-case without touching the
  persistent format.

## Definition of Done
- Wheat has 8 enumerated states (age 0..7); random ticks advance age deterministically to
  7 and stop; mature/immature wheat produce the correct drops through the loot path; the
  full gate (typecheck/lint/test/build/e2e) is green; unit tests cover state enumeration,
  growth clamping, behavior increments, random-tick eligibility, and crop loot.

## Advancement gate
- 100% task completion; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` all green; no failed MUST/SHALL requirement.
