# Proposal: 109-furnace-block-entity

## Problem

The 018 registry declares a tickable `furnace` block-entity type and 052 provides the runtime
tick framework, but nothing models a furnace: no inventory model (input/fuel/output slots), no
burn/smelt timers, no lit state, no persistence envelope, and no furnace block/item in the
registries.

## Goals

- `src/world/FurnaceBlockEntity.ts`: the furnace block-entity core —
  - `FurnaceState` (input/fuel/output slots + `burnTime`/`burnTimeTotal`/`smeltTime`/
    `smeltTimeTotal`) with strict validation;
  - `tickFurnace`: deterministic, immutable tick engine over an injectable `FurnaceContext`
    (`fuelBurnTicks`/`cookTicks`/`resultOf`; real values arrive in 110) — fuel consumed only
    when smelting can progress, lit = `burnTime > 0`, output-blocked pauses, input removal
    resets progress, cook completion consumes input and merges the result;
  - `furnaceIsLit`, `serializeFurnaceState`/`deserializeFurnaceState` (036 envelope, lossless,
    strict);
  - the 106 menu bridge (`createFurnaceMenu` 39 slots: input 0, fuel 1, output 2, player
    3-38, `playerSlotStart` 3);
  - the 052 entity lifecycle (`createFurnaceBlockEntity`, `readFurnaceState`,
    `updateFurnaceState`);
  - `furnaceTickProgress`/`furnaceBurnFraction` helpers for a future screen.
- Furnace block (id 20) and item (id 26) registered with full cross-reference validation,
  plus an original procedural atlas tile (index 28).
- `tests/unit/FurnaceBlockEntity.test.ts` covering state validation, envelope round-trips,
  tick vectors (burn start/consume, pause on blocked output, reset on input removal, cook
  completion and result merge, multi-tick determinism), menu bridge, entity lifecycle, and
  registry cross-references.

## Non-goals

- Real fuel values and smelting recipes (110-furnace-recipes-and-fuels).
- XP output (110).
- Furnace screen UI and interaction wiring (UI layer).
- Block-state (`lit`) meshing wiring.

## Preconditions

- Change 108 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 108 baseline (1229 unit / 19 e2e).

## Dependencies

- 107 `ChestBlockEntity` (slot validation conventions), 106 `MenuTransaction`, 052
  `BlockEntityInstance`/`BlockEntityManager`, 036 `SerializedBlockEntity` envelope, 018
  `furnace` type (tickable).

## Proposed change

- `src/world/FurnaceBlockEntity.ts` (NEW): constants, `FurnaceState` model, tick engine,
  serialization, menu bridge, entity lifecycle, progress helpers.
- `src/world/BlockRegistry.ts`: furnace block id 20.
- `src/inventory/ItemRegistry.ts`: furnace item id 26.
- `src/rendering/TextureAtlas.ts`: furnace tile (index 28).
- `tests/unit/FurnaceBlockEntity.test.ts` (NEW); registry enumeration tests updated.

## Compatibility and migration

Additive: new registry ids (block 20, item 26) and tile 28 are unused; no existing data or
module behavior changes.

## Risks

- Tick semantics must be deterministic and match the documented state machine; pinned by
  exact multi-tick vectors.
- Time invariants (burnTime <= burnTimeTotal, smeltTime <= smeltTimeTotal) must hold after
  every transition; asserted in tests.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- State validation rejects malformed shapes; envelopes round-trip exactly.
- Tick vectors cover burn start, fuel consumption, pause on blocked output, reset on input
  removal, cook completion with result merge, and multi-tick determinism.
- Menu bridge and entity lifecycle behave per the documented rules.
- Full gate green; 109 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 109 suite; E2E stays 19/19.
