# Design: 106-container-menu-transaction-core

## Context / current state

105 owns the crafting-table session; no generic click-transaction engine exists for
inventory-style menus.

## Target state

A validated `ContainerMenu` (ordered slots split into container and player regions, per-slot
stack caps, cursor) and a deterministic transaction engine shared by crafting and storage
screens.

## Invariants

- `MenuSlot { item: string | null; count: number; maxStack: number }`: count in
  `[0, maxStack]` (0 iff item null); maxStack positive integer.
- `MenuCursor { item: string | null; count: number }`: count in `[0, 64]` (0 iff null);
  count never exceeds the item's stack cap when non-null (engine enforces).
- `ContainerMenu { slots; cursor; playerSlotStart }`: at least 1 slot;
  `0 < playerSlotStart < slots.length`; slots before `playerSlotStart` are the container
  region, the rest the player region.
- `leftClick(i)`: cursor empty -> pick up the slot; slot empty -> place cursor (if fits);
  same item and fits -> merge; otherwise swap.
- `rightClick(i)`: slot has items and cursor empty or same-item mergeable -> take
  `ceil(count / 2)` (merge-limited); cursor has items and slot empty/same-item mergeable ->
  place one.
- `placeOne(i)`: cursor count >= 1 and slot empty or same-item with room -> place one.
- `quickMove(i)`: move the slot's whole stack into the other region via deterministic
  first-fit merge-then-empty (leftover stays); container slots move to the player region and
  vice versa.
- Transaction application is immutable (new menu/cursor states); out-of-bounds indices throw;
  identical inputs produce identical results.

## API and data model

```ts
// src/inventory/MenuTransaction.ts (NEW)
export interface MenuCursor { item: string | null; count: number; }
export interface MenuSlot { item: string | null; count: number; maxStack: number; }
export interface ContainerMenu {
  slots: MenuSlot[];
  playerSlotStart: number;
  cursor: MenuCursor;
}
export type MenuTransaction =
  | { type: 'leftClick'; index: number }
  | { type: 'rightClick'; index: number }
  | { type: 'placeOne'; index: number }
  | { type: 'quickMove'; index: number };
export function validateContainerMenu(input: unknown): ContainerMenu;
export function createContainerMenu(slots: MenuSlot[], playerSlotStart: number): ContainerMenu;
export function applyMenuTransaction(menu: ContainerMenu, transaction: MenuTransaction): ContainerMenu;
```

## Control / data flow

1. Screens map their slots onto a `ContainerMenu` (container region + player region).
2. Clicks produce transactions; `applyMenuTransaction` returns the next immutable state; the
   UI layer renders it.

## Detailed behavior

- Right-click split: with an empty cursor, take `ceil(slot.count / 2)` (e.g. 5 -> 3);
  with a same-item cursor, take `min(ceil(slot.count / 2), cursorRoom)`.
- Quick-move: iterate target-region slots in order; merge into same-item slots with room,
  then the first empty slot; the remainder stays in the source slot.

## Failure modes

- Construction/validation and out-of-bounds transactions throw descriptive errors; all other
  paths are total.

## Compatibility / migration

Additive.

## Performance / resource constraints

Transactions O(slots); quickMove O(slots) in the target region.

## Testing seams

- `tests/unit/MenuTransaction.test.ts` (NEW): construction matrix; per-transaction vectors
  (pickup, merge, swap, split-half, place-one, quick-move both directions, partial moves,
  no-room no-ops); immutability; out-of-bounds throws; determinism.

## Observability / debugging

Plain data; tests assert exact slot/cursor states.

## Affected files / symbols

- `src/inventory/MenuTransaction.ts` — NEW.
- `tests/unit/MenuTransaction.test.ts` — NEW.

## Rejected alternatives

- *Command-per-screen implementations*: a shared core keeps crafting (105/107) and storage
  (107/108) menus consistent.
- *Mutable menus*: immutable transitions match the house style and simplify testing.

## Downstream dependencies

107/108 chest menus and the crafting menu wiring map slots onto this core; 109/110 furnace
menus reuse it.
