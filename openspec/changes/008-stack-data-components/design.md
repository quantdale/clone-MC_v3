# Design: 008-stack-data-components

## Context / current state

`Inventory` stores item-specific state in a parallel `durability: number[]`
array. Each new feature currently needs another parallel field. The generic
registry core (003) already provides dedupe, finalize, and deterministic
iteration. Item definitions (`ItemTypeDefinition`) carry `maxDurability` for
tools but no general per-stack data container.

## Target state

A typed component model for inventory stacks:

- A `StackComponentType` is a ResourceId identity plus a `validate(value)`
  predicate and an optional `defaultValue`.
- A `StackComponentRegistry` holds registered types, built on the 003 generic
  `Registry<StackComponentType>` and finalized at construction (duplicate ids
  rejected; immutable thereafter).
- A `StackComponentMap` is an immutable map from component ResourceId to a
  validated, frozen component value for one stack. It supports `get`, `has`,
  deterministic `entries`, `with` (returns a new map, re-validates), `without`,
  `equals`, and `copy`.

## Invariants

- Every component value is validated against its registered type before it is
  stored; invalid values never enter a map.
- Map values are frozen; `with`/`without` return new maps and never mutate the
  source.
- Component ids and `entries` iteration are deterministic (sorted by ResourceId
  string), independent of insertion order.
- Two maps are equal iff they carry the same component ids with deep-equal values.
- The damage component validates a non-negative integer (`{ damage: number }`).

## API and data model

```
StackComponentValue = number | string | boolean | Readonly<Record<string, number|string|boolean>>
StackComponentType { id: ResourceId; description: string; validate(value: unknown): boolean; defaultValue?: StackComponentValue }
StackComponentRegistry { get/has/all }  // backed by Registry<StackComponentType>, finalized
StackComponentMap { has/get/entries/with/without/equals/copy }  // immutable, validated
```

## Control / data flow

Construction: each provided `[ResourceId, value]` is looked up in the registry
(throws MISSING_ID if unregistered) and validated (throws INVALID_ID if illegal),
then stored frozen. `with` validates the new value and produces a fresh map; the
source map is untouched.

## Failure modes

- Unregistered component id on construction/`with`: `MISSING_ID`.
- Value failing the type's `validate`: `INVALID_ID`.
- Duplicate component-type registration: `DUPLICATE_ID` (from 003).

## Compatibility / migration

008 is additive. `Inventory` and its `durability` array are NOT changed; the
damage component is defined and validated but not yet attached to stacks. 009
performs the inventory/hotbar migration to component-based `ItemStack`.

## Performance / resource bounds

Component counts per stack are small and bounded by authored types. Map
operations are O(components). No per-frame allocation is introduced; values are
frozen at construction.

## Affected files / symbols

- `src/inventory/StackDataComponents.ts` (new): component type, registry, map,
  `DAMAGE_COMPONENT`, `DamageComponentValue`, `damageComponentType`,
  `createDefaultStackComponentRegistry`, `emptyStackComponents`.
- Reuses `src/data/Registry.ts` and `src/data/ResourceId.ts`.

## Downstream dependencies

009 (inventory migration) consumes `StackComponentMap`/`StackComponentRegistry`
and the damage component to replace the parallel durability array.
