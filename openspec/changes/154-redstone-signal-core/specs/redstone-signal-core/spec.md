# Spec: redstone-signal-core

## Contract
This capability adds the foundational redstone signal model: a direction vocabulary, the 0-15
power domain and its helpers, an injected `RedstonePowerSource` world surface, and the direct/
indirect power queries every later redstone change reads. No wire block, no propagation, no
scheduled updates, no components, no block-registry additions, no `Game` wiring, no
quasi-connectivity emulation — see the proposal's Non-goals.

## Definitions
- **Signal strength**: an integer in `[MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH]` (0-15).
- **Strong power**: power a block emits into a specific neighbouring face such that the neighbour
  itself becomes a power source (queried via `getStrongPower`).
- **Weak power**: power a block emits that powers components but is not re-conducted (queried via
  `getWeakPower`).
- **Conductive**: a block that re-emits power it receives (a full solid block), per
  `isConductive`.
- **Direct power**: the maximum strong power any of the six neighbours emits into a position.
- **Indirect power**: the maximum of direct power and the direct power of each conductive
  neighbour.

## Invariants
- `clampSignal` always returns an integer within the signal domain; a non-finite input yields
  `MIN_SIGNAL_STRENGTH`.
- `OPPOSITE_DIRECTION` is an involution: applying it twice returns the original direction.
- `offsetInDirection` moves exactly one block along exactly one axis and is reversed by the
  opposite direction.
- `attenuate(s, 0) === clampSignal(s)`; `attenuate` never returns below `MIN_SIGNAL_STRENGTH` nor
  above the clamped input.
- `getDirectPower` reads only `getStrongPower`, never `getWeakPower`.
- `getIndirectPower >= getDirectPower` for the same position, always.
- Every query result is within the signal domain regardless of what the source returns.

## Requirements

### Requirement: the direction vocabulary is consistent and reversible
`OPPOSITE_DIRECTION` MUST be an involution over all six directions, and `offsetInDirection` MUST
move one block along the matching axis such that applying the opposite direction returns the
original coordinate.

#### Scenario: opposites are involutive
- **GIVEN** each of the six directions
- **WHEN** `OPPOSITE_DIRECTION` is applied twice
- **THEN** the original direction is returned

#### Scenario: offsets round-trip through opposites
- **GIVEN** a position and each of the six directions
- **WHEN** the position is offset in a direction, then offset in that direction's opposite
- **THEN** the original position is returned

#### Scenario: offsets follow the Minecraft convention
- **GIVEN** the origin
- **WHEN** offset north, south, east, west, up, and down
- **THEN** they yield `z-1`, `z+1`, `x+1`, `x-1`, `y+1`, and `y-1` respectively

### Requirement: clampSignal constrains values to the signal domain
`clampSignal` MUST return an integer within `[MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH]`, clamping
out-of-range values and mapping non-finite input to `MIN_SIGNAL_STRENGTH`.

#### Scenario: in-range values pass through
- **GIVEN** the value `7`
- **WHEN** `clampSignal` is called
- **THEN** it returns `7`

#### Scenario: out-of-range values clamp to the bounds
- **GIVEN** the values `-5` and `99`
- **WHEN** `clampSignal` is called on each
- **THEN** they return `MIN_SIGNAL_STRENGTH` and `MAX_SIGNAL_STRENGTH` respectively

#### Scenario: non-finite input yields the minimum
- **GIVEN** `NaN` and `Infinity`
- **WHEN** `clampSignal` is called on each
- **THEN** both return `MIN_SIGNAL_STRENGTH` (`Infinity` clamps to the max only if finite; a
  non-finite value is treated as no signal)

### Requirement: attenuate decays a signal over distance with a floor
`attenuate(signal, distance)` MUST return `clampSignal(signal) - distance` floored at
`MIN_SIGNAL_STRENGTH`, treating a non-positive or non-finite `distance` as `0`.

#### Scenario: distance zero preserves the signal
- **GIVEN** a signal of `15`
- **WHEN** `attenuate(15, 0)` is called
- **THEN** it returns `15`

#### Scenario: signal decays by one per block
- **GIVEN** a signal of `15`
- **WHEN** `attenuate(15, 4)` is called
- **THEN** it returns `11`

#### Scenario: decay floors at zero
- **GIVEN** a signal of `3`
- **WHEN** `attenuate(3, 99)` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

