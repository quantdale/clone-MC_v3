# Spec: block-item-separation

## Contract

Separate world block definitions from inventory item definitions while preserving all current gameplay and persisted numeric interpretation through an explicit transitional compatibility layer.

## Invariants

- Item-only resources MUST NOT exist in the block registry.
- World APIs MUST resolve block definitions; inventory/tool APIs MUST resolve item definitions.
- Placeable items MUST reference their target block explicitly.
- Block drops MUST reference item identity.
- Generic runtime registry IDs MUST NOT be persisted as current save identity.
- Every currently supported legacy numeric value MUST retain its pre-change semantic meaning.

## Requirements

### Requirement: Independent domain registries

Block and item definitions SHALL be stored in distinct typed registries.

#### Scenario: Inventory-only item
- **GIVEN** a stick/tool/apple-like inventory resource
- **WHEN** block lookup is attempted
- **THEN** it is absent from the block registry
- **AND** it remains available through the item registry.

### Requirement: Explicit block-item relation

An item that can place a world block SHALL declare the target block identity explicitly. Placement MUST NOT infer the target from numeric equality.

#### Scenario: Placeable block item
- **GIVEN** a selected placeable item
- **WHEN** placement succeeds
- **THEN** the block written is the resource referenced by the item's placement relation.

#### Scenario: Non-placeable item
- **GIVEN** an item without a placement relation
- **WHEN** placement is attempted
- **THEN** no world block is written.

### Requirement: Item-owned tool metadata

Tool category, mining power, and item wear/durability metadata SHALL be resolved from the item domain rather than block definitions.

### Requirement: Item-referenced drops

Breaking a block SHALL resolve its configured drop through item identity. A missing required drop item reference MUST be detected during definition validation rather than silently substituted.

### Requirement: Legacy numeric compatibility

The change SHALL provide explicit typed mappings preserving the semantic meaning of every numeric block/item value supported by the current save format.

#### Scenario: Existing inventory snapshot
- **GIVEN** a valid pre-004 inventory snapshot
- **WHEN** restored after 004
- **THEN** item kind, count, tool properties, and current item-specific state are semantically equivalent.

#### Scenario: Existing world edit snapshot
- **GIVEN** a valid pre-004 block edit snapshot
- **WHEN** restored after 004
- **THEN** each supported numeric block value produces the same world block meaning.

### Requirement: Duplicate legacy mapping rejection

Duplicate legacy numeric mappings within the block domain or within the item domain MUST fail initialization and MUST NOT overwrite an existing mapping.

### Requirement: Unknown legacy value safety

An unsupported numeric value from persisted input MUST follow the existing safe validation/rejection behavior and MUST NOT be reinterpreted as another valid resource.

### Requirement: Current behavior preservation

Current crafting, placement, mining speed, item wear, block drops, inventory rendering, food use, and save/load behavior SHALL remain equivalent unless a pre-existing bug is explicitly documented and fixed within scope.

### Requirement: Cross-reference validation

All item-to-block and block-to-item references required by current definitions MUST be validated during registry/bootstrap setup so missing targets cannot survive into gameplay.

## Failure behavior

Domain lookup mismatches fail rather than falling back across registries. Invalid cross-references block initialization. Compatibility-map failures preserve existing entries and never reinterpret data.

## Performance

Domain/legacy lookups SHOULD remain constant-time average. Hot gameplay paths MUST NOT repeatedly parse ResourceId strings per frame; resolved links/runtime IDs may be cached after validation.

## Compatibility

004 MUST NOT change the current persistent snapshot version or serialize generic runtime IDs as stable identity. Later numbered changes own save-format modernization.

## Verification mapping

Tests MUST cover registry membership, explicit placement links, tool metadata ownership, drop resolution, every current legacy mapping, duplicate/unknown legacy values, representative old saves, and all affected gameplay regressions. Full typecheck/lint/unit/build/E2E gates are mandatory.
