# Proposal: 311-container-screen-and-block-entity-component-lifecycle

## Problem

Following the container block entity serialization and transfer fixes in Change 310, an exhaustive audit of remaining container, menu, and block entity layers revealed systematic item component data loss, corruption, and slot hygiene violations:

1. **Missing Slot/Cursor Hygiene in `MenuTransaction.ts`**: `validateSlot` and `validateCursor` enforce that `item === null` requires `count === 0`, but omit any check on `components`. Consequently, empty slots and cursors carrying dangling `components` objects pass validation, violating container invariants.
2. **Component Stripping in Mouse Drag Distribution (`InventoryScreenParity.ts`)**: `dragEnd` distributes items from the cursor across hovered slots (in rounds for left drag, evenly for right drag), but completely ignores `cursor.components`. When placing into empty slots, `components` is dropped; when distributing into occupied slots, it fails to verify `menuComponentsEqual` (merging disparate potions or damaged items); and the remainder cursor strips `components`.
3. **Component Corruption in Double-Click Gather (`InventoryScreenParity.ts`)**: `doubleClickGather` moves matching items into the cursor up to 64, but checks only `item === target`. Disparate items (such as distinct potions or custom items sharing the base item ID) are merged into one stack, corrupting component identity. When gathering from an empty cursor, the cursor never receives `components`. Furthermore, when a source slot is depleted to count 0, its `components` is not deleted, leaving lingering components on an empty slot.
4. **False Equality in `sameSlot` and `sameMenu` (`InventoryScreenParity.ts`)**: `sameSlot` and `sameMenu` check only item ID, count, and stack cap, ignoring `components`. Two slots carrying different potion contents or durability are judged identical, causing no-op returns when states actually differ.
5. **Dangling Components and Permissive Validation in `BrewingStandBlockEntity.ts`**: `validateSlot` does not reject empty slots carrying components. When fuel or ingredient is consumed down to count 0 in `consumeOne`, object spread retains `slot.components` on the resulting `{ item: null, count: 0 }` slot.
6. **Component Blindness in `LiveBlockEntityHost.ts`**: `brewingStateEquals` and `furnaceStateEquals` compare slots using only `item` and `count`, ignoring `menuComponentsEqual`. Component changes (such as potion brewing completions or custom fuel/input transitions) are not detected, resulting in missed chunk dirtying and skipped persistence.

## Goals

- Enforce strict slot and cursor hygiene across `MenuTransaction.ts` and `BrewingStandBlockEntity.ts` so that null items (`item === null`) MUST NOT carry `components`.
- Ensure `InventoryScreenParity.dragEnd` preserves `cursor.components` when placing into empty slots, respects `menuComponentsEqual` on occupied slots, and retains `components` on the remaining cursor.
- Ensure `InventoryScreenParity.doubleClickGather` filters by `menuComponentsEqual`, preserves `components` on the cursor, and deletes `components` on depleted slots.
- Ensure `InventoryScreenParity.sameSlot` and `sameMenu` incorporate `menuComponentsEqual`.
- Ensure `BrewingStandBlockEntity.consumeOne` deletes `components` upon reaching count 0.
- Ensure `LiveBlockEntityHost.brewingStateEquals` and `furnaceStateEquals` check `menuComponentsEqual` on every slot.

## Non-goals

- Altering vanilla recipe matching logic or potion brewing recipes.
- Modifying DOM elements, rendering shaders, or visual golden baselines.
- Touching headed GPU certification (Change 258 remains BLOCKED).

## Preconditions

- Change 310 is verified and published on `origin/main`.
- Repository working tree is clean.

## Dependencies

- `src/inventory/MenuTransaction.ts`
- `src/inventory/InventoryScreenParity.ts`
- `src/world/BrewingStandBlockEntity.ts`
- `src/engine/LiveBlockEntityHost.ts`

## Proposed change

Implement component-aware distribution, gathering, slot hygiene, and equality across container screens and block entities:
- Add empty-slot/cursor component checks to `MenuTransaction.validateSlot` and `validateCursor`.
- Upgrade `InventoryScreenParity.ts` (`dragEnd`, `doubleClickGather`, `sameSlot`, `sameMenu`) to track and preserve `components` and verify `menuComponentsEqual`.
- Enforce clean depletion and validation in `BrewingStandBlockEntity.ts`.
- Upgrade `LiveBlockEntityHost.ts` equality helpers to include `menuComponentsEqual`.

## Compatibility and migration

Purely additive and hardening. Prevents silent data corruption and invalid state persistence. Valid slots and cursors remain completely compatible.

## Risks

- Existing tests might have created mock empty slots or cursors with dummy `{ components: {} }`. These must be verified and updated if they violate physical invariants.

## Rollback strategy

Revert changes via Git commit; no schema migrations or irreversible data transformations are introduced.

## Definition of Done

- All failing-first tests pass.
- All 13 gates in `verify:all` pass with 0 lint problems and 0 typecheck errors.
- Isolated multiplayer performance gate passes.
- Changes published to `origin/main` according to `openspec/REVIEW_HANDOFF.md`.

## Advancement gate

100% of tasks completed, all mandatory requirements passing, 0 critical regressions, and evidence recorded in `verification.md`.
