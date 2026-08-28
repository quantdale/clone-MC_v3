# Spec: armor-protection

## Contract

This capability defines how worn armor reduces incoming damage and wears when it
absorbs a hit. It is the calculation plus its data model; it does **not** include
an armor item catalog (that is `215-block-item-content-expansion`) or enchantment
protection (that is `119-enchantment-application`). Every normative requirement is
backed by a deterministic, independently authored formula and at least one
GIVEN/WHEN/THEN scenario with concrete numbers.

## Definitions

- **Armor points** — sum of `defensePoints` across worn armor pieces, clamped to
  `[0, 20]`.
- **Toughness** — sum of `toughness` across worn armor pieces, clamped to
  `[0, 20]`.
- **Armor slot** — one of Head / Chest / Legs / Feet (the Offhand is excluded).
- **Durable piece** — an armor stack whose item `maxDurability > 0`.
- **Bypass reason** — a `damage` call whose resolved `DamageType` carries the
  `BYPASS_ARMOR` flag, OR for which no `DamageType` exists (fail-safe: armor still
  applies for an unrecognized reason).

### Protection formula

```
armor    = min(20, points)
cap      = armor / 25
tf       = min(20, toughness)
retained = max(0, 1 - sqrt(raw) / (sqrt(raw) + 4 + tf * 2))
absorbed = raw * cap * retained
reduced  = raw - absorbed
```

## Invariants

- `points` and `toughness` are each `clamp(sum, 0, 20)`, independent of piece
  order.
- For the non-bypass, positive path: `reduced >= 0`, `absorbed >= 0`, and
  `reduced + absorbed === raw`.
- `absorbed` is the only input to durability wear. Health loses `ceil(reduced)`.
- Non-positive `raw` or a bypass reason reduces to the input unchanged with
  `absorbed === 0`.
- An unrecognized reason is **non-bypass** (armor applies).
- Durability wear is skipped entirely when `absorbed <= 0`.

## Requirements

### Requirement: armor stats aggregation

`computeArmorStats(stacks, registry)` MUST sum `defensePoints` and `toughness`
over the given stacks using `registry.getByLegacyId(stack.id)`, treating a missing
definition or an absent field as `0`, and MUST clamp each running total to `[0,
20]`.

#### Scenario: full set of mixed armor sums and caps at the ceiling

- **GIVEN** a registry with piece A (`defensePoints: 12, toughness: 4`), piece B
  (`defensePoints: 10, toughness: 8`), piece C (`defensePoints: 6, toughness: 2`)
- **WHEN** `computeArmorStats([A, B, C], registry)` is called
- **THEN** it returns `{ points: 20, toughness: 14 }` (12+10+6 = 28 → capped 20;
  4+8+2 = 14)

#### Scenario: a missing item definition contributes zero

- **GIVEN** a registry that does not contain `id = 999`
- **WHEN** `computeArmorStats([{ id: 999, count: 1 }], registry)` is called
- **THEN** it returns `{ points: 0, toughness: 0 }`

### Requirement: damage reduction with full formula

`reduceDamage(raw, stats, bypassArmor)` MUST, for `raw > 0` and `bypassArmor`
false, compute `reduced` and `absorbed` from the protection formula such that the
asymptote, zero-armor, and toughness-preserves-high-damage properties hold.

#### Scenario: full armor nearly eliminates tiny damage (80% low-damage cap)

- **GIVEN** `stats = { points: 20, toughness: 0 }` and `raw = 0.01`
- **WHEN** `reduceDamage(0.01, stats, false)` is called
- **THEN** `reduced ≈ 0.0022` (about 78% of the hit is absorbed) and `absorbed ≈
  0.0078`; concretely `absorbed > 0.7 * raw` and `absorbed < 0.85 * raw`.

#### Scenario: zero armor provides no reduction

- **GIVEN** `stats = { points: 0, toughness: 0 }` and `raw = 10`
- **WHEN** `reduceDamage(10, stats, false)` is called
- **THEN** it returns `{ reduced: 10, absorbed: 0 }`.

#### Scenario: high damage with zero toughness is poorly absorbed

- **GIVEN** `stats = { points: 20, toughness: 0 }` and `raw = 20`
- **WHEN** `reduceDamage(20, stats, false)` is called
- **THEN** `reduced ≈ 12.446` and `absorbed ≈ 7.554` (only ~38% absorbed).

#### Scenario: high damage with full toughness is well absorbed

- **GIVEN** `stats = { points: 20, toughness: 20 }` and `raw = 20`
- **WHEN** `reduceDamage(20, stats, false)` is called
- **THEN** `reduced ≈ 5.476` and `absorbed ≈ 14.524` (about 73% absorbed);
  therefore `absorbed` is greater than in the zero-toughness high-damage case.

### Requirement: damage reduction passthrough

`reduceDamage` MUST return the input unchanged with `absorbed === 0` whenever
`raw <= 0` or `bypassArmor === true`.

#### Scenario: non-positive raw passes through

- **GIVEN** `stats = { points: 20, toughness: 0 }` and `raw = 0`
- **WHEN** `reduceDamage(0, stats, false)` is called
- **THEN** it returns `{ reduced: 0, absorbed: 0 }`.

#### Scenario: bypass flag passes through

- **GIVEN** `stats = { points: 20, toughness: 20 }` and `raw = 20`
- **WHEN** `reduceDamage(20, stats, true)` is called
- **THEN** it returns `{ reduced: 20, absorbed: 0 }`.

### Requirement: durability wear spread

