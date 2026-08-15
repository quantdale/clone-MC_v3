/**
 * XP orb manager (117).
 *
 * Owns every live XP orb for a world. Mints strictly increasing unique ids,
 * validates every spawn, advances age on tick, attracts orbs toward the player
 * within a squared radius, collects them into an `ExperienceSystem`, despawns
 * expired orbs, and serializes to the 037 `SerializedEntity` envelope used by the
 * future entity-persistence runtime (131).
 *
 * The pattern mirrors `ItemEntityManager` (111); XP orbs differ from item drops in
 * their collection semantics (they merge into a counter, not an inventory slot)
 * and their payload, so they get a dedicated manager rather than overloading item
 * merge/insert.
 */
import { CONFIG } from '../config';
import {
  XP_ORB_TYPE_KEY,
  createXpOrb,
  type XpOrb,
} from '../world/XpOrb';
import { ENTITY_RECORD_VERSION, validateSerializedEntity, type SerializedEntity } from '../storage/EntityRecord';
import type { ExperienceSystem } from '../player/ExperienceSystem';
import type { RandomSource } from '../inventory/LootTable';

/** A minimal spawn option bag for {@link XpOrbManager.spawnXpOrb}. */
export interface SpawnXpOrbOptions {
  vx?: number;
  vy?: number;
  vz?: number;
  id?: number;
}

/** Horizontal spawn jitter half-spread (blocks) applied when an rng is supplied. */
const SPAWN_JITTER = 0.25;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFiniteInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v);
}

/** World-scoped store of XP orbs with deterministic id minting and 037 envelope serialization. */
export class XpOrbManager {
  private readonly rng?: RandomSource;
  private readonly byId = new Map<number, XpOrb>();
  private readonly order: number[] = [];
  private nextId = 0;

  constructor(opts?: { rng?: RandomSource }) {
    this.rng = opts?.rng;
  }

