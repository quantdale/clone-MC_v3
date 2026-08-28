# Design: 122-potion-item-data

## Context / current state

- Status effects are a runtime (`src/data/StatusEffectManager.ts`, change 121). A
  manager is constructed from finalized 012/014 registries and exposes `add(typeId,
  duration?, amplifier?)`. It does not know where effects come from.
- Item stacks carry typed data components via `StackComponentMap` /
  `StackComponentRegistry` (119). Existing component types: `DAMAGE_COMPONENT`
  (`minecraft:damage`) and `ENCHANTMENTS_COMPONENT` (`minecraft:enchantments`). Each
  `StackComponentType` has an `id: ResourceId`, a `validate(value: unknown): boolean`,
  and an optional `defaultValue`. `StackComponentMap` validates every value on
  construction and on every `with`, storing it frozen.
- `StackComponentValue` is a primitive or a flat bag of primitives (`number | string |
  boolean | Record<string, number|string|boolean>`), so the potion contents value is
  a flat record (effects as a list of small records), matching the `enchantments`
  precedent of string-keyed/value data.

## Target state

A single new module `src/data/PotionItemData.ts` that:

1. Models potion contents as a flat, serializable component value.
2. Registers a validated `potion_contents` component type in the default registry.
3. Provides pure builders that turn contents into consume/splash payloads.

No gameplay consumer is added; `StatusEffectManager.add` remains the eventual sink.

## Invariants

- `PotionContents.customEffects` is never empty after a successful `createPotionContents`
  (a potion MUST carry at least one effect in this change).
- Every `customEffects[].typeId` is a unique `minecraft:effect/<key>` string within a
  single `PotionContents` (no duplicate effect rows).
- `duration >= 0` and finite; `amplifier >= 0` and finite (floored on store).
- `kind` is one of `NORMAL | SPLASH | LINGERING`; the default is `NORMAL`.
- `getEffectiveEffects`, `buildConsumePayload`, `buildSplashPayload` are pure: same
  input → same output, no randomness, no registry/mutable state access.
- A `PotionContents` accepted by `createPotionContents` MUST also pass
  `potionContentsComponentType.validate` (the factory is the strict path; validate is
  the lenient read-path guard).

## API and data model

```ts
export type PotionKind = 'NORMAL' | 'SPLASH' | 'LINGERING';

export interface PotionEffectData {
  readonly typeId: string;        // e.g. 'minecraft:effect/speed'
  readonly duration: number;      // seconds, >= 0, finite
  readonly amplifier: number;     // >= 0, finite integer
}

export interface PotionContents {
  readonly base?: string;         // opaque base-potion reference name (no synthesis here)
  readonly kind: PotionKind;
  readonly customEffects: readonly PotionEffectData[];
}

export interface PotionConsumePayload {
  readonly effects: readonly PotionEffectData[];
}

export interface PotionSplashPayload {
  readonly radius: number;        // splash/lingering default radius; 0 for NORMAL
  readonly effects: readonly PotionEffectData[];
}
```

Component: `POTION_CONTENTS_COMPONENT = createResourceId('minecraft', 'potion_contents')`.

`potionContentsComponentType.validate(value)`:
- top-level MUST be a non-null object, not an array;
- `kind` MUST be a member of `PotionKind` (default-absent → invalid; factory supplies it);
- `customEffects` MUST be a non-empty array of records each with
  `typeId` string, finite `duration >= 0`, finite integer `amplifier >= 0`;
- `base` if present MUST be a string.

`createDefaultStackComponentRegistry()` adds `potionContentsComponentType`.

## Control / data flow

- Authoring: `createPotionContents({ kind, customEffects, base? })` → validated,
  clamped `PotionContents`.
- Storing: `stack.components.with(POTION_CONTENTS_COMPONENT, contents)` — `StackComponentMap`
  re-validates via `potionContentsComponentType.validate` and freezes the value.
- Reading: `stack.components.get(PotionContents)` → `PotionContents | undefined`.
- Consuming (downstream): `buildConsumePayload(contents)` → `{ effects }`; the consumer
  calls `manager.add(effect.typeId, effect.duration, effect.amplifier)` per effect.
- Splashing (downstream): `buildSplashPayload(contents)` → `{ radius, effects }`; the
  consumer spawns an entity using `radius` and applies `effects` to entities in range.

## Detailed behavior

- `createPotionContents`:
  - throws `RegistryError('INVALID_ID', ..., 'potion_contents: ...')` for:
    - missing/unknown `kind`;
    - empty/non-array `customEffects`;
    - a single effect with non-string `typeId`, non-finite or `duration < 0`, or
      non-finite/`amplifier < 0`;
    - duplicate `typeId` across `customEffects`;
    - `base` present but not a string.
  - floors `amplifier = max(0, floor(amplifier))` before storing; a finite
    non-negative `duration` is stored as given. Downstream therefore never sees a
    fractional or negative amplifier.
- `getEffectiveEffects(contents)`: returns `contents.customEffects` unchanged (this
  change does not synthesize from `base`).
- `buildConsumePayload(contents)`: `{ effects: getEffectiveEffects(contents) }`.
- `buildSplashPayload(contents)`:
  - radius = `kind === 'NORMAL' ? 0 : 4.0`;
  - `{ radius, effects: getEffectiveEffects(contents) }`.

## Failure modes

- Malformed value reaching `StackComponentMap.with` is rejected by
  `potionContentsComponentType.validate` (throws `RegistryError`), leaving the prior
  component map intact (immutable builder pattern).
- `createPotionContents` throws instead of storing a partial/invalid potion.
- Duplicate `typeId` rejection prevents ambiguous stacking later.

## Compatibility / migration

- Additive. No changes to `StackDataComponents.ts` beyond importing and registering the
  new type. No persisted-schema field changes. Existing 119/121 tests stay green.

## Performance / resource constraints

- Builders are O(effects). No allocation beyond the payload objects. No hot-path
  mutation. Suitable for per-consume and per-splash construction.

## Testing seams

- Pure functions with no registry/IO dependency → trivially unit-testable.
- `StackComponentMap` integration: store/retrieve via the default registry.

## Observability / debugging

- Invalid data produces a `RegistryError` carrying the component id and a reason
  string; `createPotionContents` reason prefixes with `potion_contents:`.

## Affected files / symbols

- NEW `src/data/PotionItemData.ts`: all symbols above.
- EDIT `src/inventory/StackDataComponents.ts`: import + register `potionContentsComponentType`
  in `createDefaultStackComponentRegistry`.

## Rejected alternatives

- Storing `ResourceId` objects inside the component value: `StackComponentValue`
  forbids nested objects of `ResourceId`; string typeIds keep the value flat and
  serializable, mirroring `enchantments` (string keys).
- Folding effect synthesis from `base` into this change: that needs the recipe/brew
  table (123); keeping `base` opaque limits scope to data + payload primitives.

## Downstream dependencies

- 123 brewing stand synthesizes `customEffects` (and possibly `base`) and writes the
  component onto brewed stacks.
- 124 consume/food runtime calls `buildConsumePayload` and applies effects via 121.
- A later entity/throwable change calls `buildSplashPayload`.
