# Spec: enchantment-application

## Contract

Applies enchantment effects (defined by `118-enchantment-registry`) to the
mining, durability, and armor pathways, and exposes pure, deterministic effect
primitives for later changes. Enchantments are stored on `ItemStack` via the
`ENCHANTMENTS_COMPONENT` (`minecraft:enchantments`) holding a flat
`{ enchantmentResourceId: level }` record. Weapon-enchant *application* is an
explicit non-goal: only the pure `weaponDamageBonus` primitive is provided.

## Definitions

- **EPF** (Enchantment Protection Factor): the summed contribution of protection
  family enchantments for a damage type, capped at 20.
- **Effective tool**: per `HarvestRules.isEffectiveTool`.
- **Worn armor stacks**: `PlayerEquipment.getArmorStacks()` (Head/Chest/Legs/Feet).

## Invariants

- `ENCHANTMENTS_COMPONENT` value is an object; every value is a finite integer `>= 1`.
- `absorbed` (armor durability wear) is unchanged by the protection EPF.
- New `BlockSelector` members and function parameters are optional and
  backward-compatible.
- `InventorySnapshot.version` remains `1` (no new persisted field).

## Requirements

### Requirement: ENCHANTMENTS_COMPONENT is registered and validated

`ENCHANTMENTS_COMPONENT` SHALL be registered in the default stack-component
registry with value type `Record<string, number>` (enchantment resource-id string
→ level). The value SHALL be validated as a non-null object whose every value is a
finite integer `>= 1`; any other value SHALL cause `StackComponentMap.with` to
throw `RegistryError('INVALID_ID')`.

#### Scenario: round-trips a valid enchantment record
- **GIVEN** a default component registry
- **WHEN** `map.with(ENCHANTMENTS_COMPONENT, { 'minecraft:efficiency': 3 })`
- **THEN** `map.get(ENCHANTMENTS_COMPONENT)` returns `{ 'minecraft:efficiency': 3 }`

#### Scenario: rejects a non-integer level
- **GIVEN** a default component registry
- **WHEN** `map.with(ENCHANTMENTS_COMPONENT, { 'minecraft:efficiency': 1.5 })`
- **THEN** a `RegistryError` with code `INVALID_ID` is thrown

#### Scenario: rejects a zero or negative level
- **GIVEN** a default component registry
- **WHEN** `map.with(ENCHANTMENTS_COMPONENT, { 'minecraft:unbreaking': 0 })`
- **THEN** a `RegistryError` with code `INVALID_ID` is thrown

### Requirement: enchantments are readable and writable on an ItemStack

`getStackEnchantments(stack, registry)` SHALL return the stored enchantments as
`EnchantmentInstance[]` (empty when absent). `setStackEnchantments(stack,
instances, registry)` SHALL validate the list via `validateEnchantmentList` and
store it as the component, returning a new `ItemStack`; an empty list SHALL remove
the component. `getEnchantmentLevel(stack, key, registry)` SHALL return the level
for `key`, or `0` when absent.

#### Scenario: writes and reads back enchantments
- **GIVEN** a stack with no component and a default enchantment registry
- **WHEN** `setStackEnchantments(stack, [{ id: efficiencyRid, level: 3 }], registry)`
- **THEN** `getEnchantmentLevel(stack, 'efficiency', registry)` is `3`
- **AND** `getStackEnchantments(stack, registry)` contains `{ id: efficiencyRid, level: 3 }`

#### Scenario: empty list clears the component
- **GIVEN** a stack carrying `{ 'minecraft:fortune': 2 }`
- **WHEN** `setStackEnchantments(stack, [], registry)`
- **THEN** the returned stack has no `ENCHANTMENTS_COMPONENT`

#### Scenario: invalid list is rejected before writing
- **GIVEN** a stack and registry
- **WHEN** `setStackEnchantments(stack, [{ id: efficiencyRid, level: 99 }], registry)`
- **THEN** a `RegistryError` (`LEVEL_OUT_OF_RANGE`) is thrown and the input stack is unchanged

#### Scenario: does not mutate the input stack
- **GIVEN** a stack with no component
- **WHEN** `setStackEnchantments(stack, [{ id: unbreakingRid, level: 1 }], registry)`
- **THEN** the original `stack.components` remains `undefined`

### Requirement: Efficiency speeds breaking

