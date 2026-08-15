# Spec: redstone-wire-connectivity

## Contract
This capability adds the redstone wire block (with a power + per-side connection state space), the
rules deciding which neighbours a wire connects to, and the local rule computing a wire's own power
from its sources and connected neighbours. No network propagation/ordering/loop protection (156),
no components (157-161), no `Game` wiring, no wire mesh model, no quasi-connectivity — see the
proposal's Non-goals.

## Definitions
- **Wire**: a block of type `redstone_wire`.
- **Connection**: one of `'none' | 'side' | 'up'`, describing how a wire meets one horizontal
  neighbour.
- **Connectable**: a non-wire block that accepts or emits redstone, per the caller-supplied
  `connectsToRedstone` predicate.
- **External power**: the value 154's `getIndirectPower` reports at the wire's position.

## Invariants
- `REDSTONE_WIRE_SCHEMA` enumerates exactly 1296 states; the default is `power: 0` with all four
  sides `none`.
- `resolveWireConnections` returns exactly one connection per horizontal direction.
- A connection is `'up'` only when the block above the querying wire is non-solid.
- `computeWirePower` returns a value within `[MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH]` and never
  exceeds the maximum of external power and each connected wire's power minus one.
- `wireStateProperties` produces a record whose keys exactly match the schema's property names.

## Requirements

### Requirement: the wire block and item are registered and cross-referenced
`BlockRegistry` MUST register a `redstone_wire` block carrying `REDSTONE_WIRE_SCHEMA` and a
`defaultState` of `power: 0` with all sides `none`, dropping `minecraft:redstone`; `ItemTypeRegistry`
MUST register a `redstone` item whose `placeBlock` targets `minecraft:redstone_wire`.

#### Scenario: the block resolves with its schema and default state
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `redstone_wire` block is looked up
- **THEN** it exposes `REDSTONE_WIRE_SCHEMA` and a default state of `power: 0` with every side
  `none`

#### Scenario: the item places the wire block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `redstone` item is looked up
- **THEN** its `placeBlock` resolves to the `redstone_wire` block, and
  `validateItemBlockCrossReferences` passes

#### Scenario: the state registry enumerates exactly 1296 wire states
- **GIVEN** a `BlockStateRegistry` built over the default block registry
- **WHEN** the wire block's enumerated states are counted
- **THEN** there are exactly 1296, and the default state is among them

### Requirement: resolveWireConnections implements the documented branch order
`resolveWireConnections` MUST, for each horizontal direction, return `'side'` when the neighbour is
a wire or connectable; otherwise `'up'` when the neighbour is solid, a wire sits above it, and the
block above the querying wire is non-solid; otherwise `'side'` when the neighbour is non-solid and
a wire sits below it; otherwise `'none'`.

#### Scenario: a wire neighbour connects at the side
- **GIVEN** a wire directly north of the queried position
- **WHEN** connections are resolved
- **THEN** `north` is `'side'`

#### Scenario: a connectable component connects at the side
- **GIVEN** a non-wire block east of the queried position that `connectsToRedstone` reports true for
- **WHEN** connections are resolved
- **THEN** `east` is `'side'`

#### Scenario: a wire atop a solid neighbour connects upward
- **GIVEN** a solid block west of the queried position with a wire directly above it, and a
  non-solid block above the queried position
- **WHEN** connections are resolved
- **THEN** `west` is `'up'`

#### Scenario: a solid ceiling blocks climbing
- **GIVEN** the same arrangement but with a solid block directly above the queried position
- **WHEN** connections are resolved
- **THEN** `west` is `'none'`

#### Scenario: a wire below a non-solid neighbour connects as a descent
- **GIVEN** a non-solid block south of the queried position with a wire directly below it
- **WHEN** connections are resolved
- **THEN** `south` is `'side'`

#### Scenario: an isolated wire connects to nothing
- **GIVEN** a world with no wires, components, or solid blocks around the queried position
- **WHEN** connections are resolved
- **THEN** every direction is `'none'`

### Requirement: computeWirePower takes the maximum of external power and attenuated neighbours
`computeWirePower` MUST return the clamped maximum of the external power at the position and each
connected neighbouring wire's stored power reduced by one.

#### Scenario: external power drives an unconnected wire
- **GIVEN** an isolated wire with external power `12`
- **WHEN** its power is computed
- **THEN** it is `12`

#### Scenario: a connected neighbour contributes its power minus one
- **GIVEN** a wire with no external power and a connected wire neighbour storing `9`
- **WHEN** its power is computed
- **THEN** it is `8`

#### Scenario: the strongest contributor wins
- **GIVEN** a wire with external power `4` and a connected neighbour storing `15`
- **WHEN** its power is computed
- **THEN** it is `14`

#### Scenario: an unpowered isolated wire reads zero
- **GIVEN** an isolated wire with no external power and no connected neighbours
- **WHEN** its power is computed
- **THEN** it is `MIN_SIGNAL_STRENGTH`

#### Scenario: a neighbour at power one contributes nothing
- **GIVEN** a wire with no external power and a connected neighbour storing `1`
- **WHEN** its power is computed
- **THEN** it is `MIN_SIGNAL_STRENGTH`

#### Scenario: power reaching upward and downward neighbours is attenuated identically
- **GIVEN** a wire connected upward to a wire storing `10`, and separately one connected downward
  to a wire storing `10`
- **WHEN** each wire's power is computed
- **THEN** both are `9`

### Requirement: wireStateProperties projects power and connections into schema properties
`wireStateProperties` MUST return a record containing exactly the keys `power`, `north`, `south`,
`east`, and `west`, with `power` clamped into the signal domain.

#### Scenario: a projection matches the schema's property names
- **GIVEN** a power of `7` and a mixed set of connections
- **WHEN** `wireStateProperties` is called
- **THEN** the returned record's keys exactly match the schema's property names, `power` is `7`,
  and each side carries its resolved connection value

#### Scenario: an out-of-domain power is clamped
- **GIVEN** a power of `99`
- **WHEN** `wireStateProperties` is called
- **THEN** `power` is `MAX_SIGNAL_STRENGTH`

## Error and failure behavior
- No function in this module throws for well-formed inputs; all power values are clamped through
  154's helpers.
- A `WireWorld` callback that itself throws propagates unmodified (154/140's documented
  convention).

## Performance and resource bounds
- `resolveWireConnections` makes at most ~20 `WireWorld` calls; `computeWirePower` adds 154's
  bounded `getIndirectPower` plus at most four stored-power reads. All constant.
- 1296 enumerated wire states is ~2% of 007's 65536-per-block cap.

## Compatibility and migration
- Two additive registry entries (no existing id renumbered) and one new simulation file; requires
  the documented `BlockItemSeparation.test.ts` table update. No `Game.ts` edit; no schema/save-format
  change.

## Security and integrity
- All inputs are caller-supplied coordinates and an injected interface; every power value is
  clamped, so a misbehaving world cannot produce an illegal state.

## Observability
- `wireStateProperties` output is the standard stateful-block record shape.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 block/item registration + state count | `tests/unit/RedstoneWire.test.ts` registration cases |
| REQ-2 connection branch order | `resolveWireConnections` cases |
| REQ-3 local power rule | `computeWirePower` cases |
| REQ-4 state projection | `wireStateProperties` cases |
