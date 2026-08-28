# Design: 054-deterministic-rng-streams

## Context / current state

Subsystems need reproducible randomness. 048 uses per-cell hashing; no stream primitive exists.

## Target state

A `SeedRng` (mulberry32, 32-bit state) with typed draws, `fork(name)` for deterministic child
streams, and `createNamedRng(worldSeed, streamName)` for per-subsystem named streams.

## Invariants

- The same initial seed produces the identical output sequence (algorithm pinned: mulberry32).
- `createNamedRng` derives the stream seed as `hashString(streamName) ^ worldSeed`-style (fixed,
  documented), so names are isolated and reproducible.
- `nextInt(max)` returns `floor(nextFloat() * max)` in `[0, max)`; `nextIntInclusive(min, max)`
  returns `min + nextInt(max - min + 1)`; `nextFloat()` in `[0, 1)`.
- `fork(name)` derives a child seed from the parent's current state and the name (FNV-1a over the
  string), consuming one parent draw; the same parent state + name always yields the same child.
- `state` exposes the current 32-bit state for replay/debugging.

## API and data model

```ts
// src/simulation/SeedRng.ts
export class SeedRng {
  constructor(seed: number);
  next(): number;                       // uint32
  nextFloat(): number;                  // [0, 1)
  nextInt(maxExclusive: number): number; // [0, maxExclusive)
  nextIntInclusive(min: number, max: number): number;
  nextBoolean(): boolean;
  fork(name: string): SeedRng;
  get state(): number;
}
export function createNamedRng(worldSeed: number, streamName: string): SeedRng;
```

## Control / data flow

1. A subsystem obtains its stream: `const rng = createNamedRng(worldSeed, 'mob-spawn')`.
2. It draws via `nextInt`/`nextFloat`/etc.; all draws advance the same deterministic sequence.
3. For independent sub-streams (e.g., per-entity), it calls `rng.fork('entity-12')`.

## Detailed behavior

- mulberry32: `a = (a + 0x6d2b79f5) | 0; t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t +
  Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) >>> 0;`.
- `hashString` is FNV-1a over UTF-16 code units, 32-bit.
- `fork` seed = `hashString(name) ^ state` (both 32-bit), then consumes one draw from the parent
  (the draw used to derive the child seed is `next()` after capturing the state).

## Failure modes

- `maxExclusive <= 0` or `max < min` → `RangeError` (documented).

## Compatibility / migration

Additive; the algorithm is pinned for determinism. Future algorithm changes require a versioned
stream scheme (out of scope).

## Performance / resource constraints

O(1) per draw; negligible.

## Testing seams

- `tests/unit/SeedRng.test.ts`:
  - determinism: two streams with the same seed produce identical 100-draw sequences;
  - named streams: `createNamedRng(seed, 'a')` ≠ `createNamedRng(seed, 'b')` sequences; same name
    reproducible;
  - ranges: `nextInt(5)` ∈ [0,5) over many draws; `nextIntInclusive(-3, 3)` ∈ [-3,3];
    `nextFloat()` ∈ [0,1);
  - fork: same state+name → identical child sequences; forking changes the parent's subsequent
    draws; different names fork differently;
  - state: two streams with equal states produce equal next draws; `state` is a uint32;
  - invalid arguments throw `RangeError`.

## Observability / debugging

`state` exposes the exact stream position for replay debugging.

## Affected files / symbols

- `src/simulation/SeedRng.ts` — NEW.
- `tests/unit/SeedRng.test.ts` — NEW.

## Rejected alternatives

- *`Math.random`*: non-deterministic; unusable for reproducible simulation.
- *Shared global RNG*: subsystems interfere; named streams isolate them by construction.

## Downstream dependencies

Loot (011), mob spawn (138), crop growth (125), and redstone noise draw from named streams; 241
(replay) can record `(seed, name)` pairs instead of full sequences.
