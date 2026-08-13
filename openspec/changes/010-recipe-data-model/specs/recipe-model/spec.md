# Spec: recipe-model

## Contract

Recipes are immutable registered data identified by ResourceId. This change replaces numeric/plain-string definition identity but preserves current click-to-craft behavior.

## Requirements

### Requirement: Unique recipe identity
Each recipe MUST have one unique ResourceId and duplicate registration MUST fail without replacing an existing recipe.

### Requirement: Ingredient variants
An ingredient SHALL reference either one exact registered item or one finalized item-domain tag, plus a positive integer quantity.

### Requirement: Reference validation
Every exact item, item tag, and output item reference MUST resolve before the recipe registry is considered valid.

### Requirement: Output definition
Recipe output SHALL identify a registered item, a positive integer quantity, and optional validated stack component data supported by the current component system.

### Requirement: Immutable finalized definitions
After recipe registry finalization, recipe identity, ingredients, and output MUST reject ordinary mutation.

### Requirement: Current catalog equivalence
Every recipe available before 010 MUST remain available with equivalent ingredient quantities and output quantity/item semantics.

### Requirement: Transactional craft behavior
Current craft execution MUST verify all ingredient affordability and output capacity before removing any input. Failed craft attempts MUST leave inventory unchanged.

### Requirement: Tag ingredient matching
When a recipe ingredient uses an item tag, any item identity resolved as a member of that tag SHALL satisfy the identity portion of that ingredient. This change does not add crafting-grid position semantics.

### Requirement: Invalid definition rejection
Zero/negative/non-integer quantities, missing references, duplicate recipe IDs, or invalid output component data MUST reject the definition before it becomes craftable.

## Scenarios

- Valid exact-item recipe registers and crafts under current one-click semantics.
- Valid tag ingredient is satisfied by a member item.
- Missing item or tag reference prevents finalization.
- Duplicate recipe ID leaves the original recipe intact.
- Insufficient ingredients cause no inventory mutation.
- Output capacity failure causes no ingredient removal.
- Each migrated current recipe produces the same output/cost as before 010.

## Performance

Recipe lookup SHOULD be constant-time average. Current ingredient checking remains bounded by recipe ingredient count and fixed inventory size.

## Compatibility

010 MUST NOT introduce grid position, file loading, furnace processing, or a recipe-book UI. Current user-visible crafting behavior remains equivalent.

## Verification

Focused tests cover every requirement/scenario and explicit equivalence for every current recipe, followed by mandatory typecheck, lint, full unit suite, build, and E2E.
