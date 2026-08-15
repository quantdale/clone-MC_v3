# Spec: double-chest-composition

## Contract

`isHorizontalAdjacent` MUST return true only for distinct positions with the same Y and
|dx|+|dz| == 1. `chestPairKey` MUST be canonical and order-independent for adjacent pairs and
throw for non-adjacent ones. `doubleChestOrder` MUST return `[primary, secondary]` where
primary is lexicographically smaller by (x, z); it MUST throw for non-adjacent pairs.
`createDoubleChestMenu` MUST build a 90-slot menu (primary 0-26, secondary 27-53, player
54-89) with `playerSlotStart` 54, validating both inventories and the player slots.
`extractDoubleChestHalves` MUST return the two 27-slot halves and throw for foreign menus.
`unpairDoubleChest` MUST return the surviving half's inventory when `removed` is one of the two
positions and throw otherwise. All operations MUST be immutable and deterministic.

## Definitions

- **Horizontal adjacency**: same Y, distinct positions, |dx|+|dz| == 1.
- **Pair key**: canonical string identity for an adjacent pair, equal for either argument
  order.
- **Primary half**: the position with the smaller x, or smaller z when x is equal.
- **Double-chest menu**: 90 slots; 0-26 primary, 27-53 secondary, 54-89 player;
  `playerSlotStart` 54.

## Invariants

- Pairing and ordering are deterministic and argument-order independent.
- Menus always have exactly 90 valid slots; updates are immutable.
- Halves are always valid 27-slot `ChestInventory`s (107 rules).
- Identical inputs produce identical outputs.

## Requirements

### Requirement: adjacency
`isHorizontalAdjacent` MUST implement the documented rule.

#### Scenario: adjacency matrix
- **GIVEN** positions (0,0,0) and each of (1,0,0), (-1,0,0), (0,0,1), (0,0,-1)
- **WHEN** adjacency is checked
- **THEN** all four are adjacent.

#### Scenario: non-adjacency
- **GIVEN** diagonal (1,0,1), vertical (0,1,0), same position, and (2,0,0)
- **WHEN** adjacency is checked
- **THEN** all are not adjacent.

### Requirement: pair key and order
Pair identity and half order MUST be deterministic.

#### Scenario: order independence
- **GIVEN** an adjacent pair (a, b)
- **WHEN** `chestPairKey(a, b)` and `chestPairKey(b, a)` run
- **THEN** both keys are identical, and `doubleChestOrder(a, b)` equals
  `doubleChestOrder(b, a)` with the lower coordinate primary.

#### Scenario: non-adjacent throw
- **GIVEN** a non-adjacent pair
- **WHEN** `chestPairKey` or `doubleChestOrder` runs
- **THEN** a descriptive error is thrown.

### Requirement: double-chest menu
The menu MUST compose the two halves with the player region.

#### Scenario: construction
- **GIVEN** two inventories and 36 player slots
- **WHEN** `createDoubleChestMenu` runs
- **THEN** the menu has 90 slots, `playerSlotStart` 54, primary 0-26, secondary 27-53, player
  54-89, empty cursor; invalid inventories, player slots, or cursors throw.

#### Scenario: transactions across regions
- **GIVEN** a double-chest menu
- **WHEN** leftClick/rightClick/placeOne/quickMove run across the primary, secondary, and
  player regions
- **THEN** results follow 106 semantics, the source menu is unchanged, and
  `extractDoubleChestHalves`/`extractDoubleChestPlayerSlots` reflect the new regions.

#### Scenario: out-of-bounds
- **GIVEN** a double-chest menu
- **WHEN** a transaction targets index -1 or 90
- **THEN** a descriptive error is thrown.

### Requirement: extraction
`extractDoubleChestHalves` MUST return exact halves.

#### Scenario: round-trip
- **GIVEN** a menu built from two inventories
- **WHEN** halves are extracted
- **THEN** they equal the inputs exactly; foreign menus throw.

### Requirement: unpairing
`unpairDoubleChest` MUST return the surviving half.

#### Scenario: surviving half
- **GIVEN** two inventories and an adjacent pair
- **WHEN** one position is removed
- **THEN** the returned inventory is the other half's, for both argument orders; an unknown
  removed position throws.

### Requirement: determinism and immutability
Identical inputs MUST produce identical results, and inputs MUST never be mutated.

#### Scenario: repeated calls
- **GIVEN** the same inputs
- **WHEN** every operation runs twice
- **THEN** results are identical and all inputs are unchanged.

### Requirement: manager round-trip
Two adjacent chest entities MUST survive a 052 chunk serialize/deserialize.

#### Scenario: chunk save/load
- **GIVEN** a `BlockEntityManager` with adjacent chest entities
- **WHEN** `serializeChunk` then `deserializeChunk` run
- **THEN** both restored instances read back their exact inventories and remain adjacent.

## Error and failure behavior

Non-adjacency, foreign menus, malformed slots, out-of-bounds indices, and unknown removed
positions throw descriptive errors; valid inputs never throw.

## Performance and resource bounds

All operations O(menu slots); no allocations beyond result objects.

## Compatibility and migration

Additive. Halves persist with the 107 envelope; no existing data migration.

## Security and integrity

Not applicable beyond strict validation on all inputs.

## Observability

Plain data; tests assert exact menus, keys, orders, and inventories.

## Verification mapping

- `tests/unit/DoubleChest.test.ts` — adjacency matrix, pair-key/order determinism across
  argument orders, menu construction and validation, transactions across regions,
  extraction round-trip, unpairing vectors, immutability/determinism, manager chunk
  round-trip.
