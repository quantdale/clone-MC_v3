# Spec: placed-feature-core

## Contract

`validatePlacementModifier` MUST accept exactly the documented modifier vocabulary
(`count { tries }`, `rarity { chance }`, `heightRange { minY; maxY }`, `biomeFilter { biomeKeys }`,
`survivalFilter {}`) and MUST reject everything else with descriptive errors.
`validatePlacedFeature` MUST enforce the feature shape and chain invariants.
`placeFeature` MUST apply the modifier chain in data order and MUST be deterministic for
identical contexts. `PlacedFeatureRegistry` MUST store only validated definitions, reject
duplicates and invalid inputs atomically, and expose get/has/size/clear.

## Definitions

- **count**: expands each candidate to `tries` copies.
- **rarity**: keeps each candidate with probability `1 / chance` (draw `nextFloat()`, keep iff
  `draw < 1 / chance`).
- **heightRange**: samples `y` uniformly in `[minY, maxY]` inclusive.
- **biomeFilter**: keeps candidates only when `ctx.biomeKey` is in `biomeKeys`.
- **survivalFilter**: keeps candidates only when `ctx.isSolid(x, y, z)` is true.
- Candidates never touched by a heightRange report `y = 0`.

## Invariants

- `tries`/`chance` are positive integers; `minY`/`maxY` are integers with `minY <= maxY`;
  `biomeKeys` is a non-empty array of non-empty strings.
- At most one `count` modifier per placed feature; `survivalFilter` requires a preceding
  `heightRange` in the chain.
- Unknown types and malformed fields throw.
- Registry operations never leave partial state.
- Identical `(placed, ctx, x, z)` MUST produce identical positions (fixed rng draw order).

## Requirements

### Requirement: modifier validation
`validatePlacementModifier` MUST implement the documented acceptance rules.

#### Scenario: valid modifiers
- **GIVEN** each documented modifier with valid fields
- **WHEN** validation runs
- **THEN** each passes (narrowed).

#### Scenario: rejection matrix
- **GIVEN** an unknown type, zero/negative/fractional `tries` or `chance`, non-integer `minY`/
  `maxY`, `minY > maxY`, and empty or blank `biomeKeys`
- **WHEN** validation runs
- **THEN** it throws a descriptive error naming the offending field.

### Requirement: placed feature validation
`validatePlacedFeature` MUST enforce the feature shape and chain invariants.

#### Scenario: valid feature
- **GIVEN** a placed feature with a non-empty key, non-empty featureKey, and a valid modifier
  chain
- **WHEN** validation runs
- **THEN** it passes (narrowed).

#### Scenario: chain invariant rejection
- **GIVEN** a chain with two count modifiers, or a survivalFilter without a preceding
  heightRange, or an empty key/featureKey
- **WHEN** validation runs
- **THEN** it throws a descriptive error.

### Requirement: deterministic placement
`placeFeature` MUST produce the documented positions.

#### Scenario: count and height range
- **GIVEN** `count { tries: 3 }` then `heightRange { minY: 10, maxY: 12 }` with a scripted rng
- **WHEN** placeFeature runs at `(x, z)`
- **THEN** it returns exactly 3 candidates at `x`/`z` with heights sampled uniformly inside
  `[10, 12]` in chain order.

#### Scenario: rarity filtering
- **GIVEN** `rarity { chance: 2 }` with a scripted rng
- **WHEN** placeFeature runs
- **THEN** a draw `< 0.5` keeps the candidate and a draw `>= 0.5` drops it.

#### Scenario: biome filter
- **GIVEN** `biomeFilter { biomeKeys: ["plains"] }`
- **WHEN** placeFeature runs with `ctx.biomeKey` "plains" and "desert"
- **THEN** only the matching context survives.

#### Scenario: survival filter
- **GIVEN** `heightRange { minY: 0, maxY: 0 }` then `survivalFilter {}`
- **WHEN** placeFeature runs with `isSolid` returning true and false
- **THEN** only solid candidates survive and `isSolid` receives the exact placed coordinates.

#### Scenario: chain order
- **GIVEN** a chain of count, rarity, heightRange, biomeFilter and survivalFilter in data order
- **WHEN** placeFeature runs
- **THEN** results match sequential application, with rng draws consumed exactly once per
  rarity/heightRange candidate in order.

#### Scenario: determinism
- **GIVEN** identical placed feature, context and fixed seed
- **WHEN** placeFeature runs twice
- **THEN** results are identical.

### Requirement: registry
`PlacedFeatureRegistry` MUST store validated placed features with atomic rejection.

#### Scenario: lifecycle
- **GIVEN** valid registrations
- **WHEN** register/get/has/size/clear run
- **THEN** lookups round-trip, size tracks registrations, and clear empties.

#### Scenario: atomic rejection
- **GIVEN** a duplicate key and an invalid placed feature
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

## Error and failure behavior

- Validation and registration throw descriptive errors; no partial state.

## Performance and resource bounds

Chain application O(candidates × modifiers); rng draws O(candidates); validation O(1) per
modifier; registry O(1) lookups.

## Compatibility and migration

Additive. `featureKey` is a string reference resolved by later wiring (096/097).

## Security and integrity

Not applicable.

## Observability

Positions are plain `[x, y, z]` tuples; tests assert exact values and rng draw counts.

## Verification mapping

- `tests/unit/PlacedFeature.test.ts` — modifier matrix, chain order, determinism, validation
  matrix incl. chain invariants, registry lifecycle/atomicity.
