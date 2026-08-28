/**
 * Particle system (199): pooled, data-driven particles and gameplay event hooks. Pure and
 * headless-safe — no scene access, no mutation of inputs, no randomness inside the module (the
 * rng is injected, mirroring 196's rolls).
 *
 * Kinds (fixed module-local table, gamerule-style — zero registry changes):
 *   block_debris: gravity 0.04, drag 0.9,  life [20, 40], speed 0.5, size 0.2,  color [0.6, 0.4, 0.3]
 *   explosion:    gravity 0.02, drag 0.85, life [10, 25], speed 1.2, size 0.35, color [1, 0.8, 0.4]
 *   rain_splash:  gravity 0.15, drag 0.8,  life [10, 20], speed 0.3, size 0.08, color [0.6, 0.8, 1]
 *
 * Determinism rules:
 * - The pool is immutable: `particles` is a compact array of live particles, `size` matches it,
 *   capacity never changes. Full pools never overwrite: spawn no-ops, bursts spawn as many as fit.
 * - `stepParticles` advances exactly one tick (drag, gravity, integration, life -1, removal at
 *   life <= 0); an empty pool returns the IDENTICAL pool.
 * - `emitParticleEvent` maps only block_break (8 debris), explosion (24), rain (1 splash);
 *   unknown events and invalid burst counts return the IDENTICAL pool.
 */
export type ParticleKindId = 'block_debris' | 'explosion' | 'rain_splash';

/** A data-driven particle definition. */
export interface ParticleKind {
  readonly id: ParticleKindId;
  /** Per-tick downward velocity change. */
  readonly gravity: number;
  /** Per-tick velocity multiplier (0..1). */
  readonly drag: number;
  /** Lifetime range in ticks, inclusive. */
  readonly lifetimeMin: number;
  readonly lifetimeMax: number;
  /** Random velocity magnitude scale. */
  readonly speed: number;
  readonly size: number;
  readonly color: readonly [number, number, number];
}

const KINDS: readonly ParticleKind[] = [
  { id: 'block_debris', gravity: 0.04, drag: 0.9, lifetimeMin: 20, lifetimeMax: 40, speed: 0.5, size: 0.2, color: [0.6, 0.4, 0.3] },
  { id: 'explosion', gravity: 0.02, drag: 0.85, lifetimeMin: 10, lifetimeMax: 25, speed: 1.2, size: 0.35, color: [1, 0.8, 0.4] },
  { id: 'rain_splash', gravity: 0.15, drag: 0.8, lifetimeMin: 10, lifetimeMax: 20, speed: 0.3, size: 0.08, color: [0.6, 0.8, 1] },
];

/** The fixed kind table. */
export const PARTICLE_KINDS: readonly ParticleKind[] = KINDS;

/** Look up a kind by id, or `undefined`. */
export function particleKind(id: string): ParticleKind | undefined {
  return KINDS.find((k) => k.id === id);
}

/** One live particle. */
export interface Particle {
  readonly kind: ParticleKindId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Remaining ticks. */
  readonly life: number;
  /** Original life (for fade). */
  readonly maxLife: number;
}

/** Immutable, capacity-bounded pool of live particles. */
export interface ParticlePool {
  readonly capacity: number;
  readonly particles: readonly Particle[];
  readonly size: number;
}

export type Vec3 = readonly [number, number, number];

/** Create an empty pool. Throws for a non-positive or non-integer capacity. */
export function createParticlePool(capacity: number): ParticlePool {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new Error(`ParticleSystem: capacity must be a positive integer, got ${String(capacity)}`);
  }
  return { capacity, particles: [], size: 0 };
}

/**
 * Append one particle with the kind's max lifetime. A full pool returns the IDENTICAL pool (no
 * overwrite).
 */
export function spawnParticle(
  pool: ParticlePool,
  kind: ParticleKindId,
  position: Vec3,
  velocity: Vec3,
): ParticlePool {
  if (pool.size >= pool.capacity) return pool;
  const def = particleKind(kind);
  const particle: Particle = {
    kind,
    x: position[0],
    y: position[1],
    z: position[2],
    vx: velocity[0],
    vy: velocity[1],
    vz: velocity[2],
    life: def?.lifetimeMax ?? 0,
    maxLife: def?.lifetimeMax ?? 0,
  };
  return { capacity: pool.capacity, particles: [...pool.particles, particle], size: pool.size + 1 };
}

/**
 * Advance exactly one tick: drag, gravity, integration, life -1, removal at life <= 0. An empty
 * pool returns the IDENTICAL pool.
 */
export function stepParticles(pool: ParticlePool): ParticlePool {
  if (pool.size === 0) return pool;
  const next: Particle[] = [];
  for (const p of pool.particles) {
    const vx = p.vx * dragOf(p.kind);
    const vy = p.vy * dragOf(p.kind) - gravityOf(p.kind);
    const vz = p.vz * dragOf(p.kind);
    const life = p.life - 1;
    if (life > 0) {
      next.push({
        kind: p.kind,
        x: p.x + vx,
        y: p.y + vy,
        z: p.z + vz,
        vx,
        vy,
        vz,
        life,
        maxLife: p.maxLife,
      });
    }
  }
  return { capacity: pool.capacity, particles: next, size: next.length };
}

function dragOf(kind: ParticleKindId): number {
  return particleKind(kind)?.drag ?? 1;
}

function gravityOf(kind: ParticleKindId): number {
  return particleKind(kind)?.gravity ?? 0;
}

/**
 * Spawn up to `count` particles at `position` with rng-randomized velocity and lifetime:
 * per axis `(rng()*2-1) * speed`, life `lifetimeMin + floor(rng() * (lifetimeMax - lifetimeMin +
 * 1))`. A non-integer or negative `count` returns the IDENTICAL pool; a nearly-full pool spawns
 * as many as fit.
 */
export function spawnBurst(
  pool: ParticlePool,
  kind: ParticleKindId,
  position: Vec3,
  count: number,
  rng: () => number,
): ParticlePool {
  if (!Number.isSafeInteger(count) || count < 0) return pool;
  const def = particleKind(kind);
  if (def === undefined) return pool;
  const spawnCount = Math.min(count, pool.capacity - pool.size);
  if (spawnCount <= 0) return pool;
  const particles: Particle[] = [...pool.particles];
  for (let i = 0; i < spawnCount; i += 1) {
    const life = def.lifetimeMin + Math.floor(rng() * (def.lifetimeMax - def.lifetimeMin + 1));
    particles.push({
      kind,
      x: position[0],
      y: position[1],
      z: position[2],
      vx: (rng() * 2 - 1) * def.speed,
      vy: (rng() * 2 - 1) * def.speed,
      vz: (rng() * 2 - 1) * def.speed,
      life,
      maxLife: life,
    });
  }
  return { capacity: pool.capacity, particles, size: particles.length };
}

export type ParticleEvent = 'block_break' | 'explosion' | 'rain';

/**
 * Gameplay event hook: maps events to bursts. `block_break` -> 8 block_debris, `explosion` -> 24
 * explosion, `rain` -> 1 rain_splash. Unknown events return the IDENTICAL pool.
 */
export function emitParticleEvent(
  pool: ParticlePool,
  event: string,
  position: Vec3,
  rng: () => number,
): ParticlePool {
  switch (event) {
    case 'block_break':
      return spawnBurst(pool, 'block_debris', position, 8, rng);
    case 'explosion':
      return spawnBurst(pool, 'explosion', position, 24, rng);
    case 'rain':
      return spawnBurst(pool, 'rain_splash', position, 1, rng);
    default:
      return pool;
  }
}
