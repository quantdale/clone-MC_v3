# Spec: mob-drop-loot

## Contract
This capability adds the mob health/death→loot/XP pipeline: a per-entity health tracker, species
loot-table/XP data for pig and zombie, and a composed `damageEntity` entry point that removes a
killed entity from its `EntityManager` and forwards its resolved loot/XP to caller-supplied sinks.
Not wired into `Game` — nothing currently damages a mob (the still-unscheduled player→mob combat
gap 146 flagged); no death animation/particles/sound; no new species — see the proposal's
Non-goals.

## Definitions
- **Max health**: `species.maxHealth`, sourced from the 017 `EntityTypeDefinition.health` field.
- **Death**: the `damage` call that first brings an entity's tracked health to `<= 0`.
- **Loot resolution**: evaluating `species.lootTableId` against a `LootTableRegistry` with an
  injected `RandomSource`, per 011.

## Invariants
- `MobHealthTracker.damage` lazily initializes an untracked entity's health to the supplied
  `maxHealth` before applying `amount`; health never drops below `0`.
- `damage` reports `died: true` only on the call that first reduces health to `<= 0`; any
  subsequent `damage` call for the same id (before `remove`) reports `died: false`.
- A non-positive or non-finite `amount` never changes health and `died` is always `false`.
- `MobDropLootSystem.damageEntity` calls `manager.remove(entityId)` at most once per death, and
  only invokes `spawnLoot`/`spawnXp` after a successful removal.
- `damageEntity` on a missing or non-`ACTIVE` entity id is a no-op returning `false`.

## Requirements

### Requirement: damage lazily initializes health and clamps at zero
`MobHealthTracker.damage(entityId, amount, maxHealth)` MUST treat an untracked `entityId` as
starting at `maxHealth`, then subtract `amount`, clamped so health never goes below `0`.

#### Scenario: first damage call initializes from maxHealth
- **GIVEN** an untracked entity id and `maxHealth = 10`
- **WHEN** `damage(id, 4, 10)` is called
- **THEN** the returned `health` is `6`

#### Scenario: damage cannot reduce health below zero
- **GIVEN** an entity already at health `2` (via a prior `damage` call)
- **WHEN** `damage(id, 999, 10)` is called
- **THEN** the returned `health` is `0`

### Requirement: died is true only on the killing call
`damage` MUST report `died: true` only on the call that first brings health to `<= 0`, and
`died: false` on every other call for that id.

#### Scenario: the killing blow reports died true
- **GIVEN** an entity at health `3` and `maxHealth = 10`
- **WHEN** `damage(id, 5, 10)` is called
- **THEN** `died` is `true`

#### Scenario: a non-lethal hit reports died false
- **GIVEN** an entity at full health `10`
- **WHEN** `damage(id, 4, 10)` is called
- **THEN** `died` is `false`

#### Scenario: a hit on an already-dead id reports died false again
- **GIVEN** an entity already reduced to `0` health by a prior `damage` call
- **WHEN** `damage(id, 1, 10)` is called again for the same id
- **THEN** `died` is `false`

### Requirement: a non-positive or non-finite amount is a no-op
`damage` MUST leave health unchanged (beyond lazy initialization) and report `died: false` for a
non-positive or non-finite `amount`.

#### Scenario: zero damage does not change health
- **GIVEN** an untracked entity and `maxHealth = 10`
- **WHEN** `damage(id, 0, 10)` is called
- **THEN** the returned `health` is `10` and `died` is `false`

### Requirement: damageEntity composes death, removal, and loot/XP spawning
`MobDropLootSystem.damageEntity` MUST, on a lethal hit, remove the entity from the supplied
`EntityManager`, resolve its species' loot table and XP, and invoke both `spawnLoot`/`spawnXp`
callbacks with the entity's death position; on a non-lethal hit it MUST leave the entity active in
the manager and invoke neither callback.

#### Scenario: a lethal hit removes the entity and spawns loot and XP
- **GIVEN** a spawned entity of a species with `maxHealth = 10`, a real `EntityManager`, and a
  loot table that always yields at least one drop
- **WHEN** `damageEntity(manager, id, 999, species, lootTables, spawnLoot, spawnXp, rng)` is
  called
- **THEN** it returns `true`, `manager.get(id).state` is `'REMOVED'`, `spawnLoot` was called
  exactly once with a non-empty stack list and the entity's death position, and `spawnXp` was
  called exactly once with a positive amount and the same position

#### Scenario: a non-lethal hit spawns nothing and leaves the entity active
- **GIVEN** the same setup as above
- **WHEN** `damageEntity(manager, id, 1, species, lootTables, spawnLoot, spawnXp, rng)` is called
  (insufficient to kill)
- **THEN** it returns `false`, `manager.get(id).state` is still `'ACTIVE'`, and neither `spawnLoot`
  nor `spawnXp` was called

### Requirement: damageEntity on a missing or inactive entity is a no-op
`damageEntity` MUST return `false` and invoke neither `manager.remove` nor either spawn callback
when `entityId` does not resolve to an `ACTIVE` entity in `manager`.

#### Scenario: an unknown id is a no-op
- **GIVEN** an `entityId` never spawned in `manager`
- **WHEN** `damageEntity(manager, entityId, 999, species, lootTables, spawnLoot, spawnXp, rng)` is
  called
- **THEN** it returns `false`, and neither `spawnLoot` nor `spawnXp` was called

## Error and failure behavior
- `createPigMobSpecies`/`createZombieMobSpecies` throw if the supplied `EntityRegistry` lacks the
  corresponding key (unreachable via `createDefaultEntityRegistry()`).
- `damageEntity` never throws; every ineligible case is a `false` return.

## Performance and resource bounds
- `damageEntity` is O(1) plus 011's own bounded `evaluate` cost.

## Compatibility and migration
- One `ItemRegistry.ts` edit (two new item ids, additive) and one new, additive simulation file. No
  `Game.ts` edit; no schema/save-format change; mob health is session-only.

## Security and integrity
- All inputs are caller-supplied numeric ids/amounts and already-validated registry data; no new
  untrusted input surface.

## Observability
- `MobHealthTracker.getHealth(entityId)` exposes current health for future debugging/HUD use.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 damage lazy-init + zero clamp | `tests/unit/MobDropLoot.test.ts` MobHealthTracker cases |
| REQ-2 died true only on killing call | `tests/unit/MobDropLoot.test.ts` died-gating cases |
| REQ-3 non-positive/non-finite amount no-op | `tests/unit/MobDropLoot.test.ts` no-op case |
| REQ-4 damageEntity lethal/non-lethal composition | `tests/unit/MobDropLoot.test.ts` damageEntity cases |
| REQ-5 damageEntity missing-entity no-op | `tests/unit/MobDropLoot.test.ts` missing-entity case |
