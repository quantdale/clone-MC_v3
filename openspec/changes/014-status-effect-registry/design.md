# Design: 014-status-effect-registry

## Context / current state

No status-effect model exists. This change introduces the data model only.

## Target state

`src/data/StatusEffect.ts` with a typed effect-type registry and a serializable, ticking
effect instance. Gameplay consumers are intentionally out of scope.

## Invariants

- `defaultDuration`/`maxDuration`/`duration` MUST be finite and >= 0.
- `maxAmplifier` MUST be finite and >= 0; `amplifier` MUST be in `[0, maxAmplifier]`.
- `category` MUST be one of `BENEFICIAL`/`HARMFUL`/`NEUTRAL`.
- `flags` MUST be from the known `StatusEffectFlag` set.
- Ids MUST be unique (enforced by the 003 `Registry`).
- An `INSTANT` type MUST NOT be persisted as a ticking instance (no duration).
- Serialization round-trips exactly: `deserialize(serialize(instance), registry) == instance`.

## API and data model

```ts
export type StatusEffectCategory = 'BENEFICIAL' | 'HARMFUL' | 'NEUTRAL';

export type StatusEffectFlag =
  | 'BENEFICIAL'
  | 'HARMFUL'
  | 'INSTANT'
  | 'DURATION_BASED'
  | 'AMPLIFIER_SCALES';

export interface StatusEffectTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: StatusEffectCategory;
  readonly flags: readonly StatusEffectFlag[];
  readonly defaultDuration?: number;
  readonly maxDuration?: number;
  readonly maxAmplifier?: number;
}

export class StatusEffectTypeRegistry {
  constructor(definitions: StatusEffectTypeDefinition[]); // validates + finalizes
  get(id): StatusEffectTypeDefinition;
  getOptional(id): StatusEffectTypeDefinition | undefined;
  has(id): boolean;
  size: number;
  finalized: boolean;
  entries(): readonly StatusEffectTypeDefinition[];
}

export interface StatusEffectInstanceData {
  typeId: string;   // resourceId string
  duration: number;  // remaining seconds
  amplifier: number; // level
}

export class StatusEffectInstance {
  constructor(type: StatusEffectTypeDefinition, duration?: number, amplifier?: number);
  readonly type: StatusEffectTypeDefinition;
  get duration(): number;
  get amplifier(): number;
  get expired(): boolean;       // duration <= 0 (or INSTANT)
  tick(dt: number): void;       // reduces duration; clamps at 0
  serialize(): StatusEffectInstanceData;
  static deserialize(data, registry): StatusEffectInstance;
}
```

Default types (ids `minecraft:effect/<key>`): speed, slowness, strength, weakness,
poison, regeneration, fire_resistance, water_breathing, invisibility, night_vision,
health_boost, absorption, haste, mining_fatigue, resistance, saturation, glowing,
levitation, luck, unluck, bad_omen, hero_of_the_village, conduit_power, dolphins_grace.
Each carries a category, appropriate flags, default/max duration, and maxAmplifier (0..N).
No gameplay behavior is attached; these are data placeholders for future consumers.

## Control / data flow

- Registry construction validates each definition (unique id, known flags, finite
  non-negative durations, `maxAmplifier >= 0`, matching category) and finalizes.
- `StatusEffectInstance` is constructed from a resolved type, an optional duration
  (defaulting to the type's `defaultDuration`, or 0 for `INSTANT`), and an optional
  amplifier (default 0, clamped to `maxAmplifier`). `tick(dt)` reduces duration (never
  below 0); `expired` is true when duration <= 0. `serialize()` returns plain data;
  `deserialize()` re-resolves the type by id from the registry and reconstructs the
  instance, validating the id is registered.

## Failure modes

- Non-finite/negative duration or amplifier -> `StatusEffectError` (INVALID_VALUE).
- Amplifier above `maxAmplifier` -> INVALID_VALUE.
- Unknown flag, bad category, missing `defaultDuration` on a `DURATION_BASED` type,
  or duplicate id -> appropriate error (INVALID_FLAG / INVALID_DEFINITION / DUPLICATE_ID).
- `deserialize` with an unregistered `typeId` -> INVALID_REFERENCE.

## Compatibility / migration

Purely additive. No persisted data or call sites change.

## Performance / resource constraints

Registry lookup O(1) via the 003 core. Instance ticking is O(1) arithmetic. Serialization
is plain-object copy. No allocations beyond small objects.

## Testing seams

`tests/unit/StatusEffect.test.ts` covers type validation, default registry contents,
instance construction/clamping, ticking, expiry, and serialize/deserialize round-trip.

## Affected files / symbols

- `src/data/StatusEffect.ts` (new)
- `tests/unit/StatusEffect.test.ts` (new)

## Rejected alternatives

- Putting it under `src/player/` or `src/world/`: effect types are data, consistent with
  012 attributes and 013 damage types in `src/data/`.
- Modeling gameplay application now: explicitly out of scope per the sequence ("without
  gameplay effects yet").

## Downstream dependencies

Future effect-manager/attribute work can resolve types and instantiate serializable
effects from this registry without defining their own schema.