`applyArmorWear(stacks, absorbed, registry)` MUST, when `absorbed > 0` and at
least one durable piece is present, apply `max(1, ceil(absorbed / pieceCount))`
wear to each durable piece via `DurabilityRules.applyDamage`, MUST skip
non-durable pieces (`maxDurability <= 0`), MUST return one entry per input stack
in the same order, and MUST represent a broken piece as `null`.

#### Scenario: equal wear across four durable pieces

- **GIVEN** four stacks each `{ id: <durable, maxDurability: 100>, count: 1 }`
  with no prior damage, and `absorbed = 8`
- **WHEN** `applyArmorWear(stacks, 8, registry)` is called
- **THEN** each returned stack has `DAMAGE_COMPONENT.damage === 2` (wear =
  ceil(8 / 4) = 2) and `count === 1`.

#### Scenario: a piece breaks and is returned as null

- **GIVEN** one stack `{ id: <durable, maxDurability: 10>, count: 1 }` whose
  `DAMAGE_COMPONENT.damage === 9` (remaining 1) and `absorbed = 4`
- **WHEN** `applyArmorWear([stack], 4, registry)` is called
- **THEN** the returned array has length 1 and its first element is `null`
  (remaining 1 − wear 4 ≤ 0 ⇒ broke).

#### Scenario: non-durable pieces are skipped and unchanged

- **GIVEN** one stack `{ id: <non-durable, maxDurability: 0>, count: 1 }` and
  `absorbed = 4`
- **WHEN** `applyArmorWear([stack], 4, registry)` is called
- **THEN** the returned array's first element is the same stack, unchanged.

#### Scenario: no wear when nothing is absorbed

- **GIVEN** any stack and `absorbed = 0`
- **WHEN** `applyArmorWear([stack], 0, registry)` is called
- **THEN** the returned array is the input stacks unchanged.

### Requirement: survival integration applies armor and wears it

`SurvivalSystem.damage(amount, reason)` MUST, when an `armor` instance is present
and the resolved `DamageType` for `reason` does not carry `BYPASS_ARMOR`, reduce
the health loss by the armor's `reduced` value (health loses `ceil(reduced)`) and
MUST call `armor.applyWear(absorbed)` whenever `absorbed > 0`. Bypass reasons and
an unrecognized `reason` MUST leave armor unused.

#### Scenario: non-bypass damage is reduced and wears armor

- **GIVEN** a `SurvivalSystem` with `health = 20`, an `armor` instance whose
  stats are `{ points: 20, toughness: 0 }`, and a non-bypass `combat` damage type
- **WHEN** `survival.damage(20, 'combat')` is called
- **THEN** `health` is reduced by less than `20` (armor absorbed ~38% ⇒ health
  loses ~12), and the worn armor pieces each lost `max(1, ceil(absorbed / 4))`
  durability.

#### Scenario: bypass damage ignores armor

- **GIVEN** a `SurvivalSystem` with `health = 20` and an `armor` instance
- **WHEN** `survival.damage(20, 'fall')` is called (fall carries `BYPASS_ARMOR`)
- **THEN** `health` is reduced by `20` (no armor mitigation, no wear).

#### Scenario: unrecognized reason still applies armor (fail-safe)

- **GIVEN** a `SurvivalSystem` with `health = 20` and an `armor` instance
- **WHEN** `survival.damage(20, 'unknown-reason')` is called
- **THEN** armor mitigates the hit (health reduced by less than `20`).

## Error and failure behavior

- Missing item definitions in `computeArmorStats`/`applyArmorWear` contribute `0`
  / are skipped; no exception is thrown.
- If `absorbed > 0` but no durable piece is worn, `applyArmorWear` is a no-op and
  the HP loss still applies (armor simply does not wear).
- When a piece breaks under wear, its equipment slot becomes `null` (the item is
  consumed); the remaining pieces keep wearing.

## Performance and resource bounds

- `computeArmorStats`/`applyArmorWear` are O(pieces) with O(1) registry lookups
  (≤ 4 pieces).
- `reduceDamage` is O(1) arithmetic.
- `SurvivalSystem.isBypass` runs only when an `armor` instance is present and
  scans a tiny registry (≤ ~5 entries).
- No additional allocation is introduced on the no-armor damage path.

## Compatibility and migration

- `defensePoints`/`toughness` are optional and default to `0`; no persisted-data
  schema changes. `ItemStack`, `InventorySnapshot`, and `EquipmentSnapshot` shapes
  are unchanged.
- `SurvivalSystem`'s public `damage(amount, reason)` signature and observable
  behavior are unchanged when no `armor` is supplied.

## Security and integrity

- `defensePoints`/`toughness` are read-only data; a crafted item definition with
  huge values is clamped to `20`, so a malformed or hostile client payload cannot
  produce > 80% cap or negative reduction.
- Non-positive or bypass damage never triggers durability wear.

## Observability

- `ArmorProtection.getStats()` exposes current `{ points, toughness }` for HUD/debug
  (later `205-hud-parity`).
- `reduceDamage` returns both `reduced` and `absorbed`, so a debugger can inspect
  how much HP the armor absorbed without re-deriving it.

## Verification mapping

| Requirement | Tests |
|---|---|
| Armor stats aggregation | `ArmorProtection.test.ts` — `computeArmorStats` sum/cap + missing-def |
| Damage reduction (full formula) | `ArmorProtection.test.ts` — tiny/high/toughness scenarios |
| Damage reduction passthrough | `ArmorProtection.test.ts` — `raw=0`, `bypass=true` |
| Durability wear spread | `ArmorProtection.test.ts` — equal wear, break→null, skip non-durable, no-absorb |
| Survival integration | `SurvivalSystem.test.ts` — non-bypass reduce+wear, bypass, unrecognized |
| Regression (no armor) | existing `SurvivalSystem.test.ts` (6 cases) stay green |
| Full gate | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` |
