# Proposal: 121-status-effect-runtime

## Problem

Changes 012 (attribute registry) and 014 (status-effect type registry + serializable
instance) delivered the data models but no runtime. There is no component that holds
active effects on an entity, applies duration ticking and amplifier/duration stacking,
or maps active effects to attribute modifiers. Effects therefore have no observable
gameplay consequence and cannot be persisted as a live set.

## Goals

- Add a self-contained `StatusEffectManager` that owns the active-effect list for one
  entity and exposes deterministic `add` / `get` / `getAll` / `remove` / `clear` /
  `tick` / `serialize` / `deserialize`.
- Implement duration and amplifier stacking rules for re-applied effects.
- Apply and remove attribute modifiers (the 012 attribute model) as effects are
  added, removed, or expired, so the entity's attribute values reflect active effects.
- Handle `INSTANT`-flagged effects: expire on the next tick and surface the expired
  instance through the `tick` return so a consumer can apply the one-shot.
- Persist the active-effect set losslessly and re-apply attribute hooks on restore.

## Non-goals

- Player/entity movement, damage, or rendering is **not** re-wired to read
  effect-derived attributes in 121. The manager exposes per-attribute
  `AttributeInstance`s; consumers wire to them in a later change.
- Concrete instant-effect side effects (heal/damage ticks, levitation motion,
  invisibility rendering) are **not** implemented. Only correct expiry and surfacing
  of instant instances is provided.
- No new effect types or attribute types are added (012/014 already seed them).
- SurvivalSystem / Game integration and new persisted-schema fields are **not** added.

## Preconditions

- 014 VERIFIED: `StatusEffectTypeRegistry`, `StatusEffectInstance` with `tick`,
  `serialize` / `deserialize`, `duration`, `amplifier`, `expired`.
- 012 VERIFIED: `AttributeRegistry`, `AttributeInstance` with the modifier model
  (`ADD_VALUE` / `ADD_BASE_FRACTION` / `MULTIPLY_TOTAL`) and `value`.

## Dependencies

- 012 attribute registry (`createDefaultAttributeRegistry`).
- 014 status-effect registry (`createDefaultStatusEffectRegistry`).

## Proposed change

New `src/data/StatusEffectManager.ts`:

- `StatusEffectManager` bound to an `StatusEffectTypeRegistry` and an
  `AttributeRegistry`.
- A per-entity `Map<ResourceId, AttributeInstance>` built from the attribute registry
  definitions, exposed via `getAttribute(id)`.
- An `EFFECT_ATTRIBUTE_HOOKS` table mapping an effect-type `ResourceId` to an
  attribute-modifier spec (`attribute`, `operation`, `amount(amplifier)`). Only the
  effects that map cleanly onto 012 attributes are hooked in 121.
- `add` applies stacking on re-application; `tick(dt)` decrements durations, expires
  finished effects, and removes their hooks; serialization round-trips the active list
  and re-applies hooks on restore.

The hook table is new data in the 121 module; it does **not** modify 014's
`StatusEffectTypeDefinition`.

## Compatibility and migration

Purely additive. No existing persisted data or call sites change. The 012/014
contracts are not modified.

## Risks

- Stacking semantics must follow a documented, deterministic rule (no proprietary
  source copy). The rule is specified in `design.md` and `spec.md`.
- Modifier id collisions: each effect type uses its own `ResourceId` as the modifier
  id, guaranteeing uniqueness within a single attribute instance and allowing a clean
  remove-then-re-add when the amplifier changes.

## Rollback strategy

Single additive module plus tests; revert the change commit to remove the manager.

## Definition of Done

- Manager `add` / `get` / `getAll` / `remove` / `clear` / `tick` / `serialize` /
  `deserialize` implemented and unit-tested.
- Stacking (duration + amplifier) deterministic and unit-tested.
- Attribute hooks applied/removed correctly and unit-tested against 012 attributes.
- `INSTANT` effects expire and surface via the `tick` return; unit-tested.
- Full gate green (typecheck, lint, unit, build, e2e).

## Advancement gate

100% task completion; all mandatory requirements and required tests pass; no
MUST/SHALL requirement left unverified; no data-loss, determinism, compatibility,
security, or regression blocker remaining.
