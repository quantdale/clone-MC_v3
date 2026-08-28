# Spec: item-durability-repair

## Contract

This capability defines the general, component-driven rules that decide how much
wear a tool/armor item accumulates, when it breaks, how much durability remains, and
how it is repaired. All decisions are centralized in `DurabilityRules` and applied to
stacks carrying a `DAMAGE_COMPONENT`; `Inventory` delegates its wear/repair methods
to these rules. Omitted sections are inapplicable and stated as such.

## Definitions

- **Tool**: an item definition whose `maxDurability > 0`. Non-tools are never worn or
  broken by these rules.
- **Damage component**: `DAMAGE_COMPONENT` (`minecraft:damage`) holding non-negative
  integer accumulated wear `damage`.
- **Remaining durability**: `clamp(maxDurability - damage, 0, maxDurability)`.
- **Broken**: a tool whose remaining durability `<= 0`, or whose `count <= 0`.

## Invariants

- `maxDurability` of `0`/absent ⇒ not a tool ⇒ never broken, never repairable.
- Wear is a non-negative integer; each application adds `max(1, trunc(amount))`.
- `repair` never increases damage beyond pristine (`0`) and never changes `count` or
  unrelated components.
- All `DurabilityRules` functions are pure: they return a new `ItemStack` and never
  mutate the input.

## Requirements

### Requirement: remaining-durability computation

`getRemainingDurability(maxDurability, stack)` SHALL return `max(0, min(max, max - damage))`
for a tool, and `0` for a non-tool or empty/missing stack.

#### Scenario: pristine tool is full

- **GIVEN** a wooden_pickaxe (`maxDurability 59`) with no damage component
- **WHEN** `getRemainingDurability` is computed
- **THEN** it returns `59`

#### Scenario: worn tool reflects accumulated damage

- **GIVEN** a tool (`maxDurability 59`) with `DAMAGE_COMPONENT { damage: 10 }`
- **WHEN** `getRemainingDurability` is computed
- **THEN** it returns `49`

#### Scenario: non-tool returns zero

- **GIVEN** a dirt item (`maxDurability` absent/0)
- **WHEN** `getRemainingDurability` is computed
- **THEN** it returns `0`

### Requirement: durability damage rule

`applyDamage(maxDurability, stack, amount)` SHALL accumulate `max(1, trunc(amount))` into the
`DAMAGE_COMPONENT` of a tool stack and return `{ stack, broke }`. When the remaining
durability reaches `<= 0`, the returned stack SHALL have `count = 0` and
`components = undefined` and `broke` SHALL be `true`. Non-tools and empty/missing
stacks SHALL be returned unchanged with `broke = false`.

#### Scenario: a point of wear reduces remaining durability

- **GIVEN** a tool (`maxDurability 59`) with no damage component
- **WHEN** `applyDamage(maxDurability, stack, 1)` is computed
- **THEN** the returned stack carries `DAMAGE_COMPONENT { damage: 1 }`, `broke` is
  `false`, and `count` is unchanged

#### Scenario: reaching zero breaks the tool

- **GIVEN** a tool (`maxDurability 3`) with `DAMAGE_COMPONENT { damage: 2 }`
- **WHEN** `applyDamage(maxDurability, stack, 1)` is computed
- **THEN** the returned stack has `count = 0`, `components = undefined`, and `broke`
  is `true`

#### Scenario: non-tools are unaffected

- **GIVEN** a dirt item (`maxDurability 0`)
- **WHEN** `applyDamage(maxDurability, stack, 5)` is computed
- **THEN** the returned stack is unchanged and `broke` is `false`

#### Scenario: negative/zero amount still applies one wear

- **GIVEN** a tool (`maxDurability 59`) with no damage component
- **WHEN** `applyDamage(maxDurability, stack, -3)` is computed
- **THEN** the returned stack carries `DAMAGE_COMPONENT { damage: 1 }` and `broke` is
  `false`

### Requirement: break detection

`isBroken(maxDurability, stack)` SHALL be `true` for a tool whose remaining durability `<= 0`
or whose `count <= 0`, and `false` for a non-tool.

#### Scenario: full tool is not broken

- **GIVEN** a tool (`maxDurability 59`) with `DAMAGE_COMPONENT { damage: 0 }`
- **WHEN** `isBroken` is evaluated
- **THEN** it is `false`

#### Scenario: depleted tool is broken

