# Design: 048-random-tick-system

## Context / current state

047 provides explicit scheduled ticks. Random ticks need a deterministic per-sub-chunk cell sampler so
probabilistic block behavior replays identically.

## Target state

A `RandomTickSelector` maps `(seed, sectionX, sectionY, sectionZ, tick, attempt)` to a cell via a
stable integer hash, producing `randomTicksPerSubChunk` (default 3) local indices per sub-chunk per
tick, with an eligibility-filtered world-coordinate variant.

## Invariants

- `selectForSection` returns exactly `count` (default 3) indices, each in `[0, SECTION_VOLUME)`.
- The selection is a pure function of its inputs: identical inputs → identical output arrays.
- `selectEligible` returns only positions where the predicate is true; attempts are bounded
  (`maxAttempts`, default 256) so ineligible-only sub-chunks terminate quickly.
- Sampling is with replacement (a cell may appear twice), matching Java random-tick semantics.

## API and data model

```ts
// src/simulation/RandomTickSelector.ts
export const RANDOM_TICKS_PER_SUB_CHUNK = 3;
export function hash32(...values: number[]): number;
export class RandomTickSelector {
  constructor(opts?: { randomTicksPerSubChunk?: number; maxEligibleAttempts?: number });
  selectForSection(
    sectionX: number, sectionY: number, sectionZ: number,
    tick: number, seed: number,
    count?: number,
  ): number[]; // local indices in [0, 4096)
  selectEligible(
    sectionX: number, sectionY: number, sectionZ: number,
    tick: number, seed: number,
    isEligible: (x: number, y: number, z: number) => boolean,
    count?: number,
  ): Array<[number, number, number]>; // world coordinates
}
```

## Control / data flow

1. Each fixed tick, for each ticking sub-chunk, the consumer calls
   `selectForSection(sx, sy, sz, tick, seed)` (or `selectEligible` with its block predicate).
2. `selectForSection` loops `count` times: `index = hash32(seed, sx, sy, sz, tick, attempt) %
   SECTION_VOLUME`.
3. `selectEligible` samples candidates (bounded by `maxEligibleAttempts`) and keeps those whose world
   position passes `isEligible`; world coords derive from section origin + `localFromIndex`.

## Detailed behavior

- `hash32` is FNV-1a over the integer inputs (32-bit, unsigned), so it is platform-independent.
- Negative section coordinates are handled (hash mixes the raw integers; modulo is on the unsigned
  hash, always non-negative).
- `count <= 0` returns `[]`; `selectEligible` stops early once `count` eligible positions are found.

## Failure modes

- Predicate throwing propagates (caller bug); no retry semantics.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

O(count) for `selectForSection`; O(min(count, maxEligibleAttempts)) for `selectEligible`; called once
per ticking sub-chunk per tick.

## Testing seams

- `tests/unit/RandomTickSelector.test.ts`:
  - determinism: identical inputs → identical arrays (exact equality);
  - bounds: all indices in `[0, 4096)`;
  - variation: different tick / seed / section → (exact) different arrays for chosen inputs;
  - count: `count` and `count: 0`;
  - eligibility: predicate filters; fewer than count returned when sparse; all-eligible returns count;
  - attempt bounding: predicate always false terminates (returns `[]`, no hang).

## Observability / debugging

Selections are pure and loggable for replay debugging.

## Affected files / symbols

- `src/simulation/RandomTickSelector.ts` — NEW.
- `tests/unit/RandomTickSelector.test.ts` — NEW.

## Rejected alternatives

- *A shared mutable RNG stream*: non-deterministic ordering across systems; per-selection hashing is
  deterministic and dependency-free.
- *Deduplication of sampled cells*: Java samples with replacement; matching that keeps parity simple.

## Downstream dependencies

125 (crop growth), 128 (fire), and 048's consumers run random ticks through this selector; 054
(named RNG streams) may later supersede the raw hash for other systems.
