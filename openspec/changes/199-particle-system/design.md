# Design: 199-particle-system

## Context/current state
- Gameplay events have no particle representation. 199 adds the pure pooled particle simulation
  (kinds, spawn, tick, burst, event hooks); the rendering layer draws `particles` and 200's sound
  events follow the same event-hook shape.

## Target state
- `src/simulation/ParticleSystem.ts` holding the fixed kind table, the immutable `ParticlePool`,
  spawn/step/burst, and the gameplay event hook mapping.

## Invariants
- Pure and headless-safe: no scene access, no mutation of inputs, no randomness inside the module
  (rng injected).
- `ParticlePool` is immutable: `particles` is a compact array of live particles (no holes) and
  `size` matches its length; capacity never changes.
- Full pools never overwrite: `spawnParticle` returns the IDENTICAL pool; `spawnBurst` spawns as
  many as fit.
- `stepParticles` advances exactly one tick: velocity drag/gravity, life -1, removal at life <= 0;
  an empty pool returns the IDENTICAL pool.
- Kind data is validated at load: gravity >= 0, drag in [0, 1], 0 < lifetimeMin <= lifetimeMax,
  size > 0, speed >= 0, 3-component color in [0, 1].
- `emitParticleEvent` maps only the three documented events; anything else is an identity no-op.

## API and data model
```ts
// src/simulation/ParticleSystem.ts (new)
export type ParticleKindId = 'block_debris' | 'explosion' | 'rain_splash';
export interface ParticleKind {
  id: ParticleKindId;
  gravity: number;       // per-tick downward velocity change
  drag: number;          // per-tick velocity multiplier (0..1)
  lifetimeMin: number;   // ticks, inclusive
  lifetimeMax: number;   // ticks, inclusive
  speed: number;         // random velocity magnitude scale
  size: number;          // units
  color: readonly [number, number, number];
}
export const PARTICLE_KINDS: readonly ParticleKind[];
export function particleKind(id: string): ParticleKind | undefined;

export interface Particle {
  kind: ParticleKindId;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;       // remaining ticks
  maxLife: number;    // original life (for fade)
}

export interface ParticlePool {
  capacity: number;
  particles: readonly Particle[];
  size: number;
}

export type Vec3 = readonly [number, number, number];

export function createParticlePool(capacity: number): ParticlePool;          // throws on invalid
export function spawnParticle(pool: ParticlePool, kind: ParticleKindId, position: Vec3, velocity: Vec3): ParticlePool;
export function stepParticles(pool: ParticlePool): ParticlePool;
export function spawnBurst(pool: ParticlePool, kind: ParticleKindId, position: Vec3, count: number, rng: () => number): ParticlePool;
export type ParticleEvent = 'block_break' | 'explosion' | 'rain';
export function emitParticleEvent(pool: ParticlePool, event: string, position: Vec3, rng: () => number): ParticlePool;
```

## Control/data flow
1. Gameplay systems call `emitParticleEvent(pool, 'block_break' | 'explosion' | 'rain', pos, rng)`
   or direct `spawnBurst`/`spawnParticle`.
2. Each simulation tick the wiring calls `stepParticles(pool)` and stores the result.
3. The rendering layer reads `pool.particles` (position, velocity, life/maxLife for fade, kind for
   color/size).

## Detailed behavior
- Kind table (module-local constants):
  - `block_debris`: gravity 0.04, drag 0.9, life [20, 40], speed 0.5, size 0.2, color [0.6, 0.4, 0.3].
  - `explosion`: gravity 0.02, drag 0.85, life [10, 25], speed 1.2, size 0.35, color [1, 0.8, 0.4].
  - `rain_splash`: gravity 0.15, drag 0.8, life [10, 20], speed 0.3, size 0.08, color [0.6, 0.8, 1].
- `createParticlePool(capacity)`: `Number.isSafeInteger(capacity) && capacity > 0` else
  `Error('ParticleSystem: capacity must be a positive integer, got <v>')`.
- `spawnParticle`: full -> identical pool; else a NEW pool with the particle appended
  (`life = maxLife = lifetimeMax` — spawning uses the max lifetime; burst randomizes).
- `stepParticles`: for each live particle: `vx *= drag; vz *= drag; vy = vy * drag - gravity; x +=
  vx; y += vy; z += vz; life -= 1`; keep `life > 0`. Empty pool -> identical.
- `spawnBurst(pool, kind, pos, count, rng)`: `count` must be a non-negative integer (else
  identical pool); spawns `min(count, capacity - size)` particles, each with:
  `vx = (rng() * 2 - 1) * speed`, `vy = (rng() * 2 - 1) * speed`, `vz = (rng() * 2 - 1) * speed`,
  `life = lifetimeMin + floor(rng() * (lifetimeMax - lifetimeMin + 1))`, `maxLife = life`.
- `emitParticleEvent(pool, event, pos, rng)`: `block_break` -> `spawnBurst(block_debris, 8)`;
  `explosion` -> `spawnBurst(explosion, 24)`; `rain` -> `spawnBurst(rain_splash, 1)`; unknown ->
  identical pool. (counts clamped by the free slots, per burst semantics.)

## Failure modes
- `createParticlePool` throws on invalid capacity (construction-time validation).
- Everything else is total: full pools no-op, unknown events no-op, invalid burst counts no-op.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- `stepParticles` is O(live particles) with one new array per tick; spawn/step never exceed the
  capacity. Burst spawns allocate at most `count` particles.

## Testing seams
- Tests use fixed rng sequences (e.g. `() => 0.5`) to pin velocity/lifetime math exactly, and
  filled pools to pin overflow behavior.

## Observability/debugging
- `pool.particles` and `pool.size` expose the full simulation; kind lookup is introspectable.

## Affected files/symbols
- `src/simulation/ParticleSystem.ts` (new).
- Tests: `tests/unit/ParticleSystem.test.ts` (new). No other files.

## Rejected alternatives
- **Persisting particles**: rejected — particles are transient simulation state (vanilla clears
  them on save/load).
- **A shared registry for kinds**: rejected — a module-local fixed table (gamerule-style) keeps
  zero registry changes while staying data-driven.

## Downstream dependencies
- 200 (`sound-event-system`) mirrors the event-hook shape; the rendering layer draws particles;
  242's e2e asserts particle bursts after block breaks/explosions.
