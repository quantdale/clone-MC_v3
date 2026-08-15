# Spec: status-effect-runtime

## Contract

Provide a deterministic, serializable runtime that holds the set of active status
effects for one entity, applies duration ticking and amplifier/duration stacking, and
maps active effects to attribute modifiers from the 012 attribute model. Player/entity
consumers are out of scope; the manager only exposes attribute instances and surfaces
expired (including INSTANT) effects.

## Definitions

- **Active effect**: a `StatusEffectInstance` (014) currently owned by the manager,
  keyed by its effect-type `ResourceId`.
- **Hook**: a mapping from an effect-type `ResourceId` to one attribute modifier
  (`attribute`, `operation`, `amount(amplifier)`) applied while that effect is active.
- **Stacking**: the deterministic merge applied when `add` is called for a type that is
  already active.

## Invariants

- At most one active instance per effect type.
- Every active instance's `amplifier` is within `[0, type.maxAmplifier]` and its
  `duration` is finite and `>= 0`, clamped to `type.maxDuration` when present.
- The set of active attribute modifiers equals exactly the set of hooked active effects.
- A hook's modifier id is the effect type's `ResourceId`, guaranteeing uniqueness within
  an attribute instance.
- `serialize` / `deserialize` round-trip the active list exactly; `deserialize` is
  atomic.

## Requirements

### Requirement: Manager construction
The manager MUST accept an `StatusEffectTypeRegistry` and an `AttributeRegistry`, build
a per-entity `AttributeInstance` for every attribute definition, and expose them via
`getAttribute(id)` and `attributes()`.

### Requirement: Add resolves and clamps
`add(typeId, duration?, amplifier?)` MUST resolve `typeId` through the effect registry
(strict; an unregistered id MUST throw) and MUST clamp the incoming duration to
`[0, type.maxDuration]` and the amplifier to `[0, type.maxAmplifier]`.

#### Scenario: add a new effect
- **GIVEN** an empty manager
- **WHEN** `add(speed, 100, 1)` is called
- **THEN** `get(speed)` returns an instance with `duration == 100` and `amplifier == 1`

#### Scenario: add with missing type throws
- **GIVEN** a manager
- **WHEN** `add(unknownType)` is called
- **THEN** a `StatusEffectError` is thrown and no effect is stored

#### Scenario: amplifier above max is clamped
- **GIVEN** `speed` has `maxAmplifier == 2`
- **WHEN** `add(speed, 100, 9)` is called
- **THEN** the stored instance has `amplifier == 2`

### Requirement: One instance per type
The manager MUST hold at most one active instance per effect type; `add` for an active
type MUST replace/merge the existing instance rather than create a second.

#### Scenario: re-add replaces, does not duplicate
- **GIVEN** `add(speed, 100, 1)` is active
- **WHEN** `add(speed, 50, 0)` is called
- **THEN** `getAll()` contains exactly one `speed` instance

### Requirement: Stacking rule
On re-application, `amplifier` MUST become `max(current, incoming)`. If the incoming
amplifier is greater than the current, `duration` MUST become the incoming duration;
otherwise `duration` MUST become `max(current, incoming)` (never shortening).

#### Scenario: stronger amplifier refreshes duration
- **GIVEN** `add(speed, 100, 1)` is active (duration 100)
- **WHEN** `add(speed, 30, 2)` is called
- **THEN** the instance has `amplifier == 2` and `duration == 30`

#### Scenario: equal/weaker amplifier keeps longer duration
- **GIVEN** `add(speed, 100, 2)` is active (duration 100)
- **WHEN** `add(speed, 30, 2)` is called
- **THEN** the instance has `amplifier == 2` and `duration == 100`

#### Scenario: weaker amplifier does not shorten
- **GIVEN** `add(speed, 100, 2)` is active
- **WHEN** `add(speed, 30, 1)` is called
- **THEN** the instance has `amplifier == 2` and `duration == 100`

### Requirement: Attribute hook applied
When an active effect has a hook row, the manager MUST add a `Modifier` to the target
attribute instance with `id = effectType.id`, the configured `operation`, and
`amount = hook.amount(amplifier)`. The attribute `value` MUST reflect the modifier.

#### Scenario: speed multiplies movement speed
- **GIVEN** `movement_speed` base is `0.1`
- **WHEN** `add(speed, 180, 1)` is applied (hook `MULTIPLY_TOTAL` `0.20*amp`)
- **THEN** `getAttribute(movement_speed).value` equals `0.1 * (1 + 0.2)`

#### Scenario: strength adds attack damage
- **GIVEN** `attack_damage` base is `1`
- **WHEN** `add(strength, 180, 1)` is applied (hook `ADD_VALUE` `3*amp`)
- **THEN** `getAttribute(attack_damage).value` equals `4`

