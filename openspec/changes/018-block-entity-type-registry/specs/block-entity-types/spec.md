# Spec: block-entity-types

## Contract

`block-entity-types` defines ResourceId-identified block-entity types (inventory size, tickable
flag), a `BlockEntityRegistry` on the 003 generic `Registry`, and `BlockEntityCompatibility`
declarations mapping block keys to allowed block-entity type keys. No behavior/storage is included.

## Definitions

- **BlockEntityTypeDefinition**: immutable data describing one block-entity type.

## Invariants

- `inventorySize` when present MUST be finite and > 0.
- Registry ids MUST be unique.
- `BlockEntityCompatibility` MUST only reference block-entity type keys present in the registry.
- Block keys are free-form strings (the structure is decoupled from any live block registry).

## Requirements

### Requirement: registry construction validates and finalizes block-entity types
The registry MUST validate every definition (unique id, finite positive inventorySize) and finalize
before lookup.

#### Scenario: accepts the default block-entity set
- **GIVEN** `createDefaultBlockEntityRegistry()`
- **WHEN** `size` is read
- **THEN** it equals 10 and `finalized` is true

#### Scenario: rejects a non-positive inventorySize
- **GIVEN** a definition with `inventorySize: 0`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-value error

#### Scenario: rejects a duplicate id
- **GIVEN** two definitions sharing the same `id`
- **WHEN** the registry is constructed
- **THEN** construction throws with a duplicate-id error

### Requirement: compatibility only references existing types
`BlockEntityCompatibility` MUST reject a mapping whose type key is absent from the registry.

#### Scenario: rejects an unknown referenced type
- **GIVEN** a registry and a mapping `{'chest': 'not_a_type'}`
- **WHEN** compatibility is constructed
- **THEN** construction throws with an invalid-reference error

### Requirement: compatibility resolves the block-entity type for a block
`BlockEntityCompatibility` MUST resolve a declared block key to its block-entity type and report
incompatibility for undeclared pairs.

#### Scenario: resolves a declared block
- **GIVEN** `createDefaultBlockEntityCompatibility(reg)`
- **WHEN** `getBlockEntityTypeForBlock('furnace')` is read
- **THEN** it returns the furnace block-entity type (tickable true)

#### Scenario: reports an undeclared block as having no block entity
- **GIVEN** `createDefaultBlockEntityCompatibility(reg)`
- **WHEN** `getBlockEntityTypeForBlock('stone')` is read
- **THEN** it returns undefined and `isCompatible('stone', 'chest')` is false

## Error and failure behavior

Invalid definitions MUST throw at construction (atomic). Compatibility referencing missing types MUST
throw at construction (atomic).

## Performance and resource bounds

Registry lookup O(1); compatibility query O(1).

## Compatibility and migration

Purely additive data; no persisted or call-site changes.

## Security and integrity

Definitions are static data; no runtime external input flows into block-entity parameters.

## Observability

The structures expose typed block-entity metadata and block compatibility for future storage/UI/tick
consumers.

## Verification mapping

- Registry/compatibility validation, defaults, queries -> `tests/unit/BlockEntityType.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
