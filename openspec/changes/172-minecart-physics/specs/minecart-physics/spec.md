# Spec: minecart-physics

## Contract
This capability adds the deterministic rail-constrained minecart core: `tickMinecart` advances a
cart's position/velocity one fixed 20 TPS tick through a caller-supplied `MinecartWorld` seam,
following the rail shape in the cart's cell (straights slide, ascents couple vertical speed to the
slope, corners turn pure-axis arrivals), clamping rail speed, applying gravity/decay off rails, and
stopping the cart dead when its next cell is blocking. `minecartOnRails` reports whether the cart's
cell contains a rail. Zero registry changes.

## Definitions
- **Cart**: `{ x, y, z, vx, vy, vz }` — position and per-tick velocity.
- **On rails**: the cart's cell (floor of position) contains a rail.
- **Pure incoming axis**: for a corner, the arriving horizontal component is non-zero and the other
  is exactly 0.

## Invariants
- `tickMinecart` is pure and deterministic for a fixed world.
- On rails: straights zero the cross axis and `vy`; ascents set `vy` to the slope-coupled speed
  (`+vx` east, `-vx` west, `-vz` north, `+vz` south); corners turn only pure-axis arrivals, else
  stop; all components clamped to `±MINECART_MAX_SPEED`.
- Off rails: `vy -= MINECART_GRAVITY`, `vx`/`vz` decay by `MINECART_OFFRAIL_DECAY`.
- A blocking next cell stops the cart: velocities zeroed, position unchanged.

## Requirements

### Requirement: minecartOnRails reports the cart's riding state
`minecartOnRails(state, world)` MUST return `true` exactly when `world.getRailShapeAt` returns a
shape for the cart's cell.

#### Scenario: on a rail cell and off it
- **GIVEN** a world with a rail at `(0, 0, 0)`
- **WHEN** `minecartOnRails` is called for a cart at `(0.5, 0.5, 0.5)` and one at `(3.5, 0.5, 0.5)`
- **THEN** the results are `true` and `false`

### Requirement: straights constrain the cart to their axis at rail height
On `north_south`, `tickMinecart` MUST zero `vx` and `vy` and keep `vz`; on `east_west` it MUST zero
`vz` and `vy` and keep `vx`.

#### Scenario: north_south slides along z
- **GIVEN** a cart at `(0.5, 0.5, 0.5)` with `(vx, vy, vz) = (0.3, 0.1, 0.2)` on a `north_south` rail
- **WHEN** `tickMinecart` is called
- **THEN** the new state is `{ x: 0.5, y: 0.5, z: 0.7, vx: 0, vy: 0, vz: 0.2 }`

#### Scenario: east_west slides along x
- **GIVEN** the same cart on an `east_west` rail
- **THEN** the new state is `{ x: 0.7, y: 0.5, z: 0.5, vx: 0.2, vy: 0, vz: 0 }`

### Requirement: ascents couple vertical speed to the slope
On an ascent, `tickMinecart` MUST set `vy` to the slope-coupled horizontal speed: `vy = vx` on
`ascending_east`, `vy = -vx` on `ascending_west`, `vy = -vz` on `ascending_north`, `vy = vz` on
`ascending_south` (rising toward the elevated end, falling away), and zero the cross axis.

#### Scenario: all eight ascent cases
- **GIVEN** each ascent shape with motion toward and away from its elevated end
- **WHEN** `tickMinecart` is called
- **THEN** `vy` equals the expected slope-coupled value (rising positive, falling negative) and the
  cross axis is zero

### Requirement: corners turn pure-axis arrivals and stop others
On a corner, `tickMinecart` MUST turn a cart arriving along one of the corner's two axes (the other
component exactly 0) onto the other axis, and MUST zero both horizontal components for any other
arrival.

#### Scenario: all eight corner turns
- **GIVEN** each corner shape with a pure-axis arrival from each of its two directions
- **WHEN** `tickMinecart` is called
- **THEN** the cart's motion is on the outgoing axis with the same speed

#### Scenario: a diagonal arrival stops at the corner
- **GIVEN** a cart with `(vx, vz) = (0.2, 0.2)` on `corner_north_east`
- **WHEN** `tickMinecart` is called
- **THEN** both `vx` and `vz` are `0` and the position is unchanged

### Requirement: rail speed is clamped
On rails, `tickMinecart` MUST clamp every velocity component to `[-MINECART_MAX_SPEED,
MINECART_MAX_SPEED]`.

#### Scenario: excessive speed clamps
- **GIVEN** a cart with `(vx, vz) = (2, 3)` on an `east_west` rail
- **WHEN** `tickMinecart` is called
- **THEN** `vx` is `MINECART_MAX_SPEED` and `vz` is `0`

### Requirement: off-rail carts fall and decay
Off rails, `tickMinecart` MUST subtract `MINECART_GRAVITY` from `vy` and scale `vx`/`vz` by
`MINECART_OFFRAIL_DECAY` each tick.

#### Scenario: gravity and decay
- **GIVEN** a cart with `(vy, vx, vz) = (0, 0.2, 0.1)` in an empty world
- **WHEN** `tickMinecart` is called
- **THEN** `vy` is `-MINECART_GRAVITY`, `vx` is `0.2 * MINECART_OFFRAIL_DECAY`, `vz` is
  `0.1 * MINECART_OFFRAIL_DECAY`

### Requirement: blocking cells stop the cart
If the cart's next cell is blocking, `tickMinecart` MUST return the current position with all
velocities zeroed.

#### Scenario: a wall stops the cart one tick before entry
- **GIVEN** a cart at `(0.9, 0.5, 0.5)` moving east at `0.2` on an `east_west` rail, with cell
  `(1, 0, 0)` blocking
- **WHEN** `tickMinecart` is called
- **THEN** the new state is the same position with all velocities `0`

#### Scenario: a falling cart lands on solid ground
- **GIVEN** a cart at `(0.5, 1, 0.5)` falling at `-0.1` with cell `(0, 0, 0)` blocking
- **WHEN** `tickMinecart` is called
- **THEN** the new state is `(0.5, 1, 0.5)` with all velocities `0`

## Error and failure behavior
- No function throws for well-formed inputs; invalid (non-finite) state is caller responsibility,
  consistent with the section's other cores.

## Performance and resource bounds
- `tickMinecart` is O(1); no registry or stored-data change.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `MinecartState` is a plain value; `minecartOnRails` makes riding state explicit.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 minecartOnRails | `tests/unit/MinecartPhysics.test.ts` › `minecartOnRails` |
| REQ-2 straights | straight cases |
| REQ-3 ascents | ascent table cases |
| REQ-4 corners | corner table cases + diagonal stop |
| REQ-5 speed clamp | clamp case |
| REQ-6 off-rail physics | off-rail case |
| REQ-7 collisions | wall-stop + landing cases |
