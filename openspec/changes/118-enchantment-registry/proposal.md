# Proposal: 118-enchantment-registry

## Problem

The game has no notion of enchantments. Minecraft parity requires a registry of
enchantment definitions (identity, display name, maximum level), rules that decide
which items an enchantment may be applied to (*applicability*), and rules that forbid
certain enchantments from coexisting on the same item (*conflict*). Without this layer,
later changes (119 enchantment application, 120 enchanting table, 219 catalog fill) have
no single source of truth and would each reinvent the same validation.

## Goals

- Define an `EnchantmentDefinition` (resource id, name, `maxLevel`, `targets`,
  `incompatibleWith`).
- Provide an `EnchantmentRegistry` that registers definitions, resolves them by
  numeric/resource id, and exposes pure conflict (`areIncompatible`) and applicability
  (`appliesTo`) queries.
- Provide a normalized `EnchantmentInstance { id, level }` model plus strict
  `serializeEnchantments` / `deserializeEnchantments` (037-style `version:1` envelope)
  and a `validateEnchantmentList` that rejects unknown ids, out-of-range levels, and
  pairwise conflicts.
- Seed a representative catalog that exercises every conflict group (tool enchantments,
  weapon damage-group exclusivity, armor protection-group exclusivity) so the rules are
  provably tested.

## Non-goals

- Applying enchantment *effects* to mining/combat/durability (that is `119-enchantment-
  application`). 118 only stores definitions and validates membership/conflicts.
- Wiring enchantments onto `ItemStack` / `Inventory` persistence of equipped stacks (the
  instance model and its serializer exist, but stack integration is deferred to 119/equipment).
- Generating enchantments at an enchanting table (120) or filling the full ~40-entry
  catalog (219). Only a representative seed catalog ships here.

## Preconditions

- `117-player-experience` is VERIFIED and published (done this session).
- `ResourceId` (`src/data/ResourceId.ts`) exists for stable enchantment identity.
- `ItemTypeDefinition` (`src/inventory/ItemRegistry.ts`) exposes `toolKind`,
  `defensePoints`, etc., which the applicability predicates read.

## Dependencies

- `src/data/ResourceId.ts` — enchantment identity.
- `src/inventory/ItemRegistry.ts` — `ItemTypeDefinition` used by applicability checks.
- `src/data/Registry.ts` — `RegistryError` for consistent validation failures.

## Proposed change

Add `src/inventory/EnchantmentRegistry.ts` containing the definition type, the registry,
the applicability predicate map (`EnchantmentTarget` → `ItemTypeDefinition` predicate),
the symmetric conflict check, the instance model + validation, and the 037 serialization
pair. Seed `createDefaultEnchantmentRegistry()` with the representative catalog above.

## Compatibility and migration

- `EnchantmentListSnapshot` is a new `version:1` envelope; a missing/old snapshot is
  treated as "no enchantments" by consumers (no stored shape changes to existing records).
- No `ItemStack`/`PlayerStateRecord` changes in 118; the snapshot type is forward-
  compatible with the later stack integration.

## Risks

- Applicability predicates must stay pure and declarative so 119 can reuse them without
  re-implementing category logic. Mitigated by `enchantmentAppliesTo(targets, itemDef)`.
- Conflict symmetry: a one-sided `incompatibleWith` entry must be detected both ways.
  Mitigated by `areIncompatible` checking both definitions.

## Rollback strategy

- 118 is additive (new module + new catalog). Reverting the commit removes the registry
  and its tests with no impact on prior changes.

## Definition of Done

- `EnchantmentRegistry` registers the seed catalog; `get`/`getByResourceId` resolve;
  `areIncompatible` is symmetric and correct for every seeded group; `appliesTo` matches
  the declared targets; `validateEnchantmentList` rejects unknown ids, level `<1` or
  `>maxLevel`, and conflicts; `deserializeEnchantments` is strict and atomic.
- Unit tests cover each requirement with GIVEN/WHEN/THEN scenarios from `spec.md`.
- Full baseline gate green: typecheck, lint, unit, build, e2e.

## Advancement gate

Target 100% task completion plus all mandatory requirements and tests passing. Below 90%
or any failed MUST/SHALL requirement forbids advancement.
