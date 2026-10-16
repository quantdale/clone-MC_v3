# Proposal: 054-deterministic-rng-streams

## Problem

Simulation subsystems (mob AI rolls, loot, growth, redstone noise) need randomness, but shared or
timing-dependent randomness makes runs unreproducible. 048 hashes per-cell selections; subsystems
need *streams*: named, seed-derived PRNG sequences that replay identically and never interfere with
each other.

## Goals

- Provide a deterministic `SeedRng` (mulberry32) with `next()`/`nextFloat()`/`nextInt`/
  `nextIntInclusive`/`nextBoolean()`.
- Provide named streams: `createNamedRng(worldSeed, streamName)` derives a unique, reproducible
  stream per subsystem — the same `(seed, name)` always yields the same sequence.
- `fork(name)` derives a child stream deterministically from the parent's current state, so
  subsystems can spawn independent sub-streams without shared state.
- Expose `state` for replay/debugging.

## Non-goals

- Cryptographically secure randomness (simulation only).
- Replacing 048's per-cell hashing (independent primitive).
- Persistence of stream state (a later determinism/replay concern; 241 can record seeds instead).

## Preconditions

- Change 053 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 053 baseline (658 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/simulation/SeedRng.ts` (NEW): `SeedRng`, `createNamedRng(worldSeed, streamName)`.
- `tests/unit/SeedRng.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- The PRNG algorithm must never change once consumers rely on it (determinism contract). Documented
  and pinned in the spec; any future change requires a versioned stream scheme.

## Rollback strategy

Revert the commit; the RNG is additive.

## Definition of Done

- Same seed → identical sequence; different seeds/names → different sequences.
- `nextInt(max)` in `[0, max)`; `nextIntInclusive(min, max)` in `[min, max]`; `nextFloat()` in
  `[0, 1)`.
- `fork(name)` from the same state yields the same child sequence; forking consumes parent state.
- `createNamedRng` isolates streams by name.
- Unit tests cover determinism, ranges, isolation, forking, and state exposure.
- Full gate green; 054 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 054 suite; E2E stays 19/19.
