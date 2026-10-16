# Spec: explosion-core

## Contract
This capability adds the deterministic core of vanilla-style explosions: `computeExplosion` returns
the destroyed block positions (sorted by (x, y, z)) and their drops for a caller-supplied world seam,
and `explosionEntityDamage` returns exposure=1 distance-scaled damage for caller-supplied positions.
Resistances and drops are caller data (no registry changes); the world drop/break application is a
future wiring change. Vanilla's random exposure roll is deliberately not modeled — destruction here
is deterministic (any positive-power ray destroys).

## Definitions
- **Ray**: a unit direction from `explosionRays()` (1352 directions sampled on the surface of a
  16×16×16 lattice, normalized).
- **Power**: a per-ray scalar, initialized to `strength`, decaying `EXPLOSION_RAY_DECAY` per 0.3 step
  plus `(blastResistance + 0.3) * 0.3` per non-air block encountered.
- **Destroyed**: a block position with `isDestroyable(state) === true` that at least one ray reaches
  with positive power.
- **Exposure**: always 1 in this core (deterministic rule); vanilla's per-block chance roll is a
  documented parity difference owned by a future wiring layer.

## Invariants
- `computeExplosion` destroys a position only if some ray's power is positive at it **and**
  `world.isDestroyable` is true; air and fluid-like states never appear in `destroyed`.
- `destroyed` is sorted lexicographically by (x, y, z); `drops` follow that exact order and contain
  exactly one entry per destroyed block with a non-null `dropFor`.
- Non-finite `strength` or any non-finite center component yields `{ destroyed: [], drops: [] }`.
- `explosionEntityDamage` returns entries in input order, only for positions with `d <= 1`.

## Requirements

### Requirement: explosionRays generates the deterministic 1352-ray set
`explosionRays()` MUST return exactly `EXPLOSION_RAY_COUNT` (1352) unit-length directions, and MUST
be deterministic (identical sequence across calls).

#### Scenario: ray count, unit length, determinism
- **GIVEN** `explosionRays()`
- **WHEN** it is called (twice)
- **THEN** both calls return identical arrays of length 1352, and every direction has Euclidean
  length 1 within `1e-9`

### Requirement: computeExplosion destroys destroyable blocks reached with positive power
`computeExplosion` MUST mark a block position when a ray's power is positive there, MUST exclude
positions whose state is not destroyable (including air), MUST sort the destroyed positions by
(x, y, z), and MUST resolve one drop per destroyed block with a non-null `dropFor`.

#### Scenario: an all-air world destroys nothing
- **GIVEN** a world whose every position returns an air state
- **WHEN** `computeExplosion` is called with strength 4 at `[0.5, 0.5, 0.5]`
- **THEN** `destroyed` is `[]` and `drops` is `[]`

#### Scenario: a reached low-resistance block is destroyed and dropped
- **GIVEN** a world with a stone block (resistance 6, drop `minecraft:cobblestone`) at `(1, 0, 0)`
- **WHEN** `computeExplosion` is called with strength 4 at `[0.5, 0.5, 0.5]`
- **THEN** `destroyed` contains `[1, 0, 0]` and `drops` contains
  `{ item: 'minecraft:cobblestone', position: [1, 0, 0] }`

#### Scenario: the second layer of a two-thick stone wall is not destroyed
- **GIVEN** stone at `(1, 0, 0)` and `(2, 0, 0)`
- **WHEN** `computeExplosion` is called with strength 4
- **THEN** `destroyed` contains `[1, 0, 0]` but not `[2, 0, 0]` (ray power dies in the first layer)

#### Scenario: water absorbs rays, is never destroyed, and shields what is behind it
- **GIVEN** water at `(1, 0, 0)` (resistance 100, `isDestroyable` false) and stone at `(2, 0, 0)`
- **WHEN** `computeExplosion` is called with strength 4
- **THEN** `destroyed` contains neither `[1, 0, 0]` nor `[2, 0, 0]`

#### Scenario: obsidian blocks destruction entirely
- **GIVEN** obsidian (resistance 1200) at `(1, 0, 0)` and stone at `(2, 0, 0)`
- **WHEN** `computeExplosion` is called with strength 4
- **THEN** `destroyed` contains neither position

#### Scenario: drops follow the sorted destroyed order
- **GIVEN** dirt at `(-1, 0, 0)` (drop `minecraft:dirt`), stone at `(1, 0, 0)`, and glass at `(0, 1, 0)`
  (no drop)
- **WHEN** `computeExplosion` is called with strength 4
- **THEN** `destroyed` contains all three positions in sorted order, `drops` is exactly
  `[{ item: 'minecraft:dirt', position: [-1, 0, 0] }, { item: 'minecraft:cobblestone', position: [1, 0, 0] }]`,
  and every drop's position appears in `destroyed`

#### Scenario: non-finite inputs yield an empty result
- **GIVEN** `strength = NaN` or `center = [NaN, 0, 0]` or `strength = 0`
- **WHEN** `computeExplosion` is called
- **THEN** `destroyed` and `drops` are both `[]`

#### Scenario: repeated calls are identical
- **GIVEN** a fixed world and inputs
- **WHEN** `computeExplosion` is called twice
- **THEN** both results are `toEqual`

### Requirement: explosionEntityDamage follows the exposure=1 formula
`explosionEntityDamage(center, strength, positions)` MUST return, in input order, one entry per
position with `d = distance / (strength * 2) <= 1`, with damage
`floor(((1-d)^2 + (1-d)) / 2 * 7 * (strength * 2) + 1)`.

#### Scenario: center, mid-blast, and edge damages for TNT strength
- **GIVEN** `center = [0, 0, 0]`, `strength = 4`, and positions `[0, 0, 0]`, `[4, 0, 0]`, `[8, 0, 0]`,
  `[9, 0, 0]`
- **WHEN** `explosionEntityDamage` is called
- **THEN** the result is exactly `[{ position: [0, 0, 0], damage: 57 }, { position: [4, 0, 0], damage: 22 }, { position: [8, 0, 0], damage: 1 }]`
  (the position beyond the blast is omitted)

#### Scenario: input order is preserved and results are deterministic
- **GIVEN** positions `[1, 0, 0]`, `[0, 0, 0]`, `[2, 0, 0]`
- **WHEN** `explosionEntityDamage` is called twice
- **THEN** both results are identical and the positions appear in the given order

#### Scenario: non-finite entity inputs return an empty list
- **GIVEN** `strength = NaN` or a non-finite center
- **WHEN** `explosionEntityDamage` is called
- **THEN** the result is `[]`

## Error and failure behavior
- No function throws for well-formed inputs; non-finite inputs yield empty results (never an
  unbounded march — the per-ray power decays by a strictly positive constant each iteration).

## Performance and resource bounds
- `computeExplosion` performs at most `1352 × ceil(strength / 0.225)` world queries (~24k for
  strength 4); each is O(1) in the caller's seam. Dedup by string key; sort O(n log n).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `ExplosionResult.destroyed`/`drops` are plain sorted arrays; `explosionRays()` is exported for
  inspection.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 ray set | `tests/unit/ExplosionCore.test.ts` ray cases |
| REQ-2 computeExplosion destruction/drops | compute cases (air, stone, second-layer, water, obsidian, drops, non-finite, determinism) |
| REQ-3 entity damage | entity damage cases |
