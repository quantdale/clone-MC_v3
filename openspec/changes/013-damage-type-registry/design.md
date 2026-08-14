# Design: 013-damage-type-registry

## Context / current state

`src/player/SurvivalSystem.ts` applies environmental damage with inline literals:

- Fall: `if (landingDistance > 3) damage(Math.ceil((landingDistance - 3) * 1.5), 'fall')`
- Drowning: when `headSubmerged` accumulates >= 1.5s, `damage(2, 'drowning')` and reset clock.
- Lava: when `inLava` accumulates >= 0.7s, `damage(4, 'lava')` and reset clock.
- Starvation: when `hunger === 0`, each hunger-clock second `damage(1, 'starvation')`.

`damage(amount, _reason)` ignores its reason argument. All parameters are literals.

## Target state

A data-driven `DamageType` model in `src/data/DamageType.ts`. `SurvivalSystem` reads
its damage parameters from a `DamageTypeRegistry`, resolving the four default types at
construction. Default values reproduce the current literals exactly.

## Invariants

- `amount`, `interval`, `fallThreshold`, `fallScaling` MUST be finite, non-negative numbers.
- A `fall` type MUST define `fallThreshold` and `fallScaling`.
- A `periodic` type MUST define `interval > 0` and `amount >= 0`.
- A `starvation` type MUST define `amount >= 0` (driven by the existing hunger clock).
- Each registered id MUST be unique (enforced by the 003 `Registry`).
- Flags MUST be from the known `DamageTypeFlag` set.

## API and data model

```ts
export type DamageTypeFlag =
  | 'BYPASS_ARMOR'   // ignores future armor reduction
  | 'FIRE'           // fire/lava category
  | 'DROWNING'       // drowning category
  | 'FALL'           // fall category
  | 'STARVATION'     // hunger category
  | 'ENVIRONMENTAL'; // source is the world, not an entity

export type DamageTypeKind = 'fall' | 'periodic' | 'starvation';

export interface DamageTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly flags: readonly DamageTypeFlag[];
  readonly kind: DamageTypeKind;
  /** Damage per application (fall uses scaling instead). */
  readonly amount: number;
  /** Seconds between periodic ticks (periodic only). */
  readonly interval?: number;
  /** Safe fall distance before damage (fall only). */
  readonly fallThreshold?: number;
  /** HP lost per block above the threshold (fall only). */
  readonly fallScaling?: number;
}

export class DamageTypeRegistry {
  constructor(definitions: DamageTypeDefinition[]); // validates + finalizes
  get(id: ResourceId): DamageTypeDefinition;
  getOptional(id: ResourceId): DamageTypeDefinition | undefined;
  has(id: ResourceId): boolean;
  size: number;
  finalized: boolean;
  entries(): readonly DamageTypeDefinition[];
}

export function createDefaultDamageTypeRegistry(): DamageTypeRegistry;
```

Default definitions (ids under `minecraft:damage/<key>`):

| key | kind | flags | amount | interval | fallThreshold | fallScaling |
|---|---|---|---|---|---|---|
| fall | fall | [FALL, ENVIRONMENTAL] | 0 | — | 3 | 1.5 |
| drowning | periodic | [DROWNING, ENVIRONMENTAL] | 2 | 1.5 | — | — |
| lava | periodic | [FIRE, ENVIRONMENTAL] | 4 | 0.7 | — | — |
| starvation | starvation | [STARVATION, ENVIRONMENTAL] | 1 | — | — | — |

## Control / data flow

`SurvivalSystem` constructor: `constructor(registry = createDefaultDamageTypeRegistry(), onEvent?)`.
It resolves `fall`, `drowning`, `lava`, `starvation` types by key once and stores them.
`update()` then:

- Fall: `if (landingDistance > fall.fallThreshold) this.damage(ceil((landingDistance - fall.fallThreshold) * fall.fallScaling), fall.key)`
- Drowning: accumulate clock by `d`; when `>= drowning.interval`, reset and `damage(drowning.amount, drowning.key)`; else reset clock to 0 when not submerged.
- Lava: same pattern with `lava`.
- Starvation: unchanged hunger-clock coupling; on the empty-hunger tick, `damage(starvation.amount, starvation.key)` instead of `1`.

`damage(amount, reason)` keeps its existing signature and body; `reason` now carries the
damage-type key (still ignored for computation, used for event context).

## Failure modes

- Non-finite or negative parameters -> `DamageTypeError` (INVALID_VALUE/INVALID_RANGE).
- Unknown kind or missing kind-required fields -> `DamageTypeError` (INVALID_DEFINITION).
- Duplicate id -> `DUPLICATE_ID` (from `Registry`).
- Unknown flag -> `DamageTypeError` (INVALID_FLAG).
- A `get()` for a missing key in `SurvivalSystem` throws, surfacing a misconfigured registry
  at construction (fail-fast) rather than silently skipping damage.

## Compatibility / migration

Public `SurvivalSystem` API unchanged; new parameter optional with current-value defaults.
Snapshot/restore untouched. No persisted data changes.

## Performance / resource constraints

Registry resolution is O(1) via the 003 core; per-frame cost is unchanged (one map lookup
at construction, constant-time comparisons per frame). No allocations in the hot path.

## Testing seams

`tests/unit/DamageType.test.ts` covers validation, the four default types, fall formula,
periodic interval/amount, flag set, and error paths. `SurvivalSystem.test.ts` already pins
exact drow/lava/fall amounts and must remain green.

## Affected files / symbols

- `src/data/DamageType.ts` (new)
- `src/player/SurvivalSystem.ts` (constructor param + data-driven application)
- `tests/unit/DamageType.test.ts` (new)
- no change to `Game.ts` call sites (default arg)

## Rejected alternatives

- Putting the registry in `src/player/`: damage types are data, consistent with 012 attributes
  in `src/data/`.
- Modeling starvation as a fixed-interval periodic type: its rate is coupled to the existing
  hunger clock, so it keeps its own kind and reuses the existing coupling.

## Downstream dependencies

Future combat/effects/armor changes can read `DamageTypeFlag` from a resolved type without
touching `SurvivalSystem`.
