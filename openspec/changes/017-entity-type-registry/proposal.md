# Proposal: 017-entity-type-registry

## Problem

Entity types currently have no first-class, ResourceId-identified data model. Spawning,
projection, and future entity/AI consumers have no shared type for an entity's category or its
descriptive metadata (health/attack bounds). Each downstream system must invent its own
constants.

## Goals

- Define a ResourceId-identified `EntityType` data model with category and optional metadata.
- Provide an `EntityRegistry` built on the 003 generic `Registry` core.
- Provide `createDefaultEntityRegistry()` with a representative set of vanilla-like entities.
- Validate known categories and finite, bounded metadata; assign dense runtime ids.

## Non-goals

- No AI/behavior implementation, no spawning system, no world/storage migration.
- No migrating existing entity constants to the registry.

## Preconditions

016 is VERIFIED. The 003 `Registry` and 002 `ResourceId` foundations are available.

## Dependencies

- `src/data/Registry.ts` (003)
- `src/data/ResourceId.ts` (002)

## Proposed change

Add `src/data/EntityType.ts` with `EntityCategory`, `EntityTypeDefinition`, `EntityRegistry`,
`EntityError`, `getEntityRuntimeId`/lookup helpers, and `createDefaultEntityRegistry()`.
Gameplay-free: no consumer is migrated; no behavior is attached.

## Compatibility and migration

No existing code or persisted data changes. Purely additive data.

## Risks

- Over-scoping into AI/behavior. Mitigated by the explicit non-goal of no behavior expansion.

## Rollback strategy

Additive data module; reverting the commit removes it with no downstream impact.

## Definition of Done

Entity-type registry, defaults, validation, runtime ids, and tests are complete; full
regression gate is green.

## Advancement gate

018 starts only after 017 is 100% complete and VERIFIED.
