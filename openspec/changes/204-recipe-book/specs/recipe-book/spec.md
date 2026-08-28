# Spec: recipe-book

## Contract
This capability adds the player recipe book: immutable known-recipes state (unlock order), a
search/filter over 103's registry restricted to known recipes, a 3x3 crafting-grid layout helper
with its inverse, and versioned validate-before-accept persistence — all pure and headless-safe.

## Definitions
- **Known recipe**: a recipe key the player has unlocked (unique, unlock order preserved).
- **Grid cell**: `{ kind: 'item', item }`, `{ kind: 'tag', tag }`, or `null` (empty).
- **Layout**: the 9-cell row-major fill from the top-left, compacted.

## Invariants
- Pure and headless-safe: the registry is injected and never modified; inputs are never mutated.
- `known` holds unique non-empty keys; an empty key is never added.
- `unlockRecipe`/`unlockRecipes` MUST return the IDENTICAL state when nothing changes.
- `searchRecipes` MUST return known recipes in registry order, blank-query = all known,
  case-insensitive substring match on key/name/output id, unknown keys skipped.
- `layoutRecipe` MUST throw for more than 9 ingredients; `compactGrid` MUST be its exact inverse.
- Deserialization MUST validate the entire payload before accepting anything.

## Requirements

### Requirement: known-recipes state
`createDefaultRecipeBook()` MUST be empty. `unlockRecipe` MUST append a new key, MUST return the
IDENTICAL state for an empty key or an already-known key, and MUST NOT mutate the input.
`unlockRecipes` MUST bulk-append unknown non-empty keys in order (identity when nothing new).
`hasRecipe` MUST report membership.

#### Scenario: unlocks
- **GIVEN** a default book and `unlockRecipe(book, 'planks')`, then `unlockRecipe(book, 'glass')`,
  then `unlockRecipe(result, 'planks')`, then `unlockRecipe(result, '')`
- **THEN** `known` is `['planks', 'glass']`; the re-unlock and empty-key calls return the
  identical object; `hasRecipe` is true for `planks` and false for `sticks`; `unlockRecipes(book,
  ['sticks', 'planks'])` yields `['sticks', 'planks']`; `unlockRecipes(book, [])` is the identical
  object

### Requirement: search and filter
`searchRecipes(registry, state, query)` MUST return the known recipes in registry order; a blank
query MUST return all known; otherwise a case-insensitive substring match against the recipe key,
name, or output item id; unknown known keys MUST be skipped.

#### Scenario: search
- **GIVEN** the default recipe registry, a book with `['planks', 'glass', 'sticks',
  'not_a_recipe']`, and queries `''`, `'plan'`, `'GLASS'`, `'stone'`, `'zzz'`
- **THEN** `''` returns planks, glass, sticks (registry order, `not_a_recipe` skipped); `'plan'`
  returns planks (key match); `'GLASS'` returns glass (name match, case-insensitive); `'stone'`
  returns every known recipe whose output item id contains `stone`; `'zzz'` returns `[]`

### Requirement: layout
`layoutRecipe(ingredients)` MUST fill the 9-cell grid row-major from the top-left: item
ingredients become `{ kind: 'item', item: <path> }`, tag ingredients `{ kind: 'tag', tag:
<id> }`, remaining cells null; more than 9 ingredients MUST throw
`RecipeBook: recipe has <n> ingredients (max 9)`.

#### Scenario: layouts
- **GIVEN** one item ingredient, four item ingredients, nine item ingredients, one tag
  ingredient, and ten ingredients
- **THEN** one -> cell 0 filled (rest null); four -> cells 0-3 (the top-left 2x2); nine -> all
  cells; the tag -> a `{ kind: 'tag' }` cell; ten throws the documented error

### Requirement: compact
`compactGrid(grid)` MUST return the non-null cells in row-major order.

#### Scenario: compact
- **GIVEN** a grid with `[a, null, b, null, null, c, null, null, null]`
- **THEN** the result is `[a, b, c]`; an all-null grid yields `[]`

### Requirement: versioned persistence
`serializeRecipeBook(state)` MUST produce `{ version: 1, known }`; `deserializeRecipeBook` MUST
round-trip it and MUST throw a descriptive `Error` for a non-object payload, an unsupported
version, a non-array `known`, empty/duplicate/non-string entries, and unknown extra keys —
accepting nothing partially.

#### Scenario: persistence
- **GIVEN** a book, its serialization, `'x'`, `{ version: 0, known: [] }`,
  `{ version: 1, known: 'x' }`, `{ version: 1, known: ['planks', ''] }`,
  `{ version: 1, known: ['planks', 'planks'] }`, and `{ version: 1, known: [], extra: true }`
- **THEN** the round-trip equals the original; the invalid inputs each throw mentioning
  `expected an object`, `unsupported version`, `known must be an array`,
  `known 1 must be a non-empty string`, `known contains duplicate key planks`, and `unknown key`
  respectively

## Error and failure behavior
- `layoutRecipe` throws for > 9 ingredients; `deserializeRecipeBook` throws on invalid data.
- Everything else is total; identity no-ops for no-change unlocks.

## Performance and resource bounds
- Search O(known); layout/compact O(9); unlock O(known) worst case.

## Compatibility and migration
- One new inventory file; 103 untouched; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions; the registry is read-only through the injected parameter.

## Observability
- The book state is a plain immutable array; search/layout are total functions.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 known state | `tests/unit/RecipeBook.test.ts` › unlocks |
| REQ-2 search | › search |
| REQ-3 layout | › layout |
| REQ-4 compact | › compact |
| REQ-5 persistence | › persistence |
