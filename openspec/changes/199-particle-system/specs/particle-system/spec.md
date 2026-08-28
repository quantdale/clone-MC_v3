# Spec: particle-system

## Contract
This capability adds the pooled, data-driven particle simulation: a fixed kind table (block
debris, explosion, rain splash), an immutable capacity-bounded pool, spawn/step/burst operations,
and gameplay event hooks that map events to bursts — all pure, deterministic given the injected
rng, and headless-safe.

## Definitions
- **Kind**: a particle definition (gravity, drag, lifetime range, speed, size, color).
- **Pool**: `{ capacity, particles, size }` — immutable; `particles` is a compact array of live
  particles; `size` matches its length.
- **Burst**: spawning up to `count` particles with rng-randomized velocity and lifetime.

## Invariants
- Pure and headless-safe: no scene access, no mutation of inputs, no randomness inside the module.
- Pool capacity never changes; particles never exceed it; full pools never overwrite.
- `spawnParticle` on a full pool and `emitParticleEvent` on an unknown event MUST return the
  IDENTICAL pool.
- `stepParticles` MUST advance exactly one tick (drag, gravity, integration, life -1, removal at
  life <= 0) and MUST return the IDENTICAL pool when empty.
- Kind data MUST satisfy: gravity >= 0, drag in [0, 1], 0 < lifetimeMin <= lifetimeMax, size > 0,
  speed >= 0, color components in [0, 1].
- `createParticlePool` MUST throw a descriptive error for a non-positive or non-integer capacity.

## Requirements

### Requirement: kind table and lookup
`PARTICLE_KINDS` MUST contain exactly the three kinds `block_debris`, `explosion`, `rain_splash`,
each satisfying the data constraints; `particleKind(id)` MUST return the kind for those ids and
`undefined` otherwise.

#### Scenario: kinds
- **GIVEN** `PARTICLE_KINDS` and lookups for `block_debris`, `explosion`, `rain_splash`, `spark`
- **THEN** the table has 3 entries in that order, every kind satisfies the constraints, and the
  lookups return the kinds for the three ids and `undefined` for `spark`

### Requirement: pool creation
`createParticlePool(capacity)` MUST create an empty pool with that capacity for any positive
integer, and MUST throw a descriptive `Error` for 0, negative, non-integer, or NaN capacities.

#### Scenario: creation
- **GIVEN** capacities 64, 1, 0, -5, 1.5, NaN
- **THEN** the first two yield empty pools (`size` 0, `particles` empty, `capacity` preserved) and
  the rest each throw `ParticleSystem: capacity must be a positive integer, got <v>`

### Requirement: spawning a particle
`spawnParticle(pool, kind, position, velocity)` MUST append a particle with the given kind,
position, velocity, `life` = `maxLife` = the kind's `lifetimeMax`, and MUST return the IDENTICAL
pool when the pool is full.

#### Scenario: spawn
- **GIVEN** an empty pool of capacity 1 and `spawnParticle(pool, 'explosion', [1, 2, 3], [0, 0.5, 0])`
- **THEN** the result has `size` 1 and the particle `{ kind: 'explosion', x: 1, y: 2, z: 3, vx: 0,
  vy: 0.5, vz: 0, life: 25, maxLife: 25 }`; spawning again returns the identical pool

### Requirement: advancing one tick
`stepParticles(pool)` MUST apply, per live particle: `vx *= drag`, `vz *= drag`,
`vy = vy * drag - gravity`, `x += vx`, `y += vy`, `z += vz`, `life -= 1`; particles with
`life <= 0` MUST be removed; an empty pool MUST return the IDENTICAL pool.

#### Scenario: step
- **GIVEN** a particle `{ kind: 'rain_splash', x: 0, y: 10, z: 0, vx: 1, vy: 0, vz: 1, life: 1,
  maxLife: 20 }`
- **THEN** one step yields a particle with `vx: 0.8, vy: -0.15, vz: 0.8, x: 0.8, y: 9.85, z: 0.8,
  life: 0`, which is REMOVED by the following step (pool empty); stepping the empty pool returns
  the identical pool

### Requirement: bursts
`spawnBurst(pool, kind, position, count, rng)` MUST spawn `min(count, free)` particles, each with
velocity `(rng()*2-1) * speed` per axis and life `lifetimeMin + floor(rng() * (lifetimeMax -
lifetimeMin + 1))`; a non-integer or negative `count` MUST return the IDENTICAL pool.

#### Scenario: burst
- **GIVEN** an empty pool of capacity 100, kind `rain_splash` (life [10, 20], speed 0.3), count 2,
  and rng `() => 0.5`
- **THEN** the result has `size` 2, each particle has `|vx| = |vy| = |vz| = 0` (0.5*2-1 = 0),
  `life` = `maxLife` = 10 + floor(0.5 * 11) = 15, and position unchanged; with a pool that has
  only 1 free slot the burst spawns exactly 1 particle

### Requirement: gameplay event hooks
`emitParticleEvent(pool, event, position, rng)` MUST map `block_break` to 8 `block_debris`,
`explosion` to 24 `explosion`, and `rain` to 1 `rain_splash` bursts; any other event MUST return
the IDENTICAL pool.

#### Scenario: events
- **GIVEN** empty pools of capacity 64 and events `block_break`, `explosion`, `rain`, `thunder`
- **THEN** the first three yield `size` 8, 24, 1 with the mapped kinds, and `thunder` returns the
  identical pool

## Error and failure behavior
- `createParticlePool` throws on invalid capacity (construction-time validation).
- Everything else is total: full pools no-op, unknown events no-op, invalid burst counts no-op.

## Performance and resource bounds
- `stepParticles` is O(live particles); spawn/step never exceed capacity; bursts allocate at most
  `count` particles.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions; injected rng keeps randomness out of the simulation core (mirrors 196).

## Observability
- `pool.particles` / `pool.size` expose the full simulation; kinds are introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 kind table | `tests/unit/ParticleSystem.test.ts` › kind table |
| REQ-2 pool creation | › pool creation |
| REQ-3 spawning | › spawning |
| REQ-4 advancing | › advancing |
| REQ-5 bursts | › bursts |
| REQ-6 event hooks | › event hooks |
