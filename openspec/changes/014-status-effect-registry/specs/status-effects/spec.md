# Spec: status-effects

## Contract

`status-effects` defines ResourceId-identified status-effect *types* with category and
flags, a `StatusEffectTypeRegistry` on the 003 generic `Registry`, and a serializable,
deterministically ticking `StatusEffectInstance`. No gameplay application is included.

## Definitions

- **StatusEffectCategory**: `BENEFICIAL` | `HARMFUL` | `NEUTRAL`.
- **StatusEffectFlag**: `BENEFICIAL` | `HARMFUL` | `INSTANT` | `DURATION_BASED` | `AMPLIFIER_SCALES`.
- **StatusEffectTypeDefinition**: immutable data describing one effect type.
- **StatusEffectInstance**: a live, serializable occurrence of a type with remaining
  duration and amplifier.

## Invariants

- `defaultDuration`, `maxDuration`, `duration` MUST be finite and >= 0.
- `maxAmplifier` MUST be finite and >= 0; `amplifier` MUST be within `[0, maxAmplifier]`.
- `category` MUST be `BENEFICIAL`/`HARMFUL`/`NEUTRAL`.
- `flags` MUST belong to the known set; `INSTANT` types MUST NOT carry a duration.
- Registry ids MUST be unique.

## Requirements

### Requirement: registry construction validates and finalizes types
The registry MUST validate every definition (unique id, known flags, finite non-negative
durations, `maxAmplifier >= 0`, valid category) and finalize before lookup.

#### Scenario: accepts the default type set
- **GIVEN** `createDefaultStatusEffectRegistry()`
- **WHEN** `size` is read
- **THEN** it is > 0 and `finalized` is true

#### Scenario: rejects a non-finite maxDuration
- **GIVEN** a definition with `maxDuration: NaN`
- **WHEN** the registry is constructed
- **THEN** construction throws

#### Scenario: rejects an unknown flag
- **GIVEN** a definition with `flags: ['NOPE']`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-flag error

### Requirement: instances derive duration and clamp amplifier
`StatusEffectInstance` MUST default duration to the type's `defaultDuration` (0 for
`INSTANT`), and MUST clamp the amplifier to `[0, maxAmplifier]`.

#### Scenario: defaults duration from the type
- **GIVEN** a `DURATION_BASED` type with `defaultDuration: 30`
- **WHEN** an instance is created without a duration
- **THEN** its duration is 30

#### Scenario: clamps amplifier to max
- **GIVEN** a type with `maxAmplifier: 2`
- **WHEN** an instance is created with `amplifier: 5`
- **THEN** the instance's amplifier is 2

### Requirement: instances tick deterministically and expire
`tick(dt)` MUST reduce `duration` by `dt` (clamped at 0); `expired` MUST be true when
`duration <= 0`.

#### Scenario: ticks to expiry
- **GIVEN** an instance with duration 1.0
- **WHEN** `tick(0.6)` then `tick(0.6)`
- **THEN** duration is 0 and `expired` is true

### Requirement: instances serialize and deserialize round-trip
`serialize()` MUST return plain data resolvable by `deserialize(data, registry)` to an
equal instance; an unregistered `typeId` MUST be rejected.

#### Scenario: round-trip equality
- **GIVEN** an instance of a registered type
- **WHEN** it is serialized then deserialized with the same registry
- **THEN** the result equals the original (type, duration, amplifier)

#### Scenario: rejects unregistered type id
- **GIVEN** serialized data with a `typeId` not in the registry
- **WHEN** `deserialize` is called
- **THEN** it throws an invalid-reference error

## Error and failure behavior

Invalid definitions MUST throw at construction (atomic). `deserialize` MUST reject
unregistered type ids. Amplifier clamping is silent (bounded), not an error.

## Performance and resource bounds

Registry lookup O(1); ticking O(1); serialization is a plain-object copy. No per-frame
allocations beyond small objects.

## Compatibility and migration

Purely additive data; no persisted or call-site changes.

## Security and integrity

Definitions are static data; serialization uses only the registered id, preventing
injection of unknown effect types on deserialize.

## Observability

`serialize()` produces a stable, inspectable representation for future save/network use.

## Verification mapping

- Registry/instance validation, ticking, serialization -> `tests/unit/StatusEffect.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
