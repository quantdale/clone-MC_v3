/**
 * Animal-breeding state machine (147): love mode, breeding cooldown, in-range same-species pair
 * matching, and child spawning — operating on an existing entity population (145's pig set via
 * `PassiveMobSystem.getManager()`/`getActivePigs()`) with no new entity id-space. A bred child is
 * spawned on the caller-supplied `EntityManager`, so it becomes an ordinary, wandering, rendered
 * pig the very next frame with zero additional wiring.
 *
 * No player-initiated feeding interaction (no entity-hit raycast exists yet — the same gap 146
 * flagged for player→mob combat), no inventory-item consumption, no baby-growth/ageing, no
 * love-mode visuals — see `openspec/changes/147-animal-breeding/design.md`.
 */
import type { ResourceId } from '../data/ResourceId';
import type { EntityInstance, EntityTransform } from '../world/Entity';
import type { EntityManager } from './EntityManager';

/** Ticks a fed entity remains in love mode (this system's own tick cadence, not fixed 20 TPS). */
export const LOVE_MODE_DURATION_TICKS = 600;
/** Ticks a bred entity must wait before it can enter love mode again. */
export const BREEDING_COOLDOWN_TICKS = 6000;
/** Max distance (blocks) between two in-love entities for them to breed. */
export const BREEDING_RANGE = 8;

/** One breedable species: its entity type and the item id that triggers love mode. */
export interface BreedableSpecies {
  readonly typeId: ResourceId;
  readonly breedingFoodItemId: number;
}

/** Per-entity love-mode/breeding-cooldown expiry tracking. */
export class LoveStateTracker {
  private readonly loveUntil = new Map<number, number>();
  private readonly cooldownUntil = new Map<number, number>();

  /** Whether `entityId` is currently on its post-breeding cooldown at `currentTick`. */
  isOnCooldown(entityId: number, currentTick: number): boolean {
    const until = this.cooldownUntil.get(entityId);
    return until !== undefined && currentTick < until;
  }

  /** Whether `entityId` is currently in love mode at `currentTick`. */
  isInLove(entityId: number, currentTick: number): boolean {
    const until = this.loveUntil.get(entityId);
    return until !== undefined && currentTick < until;
  }

  /**
   * Attempt to feed `entityId` item `itemId`. Enters love mode (expiring
   * `LOVE_MODE_DURATION_TICKS` ticks after `currentTick`) and returns `true` only when `itemId`
   * matches `species.breedingFoodItemId` and `entityId` is not on cooldown; otherwise leaves state
   * unchanged and returns `false`.
   */
  feed(entityId: number, itemId: number, species: BreedableSpecies, currentTick: number): boolean {
    if (itemId !== species.breedingFoodItemId) return false;
    if (this.isOnCooldown(entityId, currentTick)) return false;
    this.loveUntil.set(entityId, currentTick + LOVE_MODE_DURATION_TICKS);
    return true;
  }

  /** Clear `entityId`'s love mode and start its breeding cooldown from `currentTick`. */
  completeBreeding(entityId: number, currentTick: number): void {
    this.loveUntil.delete(entityId);
    this.cooldownUntil.set(entityId, currentTick + BREEDING_COOLDOWN_TICKS);
  }

  /** Clear one tracked id's love/cooldown state, or every id's when called with no argument. */
  clear(entityId?: number): void {
    if (entityId === undefined) {
      this.loveUntil.clear();
      this.cooldownUntil.clear();
    } else {
      this.loveUntil.delete(entityId);
      this.cooldownUntil.delete(entityId);
    }
  }
}

function distance3(a: EntityTransform, b: EntityTransform): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * The first same-species pair of in-love entities within `range` of each other, in
 * `entities`'s given order. Pure and deterministic; returns `null` when fewer than two such
 * entities exist.
 */
export function findBreedingPair(
  entities: readonly EntityInstance[],
  tracker: LoveStateTracker,
  species: BreedableSpecies,
  currentTick: number,
  range: number = BREEDING_RANGE,
): readonly [EntityInstance, EntityInstance] | null {
  const inLove = entities.filter((e) => e.typeId === species.typeId && tracker.isInLove(e.id, currentTick));
  for (let i = 0; i < inLove.length; i++) {
    const a = inLove[i]!;
    for (let j = i + 1; j < inLove.length; j++) {
      const b = inLove[j]!;
      if (distance3(a.transform, b.transform) <= range) {
        return [a, b];
      }
    }
  }
  return null;
}

/** A new child's spawn transform: the horizontal midpoint of both parents, at the lower of their `y`. */
export function childSpawnTransform(a: EntityInstance, b: EntityInstance): EntityTransform {
  return {
    x: (a.transform.x + b.transform.x) / 2,
    y: Math.min(a.transform.y, b.transform.y),
    z: (a.transform.z + b.transform.z) / 2,
    yaw: 0,
    pitch: 0,
  };
}

/**
 * Owns one `LoveStateTracker` and an internal frame counter (this system's own tick unit,
 * independent of `Game.simTick`/`PassiveMobSystem`/`HostileMobSystem`), exposing `feedEntity` for a
 * future interaction change to call and `tick` to attempt one breeding spawn per call.
 */
export class BreedingSystem {
  private readonly tracker = new LoveStateTracker();
  private frameCounter = 0;

  /** Feed `entityId` item `itemId` for `species`. See {@link LoveStateTracker.feed}. */
  feedEntity(entityId: number, itemId: number, species: BreedableSpecies): boolean {
    return this.tracker.feed(entityId, itemId, species, this.frameCounter);
  }

  /**
   * Advance one tick: if the live population is already at or above `populationCap`, do nothing
   * and return `0`. Otherwise search `entities` for one eligible breeding pair; if found, spawn one
   * child of `species.typeId` via `manager.spawn` at the parents' midpoint, complete breeding for
   * both parents, and return `1`. Returns `0` when no eligible pair exists.
   */
  tick(
    manager: EntityManager,
    entities: readonly EntityInstance[],
    species: BreedableSpecies,
    populationCap: number,
  ): number {
    this.frameCounter++;
    if (entities.length >= populationCap) return 0;

    const pair = findBreedingPair(entities, this.tracker, species, this.frameCounter);
    if (!pair) return 0;

    const [a, b] = pair;
    this.tracker.completeBreeding(a.id, this.frameCounter);
    this.tracker.completeBreeding(b.id, this.frameCounter);
    manager.spawn(species.typeId, a.dimension, childSpawnTransform(a, b));
    return 1;
  }
}
