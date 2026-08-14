# Spec: damage-types

## Contract

`damage-types` defines ResourceId-identified damage types with category flags and
finite, validated application parameters, plus a registry built on the 003 generic
`Registry`. `SurvivalSystem` MUST apply environmental damage using these definitions
and MUST reproduce the current fall/drown/lava/starvation semantics exactly.

## Definitions

- **DamageTypeFlag**: a category/behavior tag (`BYPASS_ARMOR`, `FIRE`, `DROWNING`,
  `FALL`, `STARVATION`, `ENVIRONMENTAL`).
- **DamageTypeKind**: `fall` (distance-scaled), `periodic` (fixed-interval ticks),
  `starvation` (driven by the hunger clock).
- **DamageTypeDefinition**: an immutable data record describing one damage source.
- **DamageTypeRegistry**: a finalized, O(1) lookup registry of definitions.

## Invariants

- Registry ids MUST be unique and ResourceId-keyed.
- `amount`, `interval`, `fallThreshold`, `fallScaling` MUST be finite and >= 0.
- A `fall` type MUST define finite `fallThreshold` and `fallScaling`.
- A `periodic` type MUST define `interval > 0` and `amount >= 0`.
- A `starvation` type MUST define `amount >= 0`.
- Flags MUST belong to the known `DamageTypeFlag` set.

## Requirements

### Requirement: registry construction validates and finalizes definitions
The registry MUST validate every definition (unique id, known flags, finite non-negative
parameters, kind-required fields) and finalize before any lookup.

#### Scenario: accepts the four default types
- **GIVEN** `createDefaultDamageTypeRegistry()`
- **WHEN** `size` is read
- **THEN** it equals 4 and `finalized` is true

#### Scenario: rejects a non-finite amount
- **GIVEN** a definition with `kind: 'periodic'`, `amount: NaN`, `interval: 1`
- **WHEN** the registry is constructed
- **THEN** construction throws and no type becomes resolvable

#### Scenario: rejects an unknown flag
- **GIVEN** a definition with `flags: ['NOPE']`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-flag error

#### Scenario: rejects a fall type missing scaling
- **GIVEN** a `kind: 'fall'` definition without `fallScaling`
- **WHEN** the registry is constructed
- **THEN** construction throws with an invalid-definition error

### Requirement: fall damage scales from the threshold
A `fall` type MUST apply `ceil((landingDistance - fallThreshold) * fallScaling)` when
`landingDistance > fallThreshold`, and MUST apply nothing otherwise.

#### Scenario: fall below threshold
- **GIVEN** `fallThreshold: 3`, `fallScaling: 1.5`
- **WHEN** landingDistance is 3
- **THEN** applied damage is 0

#### Scenario: fall above threshold
- **GIVEN** `fallThreshold: 3`, `fallScaling: 1.5`
- **WHEN** landingDistance is 6
- **THEN** applied damage is ceil((6-3)*1.5) = 5

### Requirement: periodic damage ticks at its interval
A `periodic` type MUST accumulate elapsed time and apply `amount` once per `interval`,
resetting its accumulator; when the source condition is false the accumulator MUST reset.

#### Scenario: drowning ticks every 1.5s for 2
- **GIVEN** a periodic type with `amount: 2`, `interval: 1.5`
- **WHEN** the submerged condition holds for 1.5s
- **THEN** exactly 2 damage is applied and the accumulator resets

#### Scenario: lava ticks every 0.7s for 4
- **GIVEN** a periodic type with `amount: 4`, `interval: 0.7`
- **WHEN** the lava condition holds for 0.7s
- **THEN** exactly 4 damage is applied

### Requirement: SurvivalSystem routes through the registry with identical behavior
`SurvivalSystem` MUST accept an optional `DamageTypeRegistry` and, using the default
registry, MUST reproduce current fall/drown/lava/starvation numbers exactly.

#### Scenario: default construction preserves prior behavior
- **GIVEN** `new SurvivalSystem()`
- **WHEN** it is updated for 1.5s submerged, 0.7s in lava, and a fall of distance 6
- **THEN** outcomes equal the prior literals (drown -> 18, lava -> 16, fall -> <20)

#### Scenario: starvation uses the registry amount
- **GIVEN** a starvation type with `amount: 1`
- **WHEN** hunger is empty and a hunger-clock second elapses
- **THEN** exactly 1 damage is applied (same as before)

## Error and failure behavior

Invalid definitions MUST throw at construction (atomic: no partial registry). A
`SurvivalSystem` constructed with a registry missing a required default key MUST fail
fast at construction, not skip damage silently.

## Performance and resource bounds

Registry lookup is O(1) via the 003 core; per-frame work is unchanged (constant-time
comparisons, one resolution at construction). No allocations in the update hot path.

## Compatibility and migration

`SurvivalSystem`'s public API is unchanged; the new parameter is optional and defaults
to current values. Snapshot/restore schemas are unchanged. No persisted data changes.

## Security and integrity

No external input flows into damage parameters at runtime; definitions are static data.
Validation prevents malformed (non-finite/negative) parameters from entering the system.

## Observability

`damage(amount, reason)` now propagates the damage-type key as `reason`, improving
event context for future debugging without changing computed results.

## Verification mapping

- Registry validation/invariants -> `tests/unit/DamageType.test.ts`
- SurvivalSystem routing + exact preservation -> `tests/unit/SurvivalSystem.test.ts` (existing)
- Full gate -> typecheck, lint, unit, build, e2e
