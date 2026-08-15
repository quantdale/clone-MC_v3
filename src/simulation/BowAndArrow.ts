/**
 * Bow-and-arrow charge/fire/damage/pickup layer (143), built over 142's
 * projectile core. Charge progress, fire velocity, and damage are pure
 * formulas; `LandedArrowTracker` mirrors 112's dropped-item pickup-delay/
 * radius convention for an embedded arrow. No `Inventory`/`EntityManager`/
 * `Game` wiring — see `openspec/changes/143-bow-and-arrow/design.md`.
 */

/** Arrow speed (blocks/tick) at full draw. */
export const DEFAULT_ARROW_SPEED = 3.0;
/** Base damage multiplier applied to impact speed. */
export const DEFAULT_ARROW_BASE_DAMAGE = 2;
/** Ticks before a landed arrow becomes collectible (mirrors 112's PICKUP_DELAY_TICKS). */
export const DEFAULT_PICKUP_DELAY_TICKS = 10;
/** Pickup proximity radius in blocks (mirrors 112's PICKUP_RADIUS). */
export const DEFAULT_PICKUP_RADIUS = 1.5;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Vanilla bow-charge curve: `f = clamp(ticksCharged/20, 0, 1)`, returning
 * `(f² + 2f) / 3`. `0` at no draw, `1` at a full (20-tick) draw, clamped
 * beyond.
 */
export function bowPullProgress(ticksCharged: number): number {
  const f = clamp01(ticksCharged / 20);
  return (f * f + f * 2) / 3;
}

/** Arrow speed for a given (clamped) pull progress. */
export function computeArrowSpeed(pullProgress: number, baseSpeed: number = DEFAULT_ARROW_SPEED): number {
  return baseSpeed * clamp01(pullProgress);
}

/** A fire velocity vector. */
export interface FireVelocity {
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Initial fire velocity along the normalized `(dirX, dirY, dirZ)`, scaled by
 * `computeArrowSpeed(pullProgress, baseSpeed)`. Returns `{0,0,0}` for a
 * (degenerate) zero-length direction.
 */
export function computeFireVelocity(
  dirX: number,
  dirY: number,
  dirZ: number,
  pullProgress: number,
  baseSpeed: number = DEFAULT_ARROW_SPEED,
): FireVelocity {
  const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  if (len < 1e-9) {
    return { vx: 0, vy: 0, vz: 0 };
  }
  const speed = computeArrowSpeed(pullProgress, baseSpeed);
  return { vx: (dirX / len) * speed, vy: (dirY / len) * speed, vz: (dirZ / len) * speed };
}

/** Damage dealt by an arrow impacting at `speed`, never negative. */
export function computeArrowDamage(speed: number, baseDamage: number = DEFAULT_ARROW_BASE_DAMAGE): number {
  return Math.max(0, Math.ceil(speed * baseDamage));
}

/** Whether a bow may currently be fired, given the held arrow count. */
export function canFireBow(arrowCount: number, infiniteAmmo: boolean = false): boolean {
  return infiniteAmmo || arrowCount > 0;
}

/** A tracked, embedded (landed) arrow awaiting pickup. */
export interface LandedArrow {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly landedTick: number;
  readonly ownerId: number | null;
}

/** Tracks landed arrows and their proximity-based pickup, mirroring 112's item-pickup convention. */
export class LandedArrowTracker {
  private readonly arrows = new Map<number, LandedArrow>();
  private nextId = 0;

  /** Record a newly landed arrow; returns its minted id. */
  addLandedArrow(x: number, y: number, z: number, landedTick: number, ownerId: number | null): number {
    const id = this.nextId++;
    this.arrows.set(id, { id, x, y, z, landedTick, ownerId });
    return id;
  }

  /** The tracked arrow with `id`, or `undefined`. */
  getArrow(id: number): LandedArrow | undefined {
    return this.arrows.get(id);
  }

  /** Remove `id` directly (e.g. despawn); returns whether it existed. */
  removeArrow(id: number): boolean {
    return this.arrows.delete(id);
  }

  /** All tracked arrows (insertion order not guaranteed). */
  getAll(): LandedArrow[] {
    return [...this.arrows.values()];
  }

  /** Number of tracked arrows. */
  get size(): number {
    return this.arrows.size;
  }

  /** Remove all tracked arrows and reset id minting. */
  clear(): void {
    this.arrows.clear();
    this.nextId = 0;
  }

  /**
   * Collect (and remove) every arrow whose age (`currentTick - landedTick`)
   * is `>= pickupDelayTicks` and whose distance to `(playerX, playerY,
   * playerZ)` is `<= pickupRadius`. Returns the collected ids.
   */
  collectNearby(
    playerX: number,
    playerY: number,
    playerZ: number,
    currentTick: number,
    pickupRadius: number = DEFAULT_PICKUP_RADIUS,
    pickupDelayTicks: number = DEFAULT_PICKUP_DELAY_TICKS,
  ): number[] {
    const collected: number[] = [];
    const radiusSq = pickupRadius * pickupRadius;
    for (const arrow of this.getAll()) {
      if (currentTick - arrow.landedTick < pickupDelayTicks) continue;
      const dx = playerX - arrow.x;
      const dy = playerY - arrow.y;
      const dz = playerZ - arrow.z;
      if (dx * dx + dy * dy + dz * dz <= radiusSq) {
        collected.push(arrow.id);
        this.arrows.delete(arrow.id);
      }
    }
    return collected;
  }
}
