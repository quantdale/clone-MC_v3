# Proposal: 018-block-entity-type-registry

## Problem

Block entities (chests, furnaces, signs, etc.) have no first-class, ResourceId-identified data
model, and there is no declared mapping from a block to the block-entity type it may host. Future
block-entity storage, screen UI, and tile-tick dispatch have no shared type or compatibility
contract.

## Goals

- Define a ResourceId-identified `BlockEntityType` data model (inventory size, tickable flag).
- Provide a `BlockEntityRegistry` built on the 003 generic `Registry` core.
- Provide `BlockEntityCompatibility` declarations mapping block keys to allowed block-entity type
  keys, validated against the registry.
- Provide default block-entity types and a default compatibility mapping.

## Non-goals

- No block-entity storage, screen UI, or tick dispatch implementation.
- No migrating existing block constants to the registry.

## Preconditions

017 is VERIFIED. The 003 `Registry` and 002 `ResourceId` foundations are available.

## Dependencies

- `src/data/Registry.ts` (003)
- `src/data/ResourceId.ts` (002)

## Proposed change

Add `src/data/BlockEntityType.ts` with `BlockEntityTypeDefinition`, `BlockEntityRegistry`,
`BlockEntityCompatibility`, `BlockEntityError`, and `createDefaultBlockEntityRegistry()` /
`createDefaultBlockEntityCompatibility()`. Gameplay-free: no consumer is migrated.

## Compatibility and migration

No existing code or persisted data changes. Purely additive data.

## Risks

- Over-scoping into storage/UI/dispatch. Mitigated by the explicit non-goal of no behavior.

## Rollback strategy

Additive data module; reverting the commit removes it with no downstream impact.

## Definition of Done

Block-entity type registry, compatibility declarations, defaults, validation, and tests are
complete; full regression gate is green.

## Advancement gate

019 starts only after 018 is 100% complete and VERIFIED.
