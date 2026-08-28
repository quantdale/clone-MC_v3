# Spec: player-2x2-crafting

## Contract

`createCraftingGrid`/`setCraftingSlot` MUST build and update validated grids immutably.
`matchCraftingRecipe` MUST match shaped recipes by the documented fit rule and shapeless
recipes by ingredient multiset, searching recipes in input order with the first match winning,
never throwing. `craftCraftingGrid` MUST return the recipe result and the exact consumed cell
coordinates for a matching recipe, or null otherwise.

## Definitions

- **CraftingGrid**: width/height in `[1, 3]` and row-major `slots` of length
  `width * height`; each slot is `null` or `{ item: non-empty string, count: positive
  integer }`.
- **Shaped match**: pattern HxW fits (`H <= grid.height`, `W <= grid.width`); top-left aligned
  cells: `'_'` matches an empty slot, a char matches a slot whose item equals `keys[char]`;
  every grid cell outside the pattern is empty.
- **Shapeless match**: the multiset of filled cells equals the ingredient list.
- **Consumption**: shaped -> pattern-covered cells; shapeless -> all filled cells.

## Invariants

- Filled cells count as one ingredient each (counts are payload).
- Matching/crafting never throw; a null result means no match.
- Identical inputs produce identical results.

## Requirements

### Requirement: grid construction
`createCraftingGrid`/`setCraftingSlot` MUST implement the documented rules.

#### Scenario: valid grids
- **GIVEN** grids of sizes 1x1, 2x2, and 3x3 with valid slots
- **WHEN** constructed
- **THEN** they are accepted and round-trip.

#### Scenario: rejection matrix
- **GIVEN** zero/oversize dimensions, mismatched slot counts, empty items, and non-positive
  counts
- **WHEN** construction or updates run
- **THEN** they throw descriptive errors and the original grid is unchanged.

### Requirement: matching
`matchCraftingRecipe` MUST implement the documented semantics.

#### Scenario: shaped fit
- **GIVEN** the default wooden_pickaxe (3x3) and a 3x3 grid with the exact pattern
- **WHEN** matching runs
- **THEN** the recipe matches.

#### Scenario: shaped non-fits
- **GIVEN** the 3x3 pickaxe against a 2x2 grid, a grid with extra filled cells outside the
  pattern, and a grid whose cells differ from the pattern
- **WHEN** matching runs
- **THEN** no match.

#### Scenario: shapeless multiset
- **GIVEN** a full 2x2 sand grid and the default glass recipe (4x sand)
- **WHEN** matching runs
- **THEN** the recipe matches, and a grid with a different item or different multiplicity
  does not.

#### Scenario: first match wins
- **GIVEN** two recipes that both match a grid, listed in order
- **WHEN** matching runs
- **THEN** the first listed recipe is returned.

### Requirement: consumption
`craftCraftingGrid` MUST return exact results.

#### Scenario: shaped consumption
- **GIVEN** a matching shaped recipe and grid
- **WHEN** crafting runs
- **THEN** the result equals the recipe's result and consumed coordinates equal the
  pattern-covered cells.

#### Scenario: shapeless consumption
- **GIVEN** a matching shapeless recipe and grid
- **WHEN** crafting runs
- **THEN** consumed coordinates equal all filled cells.

#### Scenario: non-match
- **GIVEN** a recipe that does not match the grid
- **WHEN** crafting runs
- **THEN** it returns null.

## Error and failure behavior

- Construction/updates throw descriptive errors; matching and crafting never throw.

## Performance and resource bounds

Matching O(recipes x grid cells); grids at most 3x3.

## Compatibility and migration

Additive.

## Security and integrity

Not applicable.

## Observability

Plain data; tests assert exact grids, matches, and consumed coordinates.

## Verification mapping

- `tests/unit/CraftingGrid.test.ts` — construction matrix, immutability, shaped/shapeless
  matching vectors, first-match order, consumption, default-recipe integration.
