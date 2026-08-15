# Proposal: 119-enchantment-application

## Problem
Change 118 delivered the enchantment *registry* (definitions, applicability,
conflict, validation, persistence envelope) but no pathway consumes those
definitions. Enchanted items cannot yet exist, and mining, durability, and armor
behavior ignores enchantments entirely. Players have no lever to make tools mine
faster, last longer, or keep more drops; armor does not gain protection enchant
reduction.

## Goals
- Store enchantments on an `ItemStack` via a typed, validated `StackComponent`
  (`minecraft:enchantments`) holding a flat `{ enchantmentResourceId: level }`
  record, consistent with the existing `DAMAGE_COMPONENT` model.
- Apply enchantment effects along three live pathways:
  - **Mining** (tools): Efficiency speeds breaking, Silk Touch makes the block
    drop itself, Fortune adds extra drops.
  - **Durability**: Unbreaking reduces/avoids wear probabilistically.
  - **Armor**: Protection / Fire / Blast / Projectile enchants add enchantment
    protection factor (EPF) to damage reduction.
- Provide pure, deterministic, unit-tested effect primitives reusable by later
  changes (enchanting table 120, anvil/grindstone/mending 948/949/2202/2203).

## Non-goals
- **Enchantment acquisition** (enchanting table offers, anvil, looting from
  mobs, villager trading) — deferred to 120 and later.
- **Attaching enchantments to `ItemStack` from a table** — deferred to 120. This
  change only provides the storage component + setters/getters; callers that
  produce enchanted items (the table) arrive later.
- **Weapon (melee) enchant application to combat** — the game has no combat /
  attack pathway yet (no attacker→target damage call site). The pure
  `weaponDamageBonus(key, level)` primitive is shipped and unit-tested as
  foundation; wiring into an attack pathway is deferred until one exists.
- **Saving enchanted stacks across sessions** — the current `InventorySnapshot`
  encodes only tool wear (via a parallel `durability` array) and `Equipment`
  stores full stacks, but `StackComponentMap` is not yet JSON-safe, so full
  component persistence is a latent gap shared with `DAMAGE_COMPONENT` on armor.
  General component serialization is deferred to a dedicated change; 119 does not
  expand stored shapes (no `InventorySnapshot` version bump).

## Preconditions
- `118-enchantment-registry` VERIFIED; `EnchantmentRegistry`,
  `EnchantmentInstance`, `validateEnchantmentList`, `serialize/deserialize`
  available and stable.
- `StackDataComponents` (component registry + `StackComponentMap`) stable.
- `HarvestRules`, `PlayerInteraction`, `DurabilityRules`, `ArmorProtection`,
  `SurvivalSystem`, `BlockSelector` stable and the integration points identified.

## Dependencies
- `118-enchantment-registry` (registry + validation).
- `115-item-durability-repair` (`DurabilityRules.applyDamage` is the single wear site).
- `116-armor-protection` (`ArmorProtection.reduce` is the armor mitigation site).
- `114-tool-tier-and-harvest-rules` (`HarvestRules.getBreakDuration` is the
  mining-speed site).

## Proposed change
1. Register `ENCHANTMENTS_COMPONENT` (`minecraft:enchantments`) in the shared
   component registry: value type `Record<string, number>` (enchantment
   resource-id string → level), validated as a non-null object whose every value
   is a finite integer `>= 1`.
2. New `src/inventory/EnchantmentApplication.ts`:
   - `getStackEnchantments(stack, registry)` / `setStackEnchantments(stack, instances, registry)` / `getEnchantmentLevel(stack, key, registry)`.
   - Pure effect primitives: `efficiencySpeedMultiplier`, `silkTouchActive`,
     `fortuneBonusCount`, `weaponDamageBonus`, `unbreakingWearChance`,
     `protectionEPF`, `protectionEnchantKeysFor`, `armorEnchantEPF`,
     `applyArmorEnchantReduction`.
3. Wire:
   - `BlockSelector` gains optional `getSelectedStack?()` and `damageSelectedItem`
     accepts optional `unbreakingLevel?`/`rng?`. `Inventory` implements both.
   - `HarvestRules.getBreakDuration(def, tool, efficiencyLevel?)` divides duration
     by the efficiency speed multiplier.
   - `PlayerInteraction` reads the selected stack's enchantments (via
     `enchantmentRegistry`), passing efficiency to `HarvestRules`, applying Silk
     Touch / Fortune to drops, and Unbreaking to tool wear.
   - `DurabilityRules.applyDamage` honors an optional `unbreakingLevel`/`rng`.
   - `ArmorProtection.reduce` accepts an optional `damageType` and folds EPF from
     worn armor enchantments into the reduction.
   - `SurvivalSystem.damage` passes the damage `reason` to `armor.reduce`.

## Compatibility and migration
- No stored-shape change: the `ENCHANTMENTS_COMPONENT` is additive to the
  component model; `InventorySnapshot.version` stays `1` (no new persisted field).
- Optional `BlockSelector` members / function parameters preserve backward
  compatibility with existing callers and mocks.

## Risks
- Combat-less weapon enchant: `weaponDamageBonus` is dead code until an attack
  pathway exists; clearly marked non-goal for application.
- Persistence gap inherited from 008/009 (`StackComponentMap` not JSON-safe) is
  not closed here; runtime effects still work, they just won't survive reload.

## Rollback strategy
- Each pathway change is additive/optional; reverting `EnchantmentApplication`
  and the component registration returns behavior to 118 (no enchantment effects).

## Definition of Done
- `ENCHANTMENTS_COMPONENT` registered and round-trippable through
  `StackComponentMap.with`/`get`.
- Mining (efficiency/silk/fortune), durability (unbreaking), and armor
  (protection family) effects apply through the live pathways and are covered by
  deterministic unit tests.
- Full gate green: typecheck, lint, unit, build, e2e.

## Advancement gate
- Target 100% task completion plus all MUST/SHALL requirements and tests passing;
  weapon *application* is an explicit non-goal (not a missing requirement).
