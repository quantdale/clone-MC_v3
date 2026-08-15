# Design: 169-explosion-core

## Context/current state
- 166-168 built item-moving redstone consumers; nothing destroys blocks yet. Vanilla's explosion is
  the canonical deterministic destruction model, and it has no dependency on any existing module here
  (resistances and drops are world data, supplied by a caller). 163 established the "state-agnostic
  caller-supplied world seam" pattern this module follows, and 164's snapshot-then-apply discipline
  is the model for how a future wiring change will apply the returned positions.

## Target state
- `src/simulation/ExplosionCore.ts` holding the deterministic ray march, the destroyable/air
  distinction, drop resolution, and the exposure=1 entity-damage formula — plus the 1352-ray
  generator. No registry changes.

## Invariants
- `computeExplosion` destroys a position only when (a) some ray's power is positive at it and (b)
  `world.isDestroyable(state)` is true. Fluids (e.g. `isAir=false, isDestroyable=false`) absorb
  power like vanilla water but never appear in `destroyed`.
- The destroyed set is sorted lexicographically by (x, y, z); `drops` follow that exact order and
  contain one entry per destroyed block whose `dropFor` is non-null.
- Non-finite strength or any non-finite center component yields `{ destroyed: [], drops: [] }`.
- Every ray march terminates: power decays by `EXPLOSION_RAY_DECAY` per iteration (strictly positive),
  so at most `ceil(strength / 0.225)` steps.
- `explosionEntityDamage` returns entries only for positions with `d <= 1`, in input order; damage is
  `floor(((1-d)^2 + (1-d)) / 2 * 7 * f + 1)` with `f = strength * 2`, `d = distance / f`.

## API and data model
```ts
// src/simulation/ExplosionCore.ts (new)
export const EXPLOSION_RAY_SAMPLES = 16;
export const EXPLOSION_RAY_STEP = 0.3;
export const EXPLOSION_RAY_DECAY = 0.225;
export const EXPLOSION_RAY_COUNT = 1352;

export interface ExplosionWorld<S> {
  getBlockState(x: number, y: number, z: number): S;
  isAir(state: S): boolean;
  isDestroyable(state: S): boolean;
  blastResistance(state: S): number;
  dropFor(state: S): string | null;
}

export interface ExplosionInput<S> {
  readonly center: readonly [number, number, number];
  readonly strength: number;
  readonly world: ExplosionWorld<S>;
}

export interface ExplosionResult {
  readonly destroyed: ReadonlyArray<readonly [number, number, number]>;
  readonly drops: ReadonlyArray<{ item: string; position: readonly [number, number, number] }>;
}

export interface EntityDamage {
  readonly position: readonly [number, number, number];
  readonly damage: number;
}

export function explosionRays(): ReadonlyArray<readonly [number, number, number]>;
export function computeExplosion<S>(input: ExplosionInput<S>): ExplosionResult;
export function explosionEntityDamage(
  center: readonly [number, number, number],
  strength: number,
  positions: ReadonlyArray<readonly [number, number, number]>,
): ReadonlyArray<EntityDamage>;
```

## Control/data flow
1. `explosionRays()` builds the 1352 unit directions once (module-level `RAYS`, deterministic order:
   `k, l, m` over the 16×16×16 lattice, surface points only, normalized).
2. `computeExplosion` iterates rays; each marches from `center` in `EXPLOSION_RAY_STEP` steps while
   its power is positive. At each step: query `world.getBlockState(floor(x), floor(y), floor(z))`; if
   not `isAir`, subtract `(blastResistance + 0.3) * 0.3`; if power is still positive, mark the
   position (dedup via a key map); advance by `ray * EXPLOSION_RAY_STEP`; subtract
   `EXPLOSION_RAY_DECAY`.
3. Marked positions are filtered by `isDestroyable`, sorted by (x, y, z), then drops are resolved via
   `dropFor` in that order.
4. `explosionEntityDamage` computes per-position damage and filters `d <= 1`.

## Detailed behavior
- The ray model matches vanilla's 1.19+ `Explosion`: same lattice sampling, same step, same decay,
  same resistance penalty `(resistance + 0.3) * 0.3`. The one deliberate divergence is the random
  exposure roll (see Non-goals).
- Resistance values are caller data: the test world uses vanilla-ish values (stone 6, dirt 0.5, glass
  0.3, water 100, obsidian 1200) to prove the behavioral claims (second-layer shielding, fluid
  pass-through, obsidian blocking).
- The center is expected in world coordinates (typically a block center like `[0.5, 0.5, 0.5]`);
  block positions are `Math.floor` of the marched coordinates, so negative coordinates behave
  correctly.

## Failure modes
- Non-finite inputs short-circuit to empty results — no throw, no unbounded loop.
- No function throws for well-formed inputs; an empty world yields empty results.

## Compatibility/migration
- One new simulation file; zero registry changes, zero characterization-test updates, no
  `Game.ts` edit, no schema/save-format change.

## Performance/resource constraints
- `computeExplosion` performs at most `EXPLOSION_RAY_COUNT × ceil(strength / 0.225)` world queries
  (e.g. ~1352 × 18 ≈ 24k for TNT strength 4). Each is O(1) in the caller's seam. The destroyed set
  dedupes by string key; sorting is O(n log n) on the marked set.

## Testing seams
- The whole module is tested with an in-memory `ExplosionWorld<string>` over a `Map` keyed by
  `x,y,z` — no `World`/registry of any kind. All vanilla claims (ray count, boundary damages,
  shielding) are asserted with hand-computable values.

## Observability/debugging
- `ExplosionResult.destroyed`/`drops` are plain sorted arrays; `explosionRays()` is exported so ray
  generation itself is inspectable.

## Affected files/symbols
- `src/simulation/ExplosionCore.ts` (new).
- Tests: `tests/unit/ExplosionCore.test.ts` (new). No other files.

## Rejected alternatives
- **Modeling the exposure roll with a seeded RNG**: rejected — 054-style RNG is for simulation
  streams, but a *core* with caller-supplied deterministic inputs should be pure; the roll belongs to
  the future wiring layer, and its absence is documented as a parity difference.
- **Hard-coding resistances/drops inside the module**: rejected — resistances are block data (a
  future change's concern), and drops already belong to 114's harvest rules; the seam keeps the core
  reusable for any caller (TNT, creeper, bed misfire).
- **Adding a `blastResistance` field to every block definition now**: rejected — that is a data
  change with its own consumers and belongs to a later content/data change, not a simulation core.

## Downstream dependencies
- 170 (`tnt-block-entity`) is the natural first consumer: it will own the TNT block, its priming
  state, and the wiring that applies `computeExplosion`'s destroyed/drops to a real world.
- 172+ (minecarts) and future mobs (creeper in 218's content expansion) reuse the same core.
