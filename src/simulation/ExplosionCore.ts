/**
 * Explosion core (169): deterministic, vanilla-shaped block destruction + entity damage + drops,
 * with NO registry footprint (the first destruction-path module in the redstone/automation arc, and
 * the first redstone-arc module since 163 with zero BlockRegistry/ItemRegistry changes).
 *
 * The ray model mirrors vanilla's Explosion: 1352 unit rays sampled from the surface of a 16x16x16
 * lattice (16^3 - 14^3 = 1352), each marching from the explosion center in 0.3 steps while its
 * remaining power decays by 0.225 per step plus `(resistance + 0.3) * 0.3` per non-air block
 * encountered. A block position is *marked* while a ray's power is still positive there; the
 * destroyed set is the marked positions whose block is destroyable (caller-decided, so fluids can
 * absorb rays like vanilla's water without being destroyed). Results are fully deterministic: the
 * destroyed positions are sorted lexicographically by (x, y, z), and drops are resolved through the
 * caller's `dropFor` in that same order.
 *
 * Vanilla's random "exposure" roll (whether a marked block is actually destroyed) is deliberately
 * NOT modeled: this core's rule is deterministic (any positive-power ray destroys). The random roll
 * is a wiring concern for a real world, not part of a deterministic core — documented rather than
 * silently approximated.
 *
 * Entity damage mirrors vanilla's `damageEntities` with exposure = 1 (full exposure): with
 * `f = strength * 2` and `d = distance / f`, damage is
 * `floor(((1-d)^2 + (1-d)) / 2 * 7 * f + 1)` for `d <= 1`.
 */
/** Ray lattice size: rays are sampled on the surface of a 16x16x16 cube. */
export const EXPLOSION_RAY_SAMPLES = 16;
/** March step along each ray (vanilla's 0.3). */
export const EXPLOSION_RAY_STEP = 0.3;
/** Per-step power decay regardless of what the ray passes through (vanilla's 0.225). */
export const EXPLOSION_RAY_DECAY = 0.225;
/** Total ray count: 16^3 - 14^3 (all lattice points except the interior). */
export const EXPLOSION_RAY_COUNT = 1352;

/** The caller-supplied world seam: how the core reads states, resistances, and drops. */
export interface ExplosionWorld<S> {
  getBlockState(x: number, y: number, z: number): S;
  isAir(state: S): boolean;
  isDestroyable(state: S): boolean;
  blastResistance(state: S): number;
  dropFor(state: S): string | null;
}

export interface ExplosionInput<S> {
  /** Explosion center in world coordinates (typically a block center, e.g. [0.5, 0.5, 0.5]). */
  readonly center: readonly [number, number, number];
  /** Explosion strength (e.g. 4 for TNT, 3 for a creeper). */
  readonly strength: number;
  readonly world: ExplosionWorld<S>;
}

export interface ExplosionResult {
  /** Destroyed block positions, sorted lexicographically by (x, y, z). */
  readonly destroyed: ReadonlyArray<readonly [number, number, number]>;
  /** Drops for destroyed blocks with a non-null `dropFor`, in the same order as `destroyed`. */
  readonly drops: ReadonlyArray<{ item: string; position: readonly [number, number, number] }>;
}

export interface EntityDamage {
  readonly position: readonly [number, number, number];
  readonly damage: number;
}

function isFinite3(v: readonly [number, number, number]): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

/** The 1352 deterministic unit ray directions (surface of the 16x16x16 lattice, normalized). */
export function explosionRays(): ReadonlyArray<readonly [number, number, number]> {
  const rays: Array<readonly [number, number, number]> = [];
  const n = EXPLOSION_RAY_SAMPLES;
  for (let k = 0; k < n; k++) {
    for (let l = 0; l < n; l++) {
      for (let m = 0; m < n; m++) {
        const onSurface = k === 0 || k === n - 1 || l === 0 || l === n - 1 || m === 0 || m === n - 1;
        if (!onSurface) continue;
        const dx = (k / (n - 1)) * 2 - 1;
        const dy = (l / (n - 1)) * 2 - 1;
        const dz = (m / (n - 1)) * 2 - 1;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        rays.push([dx / len, dy / len, dz / len]);
      }
    }
  }
  return rays;
}

const RAYS = explosionRays();

function positionKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/**
 * Compute the deterministic outcome of an explosion: destroyed block positions (sorted by (x, y, z))
 * and their drops. Non-finite strength/center inputs yield an empty result; air-only worlds destroy
 * nothing.
 */
export function computeExplosion<S>(input: ExplosionInput<S>): ExplosionResult {
  const { center, strength, world } = input;
  if (!Number.isFinite(strength) || strength <= 0 || !isFinite3(center)) {
    return { destroyed: [], drops: [] };
  }

  const marked = new Map<string, [number, number, number]>();

  for (const ray of RAYS) {
    let power = strength;
    let rx = center[0];
    let ry = center[1];
    let rz = center[2];
    while (power > 0) {
      const px = Math.floor(rx);
      const py = Math.floor(ry);
      const pz = Math.floor(rz);
      const state = world.getBlockState(px, py, pz);
      if (!world.isAir(state)) {
        power -= (world.blastResistance(state) + 0.3) * 0.3;
      }
      if (power > 0) {
        marked.set(positionKey(px, py, pz), [px, py, pz]);
      }
      rx += ray[0] * EXPLOSION_RAY_STEP;
      ry += ray[1] * EXPLOSION_RAY_STEP;
      rz += ray[2] * EXPLOSION_RAY_STEP;
      power -= EXPLOSION_RAY_DECAY;
    }
  }

  const destroyed = [...marked.values()]
    .filter(([x, y, z]) => world.isDestroyable(world.getBlockState(x, y, z)))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

  const drops: Array<{ item: string; position: readonly [number, number, number] }> = [];
  for (const [x, y, z] of destroyed) {
    const item = world.dropFor(world.getBlockState(x, y, z));
    if (item !== null) {
      drops.push({ item, position: [x, y, z] });
    }
  }

  return { destroyed, drops };
}

/**
 * Deterministic entity damage for an explosion, mirroring vanilla's `damageEntities` with
 * exposure = 1: `f = strength * 2`, `d = distance / f`, damage = `floor(((1-d)^2 + (1-d)) / 2 *
 * 7 * f + 1)` for `d <= 1`. Returns entries in input order; positions at or beyond `f` are omitted.
 */
export function explosionEntityDamage(
  center: readonly [number, number, number],
  strength: number,
  positions: ReadonlyArray<readonly [number, number, number]>,
): ReadonlyArray<EntityDamage> {
  if (!Number.isFinite(strength) || strength <= 0 || !isFinite3(center)) {
    return [];
  }
  const f = strength * 2;
  const out: EntityDamage[] = [];
  for (const position of positions) {
    if (!isFinite3(position)) continue;
    const dx = position[0] - center[0];
    const dy = position[1] - center[1];
    const dz = position[2] - center[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / f;
    if (d > 1) continue;
    const oneMinusD = 1 - d;
    const damage = Math.floor(((oneMinusD * oneMinusD + oneMinusD) / 2) * 7 * f + 1);
    out.push({ position, damage });
  }
  return out;
}
