# Proposal: 116-armor-protection

## Problem

`SurvivalSystem.damage` subtracts incoming damage directly from health with no
concept of worn armor. The data model and equipment plumbing for armor already
exist — `ItemTypeDefinition` carries `maxDurability` (114), `Equipment` owns the
four armor slots and exposes `getArmorStacks()` (113), and `DamageType` already
declares a `BYPASS_ARMOR` flag (013) that nothing consumes. What is missing is:

1. **No armor data model** — item definitions cannot express `defensePoints`
   (protection) or `toughness`, so the protection each piece grants is undefined.
2. **No protection math** — there is no deterministic rule translating worn armor
   points + toughness into a damage reduction.
3.
   **No durability-on-hit** — armor pieces never lose durability when they absorb
   damage, so the `DAMAGE_COMPONENT`/durability system (008/115) is unused by armor.

Change 116 integrates armor points, toughness, and durability into the damage
calculation as a reusable, testable rule.

## Goals

- Add `defensePoints?` and `toughness?` to `ItemTypeDefinition` (default `0`).
- Introduce a **pure, deterministic `ArmorProtection` module** that, from the worn
  armor stacks + item registry, computes total armor points/toughness and reduces
  incoming damage, and applies durability wear to the absorbing pieces.
- Wire `SurvivalSystem.damage` to consult `ArmorProtection` so worn armor mitigates
  damage whose `DamageType` does not carry `BYPASS_ARMOR`.
- Cover stats summation, damage reduction (with/without toughness, bypass, edge
  inputs), and durability wear with unit tests; cover the `SurvivalSystem`
  integration with a non-bypass damage type.

## Non-goals

- Enchantment Protection/Projectile/Blast/Fire modifiers (change 118/119) — the
  reduction rule accepts only base armor points/toughness; enchantment EPF is a
  later additive input.
- Shield blocking / offhand (change 144) — unrelated to the worn-armor reduction.
- A full armor *catalog* (every leather/gold/diamond/netherite piece) — 116 owns
  the calculation and the data model; representative armor content expands in 215.
- Resistance status-effect multiplier (121) and per-damage-type armor exclusions
  beyond `BYPASS_ARMOR` — out of scope.

## Preconditions

- Change 115 (`item-durability-repair`) is VERIFIED and advanced; `DurabilityRules`
  (`applyDamage`) is available for the wear step.
- `Equipment` (113) exposes `getArmorStacks()` and `setEquipment`; `ItemStack`,
  `ItemTypeRegistry.getByLegacyId`, and `maxDurability` are stable.
- `DamageType` (013) declares `BYPASS_ARMOR`; `SurvivalSystem` (114-era) routes all
  environmental damage through a `DamageTypeRegistry`.

## Dependencies

- Change 008/115 (`StackDataComponents`, `DurabilityRules`) — armor wear carrier.
- Change 004/009/113 (`ItemRegistry`, `Inventory`, `Equipment`) — item definitions,
  stacks, and worn-slot state.
- Change 013 (`DamageType`) — `BYPASS_ARMOR` flag and registry.

## Proposed change

1. Extend `ItemTypeDefinition` (in `ItemRegistry.ts`) with:
   - `defensePoints?: number` — protection points contributed by the item
     (e.g. chestplate contributes more than boots); default `0`.
   - `toughness?: number` — high-damage protection preservation; default `0`.
2. New `src/player/ArmorProtection.ts`:
   - `computeArmorStats(stacks, registry)` → `{ points, toughness }`, summing
     `def.defensePoints ?? 0` and `def.toughness ?? 0` over non-empty armor stacks,
     each running total hard-capped at `20` (the canonical armor ceiling).
   - `reduceDamage(rawDamage, stats, bypassArmor)` → `{ reduced, absorbed }` — the
     deterministic protection formula (see design + spec). Non-positive `rawDamage`
     or `bypassArmor` returns the input unchanged with `absorbed = 0`.
   - `applyArmorWear(stacks, absorbed, registry)` → `ItemStack[]` (same order, broken
     pieces replaced by `null`) — each worn piece loses
     `max(1, ceil(absorbed / pieceCount))` durability via `DurabilityRules.applyDamage`;
     non-durable pieces (`maxDurability <= 0`) are skipped.
   - `ArmorProtection` class wrapping `PlayerEquipment` + `ItemTypeRegistry` for the
     `SurvivalSystem` integration: `getStats()`, `reduce(raw, bypass)`,
     `applyWear(absorbed)` (mutates the equipment slots).
