# Spec: vegetation-features

## Contract

`validatePlacementModifier` MUST accept `{ type: 'surfaceHeight' }` and `placeFeature` MUST set
each candidate's y to `ctx.surfaceY(x, z)` for it, consuming no rng draw. `PlacementContext`
MUST expose a required `surfaceY(x, z): number`. The survival invariant MUST accept a preceding
`heightRange` or `surfaceHeight` (both define y). The vegetation default builders MUST produce
the documented configured and placed features deterministically, and every placed chain MUST
validate under the extended invariants.

## Definitions

- **surfaceHeight**: a modifier with no parameters that sets a candidate's y to the terrain
  surface height at its column, provided by `ctx.surfaceY`.
- **Vegetation id vocabulary** (documented, reserved for the block-registry expansion):
  short grass = 19, poppy = 20, dandelion = 21, red mushroom = 22, brown mushroom = 23.
- Default configured features (all `blockPatch`): `overworld/short_grass` (19, tries 16,
  radiusXZ 4, radiusY 1); `overworld/poppy` (20, 6, 3, 1); `overworld/dandelion` (21, 6, 3, 1);
  `overworld/red_mushroom` (22, 3, 2, 1); `overworld/brown_mushroom` (23, 3, 2, 1).
- Default placed features: `overworld/short_grass` [count 8, surfaceHeight, survivalFilter];
  `overworld/poppy` [count 2, rarity 2, surfaceHeight, survivalFilter];
  `overworld/dandelion` [count 2, rarity 2, surfaceHeight, survivalFilter];
  `overworld/red_mushroom` [count 1, rarity 4, surfaceHeight, survivalFilter];
  `overworld/brown_mushroom` [count 1, rarity 4, surfaceHeight, survivalFilter].

## Invariants

- `surfaceHeight` consumes no rng draws and requires `ctx.surfaceY`.
- A `survivalFilter` MUST be preceded by a `heightRange` or `surfaceHeight` in the chain.
- Unknown modifier types and malformed fields throw.
- Identical `(placed, ctx, x, z)` MUST produce identical positions.

## Requirements

### Requirement: surfaceHeight modifier
The 095 modifier union MUST support surface-relative placement.

#### Scenario: sets y from the surface callback
- **GIVEN** a chain `[count 2, surfaceHeight, survivalFilter]` with `surfaceY` returning fixed
  heights per column
- **WHEN** placeFeature runs
- **THEN** each candidate's y equals `surfaceY(x, z)` and no rng draw is consumed.

#### Scenario: survival after surfaceHeight
- **GIVEN** `[surfaceHeight, survivalFilter]`
- **WHEN** validation and placement run
- **THEN** the chain validates and solidity is probed at `(x, surfaceY(x, z), z)`.

#### Scenario: survival without a y-definer
- **GIVEN** a chain with `survivalFilter` preceded by neither `heightRange` nor `surfaceHeight`
- **WHEN** validation runs
- **THEN** it throws a descriptive error.

#### Scenario: existing modifiers unchanged
- **GIVEN** the 095 modifier matrix
- **WHEN** validation and placement run
- **THEN** behavior is unchanged (all prior tests pass).

### Requirement: vegetation defaults
The default builders MUST produce the documented features deterministically.

#### Scenario: configured defaults
- **GIVEN** `createDefaultVegetationConfiguredFeatures`
- **WHEN** inspected
- **THEN** it contains exactly the five documented blockPatch features with the documented
  parameters, and repeated construction yields equal registries.

#### Scenario: placed defaults
- **GIVEN** `createDefaultVegetationPlacedFeatures`
- **WHEN** inspected
- **THEN** it contains exactly the five documented chains, and repeated construction yields
  equal registries.

#### Scenario: chains validate
- **GIVEN** every default vegetation placed feature
- **WHEN** validated
- **THEN** each chain passes the extended invariants.

## Error and failure behavior

- Validation throws descriptive errors; no partial state.

## Performance and resource bounds

`surfaceHeight` O(1) per candidate with no draws; defaults construction O(1).

## Compatibility and migration

Additive union member (same pattern as 096/097 union extensions). `PlacementContext` gains a
required field; the 095 test helper is updated mechanically. 095's spec invariant line is
amended (documented); all other 095 behavior unchanged.

## Security and integrity

Not applicable.

## Observability

Plain validated data; tests assert exact values.

## Verification mapping

- `tests/unit/VegetationFeature.test.ts` — surfaceHeight behavior, invariant accept/reject,
  defaults, determinism, regression of the modifier matrix.
- `tests/unit/PlacedFeature.test.ts` — context helper updated with `surfaceY`.
