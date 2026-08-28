# Proposal: 219-enchantment-potion-content-expansion

## Problem
215-218 expanded content as data; enchantments, status effects, and potions remain fixed
(012/014/118/122). 219 fills those catalogs through data-driven definitions — the established
no-new-architecture pattern.

## Goals
- `src/data/EnchantmentPotionExpansion.ts` (NEW), pure and headless-safe:
  - **Enchantments**: `EnchantmentDefinition { id, name, maxLevel, appliesTo, incompatible }` —
    namespaced id (path without an `enchantment/` prefix), non-empty name, `maxLevel` a positive
    integer (default 1), `appliesTo` non-empty strings, `incompatible` strings (default []).
  - **Status effects**: `StatusEffectDefinition { id, name, beneficial, maxAmplifier }` — id
    without an `effect/` prefix, non-empty name, `beneficial` boolean, `maxAmplifier` an integer
    >= 0 (default 3).
  - **Potions**: `PotionDefinition { id, name, effectId, durationTicks, amplifier }` — id
    without a `potion/` prefix, non-empty name, non-empty `effectId` (a status-effect reference),
    `durationTicks` a positive integer, `amplifier` an integer >= 0.
  - **Catalog**: `createCatalogExpansion({ enchantments?, effects?, potions? })` —
    `CatalogExpansion { enchantments, effects, potions }` in registration order with per-kind
    duplicate-id rejection; `enchantmentById` / `effectById` / `potionById`;
    `potionsForEffect(expansion, effectId)`.

## Non-goals
- **No registry mutation** (012/014/118/122 stay untouched with characterization pinned), **no
  runtime behavior** (118/121/123 consume the definitions), **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 218 (`mob-content-expansion`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` helpers (imported; no registry changes).

## Proposed change
1. `src/data/EnchantmentPotionExpansion.ts` (NEW): the three definition kinds, validation, and
   the catalog queries.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Cross-kind reference drift** (potions -> effects). Mitigation: `potionsForEffect` is the
  only reference surface and is pinned; dangling effect ids are allowed (the runtime resolves),
  not rejected.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid definitions of each kind (defaults + explicit); every rejection;
  catalog grouping/order; per-kind duplicates; lookups; potionsForEffect; empty catalog.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
