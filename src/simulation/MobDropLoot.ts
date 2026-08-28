/**
 * Mob health/death→loot/XP pipeline (148). `MobHealthTracker` lazily tracks per-entity health;
 * `MobDropLootSystem.damageEntity` composes damage application, death detection, `EntityManager`
 * removal, and 011 loot-table + fixed-XP resolution into one entry point that forwards results to
 * caller-supplied sinks (so `Game` can route them to `ItemEntityManager.spawnLootStacks`/
 * `XpOrbManager.spawnXpOrb` without this module importing either).
 *
 * Not wired into `Game` — nothing currently damages a mob (the still-unscheduled player→mob
 * combat gap 146 flagged); no death animation/particles/sound; no new species beyond pig/zombie —
 * see `openspec/changes/148-mob-drop-loot/design.md`.
 */
import { createResourceId, type ResourceId } from '../data/ResourceId';
import type { EntityRegistry } from '../data/EntityType';
import type { EntityManager } from './EntityManager';
import {
  LootTableRegistry,
  evaluate,
  type LootStack,
  type RandomSource,
} from '../inventory/LootTable';
import type { ItemTypeRegistry } from '../inventory/ItemRegistry';

/** One species' health/loot/XP configuration. */
export interface MobSpecies {
  readonly typeId: ResourceId;
  readonly maxHealth: number;
  readonly lootTableId: ResourceId;
  readonly xpDrop: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Lazily-initialized per-entity health, keyed by entity id. */
export class MobHealthTracker {
  private readonly health = new Map<number, number>();

  /**
   * Apply `amount` of damage to `entityId`, initializing its health to `maxHealth` first if
   * untracked. A non-positive or non-finite `amount` is a no-op beyond that lazy initialization.
   * `died` is `true` only on the call that first reduces health to `<= 0`.
   */
  damage(entityId: number, amount: number, maxHealth: number): { health: number; died: boolean } {
    const current = this.health.get(entityId) ?? maxHealth;
    if (!isFiniteNumber(amount) || amount <= 0) {
      this.health.set(entityId, current);
      return { health: current, died: false };
    }
    const wasAlive = current > 0;
    const next = Math.max(0, current - amount);
    this.health.set(entityId, next);
    return { health: next, died: wasAlive && next <= 0 };
  }

  /** Current tracked health, or `undefined` if `entityId` has never been damaged/queried. */
  getHealth(entityId: number): number | undefined {
    return this.health.get(entityId);
  }

  /** Stop tracking `entityId` (call once its entity has been removed). */
  remove(entityId: number): void {
    this.health.delete(entityId);
  }

  /** Clear one tracked id's health, or every id's when called with no argument. */
  clear(entityId?: number): void {
    if (entityId === undefined) {
      this.health.clear();
    } else {
      this.health.delete(entityId);
    }
  }
}

/** Builds the `loot/pig` and `loot/zombie` tables backing {@link resolveMobDeath}. */
export function createDefaultMobLootTables(itemRegistry: ItemTypeRegistry): LootTableRegistry {
  return new LootTableRegistry(
    [
      {
        id: createResourceId('minecraft', 'loot/pig'),
        pools: [
          {
            rolls: 1,
            entries: [{ item: createResourceId('minecraft', 'porkchop'), weight: 1, min: 1, max: 3 }],
          },
        ],
      },
      {
        id: createResourceId('minecraft', 'loot/zombie'),
        pools: [
          {
            rolls: 1,
            entries: [{ item: createResourceId('minecraft', 'rotten_flesh'), weight: 1, min: 1, max: 2 }],
          },
        ],
      },
    ],
    itemRegistry,
  );
}

/** The pig `MobSpecies`, reading `maxHealth` from `entityRegistry`. Throws if `pig` is unregistered. */
export function createPigMobSpecies(entityRegistry: EntityRegistry): MobSpecies {
  const pig = entityRegistry.getByKey('pig');
  if (!pig) {
    throw new Error('createPigMobSpecies: entity registry has no "pig" definition');
  }
  return {
    typeId: pig.id,
    maxHealth: pig.health ?? 10,
    lootTableId: createResourceId('minecraft', 'loot/pig'),
    xpDrop: 1,
  };
}

/** The zombie `MobSpecies`, reading `maxHealth` from `entityRegistry`. Throws if `zombie` is unregistered. */
export function createZombieMobSpecies(entityRegistry: EntityRegistry): MobSpecies {
  const zombie = entityRegistry.getByKey('zombie');
  if (!zombie) {
    throw new Error('createZombieMobSpecies: entity registry has no "zombie" definition');
  }
  return {
    typeId: zombie.id,
    maxHealth: zombie.health ?? 20,
    lootTableId: createResourceId('minecraft', 'loot/zombie'),
    xpDrop: 5,
  };
}

/** The resolved outcome of one mob's death: its loot drops plus a fixed XP amount. */
export interface MobDeathResult {
  readonly loot: readonly LootStack[];
  readonly xp: number;
}

/**
 * Pure loot/XP resolution for `species`'s death: evaluates `species.lootTableId` against
 * `lootTables` (an unregistered table id resolves to no loot) and pairs it with the species'
 * fixed `xpDrop`. `blockId` in the evaluation context is a documented placeholder (`0`) — neither
 * built-in mob table references it.
 */
export function resolveMobDeath(
  species: MobSpecies,
  lootTables: LootTableRegistry,
  rng: RandomSource,
): MobDeathResult {
  const table = lootTables.getOptional(species.lootTableId);
  const loot = table
    ? evaluate(table, { blockId: 0, toolItemId: undefined, itemRegistry: lootTables.itemRegistry }, rng, lootTables.itemRegistry)
    : [];
  return { loot, xp: species.xpDrop };
}

/**
 * Owns one `MobHealthTracker` and composes damage application with death→removal→loot/XP
 * resolution via `damageEntity`.
 */
export class MobDropLootSystem {
  private readonly healthTracker = new MobHealthTracker();

  /**
   * Apply `amount` damage to `entityId`. Returns `false` (no-op) when `entityId` does not resolve
   * to an `ACTIVE` entity in `manager`, or when the hit is not lethal. On a lethal hit: removes the
   * entity from `manager`, stops tracking its health, resolves its species' loot/XP via
   * `resolveMobDeath`, invokes `spawnLoot`/`spawnXp` (only when their respective outputs are
   * non-empty/positive) with the entity's death position, and returns `true`.
   */
  damageEntity(
    manager: EntityManager,
    entityId: number,
    amount: number,
    species: MobSpecies,
    lootTables: LootTableRegistry,
    spawnLoot: (stacks: readonly LootStack[], x: number, y: number, z: number) => void,
    spawnXp: (amount: number, x: number, y: number, z: number) => void,
    rng: RandomSource,
  ): boolean {
    const entity = manager.get(entityId);
    if (!entity || entity.state !== 'ACTIVE') return false;

    const { died } = this.healthTracker.damage(entityId, amount, species.maxHealth);
    if (!died) return false;

    manager.remove(entityId);
    this.healthTracker.remove(entityId);

    const result = resolveMobDeath(species, lootTables, rng);
    const { x, y, z } = entity.transform;
    if (result.loot.length > 0) spawnLoot(result.loot, x, y, z);
    if (result.xp > 0) spawnXp(result.xp, x, y, z);
    return true;
  }
}