`HarvestRules.getBreakDuration(def, tool, efficiencyLevel)` SHALL, for an effective
tool, divide the effective duration `base / toolPower` by
`efficiencySpeedMultiplier(efficiencyLevel)` when `efficiencyLevel > 0`, never
below `MIN_BREAK_DURATION`.

#### Scenario: efficiency shortens break time
- **GIVEN** an effective tool with `toolPower = 4` and a block of `hardness = 4`
- **WHEN** `getBreakDuration(def, tool, 4)` (efficiencySpeedMultiplier(4) = 2.2)
- **THEN** the duration is `Math.max(MIN_BREAK_DURATION, 4 / 4 / 2.2)`

#### Scenario: no efficiency leaves duration unchanged
- **GIVEN** an effective tool with `toolPower = 4` and a block of `hardness = 4`
- **WHEN** `getBreakDuration(def, tool, 0)`
- **THEN** the duration is `4 / 4` (equal to the no-enchantment effective duration)

### Requirement: Silk Touch makes the block drop itself

In `PlayerInteraction.finishBreak`, when the selected stack has an active Silk
Touch level and the block has an item form, the drops SHALL be replaced by a
single stack of the block's own item form (count 1), replacing any loot-table or
fallback drops for that break.

#### Scenario: silk touch overrides the drop
- **GIVEN** a selected stack with `silk_touch` level 1 breaking a block whose
  resource id resolves to an item
- **WHEN** the block is finished
- **THEN** exactly one drop is produced, the block's own item, count 1

#### Scenario: silk touch with no item form keeps normal loot
- **GIVEN** a selected stack with `silk_touch` level 1 breaking a block with no
  item form
- **WHEN** the block is finished
- **THEN** the normal loot-table/fallback drops are produced (Silk Touch is a no-op)

### Requirement: Fortune adds extra drops

In `PlayerInteraction.finishBreak`, when the selected stack has a Fortune level
(`> 0`) and there is at least one drop, `fortuneBonusCount(level, rng)` extra
items SHALL be added to the primary drop. Silk Touch and Fortune are mutually
exclusive, so they never both apply.

#### Scenario: fortune adds between 0 and level items
- **GIVEN** a selected stack with `fortune` level 3 and a block yielding 1 primary drop
- **WHEN** the block is finished with an `rng` returning a fixed value
- **THEN** the primary drop count is `1 + Math.floor(rng() * 4)` (i.e. 1..4)

#### Scenario: fortune with no drops adds nothing
- **GIVEN** a selected stack with `fortune` level 3 and a block that yields no drops
- **WHEN** the block is finished
- **THEN** no drop is produced

### Requirement: Unbreaking reduces or avoids tool wear

`DurabilityRules.applyDamage(maxDurability, stack, amount, unbreakingLevel, rng)`
SHALL, when `unbreakingLevel > 0` and `rng !== undefined`, skip wear entirely when
`rng() >= 1/(unbreakingLevel + 1)`, otherwise wear normally. With
`unbreakingLevel = 0` or `rng = undefined`, behavior SHALL be the prior, unchanged
wear (no Unbreaking effect).

#### Scenario: unbreaking can skip a wear event
- **GIVEN** a tool stack at full durability and `unbreakingLevel = 3`
- **WHEN** `applyDamage(max, stack, 1, 3, () => 0.9)` (0.9 >= 1/4)
- **THEN** the returned stack is unchanged and `broke` is `false`

#### Scenario: unbreaking still wears on the unlucky roll
- **GIVEN** a tool stack and `unbreakingLevel = 1`
- **WHEN** `applyDamage(max, stack, 1, 1, () => 0.1)` (0.1 < 1/2)
- **THEN** wear is applied as if no Unbreaking were present

#### Scenario: no unbreaking level keeps prior behavior
- **GIVEN** a tool stack
- **WHEN** `applyDamage(max, stack, 1)` (no unbreaking args)
- **THEN** the result is identical to the pre-119 wear result

### Requirement: Armor protection enchants fold into reduction

`ArmorProtection.reduce(rawDamage, bypassArmor, damageType)` SHALL, when an
`enchantRegistry` is present and `bypassArmor` is false, compute the protection
family EPF from the worn armor stacks for `damageType` and reduce the post-armor
`reduced` amount by `applyArmorEnchantReduction(reduced, epf)`, leaving `absorbed`
unchanged. Without an `enchantRegistry`, the result SHALL equal the prior
EPF-less reduction.

#### Scenario: protection enchant reduces post-armor damage
- **GIVEN** a worn chestplate with `protection` level 4 (EPF = 4) and an
  `enchantRegistry`
