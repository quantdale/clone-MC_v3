# Design: 148-mob-drop-loot

## Context/current state
- `EntityTypeDefinition.health` (017) already carries each species' max health (`pig: 10`,
  `zombie: 20`) but nothing reads it — it has been dead data since 017 shipped.
- `LootTableRegistry`/`evaluate` (011) are entirely block-drop-shaped in their existing consumer
  (`PlayerInteraction.finishBreak` builds a `LootContext` from a broken block), but `evaluate`
  itself only requires a `LootContext` object literal — nothing prevents building one for an
  entity-death context. `LootContext.blockId` is a required field with no entity-relevant meaning
  here; loot tables built for this change simply never reference it in a condition, so a placeholder
  value is harmless and never inspected.
- `EntityManager.remove(id)` (129) already exists and does exactly what a mob's death needs: mark
  `REMOVED`, drop from the active/insertion-order index, retain the record so a stale `get(id)`
  still resolves. No change needed there.
- `ItemEntityManager.spawnLootStacks`/`XpOrbManager.spawnXpOrb` (111/112/117) are both already
  constructed once in `Game` (`this.itemEntities`/`this.xpOrbs`) and already used for the player's
  own block-break drops — this module reuses them **by injected callback**, not by importing either
  manager class, so `MobDropLoot.ts` has zero import-time coupling to either.

## Target state
- `src/inventory/ItemRegistry.ts`: two new item definitions, `Porkchop`/`RottenFlesh`.
- `src/simulation/MobDropLoot.ts`: `MobHealthTracker` (lazy per-entity health), `MobSpecies`
  (typeId + maxHealth + lootTableId + xpDrop), `createDefaultMobLootTables` (a `LootTableRegistry`
  with `loot/pig` and `loot/zombie`), `createPigMobSpecies`/`createZombieMobSpecies` (read
  `maxHealth` from an `EntityRegistry`), `resolveMobDeath` (pure loot+XP resolution), and
  `MobDropLootSystem.damageEntity` (the single composed entry point: damage → death check → manager
  removal → loot/XP resolution → sink callbacks).

## Invariants
- `MobHealthTracker.damage(entityId, amount, maxHealth)` initializes untracked `entityId` to
  `maxHealth` before applying `amount`, clamps the result to `>= 0`, and reports `died: true` only
  on the call that first brings health to `<= 0` (never again for the same id afterward, since the
  entity is expected to be removed immediately on that call).
- `damage` with a non-positive or non-finite `amount` is a no-op: health is unchanged (still
  lazily initialized if previously untracked) and `died` is always `false`.
- `MobDropLootSystem.damageEntity` calls `manager.remove(entityId)` exactly once, only on the tick
  that kills the entity, and only invokes `spawnLoot`/`spawnXp` after that removal succeeds.
- `resolveMobDeath` never mutates its inputs and always returns the same `{ loot, xp }` shape for
  a given `(species, lootTables, rng-sequence)` — `xp` is `species.xpDrop` exactly (not itself
  randomized in this baseline); `loot` is whatever `evaluate` deterministically returns for that
  rng sequence.
- `damageEntity` on an entity id the manager reports as missing or already non-`ACTIVE` is a no-op
  returning `false` — no health-tracker mutation, no manager call, no sink invocation.

## API and data model
```ts
// src/simulation/MobDropLoot.ts

export interface MobSpecies {
  readonly typeId: ResourceId;
  readonly maxHealth: number;
  readonly lootTableId: ResourceId;
  readonly xpDrop: number;
}

export class MobHealthTracker {
  damage(entityId: number, amount: number, maxHealth: number): { health: number; died: boolean };
  getHealth(entityId: number): number | undefined;
  remove(entityId: number): void;
  clear(entityId?: number): void;
}

export function createDefaultMobLootTables(itemRegistry: ItemTypeRegistry): LootTableRegistry;
export function createPigMobSpecies(entityRegistry: EntityRegistry): MobSpecies;
export function createZombieMobSpecies(entityRegistry: EntityRegistry): MobSpecies;

export interface MobDeathResult {
  readonly loot: readonly LootStack[];
  readonly xp: number;
}

export function resolveMobDeath(
  species: MobSpecies,
  lootTables: LootTableRegistry,
  rng: RandomSource,
): MobDeathResult;

export class MobDropLootSystem {
  damageEntity(
    manager: EntityManager,
    entityId: number,
    amount: number,
    species: MobSpecies,
    lootTables: LootTableRegistry,
    spawnLoot: (stacks: readonly LootStack[], x: number, y: number, z: number) => void,
    spawnXp: (amount: number, x: number, y: number, z: number) => void,
    rng: RandomSource,
  ): boolean; // true iff this call killed the entity
}
```

## Control/data flow
1. **Damage** (currently only reachable from a test or a future combat-wiring change):
   `system.damageEntity(manager, id, amount, species, lootTables, spawnLoot, spawnXp, rng)`:
   a. Look up `entity = manager.get(id)`; if missing or not `ACTIVE`, return `false` immediately.
   b. `healthTracker.damage(id, amount, species.maxHealth)`; if `!died`, return `false`.
   c. `manager.remove(id)`, then `healthTracker.remove(id)` (the id is gone; no future lookups
      needed for it).
   d. `resolveMobDeath(species, lootTables, rng)` → `{ loot, xp }`.
   e. If `loot.length > 0`: `spawnLoot(loot, entity.transform.x, entity.transform.y,
      entity.transform.z)`.
   f. If `xp > 0`: `spawnXp(xp, entity.transform.x, entity.transform.y, entity.transform.z)`.
   g. Return `true`.
