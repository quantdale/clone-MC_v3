# Design: 121-status-effect-runtime

## Context / current state

- 012 provides `AttributeRegistry` + `AttributeInstance`: a per-instance base value plus
  uniquely-identified modifiers (`ADD_VALUE`, `ADD_BASE_FRACTION`, `MULTIPLY_TOTAL`),
  deterministically combined and clamped. No gameplay consumer is wired to it.
- 014 provides `StatusEffectTypeRegistry` + `StatusEffectInstance`: immutable type
  records and a live, serializable instance with `duration`, `amplifier`, `tick(dt)`,
  and `serialize` / `deserialize`. The instance `tick` only decrements duration. There
  is no manager, no application, and no attribute hook.
- No component holds a *set* of active effects for an entity, performs stacking, or
  reflects effects in attribute values.

## Target state

`src/data/StatusEffectManager.ts` with a `StatusEffectManager` that:

- owns the active effect set for one entity (keyed by effect-type `ResourceId`);
- holds a per-entity `Map<ResourceId, AttributeInstance>` derived from the attribute
  registry;
- applies/removes attribute modifiers via an `EFFECT_ATTRIBUTE_HOOKS` table as effects
  come and go;
- ticks durations, expires finished effects, and removes their hooks;
- serializes/deserializes the active list losslessly and re-applies hooks on restore.

## Invariants

- At most one active instance per effect type (keyed by type id).
- `amplifier` of any active instance MUST stay within `[0, type.maxAmplifier]`.
- `duration` MUST stay finite and `>= 0`, clamped to `type.maxDuration` when present.
- The attribute modifier produced by an effect MUST use the effect type's `ResourceId`
  as its modifier id, so it is unique within each attribute instance.
- The set of active attribute modifiers MUST exactly mirror the set of hooked active
  effects: adding an effect adds its hook, removing/expiring it removes its hook.
- `serialize` / `deserialize` MUST round-trip the active list exactly; `deserialize`
  MUST re-apply every hook and MUST be atomic (a malformed entry MUST NOT leave a
  partially-hooked or partially-stored state).
- `tick(dt)` MUST ignore non-finite or negative `dt` (no-op) and MUST NOT mutate on
  bad input.

## API and data model

```ts
import type { ResourceId } from '../../src/data/ResourceId';
import {
  StatusEffectTypeRegistry,
  StatusEffectInstance,
  type StatusEffectInstanceData,
} from '../../src/data/StatusEffect';
import {
  AttributeRegistry,
  AttributeInstance,
  type AttributeOperation,
  type Modifier,
} from '../../src/data/AttributeRegistry';

/** Maps one effect type to a single attribute modifier applied while it is active. */
export interface EffectAttributeHook {
  readonly attribute: ResourceId;
  readonly operation: AttributeOperation;
  /** Finite amount as a function of the active amplifier (>= 0). */
  readonly amount: (amplifier: number) => number;
}

export class StatusEffectManager {
  constructor(
    effectRegistry: StatusEffectTypeRegistry,
    attributeRegistry: AttributeRegistry,
    hooks?: Readonly<Record<string, EffectAttributeHook>>,
  );

  /** Active instance for a type, or undefined. */
  get(typeId: ResourceId): StatusEffectInstance | undefined;
  /** All active instances (deterministic order). */
  getAll(): readonly StatusEffectInstance[];
  /** Add (or stack onto) an effect. Returns the resulting active instance. */
  add(typeId: ResourceId, duration?: number, amplifier?: number): StatusEffectInstance;
  /** Remove an active effect and its hook. Returns false when not present. */
  remove(typeId: ResourceId): boolean;
  /** Remove all effects and hooks. */
  clear(): void;
  /** Advance every effect by `dt` seconds; expired effects are removed + unhooked. */
  tick(dt: number): readonly StatusEffectInstance[]; // the instances that expired
  /** Per-entity attribute instance for `id`, or undefined if not registered. */
  getAttribute(id: ResourceId): AttributeInstance | undefined;
  /** All per-entity attribute instances. */
  attributes(): readonly AttributeInstance[];
  /** Plain serializable form of every active effect. */
  serialize(): StatusEffectInstanceData[];
  /** Restore from serialized data, re-applying hooks atomically. */
  deserialize(data: readonly StatusEffectInstanceData[]): void;
}
```

The default `EFFECT_ATTRIBUTE_HOOKS` maps effect types onto the 012 attributes that
exist today:

| Effect (`minecraft:effect/<key>`) | Attribute (`minecraft:generic/...`) | Operation | Amount(amp) |
|---|---|---|---|
| `speed` | `movement_speed` | `MULTIPLY_TOTAL` | `0.20 * amp` |
| `slowness` | `movement_speed` | `MULTIPLY_TOTAL` | `-0.15 * amp` |
| `strength` | `attack_damage` | `ADD_VALUE` | `3 * amp` |
| `weakness` | `attack_damage` | `ADD_VALUE` | `-4 * amp` |
| `health_boost` | `max_health` | `ADD_VALUE` | `4 * amp` |
| `haste` | `attack_speed` | `MULTIPLY_TOTAL` | `0.10 * amp` |
| `mining_fatigue` | `attack_speed` | `MULTIPLY_TOTAL` | `-0.10 * amp` |

