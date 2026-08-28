# Spec: container-menu-transaction-core

## Contract

`validateContainerMenu`/`createContainerMenu` MUST accept exactly the documented menu shape
and MUST reject malformed ones with descriptive errors. `applyMenuTransaction` MUST apply each
transaction type per the documented rules, returning a NEW immutable menu state, and MUST throw
descriptively on out-of-bounds indices. Identical `(menu, transaction)` inputs MUST produce
identical results.

## Definitions

- **MenuSlot**: `item` (string or null), `count` in `[0, maxStack]` (0 iff item null),
  `maxStack` positive integer.
- **MenuCursor**: `item` (string or null) and `count` in `[0, 64]` (0 iff null); the engine
  never leaves a cursor count above the item's slot cap.
- **ContainerMenu**: `slots` (>= 1), `playerSlotStart` with `0 < playerSlotStart <
  slots.length`; slots before it are the container region, the rest the player region;
  `cursor`.
- **leftClick**: cursor empty -> pick up the slot; slot empty -> place the cursor when it
  fits; same item with room -> merge; otherwise swap.
- **rightClick**: slot non-empty and cursor empty or same-item with room -> take
  `ceil(count / 2)` (merge-limited by cursor room); cursor non-empty and slot empty or
  same-item with room -> place one.
- **placeOne**: cursor count >= 1 and slot empty or same-item with room -> place one.
- **quickMove**: move the whole stack to the other region (container <-> player) by
  first-fit merge into same-item slots with room, then the first empty slot; the remainder
  stays in the source slot.

## Invariants

- Slot counts never exceed their maxStack; cursor counts never exceed 64 or the item cap.
- Transactions never mutate the input menu (immutable results).
- Out-of-bounds indices throw; other paths are total.

## Requirements

### Requirement: menu construction
`createContainerMenu`/`validateContainerMenu` MUST implement the documented rules.

#### Scenario: valid menus
- **GIVEN** menus with valid slots, regions, and cursors
- **WHEN** constructed
- **THEN** they are accepted and round-trip.

#### Scenario: rejection matrix
- **GIVEN** zero slots, `playerSlotStart` at or outside the range, counts above maxStack,
  non-zero counts with null items, zero maxStack, and invalid cursors
- **WHEN** construction runs
- **THEN** it throws a descriptive error.

### Requirement: left click
`applyMenuTransaction` MUST implement the documented leftClick rules.

#### Scenario: pickup, merge, and swap
- **GIVEN** empty/same-item/different-item slot and cursor combinations
- **WHEN** a leftClick transaction runs
- **THEN** the cursor picks up an empty slot, merges into same-item slots with room, and
  swaps otherwise.

### Requirement: right click
`applyMenuTransaction` MUST implement the documented rightClick rules.

#### Scenario: split-half and place-one
- **GIVEN** a 5-count slot with an empty cursor and a 1-count cursor with an empty slot
- **WHEN** rightClick transactions run
- **THEN** the cursor takes `ceil(5 / 2) = 3` from the slot, and a single item is placed from
  the cursor respectively.

### Requirement: place one
`applyMenuTransaction` MUST implement the documented placeOne rules.

#### Scenario: placement
- **GIVEN** a cursor with items and empty/mergeable slots
- **WHEN** placeOne runs
- **THEN** one item moves to the slot; full or mismatched slots do not change.

### Requirement: quick move
`applyMenuTransaction` MUST implement the documented quickMove rules.

#### Scenario: both directions
- **GIVEN** a container slot and a player slot with stacks
- **WHEN** quickMove runs on each
- **THEN** stacks move to the other region by first-fit; partial moves respect stack caps and
  leave the remainder; no-room moves leave the slot unchanged.

### Requirement: immutability and bounds
`applyMenuTransaction` MUST be pure and bounds-safe.

#### Scenario: immutability
- **GIVEN** a menu and a transaction
- **WHEN** applied
- **THEN** the input menu is unchanged and the result differs only per the transaction.

#### Scenario: out-of-bounds
- **GIVEN** an index outside `[0, slots.length)`
- **WHEN** any transaction runs
- **THEN** it throws a descriptive error.

#### Scenario: determinism
- **GIVEN** identical menu and transaction
- **WHEN** applied twice
- **THEN** the results are identical.

## Error and failure behavior

- Construction and out-of-bounds transactions throw descriptive errors; other paths are total.

## Performance and resource bounds

Transactions O(slots); quickMove O(target region size).

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Plain data; tests assert exact slot/cursor states.

## Verification mapping

- `tests/unit/MenuTransaction.test.ts` — construction matrix, per-transaction vectors,
  immutability, out-of-bounds throws, determinism.