- **WHEN** `reduce(10, false, undefined)`
- **THEN** `reduced` is `baseReduced / (4 + 1)` and `absorbed` equals the
  EPF-less `absorbed`

#### Scenario: fire protection responds to fire damage
- **GIVEN** a worn piece with `fire_protection` level 4 (EPF = 8) and an
  `enchantRegistry`
- **WHEN** `reduce(10, false, 'lava')`
- **THEN** the EPF contributed is `8` (protection + fire_protection both apply to fire)

#### Scenario: EPF is capped at 20
- **GIVEN** worn pieces providing EPF sum > 20 and an `enchantRegistry`
- **WHEN** `reduce(10, false, undefined)`
- **THEN** the applied EPF is `20`

#### Scenario: missing registry matches prior behavior
- **GIVEN** an `ArmorProtection` constructed without `enchantRegistry`
- **WHEN** `reduce(10, false)`
- **THEN** the result equals the pre-119 reduction (no EPF applied)

### Requirement: SurvivalSystem passes the damage reason to armor

`SurvivalSystem.damage(amount, reason)` SHALL pass `reason` to `armor.reduce` as
the `damageType` so the correct specialized protection enchants apply.

#### Scenario: lava damage routes to fire protection
- **GIVEN** `survival.armor` is an `ArmorProtection` with `enchantRegistry` and
  fire protection equipped
- **WHEN** `survival.damage(10, 'lava')`
- **THEN** the armor reduction consulted fire-protection enchants for the damage

### Requirement: weaponDamageBonus is a pure, tested primitive

`weaponDamageBonus(key, level)` SHALL return `1 + 0.5 * level` for `sharpness`,
`2.5 * level` for `smite` and `bane_of_arthropods`, and `0` otherwise. It is a
non-goal to wire this into a combat pathway in 119.

#### Scenario: sharpness bonus
- **WHEN** `weaponDamageBonus('sharpness', 4)`
- **THEN** the result is `3`

#### Scenario: smite bonus
- **WHEN** `weaponDamageBonus('smite', 2)`
- **THEN** the result is `5`

#### Scenario: unknown key yields zero
- **WHEN** `weaponDamageBonus('knockback', 1)`
- **THEN** the result is `0`

## Error and failure behavior

- Invalid `ENCHANTMENTS_COMPONENT` values are rejected at write time by
  `StackComponentMap.with` (`RegistryError('INVALID_ID')`).
- `setStackEnchantments` rejects invalid instances via `validateEnchantmentList`
  (`UNKNOWN_ENCHANTMENT`/`LEVEL_OUT_OF_RANGE`/`ENCHANTMENT_CONFLICT`) before any
  write and never mutates the input.
- `getStackEnchantments` skips entries with unparseable/missing resource ids
  rather than throwing.
- Silk Touch on a block without an item form is a safe no-op (normal loot kept).

## Performance and resource bounds

- No allocation on the no-enchantment path; reads short-circuit on absent
  component or missing registry.
- EPF computation is O(worn stacks × that stack's enchantments) per damage event.

## Compatibility and migration

- `InventorySnapshot.version` stays `1`; no persisted field added. General
  component serialization is deferred.
- All new `BlockSelector` members and function parameters are optional.

## Security and integrity

- Enchantment values are validated before storage; level bounds are enforced so a
  crafted/loaded stack cannot inject absurd multipliers.
- `setStackEnchantments` validates via the registry, preventing conflicts and
  out-of-range levels from reaching `ItemStack`.

## Observability

- `getStackEnchantments` exposes a stack's enchantments for debug/HUD use.
- Validation errors carry machine-readable `RegistryError` codes.

## Verification mapping

| Requirement | Primary test |
|---|---|
| ENCHANTMENTS_COMPONENT registered/validated | `EnchantmentApplication.test.ts` |
| Read/write enchantments on a stack | `EnchantmentApplication.test.ts` |
| Efficiency speeds breaking | `HarvestRules.test.ts` |
| Silk Touch drops the block | `PlayerInteraction.test.ts` |
| Fortune adds drops | `PlayerInteraction.test.ts` |
| Unbreaking wear | `DurabilityRules.test.ts` |
| Armor EPF in reduce | `ArmorProtection.test.ts` |
| SurvivalSystem reason | `SurvivalSystem.test.ts` |
| weaponDamageBonus primitive | `EnchantmentApplication.test.ts` |
