# Spec: entity-types

## Contract

`entity-types` defines ResourceId-identified entity types with category and optional descriptive
metadata (health/attack bounds, summonable/persistent flags), an `EntityRegistry` on the 003
generic `Registry` that assigns dense deterministic runtime ids, and default entity types. No
behavior/AI is included.

## Definitions

- **EntityCategory**: `MONSTER` | `CREATURE` | `AMBIENT` | `WATER_CREATURE` | `WATER_AMBIENT` |
  `PROJECTILE` | `OTHER`.
- **EntityTypeDefinition**: immutable data describing one entity type.

## Invariants

- `category` MUST be a known `EntityCategory`.
- `health` when present MUST be finite and > 0.
- `attackDamage` when present MUST be finite and >= 0.
- Registry ids MUST be unique.
- Runtime ids MUST be assigned by registration order (0-based) and are stable for a given registry
  contents; they are data-set local and MUST NOT be treated as persistent identity.

## Requirements

### Requirement: registry construction validates and finalizes entity types
The registry MUST validate every definition (unique id, known category, finite bounded
health/attackDamage) and finalize before lookup.

#### Scenario: accepts the default entity set
- **GIVEN** `createDefaultEntityRegistry()`
- **WHEN** `size` is read
- **THEN** it equals 11 and `finalized` is true

#### Scenario: rejects a non-positive health
- **GIVEN** a definition with `health: 0`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-value error

#### Scenario: rejects a negative attackDamage
- **GIVEN** a definition with `attackDamage: -1`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-value error

#### Scenario: rejects an unknown category
- **GIVEN** a definition with `category: 'NOPE'`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-flag error

### Requirement: runtime ids are assigned by registration order
The registry MUST assign runtime ids equal to each definition's registration index and resolve
them back to the definition.

#### Scenario: resolves a runtime id to its entity
- **GIVEN** `createDefaultEntityRegistry()`
- **WHEN** `getByRuntimeId(0)` is read
- **THEN** it is the first registered entity (key `zombie`) and `getRuntimeId` of its id is 0

### Requirement: default entity types encode category and metadata
The default registry MUST contain representative entities with correct category, health, and
attack metadata, and MUST reject duplicate ids.

#### Scenario: zombie is a monster with expected stats
- **GIVEN** `createDefaultEntityRegistry()`
- **WHEN** the `zombie` type is read
- **THEN** it has `category` MONSTER, `health` 20, and `attackDamage` 3

#### Scenario: duplicate ids are rejected
- **GIVEN** two definitions sharing the same `id`
- **WHEN** the registry is constructed
- **THEN** construction throws with a duplicate-id error

## Error and failure behavior

Invalid definitions MUST throw at construction (atomic). Duplicate ids MUST be rejected.

## Performance and resource bounds

Registry lookup O(1); runtime id resolution O(1); one-pass validation at construction.

## Compatibility and migration

Purely additive data; no persisted or call-site changes.

## Security and integrity

Definitions are static data; no runtime external input flows into entity parameters.

## Observability

The registry exposes typed entity metadata and stable runtime ids for future spawning and
serialization consumers.

## Verification mapping

- Registry/instance validation, defaults, runtime ids -> `tests/unit/EntityType.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