Effects without a hook row (resistance, luck, poison, regeneration, invisibility,
night_vision, fire_resistance, water_breathing, absorption, glowing, levitation,
bad_omen, hero_of_the_village, conduit_power, dolphins_grace, saturation) are still
managed, ticked, stacked, and persisted; they simply do not modify an attribute in
121. Attribute hooks for those effects are deferred to the change that integrates
their concrete behavior.

## Control / data flow

- Construction: validate registries (already finalized by 012/014), build an attribute
  instance per attribute definition, and store the hook table (default merged with any
  caller-supplied overrides). The manager owns no randomness.
- `add(typeId, duration?, amplifier?)`:
  1. Resolve the type via the effect registry (strict; unknown id throws).
  2. Compute the incoming instance values: `dur = duration ?? type.defaultDuration ?? 0`
     (clamped to `type.maxDuration`), `amp = amplifier ?? 0` (clamped to
     `type.maxAmplifier`).
  3. If an instance of this type already exists, merge per the stacking rule (below);
     otherwise use the incoming values.
  4. Remove any existing hook for this type, store/replace the instance, then apply the
     hook for the merged amplifier.
- Stacking rule (deterministic): let `cur` = existing, `nxt` = incoming (after clamp).
  - `amplifier = max(cur.amplifier, nxt.amplifier)`.
  - `duration`:
    - if `nxt.amplifier > cur.amplifier`: `duration = nxt.duration` (a stronger effect
      refreshes and may extend the timer);
    - else (equal or weaker amplifier): `duration = max(cur.duration, nxt.duration)`
      (never shorten an active effect).
  - The result is clamped to `[0, type.maxDuration]`.
- `tick(dt)`: ignore non-finite/negative `dt`; for each active instance call
  `instance.tick(dt)`; collect instances whose `expired` is now true, `remove` each
  (which also removes its hook), and return them.
- `serialize`: map every active instance through `instance.serialize()`.
- `deserialize(data)`: validate every entry against the registry into a temporary list,
  then (only after all entries are valid) clear the current state and re-add each via
  `add`, which re-applies hooks. A malformed entry throws before any mutation.

## Detailed behavior

- Hook apply: for a hooked effect, add a `Modifier` to the target attribute instance with
  `id = effectType.id`, `operation = hook.operation`, `amount = hook.amount(amplifier)`.
  Because the modifier id equals the effect-type id, a later `remove`/re-apply cleanly
  removes or re-adds it.
- Hook remove: `attributeInstance.removeModifier(effectType.id)`.
- When an amplifier changes on re-apply, the hook is removed and re-added so the
  attribute value reflects the new amplifier.

## Failure modes

- `add` with an unregistered effect id -> throws `StatusEffectError` (via the registry).
- `add` / `tick` ignore non-finite/negative duration/amplifier/dt (no-op / clamp).
- `deserialize` with an unregistered type id or malformed data -> throws
  `StatusEffectError`; prior state preserved (atomic).
- `remove` of an absent effect -> returns `false`, no hook change.

## Compatibility / migration

Purely additive. 012/014 contracts unchanged. No persisted data or call sites change.

## Performance / resource constraints

- `add` / `get` / `remove` are O(1) map operations.
- `tick` is O(active effects); modifier removal is O(1) on the attribute instance.
- Attribute `value` is cached and invalidated on modifier change (012).
- No allocations beyond small objects; no randomness; safe per simulation step.

## Testing seams

`tests/unit/StatusEffectManager.test.ts` covers: construction, add/get/remove/clear,
stacking (amplifier up/down, duration refresh/keep), attribute hook apply/remove and
value reflection, re-apply amplifier change re-hooks, `INSTANT` expiry + surfacing,
serialization round-trip, atomic `deserialize` failure, and full regression against the
012/014 registries.

## Affected files / symbols

- `src/data/StatusEffectManager.ts` (new)
- `tests/unit/StatusEffectManager.test.ts` (new)
- No changes to `src/data/StatusEffect.ts` or `src/data/AttributeRegistry.ts`.

## Rejected alternatives

- Mutating 014's `StatusEffectTypeDefinition` to carry attribute hooks: violates scope
  discipline (014 is VERIFIED) and couples data to one consumer. A separate hook table
  keeps 014 intact.
- Storing attribute modifiers on the effect instance: the attribute instance is the
  source of truth for `value`; the manager pushes/pulls modifiers from it.
- Wiring player movement/damage to read the manager in 121: out of scope per the
  sequence ("runtime" only); consumers integrate later.

## Downstream dependencies

Later changes wire the player's `StatusEffectManager` into `Game`, read movement/attack
attributes from it, and implement concrete instant/tick behaviors (heal, damage,
levitation, rendering).
