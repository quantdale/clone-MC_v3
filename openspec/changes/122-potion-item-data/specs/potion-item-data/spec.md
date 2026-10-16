# Spec: potion-item-data

## Contract

This capability defines the on-item data model for potions and the pure primitives
that marshal that data into consume/splash effect payloads. It does NOT brew, apply,
or render potions; those are downstream changes (123 brewing, 124 consume, a later
throwable-entity change). All behavior is deterministic and registry-free at the
data layer.

## Definitions

- **PotionKind**: `'NORMAL' | 'SPLASH' | 'LINGERING'`. `NORMAL` is the default.
- **PotionEffectData**: `{ typeId: string; duration: number; amplifier: number }`
  where `typeId` is a `minecraft:effect/<key>` string.
- **PotionContents**: `{ base?: string; kind: PotionKind; customEffects: readonly
  PotionEffectData[] }`.
- **PotionConsumePayload**: `{ effects: readonly PotionEffectData[] }`.
- **PotionSplashPayload**: `{ radius: number; effects: readonly PotionEffectData[] }`.

## Invariants

- A `PotionContents` accepted by `createPotionContents` MUST carry at least one
  `customEffects` entry.
- Within one `PotionContents`, every `customEffects[].typeId` MUST be unique.
- `duration` MUST be `>= 0` and finite; `amplifier` MUST be `>= 0` and finite.
- `getEffectiveEffects`, `buildConsumePayload`, `buildSplashPayload` MUST be pure and
  deterministic.

## Requirements

### Requirement: potion_contents component registration

`potion_contents` (`ResourceId` `minecraft:potion_contents`) MUST be a registered
`StackComponentType` in `createDefaultStackComponentRegistry()`, and
`StackComponentMap.with(POTION_CONTENTS_COMPONENT, value)` MUST validate the value
and reject any value that fails `potionContentsComponentType.validate`.

#### Scenario: valid value is stored and retrievable

- **GIVEN** a `PotionContents` built by `createPotionContents`
- **WHEN** it is stored via `StackComponentMap.with(POTION_CONTENTS_COMPONENT, contents)`
- **THEN** `map.has(POTION_CONTENTS_COMPONENT)` is true and `map.get` returns an equal value

#### Scenario: malformed value is rejected on write

- **GIVEN** a plain object missing `customEffects`
- **WHEN** `StackComponentMap.with(POTION_CONTENTS_COMPONENT, bad)` is called
- **THEN** a `RegistryError` is thrown and the prior map is unchanged

### Requirement: strict factory validation

`createPotionContents` MUST throw a `RegistryError` when `kind` is missing/unknown,
`customEffects` is empty/non-array, any effect has a non-string `typeId`, a non-finite
or `duration < 0`, or a non-finite/`amplifier < 0`, or a duplicate `typeId` occurs,
or `base` is present but not a string. A fractional (non-integer) `amplifier` is NOT
an error — it is floored by the clamping rule below.

#### Scenario: empty effects rejected

- **GIVEN** `createPotionContents({ kind: 'NORMAL', customEffects: [] })`
- **WHEN** it is invoked
- **THEN** it throws a `RegistryError` (reason mentions `potion_contents`)

#### Scenario: duplicate typeId rejected

- **GIVEN** two effects with equal `typeId`
- **WHEN** `createPotionContents` is invoked
- **THEN** it throws a `RegistryError`

#### Scenario: bad duration rejected

- **GIVEN** an effect with `duration: -5`
- **WHEN** `createPotionContents` is invoked
- **THEN** it throws a `RegistryError`

### Requirement: clamping on construction

`createPotionContents` MUST floor `amplifier` to `max(0, floor(amplifier))` before
storing, and MUST set `kind` to `NORMAL` when not supplied. A finite non-negative
`duration` is stored as given (negative duration is rejected, not clamped).

#### Scenario: fractional amplifier is floored

- **GIVEN** an effect with `duration: 3.9` and `amplifier: 2.9`, and no `kind`
- **WHEN** `createPotionContents` is invoked
- **THEN** the stored effect has `duration: 3.9`, `amplifier: 2`, and `kind === 'NORMAL'`

### Requirement: effective effects resolution

`getEffectiveEffects(contents)` MUST return `contents.customEffects` unchanged (this
change does not synthesize from `base`).

#### Scenario: returns custom effects

- **GIVEN** a `PotionContents` with two custom effects
- **WHEN** `getEffectiveEffects` is called
- **THEN** it returns those two effects in order

### Requirement: consume payload

`buildConsumePayload(contents)` MUST return `{ effects: getEffectiveEffects(contents) }`.

#### Scenario: consume payload carries effects

- **GIVEN** a `PotionContents` with effects `[speed, strength]`
- **WHEN** `buildConsumePayload` is called
- **THEN** the result has `effects` of length 2 equal to the custom effects

### Requirement: splash payload

`buildSplashPayload(contents)` MUST return `{ radius, effects }` where `effects` is
`getEffectiveEffects(contents)` and `radius` is `4.0` for `SPLASH`/`LINGERING` and `0`
for `NORMAL`.

#### Scenario: splash radius for throwable kinds

- **GIVEN** a `PotionContents` with `kind: 'SPLASH'`
- **WHEN** `buildSplashPayload` is called
- **THEN** `radius === 4.0` and `effects` equals the custom effects

#### Scenario: normal potion has zero splash radius

- **GIVEN** a `PotionContents` with `kind: 'NORMAL'`
- **WHEN** `buildSplashPayload` is called
- **THEN** `radius === 0`

## Error and failure behavior

- Invalid data reaching `StackComponentMap.with` is rejected by
  `potionContentsComponentType.validate` (throws `RegistryError`), leaving the prior
  immutable map intact.
- `createPotionContents` throws instead of producing a partial/invalid potion; no
  component is written on failure.

## Performance and resource bounds

- `createPotionContents`, `getEffectiveEffects`, `buildConsumePayload`,
  `buildSplashPayload` are O(number of effects) with no registry/IO access and no
  randomness. Safe for per-consume and per-splash construction.

## Compatibility and migration

- Additive: one new component type; no existing component, item, or persisted-schema
  field changed. Serialized form is plain JSON compatible with the existing component
  (de)serialization path.

## Security and integrity

- The component value is validated on every write by `StackComponentMap` and stored
  frozen; downstream consumers MUST NOT trust unvalidated JSON and SHOULD rebuild via
  `createPotionContents` (or re-validate) before use.

## Observability

- `RegistryError` from `createPotionContents` carries a reason prefixed with
  `potion_contents:` for easy diagnosis.

## Verification mapping

| Requirement | Test |
|---|---|
| Registration + validate-on-write | `PotionItemData.test.ts` component round-trip + reject |
| Strict factory validation | invalid-input tests |
| Clamping | clamping test |
| Effective effects | `getEffectiveEffects` test |
| Consume payload | `buildConsumePayload` test |
| Splash payload | `buildSplashPayload` per-kind tests |
| Regression | existing 119/121 suites stay green |