- **GIVEN** a tool (`maxDurability 3`) with `DAMAGE_COMPONENT { damage: 3 }`
- **WHEN** `isBroken` is evaluated
- **THEN** it is `true`

#### Scenario: non-tool is never broken

- **GIVEN** a dirt item
- **WHEN** `isBroken` is evaluated
- **THEN** it is `false`

### Requirement: repair rule

`repair(maxDurability, stack, amount)` SHALL reduce accumulated damage by `max(1, trunc(amount))`,
clamped at `0`, preserving `count` and identity; pristine, non-tool, and empty/missing
stacks SHALL be returned unchanged.

#### Scenario: repair reduces wear

- **GIVEN** a tool (`maxDurability 59`) with `DAMAGE_COMPONENT { damage: 10 }`
- **WHEN** `repair(maxDurability, stack, 4)` is computed
- **THEN** the returned stack carries `DAMAGE_COMPONENT { damage: 6 }` and `count` is
  unchanged

#### Scenario: repair clamps at pristine

- **GIVEN** a tool (`maxDurability 59`) with `DAMAGE_COMPONENT { damage: 2 }`
- **WHEN** `repair(maxDurability, stack, 10)` is computed
- **THEN** the returned stack carries no `DAMAGE_COMPONENT` (pristine, full
  remaining durability)

#### Scenario: pristine tool is unchanged by repair

- **GIVEN** a tool (`maxDurability 59`) with no damage component
- **WHEN** `repair(maxDurability, stack, 5)` is computed
- **THEN** the returned stack is unchanged

#### Scenario: non-tool is unchanged by repair

- **GIVEN** a dirt item
- **WHEN** `repair(maxDurability, stack, 5)` is computed
- **THEN** the returned stack is unchanged

### Requirement: inventory integration

`Inventory.damageSelectedItem(amount, maxDurability)` SHALL delegate to
`applyDamage` and return whether the selected tool broke, preserving the prior
observable behavior (existing durability tests stay green). `Inventory` SHALL also
expose `repairSelectedItem(amount)` delegating to `repair` and returning whether the
selected tool changed.

#### Scenario: damaging the selected tool breaks it at zero

- **GIVEN** an inventory whose selected slot holds a tool (`maxDurability 3`) with
  `DAMAGE_COMPONENT { damage: 2 }`
- **WHEN** `damageSelectedItem(1, 3)` is called
- **THEN** it returns `true` and the selected slot's stack has `count = 0`

#### Scenario: repairing the selected tool reduces its wear

- **GIVEN** an inventory whose selected slot holds a tool (`maxDurability 59`) with
  `DAMAGE_COMPONENT { damage: 10 }`
- **WHEN** `repairSelectedItem(4)` is called
- **THEN** it returns `true` and the selected slot's `DAMAGE_COMPONENT.damage` is `6`

## Error and failure behavior

- `applyDamage`/`repair` MUST NOT throw for any integer `amount`; non-positive amounts
  are coerced to `1` wear via `max(1, trunc(amount))`.
- A broken/empty stack passed to `applyDamage` MUST be returned unchanged with
  `broke = false` (no double-break, no negative-count mutation).

## Performance and resource bounds

- `applyDamage`/`repair` allocate at most one small `StackComponentMap` per call
  (per break/repair, not per frame). `getRemainingDurability`/`isBroken` are O(1)
  component reads. No per-frame allocation.

## Compatibility and migration

- No persisted-data schema change. `DAMAGE_COMPONENT`, `maxDurability`, and the
  legacy `durability` snapshot field are unchanged; `damageSelectedItem`'s signature
  and return contract are preserved. `repairSelectedItem` is additive.

## Security and integrity

- No untrusted input reaches durability math; `amount` originates from gameplay
  (fixed `1` per break, later enchantment/augmented values). Component values written
  are always valid non-negative integers, validated by `StackComponentMap.with`.

## Observability

- Centralized in `DurabilityRules`; break/repair state is observable via
  `getRemainingDurability`/`isBroken` for UI and tests.

## Verification mapping

| Requirement | Test |
|---|---|
| remaining-durability computation | `DurabilityRules.test.ts` |
| durability damage rule | `DurabilityRules.test.ts` + `Inventory.test.ts` (damageSelectedItem) |
| break detection | `DurabilityRules.test.ts` |
| repair rule | `DurabilityRules.test.ts` + `Inventory.test.ts` (repairSelectedItem) |
| inventory integration | `Inventory.test.ts` + `PlayerInteraction.test.ts` (break path) |
