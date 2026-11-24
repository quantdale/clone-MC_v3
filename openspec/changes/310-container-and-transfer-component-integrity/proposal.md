# Proposal: 310-container-and-transfer-component-integrity

## Problem

Following the repository-wide audit directive, inspection of container block entities and redstone item transfer systems uncovered systematic item component data loss and corruption:

1. **Chest Block Entity Component Stripping:** In `src/world/ChestBlockEntity.ts`, `serializeChestInventory` maps slots to `{ item: s.item, count: s.count, maxStack: s.maxStack }`, completely omitting `components`. Deserialization via `validateSlots` similarly constructs slots without reading `s.components`. Any potion, custom tool, enchanted item, or item carrying `StackDataComponents` stored in a single or double chest silently loses all component data upon save and reload.
2. **Furnace & Smoker Block Entity Component Stripping:** In `src/world/FurnaceBlockEntity.ts`, `serializeFurnaceState` and `parseSlot` serialize and deserialize `input`, `fuel`, and `output` without `components`. Storing or smelting items with data components in furnaces or smokers silently erases their component data.
3. **Hopper Transfer Component Blindness & Corruption:** In `src/simulation/HopperTransfer.ts`, `transferOneItem` checks only `d.item === item && d.count < d.maxStack` when searching for a mergeable destination slot, completely ignoring `menuComponentsEqual(sourceSlot.components, d.components)`. Consequently, items of the same base type with different components (e.g., healing potion vs harming potion) merge into one stack, corrupting item contents. Furthermore, moving an item into an empty slot fails to copy `sourceSlot.components`, stripping components on transfer. When a source slot is depleted to count 0, `delete sourceSlot.components` is omitted, leaving an invalid slot with `item: null` but dangling `components`.
4. **Dropper & Dispenser Component Loss:** In `src/simulation/DropperEject.ts` and `src/simulation/DispenserBehavior.ts`, depleting a slot to count 0 fails to clean up `components`, and `DroppedItem` does not carry item components, causing dropped world items to lose component metadata.

## Goals

1. Preserve `components?: Readonly<Record<string, unknown>>` losslessly across chest (`ChestBlockEntity`, `DoubleChest`) and furnace/smoker (`FurnaceBlockEntity`, `SmokerBlockEntity`) serialization and deserialization.
2. Enforce strict slot structural validity: a slot with `item: null` MUST have `count: 0` and MUST NOT carry `components`.
3. Make `transferOneItem` in `HopperTransfer.ts` component-aware: require `menuComponentsEqual` for merging, copy components when transferring to empty slots, and delete components when source slots reach count 0.
4. Support component descriptors on `DroppedItem` in `DropperEject.ts` and clean up components on depleted slots in `DropperEject.ts` and `DispenserBehavior.ts`.
5. Prove all behaviors with failing-first unit tests, maintain 100% green gates, zero regressions, and zero headed GPU claims.

## Non-goals

- Adding new custom component types or rewriting `StackDataComponents.ts`.
- Altering player inventory transaction core (`applyMenuTransaction`) which already implements `menuComponentsEqual`.
- Altering furnace smelting recipes or fuel burn calculations.
- Altering Change 258 headed hardware-WebGL certification (remains deferred/BLOCKED).

## Preconditions

- Change 309 is VERIFIED and published at `a07a745d31f60e5d3b0456290310d6094a4af0f1`.
- Clean working tree with all 13 gates passing.

## Dependencies

- `src/inventory/MenuTransaction.ts` (`MenuSlot`, `menuComponentsEqual`).
- `src/world/ChestBlockEntity.ts`.
- `src/world/FurnaceBlockEntity.ts`.
- `src/simulation/HopperTransfer.ts`.
- `src/simulation/DropperEject.ts`.
- `src/simulation/DispenserBehavior.ts`.

## Proposed change

- In `src/world/ChestBlockEntity.ts`: include `components` in `validateSlots` and `serializeChestInventory`; enforce that `item === null` forbids `components` in `validateSlot`.
- In `src/world/FurnaceBlockEntity.ts`: include `components` in `parseSlot` and `serializeFurnaceState`; enforce that `item === null` forbids `components` in `validateSlot`.
- In `src/simulation/HopperTransfer.ts`: update `transferOneItem` to match merge slots using `menuComponentsEqual(sourceSlot.components, d.components)`, copy `components` to empty destination slots, and delete `sourceSlot.components` when count reaches 0.
- In `src/simulation/DropperEject.ts`: add `readonly components?: Readonly<Record<string, unknown>>` to `DroppedItem`, delete `sourceSlot.components` on depletion, and forward components to the dropped descriptor.
- In `src/simulation/DispenserBehavior.ts`: delete `sourceSlot.components` on depletion when executing special item behaviors.

## Compatibility and migration

- Backward compatibility: existing serialized payloads without `components` continue to parse normally as component-less slots.
- Forward compatibility: payloads containing `components` will now preserve them round-trip rather than discarding them.
- No database format version bump required (036 envelope data is payload-transparent).

## Risks

- Low. All changes are backward-compatible and additive to existing slot processing. Adding `menuComponentsEqual` prevents invalid item merges in hoppers without altering un-componented item behavior.

## Rollback strategy

Revert the commits touching `ChestBlockEntity.ts`, `FurnaceBlockEntity.ts`, `HopperTransfer.ts`, `DropperEject.ts`, and `DispenserBehavior.ts`.

## Definition of Done

- All 5 problem areas proven with failing-first unit tests.
- Implementation passes all unit, integration, and browser suites with 0 regressions.
- All 13 verify:all gates and isolated multiplayer performance pass.
- PROGRAM_STATE, sequence overrides, and parity matrix reconciled and published.

## Advancement gate

100% completion of tasks T1-T7 and all mandatory requirements passing.
