/**
 * Villager profession/workstation assignment and schedule phases (150): a `VillagerProfession`
 * data model on the 003 generic registry core, a `VillagerProfessionSystem` that assigns a
 * villager to the nearest available profession's workstation POI (149) in priority order, and a
 * pure `scheduleForHour` phase function.
 *
 * No villager spawning wired into `Game` (no village/structure generation exists yet), no trading/
 * gossip/restocking/iron-golem-spawning/bed-claiming, no goal-selector wiring — see
 * `openspec/changes/150-villager-professions/design.md`.
 */
import { type ResourceId, createResourceId } from '../data/ResourceId';
import { Registry } from '../data/Registry';
import type { PointOfInterestManager } from './PointOfInterest';

/** One profession: an identity plus the 149 POI type its workstation is registered under. */
export interface VillagerProfession {
  readonly id: ResourceId;
  readonly key: string;
  readonly workstationType: ResourceId;
}

/**
 * Registry of villager professions built on the 003 generic registry core. Never contains an
 * "unemployed" entry — unemployment is represented as `null` by callers, not a registered id.
 */
export class VillagerProfessionRegistry {
  private readonly inner: Registry<VillagerProfession>;
  private readonly byKeyMap = new Map<string, VillagerProfession>();

  constructor(professions: VillagerProfession[]) {
    this.inner = new Registry<VillagerProfession>();
    for (const profession of professions) {
      this.inner.register(profession.id, profession);
      this.byKeyMap.set(profession.key, profession);
    }
    this.inner.finalize();
  }

  get finalized(): boolean {
    return this.inner.finalized;
  }

  get size(): number {
    return this.inner.size;
  }

  get(id: ResourceId): VillagerProfession {
    return this.inner.get(id);
  }

  getOptional(id: ResourceId): VillagerProfession | undefined {
    return this.inner.getOptional(id);
  }

  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** Lookup by short key string (e.g. `'farmer'`). Undefined when absent. */
  getByKey(key: string): VillagerProfession | undefined {
    return this.byKeyMap.get(key);
  }

  /** All professions in ascending registration order (deterministic). */
  entries(): readonly VillagerProfession[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

const professionId = (key: string): ResourceId => createResourceId('minecraft', `profession/${key}`);
const workstationPoiType = (key: string): ResourceId => createResourceId('minecraft', `poi/${key}`);

/**
 * A representative default profession set: `farmer`, `librarian`, `weaponsmith`, each keyed to its
 * own placeholder workstation POI type. Not an exhaustive vanilla catalog — a later content-
 * expansion change may register more.
 */
export function createDefaultVillagerProfessionRegistry(): VillagerProfessionRegistry {
  const def = (key: string): VillagerProfession => ({
    id: professionId(key),
    key,
    workstationType: workstationPoiType(key),
  });
  return new VillagerProfessionRegistry([def('farmer'), def('librarian'), def('weaponsmith')]);
}

/** Coarse villager daily schedule phase. */
export type VillagerSchedulePhase = 'WORK' | 'REST' | 'MEANDER';

/**
 * The schedule phase for `hour` (expected in `[0, 24)`, but any finite value is reduced modulo 24
 * first so an out-of-range input still resolves deterministically): `'WORK'` in `[6, 18)`,
 * `'MEANDER'` in `[18, 22)`, `'REST'` in `[22, 24)` or `[0, 6)`.
 */
export function scheduleForHour(hour: number): VillagerSchedulePhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 18) return 'WORK';
  if (h >= 18 && h < 22) return 'MEANDER';
  return 'REST';
}

/** A villager's current profession + the workstation POI position claimed for it. */
export interface VillagerAssignment {
  readonly professionId: ResourceId;
  readonly poiX: number;
  readonly poiY: number;
  readonly poiZ: number;
}

/** Owns per-villager profession assignment tracking, composing 149's `PointOfInterestManager`. */
export class VillagerProfessionSystem {
  private readonly assignments = new Map<number, VillagerAssignment>();

  /**
   * Assign `entityId` to the first profession (in `professions`' order) with an unclaimed
   * workstation POI within `maxDistance` of `(x, y, z)`, claiming that POI. Returns the assigned
   * profession id, or `null` if none qualifies (nothing is claimed in that case). Idempotent: an
   * already-assigned villager's existing profession id is returned unchanged without any further
   * claim attempt.
   */
  assignProfession(
    entityId: number,
    poiManager: PointOfInterestManager,
    professions: readonly VillagerProfession[],
    x: number,
    y: number,
    z: number,
    maxDistance: number,
  ): ResourceId | null {
    const existing = this.assignments.get(entityId);
    if (existing) return existing.professionId;

    for (const profession of professions) {
      const poi = poiManager.findNearestUnclaimed(profession.workstationType, x, y, z, maxDistance);
      if (!poi) continue;
      poiManager.claim(poi.x, poi.y, poi.z);
      this.assignments.set(entityId, {
        professionId: profession.id,
        poiX: poi.x,
        poiY: poi.y,
        poiZ: poi.z,
      });
      return profession.id;
    }
    return null;
  }

  /**
   * Release `entityId`'s claimed workstation POI (if any) in `poiManager` and clear its tracked
   * assignment. Returns `true` if an assignment existed, `false` (no-op) otherwise.
   */
  unassign(entityId: number, poiManager: PointOfInterestManager): boolean {
    const assignment = this.assignments.get(entityId);
    if (!assignment) return false;
    poiManager.release(assignment.poiX, assignment.poiY, assignment.poiZ);
    this.assignments.delete(entityId);
    return true;
  }

  /** `entityId`'s current profession/POI binding, or `undefined` if unassigned. */
  getAssignment(entityId: number): VillagerAssignment | undefined {
    return this.assignments.get(entityId);
  }
}
