# Spec: stack-data-components

## Contract

Typed, ResourceId-identified stack-data components and an immutable component map
for one inventory stack. This change defines the component framework and a basic
tool-damage component; inventory/hotbar migration is 009.

## Requirements

### Requirement: Component type identity
Each stack-data component type MUST be identified by a unique ResourceId and carry
a value validator. Duplicate component-type registration MUST be rejected.

### Requirement: Component registry
Registered component types MUST be enumerable and finalizable. Lookup by
ResourceId MUST be strict (unknown ids fail). The registry MUST reject duplicate
ids and become immutable after construction.

### Requirement: Immutable component map
A stack component map MUST hold zero or more validated component values keyed by
component ResourceId. It MUST expose `get`, `has`, deterministic `entries`, and
preserve immutability: `with`/`without` return new maps and never mutate the
source.

### Requirement: Value validation
Every value stored in a map MUST pass its registered type's `validate` predicate.
Values that fail validation or belong to an unregistered component MUST be
rejected at construction and on `with`.

### Requirement: Map equality
Two component maps MUST be equal iff they carry the same component ids with
deep-equal values.

### Requirement: Deterministic iteration
`entries` MUST return component id/value pairs in a deterministic order
(ResourceId string order), independent of insertion order.

### Requirement: Tool damage component
A basic damage/wear component MUST exist for current tools, validating a
non-negative integer accumulated damage. It MUST NOT yet be attached to the
existing inventory durability array.

### Requirement: Additive compatibility
008 MUST NOT migrate `Inventory` or change existing inventory snapshots. Current
tool items MUST retain their `maxDurability` metadata.

## Scenarios

- Register base damage component; duplicate registration rejected.
- Construct a map with a valid damage value; `get` returns it.
- Construct/`with` with illegal value (negative, non-integer, non-object) rejected.
- `with`/`without` produce new maps; source unchanged.
- Two maps with identical components are equal; differing values are not.
- `entries` order is stable across insertion orders.
- `Inventory` durability array remains intact (no migration).

## Performance

Component counts per stack are small and bounded by authored types. Map operations
are O(components). Values are frozen at construction; no per-frame allocation.

## Compatibility and migration

Current world/inventory storage is unchanged in 008. 009 migrates inventory and
hotbar to component-based `ItemStack`.

## Security and integrity

Unregistered component ids and invalid values are rejected before storage; no
partial map is observable on failure.

## Verification mapping

Focused tests cover registration, duplicate rejection, value validation, map
immutability, equality, deterministic iteration, the damage component, and
inventory non-migration. Full typecheck/lint/unit/build/E2E gates remain mandatory.
