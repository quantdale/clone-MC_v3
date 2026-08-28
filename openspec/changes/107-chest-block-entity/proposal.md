# Proposal: 107-chest-block-entity

## Problem

106 provides the container-menu transaction core, but no concrete storage container exists: there
is no chest block/item in the registries, no 27-slot inventory model, and no block-entity
integration (018 block-entity type registry and 052 runtime framework exist but nothing uses
them for a chest).

## Goals

- Chest block (numeric id 19) and chest item (numeric id 25) registered with full
  cross-reference validation, so the block is placeable/breakable through existing mechanics and
  drops the chest item via the auto-built loot table.
- `src/world/ChestBlockEntity.ts`: the single-chest block-entity core —
  - 27-slot chest inventory model (`ChestInventory`) with strict validation;
  - 036-envelope serialization (`serializeChestInventory`/`deserializeChestInventory`) for
    persistence, round-trip exact;
  - 106 container-menu bridge (`createChestMenu` with the 27 chest slots + 36 player slots,
    `applyChestMenuTransaction`, `extractChestInventory`/`extractPlayerSlots`);
  - 052 `BlockEntityInstance` lifecycle (`createChestBlockEntity`, `readChestEntity`,
    `updateChestEntityInventory`) keyed by the `chest` block-entity type with `data` = the
    serialized inventory envelope;
  - `chestEntityContents` (ordered non-empty stacks) for future 111 drop integration.
- `tests/unit/ChestBlockEntity.test.ts` covering construction, validation, round-trips, menu
  transactions, entity lifecycle, manager chunk round-trip, and registry cross-references.

## Non-goals

- Chest screen UI / input handling (UI layer change).
- Opening a chest in-game (interaction wiring; the block entity and menu bridge are the
  interaction core, consumed by a future screen).
- Adjacent chest pairing (108-double-chest-composition).
- Item entity drops on break (111-item-entity-drops).
- Chest crafting recipe (recipe data expansion).

## Preconditions

- Change 106 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 106 baseline (1192 unit / 19 e2e).

## Dependencies

- 106 `MenuTransaction` (`MenuSlot`/`MenuCursor`/`ContainerMenu`, `createContainerMenu`,
  `applyMenuTransaction`, `MAX_CURSOR_COUNT`), 052 `BlockEntityManager`/`BlockEntityInstance`,
  036 `SerializedBlockEntity` envelope, 018 `chest` block-entity type (inventorySize 27).

## Proposed change

- `src/world/BlockRegistry.ts`: add chest block (id 19; hardness 2.5, axe-preferred, drops
  chest).
- `src/inventory/ItemRegistry.ts`: add chest item (id 25; placeBlock chest).
- `src/rendering/TextureAtlas.ts`: add original procedural chest tile (index 27).
- `src/world/ChestBlockEntity.ts` (NEW): constants, `ChestInventory` model, serialization,
  menu bridge, entity lifecycle, contents extraction.
- `tests/unit/ChestBlockEntity.test.ts` (NEW).

## Compatibility and migration

Additive: new registries entries (ids 19/25 are currently unused), new tiles, new module. No
existing save data or module behavior changes.

## Risks

- Serialization must be strict and round-trip exact (036 payload is opaque; a future screen
  depends on it).
- Menu slot indices must line up (chest 0-26, player 27-62); pinned by exact vectors.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Chest inventory validation rejects every malformed shape; round-trips are exact.
- Menu bridge transactions (leftClick/rightClick/placeOne/quickMove) behave per 106 semantics
  across the chest/player boundary; chest slots extract correctly after apply.
- Entity lifecycle and chunk serialize/deserialize round-trip through 052/036.
- Full gate green; 107 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 107 suite; E2E stays 19/19.