### Requirement: strongestSignalFrom returns the clamped maximum, or zero when empty
`strongestSignalFrom` MUST return `MIN_SIGNAL_STRENGTH` for an empty list and the clamped maximum
otherwise.

#### Scenario: the maximum wins
- **GIVEN** `[3, 11, 7]`
- **WHEN** `strongestSignalFrom` is called
- **THEN** it returns `11`

#### Scenario: an empty list reads as unpowered
- **GIVEN** `[]`
- **WHEN** `strongestSignalFrom` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

### Requirement: getDirectPower is the maximum strong power across the six faces
`getDirectPower` MUST query each of the six neighbours' facing-back strong power and return the
clamped maximum, and MUST NOT consult weak power.

#### Scenario: a single strongly-powered neighbour sets the value
- **GIVEN** a source where only the block below emits strong power `9` upward
- **WHEN** `getDirectPower` is called at the position above it
- **THEN** it returns `9`

#### Scenario: the strongest of several neighbours wins
- **GIVEN** a source with strong power `4` from one face and `12` from another
- **WHEN** `getDirectPower` is called
- **THEN** it returns `12`

#### Scenario: weak power alone yields no direct power
- **GIVEN** a source that emits weak power `15` from every face and strong power `0`
- **WHEN** `getDirectPower` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

#### Scenario: an out-of-domain source value is clamped
- **GIVEN** a source returning strong power `99`
- **WHEN** `getDirectPower` is called
- **THEN** it returns `MAX_SIGNAL_STRENGTH`

### Requirement: getIndirectPower includes power conducted through solid neighbours
`getIndirectPower` MUST return the maximum of the position's direct power and the direct power of
each *conductive* neighbour; a non-conductive neighbour MUST NOT contribute conducted power.

#### Scenario: a conductive neighbour re-emits its own strong power
- **GIVEN** a conductive block adjacent to the query position, itself strongly powered `10` from
  its far side, with no strong power emitted directly at the query position
- **WHEN** `getIndirectPower` is called
- **THEN** it returns `10`

#### Scenario: a non-conductive neighbour conducts nothing
- **GIVEN** the same arrangement but with the neighbour reported non-conductive
- **WHEN** `getIndirectPower` is called
- **THEN** it returns `MIN_SIGNAL_STRENGTH`

#### Scenario: direct power wins when it is higher
- **GIVEN** direct power `13` at the position and a conductive neighbour conducting only `5`
- **WHEN** `getIndirectPower` is called
- **THEN** it returns `13`

#### Scenario: indirect power is never below direct power
- **GIVEN** any source arrangement
- **WHEN** both queries are called at the same position
- **THEN** `getIndirectPower` is greater than or equal to `getDirectPower`

### Requirement: isBlockPowered reflects any indirect power
`isBlockPowered` MUST return `true` exactly when `getIndirectPower` exceeds
`MIN_SIGNAL_STRENGTH`.

#### Scenario: an unpowered position reads false
- **GIVEN** a source emitting no power anywhere
- **WHEN** `isBlockPowered` is called
- **THEN** it returns `false`

#### Scenario: a position with power of one reads true
- **GIVEN** a source emitting strong power `1` from one face
- **WHEN** `isBlockPowered` is called
- **THEN** it returns `true`

## Error and failure behavior
- No function throws for any input; all source-returned values are clamped into the signal domain.
- A `RedstonePowerSource` callback that itself throws propagates unmodified (matching 140's
  documented `findNearestTarget` convention).

## Performance and resource bounds
- `getDirectPower` is exactly 6 source calls; `getIndirectPower` is at most 42 — bounded and
  constant, with conduction recursing exactly one level.

## Compatibility and migration
- One new, additive file with zero imports; no existing module edited; no schema/save-format
  change.

## Security and integrity
- All inputs are caller-supplied numbers and an injected interface; every source value is clamped
  before use, so a misbehaving source cannot produce out-of-domain results.

## Observability
- All functions are pure with plain numeric returns.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 direction vocabulary | `tests/unit/RedstoneSignal.test.ts` direction cases |
| REQ-2 clampSignal domain | clampSignal cases |
| REQ-3 attenuate decay/floor | attenuate cases |
| REQ-4 strongestSignalFrom | strongestSignalFrom cases |
| REQ-5 getDirectPower strong-only maximum | getDirectPower cases |
| REQ-6 getIndirectPower conduction | getIndirectPower cases |
| REQ-7 isBlockPowered threshold | isBlockPowered cases |
