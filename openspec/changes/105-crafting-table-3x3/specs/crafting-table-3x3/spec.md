# Spec: crafting-table-3x3

## Contract

`createCraftingTableSession` MUST build a session with an empty 3x3 grid over the given recipe
snapshot. `setCraftingTableSlot` MUST validate bounds and slots and return a NEW session.
`craftingTableMatch`/`craftingTableResult` MUST reflect the first matching recipe (104
semantics). `takeCraftingTableResult` MUST consume exactly the matched cells and return the
result slot on a match, or return the unchanged session and null otherwise, never throwing.

## Definitions

- **Session**: a 3x3 `CraftingGrid` plus a readonly `TypedRecipe` snapshot.
- **Match**: `matchCraftingRecipe(grid, recipes)` (first match wins).
- **Result slot**: the matched recipe's `{ item, count }`, or null.
- **Take**: on a match, empty the consumed cells (per `craftCraftingGrid`) and return the
  result slot; otherwise return the session unchanged and null.
- **CRAFTING_TABLE_BLOCK_ID**: 13 (documented reserved block id).

## Invariants

- Sessions always hold a 3x3 grid; updates are immutable; invalid updates throw.
- Queries and take never throw.
- Identical inputs produce identical results.

## Requirements

### Requirement: session lifecycle
`createCraftingTableSession`/`setCraftingTableSlot` MUST implement the documented rules.

#### Scenario: creation and updates
- **GIVEN** a recipe snapshot
- **WHEN** a session is created and slots are set
- **THEN** the grid is 3x3, updates return new sessions, the original is unchanged, and
  out-of-bounds or invalid slots throw.

### Requirement: matching and result
`craftingTableMatch`/`craftingTableResult` MUST reflect the grid.

#### Scenario: pickaxe on the table
- **GIVEN** the default recipes and a session with the wooden pickaxe pattern
- **WHEN** match/result run
- **THEN** the shaped pickaxe recipe matches and the result slot is wooden_pickaxe x1.

#### Scenario: no match
- **GIVEN** an empty or non-matching session
- **WHEN** match/result run
- **THEN** match is null and the result slot is null.

### Requirement: take result
`takeCraftingTableResult` MUST implement exact consumption semantics.

#### Scenario: shaped consumption
- **GIVEN** a session with the pickaxe pattern
- **WHEN** the result is taken
- **THEN** the taken slot is wooden_pickaxe x1 and the new session's grid has exactly the
  pattern-covered cells empty.

#### Scenario: shapeless consumption
- **GIVEN** a session with four sand cells
- **WHEN** the result is taken
- **THEN** the taken slot is glass x1 and all four cells are empty.

#### Scenario: no-match take
- **GIVEN** an empty session
- **WHEN** the result is taken
- **THEN** taken is null and the session is unchanged (same grid).

### Requirement: determinism
Identical sessions MUST produce identical results.

#### Scenario: repeated queries
- **GIVEN** an identical session
- **WHEN** match/result/take run twice
- **THEN** the results are identical.

## Error and failure behavior

- Updates throw descriptive errors; queries and take never throw.

## Performance and resource bounds

All operations O(recipes x 9 cells).

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Plain data; tests assert exact sessions, results, and taken slots.

## Verification mapping

- `tests/unit/CraftingTable.test.ts` — lifecycle, immutability, match/result, take
  consumption vectors, no-match take, determinism.