  /**
   * Spawn a single XP orb. Validates a positive integer `value` and finite
   * coordinates. Throws and leaves the manager unchanged on any invalid input.
   * `id` defaults to the next minted id.
   */
  spawnXpOrb(
    value: number,
    x: number,
    y: number,
    z: number,
    opts?: SpawnXpOrbOptions,
  ): XpOrb {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`XpOrbManager: value must be a positive integer (got ${String(value)})`);
    }
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
      throw new Error('XpOrbManager: spawn position must be finite numbers');
    }
    const id = opts?.id ?? this.nextId++;
    const jx = this.rng ? (this.rng() - 0.5) * 2 * SPAWN_JITTER : 0;
    const jz = this.rng ? (this.rng() - 0.5) * 2 * SPAWN_JITTER : 0;
    const orb = createXpOrb({
      id,
      value,
      x: x + jx,
      y,
      z: z + jz,
      vx: opts?.vx,
      vy: opts?.vy,
      vz: opts?.vz,
    });
    this.byId.set(id, orb);
    this.order.push(id);
    if (id >= this.nextId) this.nextId = id + 1;
    return orb;
  }

  /** Remove the orb with `id`; returns whether one existed. */
  removeXpOrb(id: number): boolean {
    if (!this.byId.has(id)) return false;
    this.byId.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    return true;
  }

  /** All live orbs in insertion order. */
  getXpOrbs(): XpOrb[] {
    const out: XpOrb[] = [];
    for (const id of this.order) {
      const o = this.byId.get(id);
      if (o) out.push(o);
    }
    return out;
  }

  /** Number of live orbs. */
  get size(): number {
    return this.byId.size;
  }

  /** Remove all orbs. */
  clear(): void {
    this.byId.clear();
    this.order.length = 0;
    this.nextId = 0;
  }

  /**
   * Advance and attract/collect every live orb for one simulation step.
   *
   * 1. Advance each orb's `ageTicks` by `round(dt * 20)` (no-op when `dt <= 0`).
   * 2. For each orb within `orbAttractionRadius²` of the player, move it toward the
   *    player by at most the current distance (no tunneling).
   * 3. Collect (call `experience.addXp(orb.value)` + remove) any orb within
   *    `orbCollectRadius²`, checked after movement.
   * 4. Despawn orbs with `ageTicks >= orbDespawnTicks`.
   *
   * Returns the number of orbs collected.
   */
  tickItemEntities(
    dt: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    experience: ExperienceSystem,
  ): number {
    if (!isFiniteNumber(dt) || dt <= 0) return 0;
    const ticks = Math.round(dt * 20);
    if (ticks <= 0) return 0;

    const attractionSq = CONFIG.xp.orbAttractionRadius * CONFIG.xp.orbAttractionRadius;
    const collectSq = CONFIG.xp.orbCollectRadius * CONFIG.xp.orbCollectRadius;
    const speed = CONFIG.xp.orbAttractionSpeed;

    const collectedIds = new Set<number>();
    let collected = 0;

    for (const id of this.order) {
      const orb = this.byId.get(id);
      if (!orb) continue;
      orb.ageTicks += ticks;

      const dx = playerX - orb.x;
      const dy = playerY - orb.y;
      const dz = playerZ - orb.z;
      let distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= attractionSq) {
        const dist = Math.sqrt(distSq);
        const step = Math.min(speed * dt, dist);
        if (dist > 0) {
          orb.x += (dx / dist) * step;
          orb.y += (dy / dist) * step;
          orb.z += (dz / dist) * step;
          const ndx = playerX - orb.x;
          const ndy = playerY - orb.y;
          const ndz = playerZ - orb.z;
          distSq = ndx * ndx + ndy * ndy + ndz * ndz;
        }
      }

      if (distSq <= collectSq) {
        experience.addXp(orb.value);
        collectedIds.add(id);
        collected++;
      }
    }

    for (const id of collectedIds) this.removeXpOrb(id);

    const maxAge = CONFIG.xp.orbDespawnTicks;
    for (const id of [...this.order]) {
      const orb = this.byId.get(id);
      if (orb && orb.ageTicks >= maxAge) this.removeXpOrb(id);
    }

    return collected;
  }

  /** Serialize all live orbs to the 037 `SerializedEntity` envelope. */
  serializeAll(): SerializedEntity[] {
    return this.order.map((id) => {
      const o = this.byId.get(id)!;
      return {
        schemaVersion: ENTITY_RECORD_VERSION,
        typeKey: XP_ORB_TYPE_KEY,
        x: Math.floor(o.x),
        y: Math.floor(o.y),
        z: Math.floor(o.z),
        data: {
          id: o.id,
          value: o.value,
          x: o.x,
          y: o.y,
          z: o.z,
          vx: o.vx,
          vy: o.vy,
          vz: o.vz,
          ageTicks: o.ageTicks,
        },
      };
    });
  }

  /**
   * Restore orbs from 037 payloads. The whole batch is validated first (envelope,
   * `minecraft:xp_orb` type, and data shape); on any rejection the manager is left
   * unchanged and an `Error` is thrown. Returns the number of orbs added.
   */
  deserializeAll(entities: unknown[]): number {
    const parsed = entities.map((e) => validateSerializedEntity(e));
    const rebuilt: XpOrb[] = [];
    let maxId = -1;
    for (const record of parsed) {
      if (record.typeKey !== XP_ORB_TYPE_KEY) {
        throw new Error(`XpOrbManager: unexpected entity typeKey ${record.typeKey}`);
      }
      const d = record.data as Record<string, unknown>;
      if (
        !isFiniteInteger(d.id) ||
        (d.id as number) < 0 ||
        !isFiniteInteger(d.value) ||
        (d.value as number) < 1 ||
        !isFiniteNumber(d.x) ||
        !isFiniteNumber(d.y) ||
        !isFiniteNumber(d.z) ||
        !isFiniteNumber(d.vx) ||
        !isFiniteNumber(d.vy) ||
        !isFiniteNumber(d.vz) ||
        !isFiniteInteger(d.ageTicks) ||
        (d.ageTicks as number) < 0
      ) {
        throw new Error('XpOrbManager: malformed xp-orb data payload');
      }
      rebuilt.push(
        createXpOrb({
          id: d.id as number,
          value: d.value as number,
          x: d.x as number,
          y: d.y as number,
          z: d.z as number,
          vx: d.vx as number,
          vy: d.vy as number,
          vz: d.vz as number,
          ageTicks: d.ageTicks as number,
        }),
      );
      if ((d.id as number) > maxId) maxId = d.id as number;
    }

    this.byId.clear();
    this.order.length = 0;
    for (const orb of rebuilt) {
      this.byId.set(orb.id, orb);
      this.order.push(orb.id);
    }
    this.nextId = maxId + 1;
    return rebuilt.length;
  }
}