2. **A future `Game` wiring** (not part of this change) would call `damageEntity` with
   `this.hostileMobs.getManager()`/`this.passiveMobs.getManager()`, the matching `MobSpecies`, a
   `createDefaultMobLootTables(this.itemRegistry)` instance, `(stacks, x, y, z) =>
   this.itemEntities.spawnLootStacks(stacks, x, y, z)`, `(amount, x, y, z) =>
   this.xpOrbs.spawnXpOrb(amount, x, y, z)`, and `Math.random` — once a real "the player hit this
   mob for N damage" event exists.

## Detailed behavior
- `loot/pig`: one pool, `rolls: 1`, a single entry `porkchop` weight 1, quantity range `1..3`.
- `loot/zombie`: one pool, `rolls: 1`, a single entry `rotten_flesh` weight 1, quantity range
  `1..2` — 011's `LootEntry.min` MUST be a positive integer (`>= 1`), so a "sometimes drops
  nothing" zombie table (vanilla's actual behavior) is not representable by one plain weighted
  entry; always dropping at least one flesh keeps the table shape identical to `loot/pig`'s and
  fully valid, and is documented here as a simplification rather than an exact vanilla match.
- `xpDrop` is a small fixed constant per species (pig `1`, zombie `5`, roughly vanilla-proportioned)
  — not itself loot-table-driven, since 011's `LootStack` model has no XP concept; XP is a second,
  parallel output of `resolveMobDeath`.
- `createPigMobSpecies`/`createZombieMobSpecies` throw if the supplied `EntityRegistry` lacks the
  corresponding key — defensive, matches 145/146's identical "throws if the registry has no X
  definition" convention (unreachable via `createDefaultEntityRegistry()`).
- `LootContext.blockId` is set to `0` for entity-death evaluation — a documented placeholder,
  never referenced by either new table's (conditionless) entries/pools.

## Failure modes
- `createPigMobSpecies`/`createZombieMobSpecies` throw for a registry missing the relevant key.
- `damageEntity` never throws; every "not eligible to be damaged/already gone" case is a `false`
  return, matching `EntityManager`'s own defensive-return convention.

## Compatibility/migration
- One `ItemRegistry.ts` edit (two new item ids, additive) and one new, additive simulation file.
  No `Game.ts` edit. No schema/save-format change; mob health is session-only (not persisted),
  matching 145/146/147's identical non-persistence simplification.

## Performance/resource constraints
- `damageEntity` is O(1) plus `evaluate`'s own bounded cost (011, capped at `MAX_ROLLS`/
  `MAX_TABLE_OUTPUT`); no unbounded loops.

## Testing seams
- `MobHealthTracker` is tested standalone with plain numeric inputs — no `EntityManager` needed.
- `resolveMobDeath` is tested against a real `LootTableRegistry` built by
  `createDefaultMobLootTables` with a real `ItemTypeRegistry`, and a scripted deterministic `rng`.
- `MobDropLootSystem.damageEntity` is tested against a real `EntityManager`
  (`createDefaultEntityRegistry()`), with plain array-collecting fakes standing in for
  `spawnLoot`/`spawnXp` (no `ItemEntityManager`/`XpOrbManager` needed) — mirrors how
  `PassiveMobBaseline.test.ts`/`HostileMobBaseline.test.ts` avoid constructing unrelated managers.

## Observability/debugging
- `MobHealthTracker.getHealth(entityId)` exposes current health for a future debug-overlay hook (not
  added in this change).

## Affected files/symbols
- `src/inventory/ItemRegistry.ts` (edit: two new item ids).
- `src/simulation/MobDropLoot.ts` (new).
- Tests: `tests/unit/MobDropLoot.test.ts` (new).

## Rejected alternatives
- **Wiring `damageEntity` into `Game.ts` behind a synthetic trigger (e.g. a debug keybind)**:
  rejected — inventing a fake trigger to claim "wired in" would misrepresent this baseline as more
  interactive than it is; the honest state is "additive/unconsumed until real combat exists,"
  exactly like 136-144 before 145/146.
- **Eagerly registering each entity's health at its spawn call site (145's `PassiveMobSystem`,
  146's `HostileMobSystem`, 147's `BreedingSystem`)**: rejected — it would require touching all
  three prior changes' files, which their own proposals explicitly committed not to do, for a
  benefit (avoiding one lazy-init branch in `MobHealthTracker.damage`) that doesn't outweigh that
  cost.
- **Making `xpDrop` itself loot-table-driven (a `LootEntry`-shaped XP output)**: rejected — 011's
  `LootStack` model has no XP concept and retrofitting one is a larger, separate schema change;
  a plain fixed constant per species is sufficient for this baseline and matches vanilla's simplest
  mob XP values closely enough.

## Downstream dependencies
- A future, currently-unscheduled player→mob combat change is the real consumer: it must construct
  `MobSpecies`/`LootTableRegistry` instances (or reuse `createDefault*` here) and call
  `damageEntity` once its entity-hit raycast lands a hit.
- 149+ (`point-of-interest-system` onward) are unaffected — none of them touch mob health/combat.
