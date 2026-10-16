# Proposal: 108-double-chest-composition

## Problem

107 models a single chest (27 slots), but two chests placed side by side form a double chest in
Minecraft. Nothing models horizontal adjacency, deterministic pairing order, the 54-slot
combined menu, or unpairing back to singles.

## Goals

- `src/world/DoubleChest.ts`: deterministic double-chest composition over the 107 model —
  - `isHorizontalAdjacent`: same Y, Chebyshev-adjacent on the XZ plane (|dx|+|dz| == 1);
  - `chestPairKey`/`doubleChestOrder`: deterministic, order-independent pair identity and
    primary/secondary half order (lexicographic by x, then z);
  - `createDoubleChestMenu`: a 90-slot menu (54 chest slots, primary 0-26 then secondary
    27-53, player 54-89, `playerSlotStart` 54) built from two `ChestInventory`s + 36 player
    slots, with strict validation;
  - `extractDoubleChestHalves`: reads the two 27-slot halves back out of a menu;
  - `unpairDoubleChest`: returns the surviving half's inventory when one position is removed.
- Each half remains its own 27-slot persisted `ChestInventory` (matching Minecraft, where each
  chest block entity stores its own half; pairing is a menu-view composition).
- `tests/unit/DoubleChest.test.ts` covering adjacency, ordering/pair-key determinism, menu
  construction and validation, transactions across halves and the player region, extraction,
  unpairing, immutability, and a 052 manager round-trip of two adjacent chest entities.

## Non-goals

- Facing-aware placement (which half is primary when placing while looking a direction) —
  interaction wiring.
- UI for the double-chest screen (UI layer change).
- Breaking/unpairing side effects beyond returning the surviving inventory.
- A third chest on an occupied side (placement rules live in interaction wiring).

## Preconditions

- Change 107 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 107 baseline (1216 unit / 19 e2e).

## Dependencies

- 107 `ChestBlockEntity` (`ChestInventory`, `createChestInventory`, validation), 106
  `MenuTransaction`, 052 `BlockEntityManager`.

## Proposed change

- `src/world/DoubleChest.ts` (NEW): constants, adjacency, pair key/order, double-chest menu
  bridge, half extraction, unpairing.
- `tests/unit/DoubleChest.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes. Each half serializes exactly as in 107, so existing
single-chest saves are unaffected.

## Risks

- Region indices must line up (primary 0-26, secondary 27-53, player 54-89); pinned by exact
  vectors.
- Pair order must be deterministic regardless of argument order; pinned by symmetric vectors.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Adjacency, pair key, and half ordering are deterministic and order-independent.
- Menu construction validates strictly; transactions behave per 106 across all three regions.
- Unpairing returns the correct surviving inventory.
- Full gate green; 108 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 108 suite; E2E stays 19/19.
