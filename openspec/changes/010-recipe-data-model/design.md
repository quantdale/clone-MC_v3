# Design: 010-recipe-data-model

## Target

Represent every recipe as an immutable registered definition with namespaced identity and typed ingredient/output references. Current CraftingSystem continues using its existing one-click affordability/capacity semantics; only the recipe definition layer changes.

## Invariants

- Recipe IDs are unique ResourceIds.
- Every ingredient quantity is a positive integer.
- Every exact-item ingredient references a registered item.
- Every tag ingredient references a finalized item-domain tag.
- Output item exists and output quantity is a positive integer not exceeding a valid stack-result bound.
- Output component data is validated by the stack-component system.
- Definitions are immutable after recipe registry finalization.
- Definition validation occurs before a recipe becomes craftable.

## Ingredient model

An ingredient is either an exact item reference or an item-tag reference plus required quantity. Tag matching is evaluated against the selected/current inventory item identity; this change does not introduce crafting-grid position.

## Current recipe migration

Give every existing recipe a stable project ResourceId and express its current ingredients/output using the new model. Preserve the current transactional sequence: verify affordability and output capacity before removing ingredients, then insert output.

## Failure behavior

Duplicate recipe IDs, missing item/tag references, zero/negative/non-integer quantities, invalid output component data, and invalid output identity fail recipe definition/finalization. Craft attempts against an unavailable/invalid recipe must not mutate inventory.

## Performance

Recipe registry lookup should be constant-time average. Current recipe matching is small and may scan ingredient requirements; no grid search is introduced.

## Verification

Tests compare every migrated current recipe's costs/output to the pre-change catalog and cover exact/tag ingredients, invalid definitions, transactional insufficient-input/full-output behavior, deterministic registry iteration, and full regressions.
