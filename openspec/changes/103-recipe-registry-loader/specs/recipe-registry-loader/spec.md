# Spec: recipe-registry-loader

## Contract

`validateTypedRecipe` MUST accept exactly the documented shapes for each kind and MUST reject
malformed ones with descriptive errors. `TypedRecipeRegistry` MUST store only validated
recipes, reject duplicates and invalid inputs atomically, and expose get/has/size/all/clear.
`createDefaultTypedRecipes` MUST produce the documented deterministic defaults.

## Definitions

- **shaped**: pattern of 1-3 rows (each 1-3 chars, uniform width), chars `_` (empty) or
  uppercase `A-Z` defined in `keys`; every `keys` char appears in the pattern; at least one
  non-empty cell; keys values are non-empty item resource-id strings.
- **shapeless**: 1-9 non-empty ingredient strings.
- **processing**: non-empty input, result, positive integer cookingTime, finite experience
  >= 0.
- **Result**: non-empty item string and positive integer count <= `MAX_RECIPE_COUNT` (64).

## Invariants

- All kinds have non-empty `key` and a valid `result`.
- Unknown shapes and malformed fields throw.
- Registry operations never leave partial state.
- Identical inputs produce identical validation results.

## Requirements

### Requirement: shaped validation
`validateTypedRecipe` MUST implement the documented shaped rules.

#### Scenario: valid shaped recipe
- **GIVEN** a 3x3 pattern with defined keys and a valid result
- **WHEN** validation runs
- **THEN** it passes (narrowed to `shaped`).

#### Scenario: shaped rejection matrix
- **GIVEN** zero/four rows, ragged row widths, chars not in keys, empty patterns, dead keys,
  empty key values, empty recipe keys, and invalid counts
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field.

### Requirement: shapeless validation
`validateTypedRecipe` MUST implement the documented shapeless rules.

#### Scenario: valid shapeless recipe
- **GIVEN** a recipe with 1-9 non-empty ingredients and a valid result
- **WHEN** validation runs
- **THEN** it passes (narrowed to `shapeless`).

#### Scenario: shapeless rejection matrix
- **GIVEN** zero or ten ingredients, empty ingredient strings, and invalid counts
- **WHEN** validation runs
- **THEN** it throws a descriptive error.

### Requirement: processing validation
`validateTypedRecipe` MUST implement the documented processing rules.

#### Scenario: valid processing recipe
- **GIVEN** a recipe with a non-empty input, valid result, positive cookingTime and finite
  experience >= 0
- **WHEN** validation runs
- **THEN** it passes (narrowed to `processing`).

#### Scenario: processing rejection matrix
- **GIVEN** an empty input, zero/negative/fractional cookingTime, and negative/NaN experience
- **WHEN** validation runs
- **THEN** it throws a descriptive error.

### Requirement: registry
`TypedRecipeRegistry` MUST store validated recipes with atomic rejection.

#### Scenario: lifecycle
- **GIVEN** valid registrations
- **WHEN** register/get/has/size/all/clear run
- **THEN** lookups round-trip, size tracks registrations, all preserves order, and clear
  empties.

#### Scenario: atomic rejection
- **GIVEN** a duplicate key and an invalid recipe
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

### Requirement: defaults
`createDefaultTypedRecipes` MUST produce the documented defaults deterministically.

#### Scenario: default registry
- **GIVEN** the default builder
- **WHEN** inspected
- **THEN** it contains exactly the wooden_pickaxe (shaped), glass (shapeless), smelt_sand and
  smelt_cobblestone (processing) recipes with the documented fields, and repeated construction
  yields equal registries.

## Error and failure behavior

- Validation and registration throw descriptive errors; no partial state.

## Performance and resource bounds

Validation O(pattern area) for shaped, O(ingredients) otherwise; registry O(1) lookups.

## Compatibility and migration

Additive; the 010 recipe registry is untouched.

## Security and integrity

Not applicable.

## Observability

Plain validated data; tests assert exact values.

## Verification mapping

- `tests/unit/TypedRecipe.test.ts` — per-kind validation matrices, registry
  lifecycle/atomicity, defaults.
