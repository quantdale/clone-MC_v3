# Design: 095-placed-feature-core

## Context / current state

094 provides `ConfiguredFeature` (key + validated config, `simpleBlock`/`blockPatch`). No
placement model exists: features have no position, count, or filtering.

## Target state

`PlacedFeature` (key + featureKey + ordered modifier chain) and `placeFeature` produce
deterministic placement positions `[x, y, z]` from a `PlacementContext`. The registry stores
validated placed features.

## Invariants

- Modifier vocabulary: `count { tries }`, `rarity { chance }`, `heightRange { minY; maxY }`,
  `biomeFilter { biomeKeys }`, `survivalFilter {}`.
- `tries`/`chance` positive integers; `minY`/`maxY` integers with `minY <= maxY`; `biomeKeys` a
  non-empty array of non-empty strings.
- At most one `count` modifier per placed feature; if `survivalFilter` is present, a `heightRange`
  MUST precede it in the chain (y must be defined when the survival check runs).
- Modifiers apply in data order; every rng draw happens at a fixed chain position, so identical
  contexts yield identical results.
- The registry stores only validated definitions; duplicates and invalid inputs throw without
  partial state.

## API and data model

```ts
// src/worldgen/PlacedFeature.ts (NEW)
export type PlacementModifier =
  | { type: 'count'; tries: number }
  | { type: 'rarity'; chance: number }
  | { type: 'heightRange'; minY: number; maxY: number }
  | { type: 'biomeFilter'; biomeKeys: string[] }
  | { type: 'survivalFilter' };

export interface PlacedFeature { key: string; featureKey: string; modifiers: PlacementModifier[]; }

export interface PlacementContext {
  biomeKey: string;
  isSolid(x: number, y: number, z: number): boolean;
  rng: { nextFloat(): number }; // SeedRng (054) satisfies this
}

export function validatePlacementModifier(input: unknown): PlacementModifier;
export function validatePlacedFeature(input: unknown): PlacedFeature;
export function placeFeature(placed: PlacedFeature, ctx: PlacementContext, x: number, z: number): Array<[number, number, number]>;
export class PlacedFeatureRegistry {
  register(key: string, featureKey: string, modifiers: PlacementModifier[]): void;
  get(key: string): PlacedFeature | null;
  has(key: string): boolean;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. Start with one candidate `(x, z)`; y is undefined.
2. For each modifier in data order:
   - `count { tries }`: expand each candidate to `tries` copies (allowed at most once).
   - `rarity { chance }`: draw `nextFloat()` per candidate; drop when `draw >= 1 / chance`.
   - `heightRange { minY, maxY }`: draw `nextFloat()` per candidate;
     `y = minY + floor(draw * (maxY - minY + 1))` (uniform over `[minY, maxY]`, inclusive).
   - `biomeFilter { biomeKeys }`: drop all candidates when `ctx.biomeKey` is not in `biomeKeys`
     (per-column decision, so it is all-or-nothing for the column).
   - `survivalFilter {}`: drop candidates where `ctx.isSolid(x, y, z)` is false (y is defined by
     the invariant).
3. Return surviving candidates as `[x, y, z]`; candidates never touched by a heightRange report
   `y = 0` (documented; real wiring always uses heightRange).

## Detailed behavior

- Draw order is fixed: rng draws occur only in `rarity` (per surviving candidate, in order) and
  `heightRange` (per candidate, in order) steps. `count` expands, `biomeFilter`/`survivalFilter`
  consume no draws.
- A `rarity { chance: 1 }` modifier consumes draws but always keeps candidates (draw < 1 always).
- `placeFeature` does not validate its inputs (validation is the registry's/validator's job);
  a defensive `y === undefined` guard in the survival step keeps direct calls sound.

## Failure modes

- Validation throws descriptive errors naming the offending field; registry operations reject
  invalid or duplicate registrations atomically (size and contents unchanged).

## Compatibility / migration

Additive. `featureKey` is a string reference resolved by later wiring (096/097).

## Performance / resource constraints

Chain application O(candidates × modifiers); rng draws O(candidates); validation O(1) per
modifier; registry O(1) lookups.

## Testing seams

- `tests/unit/PlacedFeature.test.ts` (NEW): modifier matrix (count/rarity/heightRange/
  biomeFilter/survivalFilter), chain order with a scripted rng, determinism with a fixed-seed
  `SeedRng`, validation matrix (incl. two-count and survival-without-heightRange rejection),
  registry lifecycle/atomicity.

## Observability / debugging

Positions are plain `[x, y, z]` tuples; tests assert exact coordinates and rng draw counts.

## Affected files / symbols

- `src/worldgen/PlacedFeature.ts` — NEW.
- `tests/unit/PlacedFeature.test.ts` — NEW.

## Rejected alternatives

- *Free-form placement rules*: the typed union keeps validation strict and deterministic.
- *Single combined placement object*: the ordered chain is the documented Minecraft-style model
  and keeps 096/097 extensible.
- *Context with full SeedRng type*: the structural `{ nextFloat }` interface keeps tests able to
  script exact draws while production passes a 054 `SeedRng`.

## Downstream dependencies

096 ore and 097 tree generation define placed features over 094 configured features and consume
`placeFeature`; later wiring resolves `featureKey` and writes blocks.