### Requirement: Hook removed on remove/expiry
When an effect is removed (explicitly or by expiry), the manager MUST remove its
attribute modifier. The attribute `value` MUST return to its prior state.

#### Scenario: removing speed restores base
- **GIVEN** `add(speed, 180, 1)` is active and `movement_speed.value == 0.12`
- **WHEN** `remove(speed)` is called
- **THEN** `getAttribute(movement_speed).value` equals the base `0.1` and `get(speed)` is undefined

### Requirement: Re-apply re-hooks on amplifier change
When an effect is re-applied with a different amplifier, the manager MUST remove the
prior hook and apply a hook reflecting the new amplifier.

#### Scenario: amplifier change updates hook value
- **GIVEN** `add(speed, 180, 1)` is active (`movement_speed.value == 0.12`)
- **WHEN** `add(speed, 180, 2)` is applied
- **THEN** `getAttribute(movement_speed).value` equals `0.1 * (1 + 0.4)`

### Requirement: Ticking decrements and expires
`tick(dt)` MUST ignore non-finite or negative `dt`. Otherwise it MUST decrement every
active instance, remove every instance that becomes `expired`, remove its hook, and
return the expired instances.

#### Scenario: duration-based effect expires and unhooks
- **GIVEN** `add(speed, 1, 1)` is active (`movement_speed.value == 0.12`)
- **WHEN** `tick(1.0)` is called
- **THEN** the returned list contains the speed instance, `get(speed)` is undefined, and
  `getAttribute(movement_speed).value == 0.1`

#### Scenario: bad dt is a no-op
- **GIVEN** an active effect with `duration == 10`
- **WHEN** `tick(NaN)` or `tick(-1)` is called
- **THEN** the duration is unchanged and nothing expires

### Requirement: INSTANT effects surface
An `INSTANT` effect (duration 0) MUST be stored on `add`, MUST expire on the first
`tick`, and MUST be included in the `tick` return so a consumer can apply the one-shot.
Its hook (if any) MUST be removed on expiry.

#### Scenario: instant expires on first tick
- **GIVEN** an `INSTANT` type `x` with a hook is added
- **WHEN** `tick(0.1)` is called
- **THEN** the returned list contains `x`, `get(x)` is undefined, and the hook is removed

### Requirement: Serialization round-trip
`serialize()` MUST return the plain data of every active instance; `deserialize(data)`
MUST restore the same active set and re-apply every hook. `deserialize` MUST be atomic:
a malformed or unregistered entry MUST throw before mutating state.

#### Scenario: round-trip
- **GIVEN** `add(speed, 120, 1)` and `add(strength, 90, 2)` are active
- **WHEN** `deserialize(serialize())` is called
- **THEN** the active set and attribute values are identical to before

#### Scenario: atomic deserialize failure
- **GIVEN** a manager with one active effect
- **WHEN** `deserialize([{ typeId: 'minecraft:effect/missing', duration: 1, amplifier: 0 }])` is called
- **THEN** a `StatusEffectError` is thrown and the prior active set is unchanged

## Error and failure behavior

- Unregistered effect id on `add` -> `StatusEffectError` via the registry.
- Non-finite/negative `dt` on `tick` -> no-op.
- Malformed/unregistered entry on `deserialize` -> `StatusEffectError`, prior state kept.
- `remove` of an absent effect -> returns `false`, no hook change.

## Performance and resource bounds

- `add`/`get`/`remove` are O(1). `tick` is O(active effects). No randomness. Attribute
  `value` is cached (012) and invalidated on modifier change. No large allocations per
  tick.

## Compatibility and migration

012/014 contracts are unchanged. No persisted data or call sites change. The hook table
is new data in the 121 module only.

## Security and integrity

No external input is processed directly; all effect ids are resolved against the
registry. `deserialize` validates before mutating. No `Math.random` in the runtime.

## Observability

`getAll()` and `attributes()` expose the full active state for debugging and tests.

## Verification mapping

| Requirement | Test |
|---|---|
| Manager construction | `StatusEffectManager.test.ts` construction + `attributes()` |
| Add resolves/clamps | add new / missing type throws / amplifier clamp |
| One instance per type | re-add replaces |
| Stacking rule | stronger refreshes / equal keeps / weaker keeps |
| Attribute hook applied | speed multiplies / strength adds |
| Hook removed | remove restores base |
| Re-apply re-hooks | amplifier change updates value |
| Ticking | duration expires + unhooks / bad dt no-op |
| INSTANT surfaces | instant expires on first tick |
| Serialization | round-trip / atomic failure |
