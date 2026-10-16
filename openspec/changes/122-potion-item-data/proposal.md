# Proposal: 122-potion-item-data

## Problem

The game has no representation of potion contents. Status effects exist as a runtime
(change 121: `StatusEffectManager`) but nothing yet describes *which* effects a
potion carries, how they are stored on an item stack, or how a consumable/splash
action turns those contents into a concrete set of effects to apply. Without this
data layer, brewing (123) and consumption (124) cannot be built.

## Goals

- Define a serializable `potion_contents` stack component describing the effects a
  potion carries (base potion name, potion `kind`, and a list of custom effects).
- Define pure, deterministic primitives that turn potion contents into:
  - a **consume payload** — the effect instances to add to a target's
    `StatusEffectManager` when the potion is drunk;
  - a **splash payload** — the effect instances + radius for a thrown/splash potion
    entity (consumed by a later change; not wired to any entity here).
- Register the component in the default stack-component registry so it survives the
  existing immutable `StackComponentMap` contract (validate-on-write, frozen values).

## Non-goals

- No brewing recipes, stand block entity, or fuel timing (123).
- No food/hunger component or auto-application on eat (124).
- No DOM/UI for a brewing stand or inventory potion view.
- No `Game`/`Player`/`Entity` wiring that actually applies a consume/splash payload.
  This change produces the *data and payload primitives only*; application is
  downstream.
- No new item ids for potion items. Potion item definitions (drinkable/splash) are
  added by a later change that consumes these primitives.

## Preconditions

- Change 121 (`status-effect-runtime`) is VERIFIED and published; `StatusEffectManager`
  (`src/data/StatusEffectManager.ts`) is available as the consumer of effect payloads.
- The stack-component model (119/008/009) is in place: `StackComponentMap`,
  `StackComponentRegistry`, `StackComponentType`, and `createDefaultStackComponentRegistry`.

## Dependencies

- 121 `StatusEffectManager` (effect instance shape: `typeId`, `duration`, `amplifier`).
- 014 `StatusEffectTypeRegistry` (effect type resolution) — used by downstream
  consumers, not by this change's pure primitives (which only marshal data).

## Proposed change

Add `src/data/PotionItemData.ts`:

- `PotionKind` enum: `NORMAL | SPLASH | LINGERING`.
- `PotionEffectData`: `{ typeId: string; duration: number; amplifier: number }`
  (typeId stored as a `minecraft:effect/<key>` string for serializability).
- `PotionContents`: `{ base?: string; kind: PotionKind; customEffects: PotionEffectData[] }`.
- `createPotionContents(...)`: strict factory that validates and clamps
  (duration `>= 0`, finite; amplifier `>= 0` integer; unique typeIds; at least one
  effect when `customEffects` is given), throwing a `RegistryError` on violation.
- `POTION_CONTENTS_COMPONENT`: `ResourceId` (`minecraft:potion_contents`).
- `potionContentsComponentType`: `StackComponentType` whose `validate` enforces the
  shape (including non-empty `customEffects`).
- Registered in `createDefaultStackComponentRegistry()`.
- `getEffectiveEffects(contents): PotionEffectData[]` — resolves the final effect list
  (customEffects; base potion reference is a name only and does not synthesize effects
  in this change).
- `buildConsumePayload(contents): PotionConsumePayload` where
  `PotionConsumePayload = { effects: PotionEffectData[] }` — the effects a drink adds.
- `buildSplashPayload(contents): PotionSplashPayload` where
  `PotionSplashPayload = { radius: number; effects: PotionEffectData[] }` — a sensible
  default radius for `SPLASH`/`LINGERING` (e.g. 4.0), `0` for `NORMAL`.

## Compatibility and migration

- New additive component; no existing component, item, or persisted-schema field is
  modified. `StackComponentMap` already validates on write and stores values frozen,
  so the new component is transparent to existing storage/serialization paths.
- Serialized form is plain JSON (`base?`, `kind`, `customEffects[]`); it degrades
  cleanly through the existing component (de)serialization.

## Risks

- A malformed `PotionContents` could pass `validate` and later break a consumer.
  Mitigated by a strict `createPotionContents` factory and a thorough `validate`
  function; consumers MUST build through the factory or re-validate on read.
- `base` potion name is opaque to this change (no recipe table yet). Documented as a
  reference key only; effect synthesis from `base` is 123's concern.

## Rollback strategy

- Single additive file + one registry registration line. Reverting the commit removes
  the component and its tests with no impact on prior changes.

## Definition of Done

- `potion_contents` component registered and validated by `StackComponentMap`.
- `createPotionContents` clamps/validates inputs and rejects malformed data.
- `getEffectiveEffects`, `buildConsumePayload`, `buildSplashPayload` are pure and
  deterministic.
- Unit tests cover construction, clamping, uniqueness, invalid input, payload
  building for each `kind`, and the 119/121 regression (component registry + effects
  unchanged contracts).
- Full baseline gate green (typecheck, lint, `npm test`, build, e2e).

## Advancement gate

Target 100%. Floor 90% with an explicit Advancement Exception if any non-blocking
task is incomplete. Required tests MUST pass and no MUST/SHALL may be unmet.
