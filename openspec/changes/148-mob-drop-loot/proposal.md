# Proposal: 148-mob-drop-loot

## Problem
145/146/147 wired a live pig and zombie population into `Game`, but neither has any concept of
health or death — both explicitly deferred it ("no way to damage it yet, tracking its health has
no consumer"). Nothing in the game can currently damage a mob at all: `PlayerInteraction` has no
entity-hit raycast or "attack" action (146's own flagged, still-unscheduled gap — no titled change
between 146 and 153 adds player→mob combat). 148 cannot fix that gap, but it can build the
death→loot→XP/item-entity pipeline as a complete, correct, fully-tested capability so that
whichever future change adds real combat only needs to call one function.

## Goals
- A `MobHealthTracker`: per-entity-id current health, lazily initialized to a species' max health
  on first reference so no existing spawn path (145's `PassiveMobSystem`, 146's
  `HostileMobSystem`, 147's `BreedingSystem`) needs to be touched.
- `MobSpecies` describing one species' `typeId`, `maxHealth` (sourced from the existing 017
  `EntityTypeDefinition.health`), `lootTableId`, and fixed `xpDrop`.
- `resolveMobDeath(species, lootTables, rng)`: evaluates the species' loot table (011) and returns
  the resulting drops plus its XP value — pure, no entity/world mutation.
- `MobDropLootSystem.damageEntity(manager, entityId, amount, species, lootTables, spawnLoot,
  spawnXp, rng)`: applies damage; when it kills the entity, removes it from the supplied
  `EntityManager`, resolves its death loot/XP, and forwards them to caller-supplied sinks (so the
  same function works with `ItemEntityManager.spawnLootStacks`/`XpOrbManager.spawnXpOrb` in `Game`,
  or a plain array-collecting fake in tests) — returns whether the entity died this call.
- Two new drop items (`Porkchop`, `RottenFlesh`) and two new loot tables (`loot/pig`,
  `loot/zombie`) so there is something real for a pig/zombie to drop.

## Non-goals
- **Not wired into `Game`.** Exactly like 140/141 before 146 wired them in, this is the
  additive/unconsumed capability: nothing in the live game currently calls `damageEntity`, because
  nothing can currently damage a mob (the still-unscheduled player→mob combat gap 146 flagged).
  Wiring a fake call site with no real trigger would misrepresent this as "interactive" when it
  is not; a future combat/interaction change calls `damageEntity` for real once it exists.
- **No mob-initiated damage to the mob itself** (fall damage, drowning, fire, etc.) — only the
  generic `damageEntity(amount)` entry point; environmental damage sources for mobs are a separate,
  unscheduled scope.
- **No death animation/particles/sound** — 199/200 (`particle-system`/`sound-event-system`) do not
  exist yet.
- **No XP-orb velocity/pop physics beyond what `XpOrbManager.spawnXpOrb` already provides** — reused
  unmodified.
- **No new species beyond pig/zombie** — mirrors 145/146/147's identical "the two species already
  wired" scope.
- **No rotten-flesh hunger-effect chance** (vanilla's ~80% chance to inflict Hunger) — 124's
  `FoodComponentRuntime` models fixed, not probabilistic, food effects; adding probabilistic effect
  chance is separate scope, not required for "death routes through loot tables."

## Preconditions
- Change 147 (`animal-breeding`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/EntityType.ts` (017, existing `pig.health=10`/`zombie.health=20`), `src/inventory/
  LootTable.ts` (011, `LootTableRegistry`/`evaluate`/`LootStack`), `src/inventory/ItemRegistry.ts`
  (new items), `src/simulation/EntityManager.ts` (129, `remove`), `src/simulation/
  ItemEntityManager.ts` (111/112, `spawnLootStacks` — reused via injected callback, not imported),
  `src/simulation/XpOrbManager.ts` (117, `spawnXpOrb` — same).

## Proposed change
1. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Porkchop = 35`, `ItemId.RottenFlesh = 36`
   (simple food items, no placeBlock).
2. `src/simulation/MobDropLoot.ts` (NEW): `MobHealthTracker`, `MobSpecies` interface,
   `createDefaultMobLootTables(itemRegistry)` (builds `loot/pig` + `loot/zombie` as a
   `LootTableRegistry`), `resolveMobDeath`, `MobDropLootSystem`.

## Compatibility and migration
- One `ItemRegistry.ts` edit adding two new item ids (additive, no existing id renumbered) and one
  new, additive simulation file. No `Game.ts` edit; no schema/save-format change (mob health is not
  persisted — mirrors 145/146/147's identical non-persistence simplification); no migration.

## Risks
- **`damageEntity` silently no-ops for an untracked/removed/nonexistent entity id** (defensive,
  matches `EntityManager`'s own `setTransform`/`setVelocity` false-return convention) — a future
  caller must check the boolean return to know whether a hit actually registered.
- **Lazy health initialization means an entity's first-ever `damageEntity` call always uses the
  caller-supplied `species.maxHealth` for that tick**, even if the entity has existed (undamaged)
  for a long time — correct by construction (an undamaged entity is always at max health) but
  worth noting since there is no explicit "entity spawned" hook feeding this tracker.

## Rollback strategy
One additive file plus one additive `ItemRegistry.ts` edit (two new item ids); reverting fully
removes the feature with no other impact, and does not touch 145/146/147's files.

## Definition of Done
- All listed classes/functions implemented per design.md/spec.md.
- Unit tests cover: `MobHealthTracker` lazy-init/damage/death-threshold/idempotent-death behavior;
  `resolveMobDeath` loot/XP resolution against a real `LootTableRegistry`; `MobDropLootSystem
  .damageEntity` composition (non-lethal hit leaves the entity alive with no spawn callbacks
  invoked; lethal hit removes the entity from the manager and invokes both spawn callbacks with the
  entity's death position; an untracked/missing entity id is a no-op returning `false`).
- Full gate green: typecheck, lint, unit, build (module count is unchanged from 147 — this module
  has no runtime consumer in `Game.ts`'s entry graph, exactly like 136-144's own "additive/
  unconsumed" validation evidence before 145/146 wired mob systems in), e2e (existing 22 assertions
  unaffected — no regression, no new assertion since nothing is wired into the live game).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