3. `SurvivalSystem` integration:
   - Store the `DamageTypeRegistry` reference and add an optional
     `armor?: ArmorProtection`.
   - In `damage(amount, reason)`, when `armor` is present and the damage type for
     `reason` does not carry `BYPASS_ARMOR`, reduce the amount, apply the reduced
     health loss, and call `armor.applyWear(absorbed)` when `absorbed > 0`.
   - Resolve `BYPASS_ARMOR` by looking up the `DamageType` for `reason` in the
     registry; an unrecognized `reason` is treated as **non-bypass** (armor applies).
4. `DamageType` definitions: add `BYPASS_ARMOR` to the environmental types
   (`fall`, `drowning`, `starvation`, `lava`) so armor only mitigates
   combat/projectile/explosion damage (parity). These are the only damage sources
   implemented today, so the protective effect is latent until combat damage types
   arrive; the `ArmorProtection` module and the `SurvivalSystem` integration are
   fully unit/integration tested with a synthetic non-bypass type.

## Compatibility and migration

- `defensePoints`/`toughness` are optional and default to `0`; no persisted-data
  schema change. Existing `ItemStack`/`InventorySnapshot`/`EquipmentSnapshot` shapes
  are unchanged.
- `SurvivalSystem`'s public surface is additive (optional `armor` field, preserved
  `damage(amount, reason)` signature). Existing `SurvivalSystem.test.ts` calls
  `damage` with no `armor` and stays green.
- `DamageType` default definitions gain a flag only; existing fall/drown/lava/
  starvation semantics are preserved (they now also bypass armor, which matches
  Minecraft).

## Risks

- **Formula regression / wrong parity curve**: the reduction must reproduce the
  "4% per armor point (capped at 20 → 80% at low damage), toughness preserving
  protection as damage rises" shape, or the `ArmorProtection.test.ts` scenarios
  fail. Mitigated by pinning the formula in the spec with concrete scenarios and
  testing the cap, zero-armor, and toughness-preserves-high-damage cases.
- **Durability churn / accidental break on absorb**: the wear step must reuse
  `DurabilityRules.applyDamage` (which breaks at zero identically to the prior
  inline logic) and drop broken pieces, never mutating unrelated components.
- **i-frame / partial-absorb semantics**: a fully absorbed hit (`reduced === 0`)
  must not silently skip later logic inconsistently; the integration applies the
  existing `ceil` + i-frame flow to the reduced amount.

## Rollback strategy

`ArmorProtection` and the `armor` field are additive. Removing the
`SurvivalSystem` wiring (passing no `armor`) restores prior direct-damage behavior
without touching data. The `defensePoints`/`toughness` fields and the `BYPASS_ARMOR`
flags are inert without the wiring.

## Definition of Done

- `ItemTypeDefinition` carries `defensePoints`/`toughness`; `computeArmorStats`
  sums and caps them at `20`.
- `reduceDamage` implements the deterministic protection formula: non-positive or
  bypassed damage passes through unchanged; otherwise armor reduces damage with the
  canonical cap + toughness curve; `absorbed` is returned for durability.
- `applyArmorWear` reduces each worn piece's durability by
  `max(1, ceil(absorbed / pieceCount))` via `DurabilityRules.applyDamage`, dropping
  broken pieces; non-durable pieces are skipped.
- `SurvivalSystem.damage` consults `ArmorProtection` for non-bypass damage types and
  applies wear on absorb.
- Unit tests cover stats, reduction (cap, zero-armor, toughness preserves high
  damage, bypass, non-positive), and wear (reduce, break, skip non-durable); an
  integration test exercises `SurvivalSystem` with a non-bypass damage type.
- Full baseline regression gate is green (typecheck, lint, unit, build, e2e).

## Advancement gate

100% task completion, all MUST/SHALL requirements verified by tests, and the
baseline regression gate (`npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run test:e2e`) fully green.
