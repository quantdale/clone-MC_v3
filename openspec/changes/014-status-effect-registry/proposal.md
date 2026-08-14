# Proposal: 014-status-effect-registry

## Problem

Future effects (speed, poison, regeneration, weakness, etc.) need a shared, typed notion
of a status-effect *type* and a serializable *instance* so they can be stored, networked,
and later applied by gameplay systems. Today there is no effect model at all; any future
consumer would invent ad-hoc fields and lose determinism/serializability.

## Goals

- Define ResourceId-identified `StatusEffectType` definitions with category and flags.
- Define a serializable `StatusEffectInstance` (type, remaining duration, amplifier) with
  deterministic ticking and serialize/deserialize round-trips.
- Provide a `StatusEffectTypeRegistry` built on the 003 generic `Registry` core.
- Provide `createDefaultStatusEffectRegistry()` with common effect types (no gameplay yet).
- Validate finite, bounded durations/amplifiers and known flags/ids.

## Non-goals

- No gameplay application of effects (no speed/health/damage changes).
- No entity/player effect manager wiring.
- No combat, attribute, or survival coupling.

## Preconditions

013 is VERIFIED. The 003 `Registry` and 002 `ResourceId` foundations are available.

## Dependencies

- `src/data/Registry.ts` (003)
- `src/data/ResourceId.ts` (002)

## Proposed change

Add `src/data/StatusEffect.ts` with `StatusEffectCategory`, `StatusEffectFlag`,
`StatusEffectTypeDefinition`, `StatusEffectTypeRegistry`, `StatusEffectInstance`
(serializable, tick + serialize/deserialize), and `createDefaultStatusEffectRegistry()`.
Gameplay-free: no consumer is migrated.

## Compatibility and migration

No existing code or persisted data changes. The model is purely additive data.

## Risks

- Over-scoping into gameplay. Mitigated by the explicit non-goal of not applying effects.

## Rollback strategy

Additive data module; reverting the commit removes it with no downstream impact.

## Definition of Done

Effect-type registry, instance serialization/ticking, validation, and tests are complete;
full regression gate is green.

## Advancement gate

015 starts only after 014 is 100% complete and VERIFIED.
