# Proposal: 199-particle-system

## Problem
Gameplay events (block breaking, explosions, weather) have no visible/audible presence hooks:
nothing spawns, advances, or pools particles. 200's sound events will want the same event-hook
shape, and the rendering layer needs a deterministic particle simulation to draw.

## Goals
- `src/simulation/ParticleSystem.ts` (NEW), pure and headless-safe (no scene access, no mutation
  of inputs):
  - **Kinds**: a fixed module-local table `PARTICLE_KINDS` of three data-driven kinds —
    `block_debris`, `explosion`, `rain_splash` — each with gravity, drag, lifetime range, size,
    speed, and color; `particleKind(id)` lookup.
  - **Pool**: `createParticlePool(capacity)` (positive-integer capacity; invalid -> descriptive
    throw); `ParticlePool { capacity, particles, size }` is immutable; live particles are compact
    with no holes.
  - **Spawn**: `spawnParticle(pool, kind, position, velocity)` adds a particle or returns the
    IDENTICAL pool when full (no overwrite).
  - **Advance**: `stepParticles(pool)` advances one tick — gravity, drag, life decrement, dead
    removal; an empty pool returns the IDENTICAL pool.
  - **Burst**: `spawnBurst(pool, kind, position, count, rng)` spawns up to `count` particles with
    rng-randomized velocity and lifetime (injected rng — fully deterministic given it); a full
    pool spawns as many as fit.
  - **Event hooks**: `emitParticleEvent(pool, event, position, rng)` maps gameplay events to
    bursts: `block_break` -> 8 debris, `explosion` -> 24 explosion, `rain` -> 1 splash; unknown
    events return the IDENTICAL pool.

## Non-goals
- **No rendering/mesh work** (the rendering layer draws `particles`), **no sound** (200), **no
  persistence** (particles are transient simulation state, vanilla-style), **no `Game.ts` edit**,
  **no save-format change**.

## Preconditions
- Change 198 (`sleep-and-time-skip`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library; randomness is injected (mirrors 196's rolls).

## Proposed change
1. `src/simulation/ParticleSystem.ts` (NEW): the kind table, pool, spawn/step/burst, and event
   hooks.

## Compatibility and migration
- One new simulation file; zero registry changes (module-local kind table, gamerule-style), zero
  characterization updates, no `Game.ts` edit, no schema/save-format change.

## Risks
- **Pool overflow semantics**. Mitigation: full pools never overwrite — spawn no-ops and bursts
  spawn as many as fit, both pinned by tests.
- **RNG coupling**. Mitigation: the rng function is injected and its exact use is documented;
  tests use fixed rng sequences to pin the math.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: the kind table (all fields valid per constraints) and lookup; pool creation
  (valid + every invalid capacity); spawn (fields, full-pool no-op); step (gravity/drag/life/
  removal, empty-pool identity); burst (count, rng-driven values, partial spawn near full);
  event hooks (mapping counts/kinds, unknown event identity).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
