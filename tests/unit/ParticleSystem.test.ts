import { describe, it, expect } from 'vitest';
import {
  PARTICLE_KINDS,
  createParticlePool,
  emitParticleEvent,
  particleKind,
  spawnBurst,
  spawnParticle,
  stepParticles,
  type Particle,
} from '../../src/simulation/ParticleSystem';

const HALF = () => 0.5;

describe('kind table', () => {
  it('defines exactly the three kinds in order with valid data', () => {
    expect(PARTICLE_KINDS.map((k) => k.id)).toEqual(['block_debris', 'explosion', 'rain_splash']);
    for (const kind of PARTICLE_KINDS) {
      expect(kind.gravity).toBeGreaterThanOrEqual(0);
      expect(kind.drag).toBeGreaterThanOrEqual(0);
      expect(kind.drag).toBeLessThanOrEqual(1);
      expect(kind.lifetimeMin).toBeGreaterThan(0);
      expect(kind.lifetimeMax).toBeGreaterThanOrEqual(kind.lifetimeMin);
      expect(kind.speed).toBeGreaterThanOrEqual(0);
      expect(kind.size).toBeGreaterThan(0);
      expect(kind.color.length).toBe(3);
      for (const c of kind.color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('looks up known kinds and rejects unknown ones', () => {
    expect(particleKind('block_debris')?.size).toBe(0.2);
    expect(particleKind('explosion')?.lifetimeMax).toBe(25);
    expect(particleKind('rain_splash')?.gravity).toBe(0.15);
    expect(particleKind('spark')).toBeUndefined();
  });
});

describe('pool creation', () => {
  it('creates empty pools with the requested capacity', () => {
    const pool = createParticlePool(64);
    expect(pool).toEqual({ capacity: 64, particles: [], size: 0 });
    expect(createParticlePool(1).capacity).toBe(1);
  });

  it('throws for invalid capacities', () => {
    for (const capacity of [0, -5, 1.5, NaN]) {
      expect(() => createParticlePool(capacity)).toThrow(
        `ParticleSystem: capacity must be a positive integer, got ${String(capacity)}`,
      );
    }
  });
});

describe('spawning', () => {
  it('appends a particle with the kind max lifetime', () => {
    const pool = createParticlePool(4);
    const next = spawnParticle(pool, 'explosion', [1, 2, 3], [0, 0.5, 0]);
    expect(next.size).toBe(1);
    expect(next.particles[0]).toEqual({
      kind: 'explosion',
      x: 1,
      y: 2,
      z: 3,
      vx: 0,
      vy: 0.5,
      vz: 0,
      life: 25,
      maxLife: 25,
    });
    expect(next).not.toBe(pool);
    expect(pool.size).toBe(0);
  });

  it('identity-no-ops on a full pool', () => {
    const full = spawnParticle(createParticlePool(1), 'explosion', [0, 0, 0], [0, 0, 0]);
    expect(spawnParticle(full, 'explosion', [0, 0, 0], [0, 0, 0])).toBe(full);
  });
});

describe('advancing', () => {
  it('applies drag, gravity, integration, and life decrement', () => {
    const pool = spawnParticle(
      createParticlePool(4),
      'rain_splash',
      [0, 10, 0],
      [1, 0, 1],
    );
    const stepped = stepParticles(pool);
    const p = stepped.particles[0]!;
    expect(p.vx).toBeCloseTo(0.8);
    expect(p.vy).toBeCloseTo(-0.15);
    expect(p.vz).toBeCloseTo(0.8);
    expect(p.x).toBeCloseTo(0.8);
    expect(p.y).toBeCloseTo(9.85);
    expect(p.z).toBeCloseTo(0.8);
    expect(p.life).toBe(19); // rain_splash max life 20, one tick elapsed
    expect(p.maxLife).toBe(20);
  });

  it('removes dead particles and identity-no-ops on an empty pool', () => {
    const alive: Particle = {
      kind: 'rain_splash',
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 1,
      maxLife: 1,
    };
    const dying = { capacity: 2, particles: [alive], size: 1 };
    expect(stepParticles(dying)).toEqual({ capacity: 2, particles: [], size: 0 });
    const empty = { capacity: 2, particles: [], size: 0 };
    expect(stepParticles(empty)).toBe(empty);
  });
});

describe('bursts', () => {
  it('spawns count particles with rng-driven velocity and lifetime', () => {
    const pool = createParticlePool(100);
    const burst = spawnBurst(pool, 'rain_splash', [5, 6, 7], 2, HALF);
    expect(burst.size).toBe(2);
    for (const p of burst.particles) {
      expect(p.kind).toBe('rain_splash');
      expect(p.x).toBe(5);
      expect(p.y).toBe(6);
      expect(p.z).toBe(7);
      expect(p.vx).toBeCloseTo(0); // (0.5*2-1)*0.3 = 0
      expect(p.vy).toBeCloseTo(0);
      expect(p.vz).toBeCloseTo(0);
      expect(p.life).toBe(10 + Math.floor(0.5 * 11)); // 15
      expect(p.maxLife).toBe(p.life);
    }
  });

  it('spawns only as many as fit', () => {
    const full = spawnBurst(createParticlePool(1), 'rain_splash', [0, 0, 0], 5, HALF);
    expect(full.size).toBe(1);
    const nearlyFull = { capacity: 2, particles: [...full.particles], size: 1 };
    const partial = spawnBurst(nearlyFull, 'rain_splash', [0, 0, 0], 5, HALF);
    expect(partial.size).toBe(2);
  });

  it('identity-no-ops on invalid counts', () => {
    const pool = createParticlePool(4);
    expect(spawnBurst(pool, 'rain_splash', [0, 0, 0], -1, HALF)).toBe(pool);
    expect(spawnBurst(pool, 'rain_splash', [0, 0, 0], 1.5, HALF)).toBe(pool);
  });
});

describe('event hooks', () => {
  it('maps block_break, explosion, and rain to their bursts', () => {
    const debris = emitParticleEvent(createParticlePool(64), 'block_break', [0, 0, 0], HALF);
    expect(debris.size).toBe(8);
    expect(debris.particles.every((p) => p.kind === 'block_debris')).toBe(true);

    const boom = emitParticleEvent(createParticlePool(64), 'explosion', [0, 0, 0], HALF);
    expect(boom.size).toBe(24);
    expect(boom.particles.every((p) => p.kind === 'explosion')).toBe(true);

    const splash = emitParticleEvent(createParticlePool(64), 'rain', [0, 0, 0], HALF);
    expect(splash.size).toBe(1);
    expect(splash.particles[0]!.kind).toBe('rain_splash');
  });

  it('identity-no-ops on unknown events', () => {
    const pool = createParticlePool(64);
    expect(emitParticleEvent(pool, 'thunder', [0, 0, 0], HALF)).toBe(pool);
  });
});
