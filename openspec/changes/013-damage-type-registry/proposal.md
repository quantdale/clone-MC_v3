# Proposal: 013-damage-type-registry

## Problem

Environmental damage in `SurvivalSystem` is hard-coded: fall scaling, drowning/lava
intervals and amounts, and the starvation amount are literals inline in `update()`.
Adding new damage sources (fire, cactus, poison, mob attacks) means editing the
system directly and risks diverging semantics. There is no shared, typed notion of
a "damage type" with category flags that other systems (combat, effects, armor) can
reason about.

## Goals

- Define a ResourceId-identified `DamageType` data model with category flags.
- Define three application kinds needed by current gameplay: `fall`, `periodic`,
  and `starvation`, with finite, validated parameters.
- Provide a `DamageTypeRegistry` built on the 003 generic `Registry` core.
- Provide `createDefaultDamageTypeRegistry()` encoding the current fall/drown/lava
  (and starvation) numbers exactly.
- Route `SurvivalSystem` through the registry so current behavior is reproduced
  byte-for-byte, with the registry injected as an optional default dependency.

## Non-goals

- No new damage sources beyond what currently exists (no fire/cactus/mob combat yet).
- No armor reduction, no invulnerability/IFRAME rework, no status-effect coupling.
- No save-format changes (snapshot schema is untouched).
- No combat/entity damage pipeline migration.

## Preconditions

012 (attribute-registry) is VERIFIED. The 003 generic `Registry` and 002 `ResourceId`
foundations are available.

## Dependencies

- `src/data/Registry.ts` (003) for the registry core.
- `src/data/ResourceId.ts` (002) for ids.

## Proposed change

Add `src/data/DamageType.ts` with `DamageTypeFlag`, `DamageTypeDefinition`,
`DamageTypeRegistry`, and `createDefaultDamageTypeRegistry()`. Modify
`src/player/SurvivalSystem.ts` to accept an optional `DamageTypeRegistry`, resolve
the four default types once, and apply damage from their data instead of literals.
The default argument preserves every existing call site and observable result.

## Compatibility and migration

`SurvivalSystem`'s public surface (`update`, `damage`, `heal`, `snapshot`, `restore`,
events) is unchanged. The new constructor parameter is optional; `new SurvivalSystem()`
keeps identical behavior. No persisted state changes.

## Risks

- Accidentally changing a literal (threshold/interval/amount) would regress survival.
  Mitigated by keeping the default registry values identical to the current literals
  and by the existing `SurvivalSystem.test.ts` assertions.

## Rollback strategy

The change is additive and the registry defaults reproduce current values. Reverting
the commit restores prior literals with no data migration needed.

## Definition of Done

The damage-type model and registry are fully tested; `SurvivalSystem` routes through
them; current fall/drown/lava/starvation semantics are preserved (existing tests
still pass); full regression gate is green.

## Advancement gate

014 starts only after 013 is 100% complete and VERIFIED.
