# Spec: redstone-consumer-blocks

## Contract
This capability adds the first redstone *consumers*: `redstone_lamp`, `door`, and `trapdoor`, each
a pure sink whose visible boolean state mirrors whether it is powered. The lamp turns on
immediately and defers turning off by a short scheduled delay; the door and trapdoor toggle
immediately in both directions. No player interaction, no door/trapdoor facing or two-block
geometry, no `Game`/`World` wiring — see the proposal's Non-goals.

## Definitions
- **Powered**: a plain caller-supplied boolean (not a signal strength) indicating whether the
  consumer currently sees redstone power.
- **Lamp off-delay**: the number of ticks a lamp waits after losing power before actually turning
  off, to avoid a single brief pulse visibly flickering it.

## Invariants
- `lampShouldBeLit`, `doorShouldBeOpen`, and `trapdoorShouldBeOpen` are each exactly the identity
  function on their `powered` argument.
- `scheduleLampOff`/`dueLampOffs` behave identically to 157-161's 047 bridges.
- Door and trapdoor share one `OPEN_SCHEMA` instance (the same one-schema-many-blocks pattern as
  157's `POWERED_SCHEMA`).

## Requirements

### Requirement: the lamp block and item are registered
`BlockRegistry` MUST register `redstone_lamp` carrying `LAMP_SCHEMA` with a default of
`{ lit: false }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the lamp block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `redstone_lamp` block is looked up
- **THEN** it exposes `LAMP_SCHEMA` and that default state

#### Scenario: the lamp item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `redstone_lamp` item is looked up
- **THEN** its `placeBlock` resolves to the lamp block and `validateItemBlockCrossReferences` passes

#### Scenario: the lamp block enumerates exactly 2 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the lamp's states are counted
- **THEN** there are exactly 2, and the default is among them

### Requirement: the door block and item are registered
`BlockRegistry` MUST register `door` carrying `OPEN_SCHEMA` with a default of `{ open: false }`;
`ItemTypeRegistry` MUST register a placing item.

#### Scenario: the door block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `door` block is looked up
- **THEN** it exposes `OPEN_SCHEMA` and that default state

#### Scenario: the door item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `door` item is looked up
- **THEN** its `placeBlock` resolves to the door block and `validateItemBlockCrossReferences` passes

#### Scenario: the door block enumerates exactly 2 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the door's states are counted
- **THEN** there are exactly 2, and the default is among them

### Requirement: the trapdoor block and item are registered
`BlockRegistry` MUST register `trapdoor` carrying `OPEN_SCHEMA` (the same shared instance as
`door`) with a default of `{ open: false }`; `ItemTypeRegistry` MUST register a placing item.

#### Scenario: the trapdoor block carries its schema and default
- **GIVEN** `createDefaultBlockRegistry()`
- **WHEN** the `trapdoor` block is looked up
- **THEN** it exposes `OPEN_SCHEMA` and that default state

#### Scenario: the trapdoor item places the block
- **GIVEN** `createDefaultItemRegistry()`
- **WHEN** the `trapdoor` item is looked up
- **THEN** its `placeBlock` resolves to the trapdoor block and `validateItemBlockCrossReferences`
  passes

#### Scenario: the trapdoor block enumerates exactly 2 states
- **GIVEN** a `BlockStateRegistry` over the default block registry
- **WHEN** the trapdoor's states are counted
- **THEN** there are exactly 2, and the default is among them

### Requirement: each predicate mirrors the powered input
`lampShouldBeLit(powered)`, `doorShouldBeOpen(powered)`, and `trapdoorShouldBeOpen(powered)` MUST
each return exactly `powered`.

#### Scenario: each predicate returns true when powered
- **GIVEN** `powered = true`
- **WHEN** each of the three predicates is called
- **THEN** each returns `true`

#### Scenario: each predicate returns false when unpowered
- **GIVEN** `powered = false`
- **WHEN** each of the three predicates is called
- **THEN** each returns `false`

### Requirement: the lamp's off-transition is scheduled and deterministically ordered
`scheduleLampOff` MUST schedule the off-recheck `LAMP_OFF_DELAY_TICKS` after the current tick;
`dueLampOffs` MUST return exactly the entries due at or before `nowTick`, deterministically ordered.

#### Scenario: an off-recheck is not due early
- **GIVEN** an off-recheck scheduled at tick `0`
- **WHEN** the queue is drained at `LAMP_OFF_DELAY_TICKS - 1`
- **THEN** nothing is returned

#### Scenario: an off-recheck fires at its tick
- **GIVEN** the same off-recheck
- **WHEN** the queue is drained at `LAMP_OFF_DELAY_TICKS`
- **THEN** exactly that position is returned

#### Scenario: same-tick off-rechecks are deterministically ordered
- **GIVEN** two lamps scheduled for the same off-recheck tick
- **WHEN** the queue is drained at that tick
- **THEN** both are returned in scheduling order, and repeating the scenario yields the identical
  order

### Requirement: the three state projections match their schemas
`lampStateProperties(lit)`, `doorStateProperties(open)`, and `trapdoorStateProperties(open)` MUST
each return a record containing exactly their one property, legal for its block's schema.

#### Scenario: each projection matches its schema
- **GIVEN** any legal boolean argument
- **WHEN** each projection function is called
- **THEN** its record's single key is legal for its schema property

## Error and failure behavior
- No function throws for well-formed inputs; a non-finite tick is treated as `0`.

## Performance and resource bounds
- Every function is O(1); `dueLampOffs` is 047's own bounded pop. 6 new block states total.

## Compatibility and migration
- Three additive block ids and three additive item ids; one new simulation file; the documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted input surface.

## Observability
- `lampStateProperties`/`doorStateProperties`/`trapdoorStateProperties` are the standard
  stateful-block records.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 lamp registration + 2 states | `tests/unit/RedstoneConsumers.test.ts` lamp registration cases |
| REQ-2 door registration + 2 states | door registration cases |
| REQ-3 trapdoor registration + 2 states | trapdoor registration cases |
| REQ-4 predicates mirror powered | predicate cases |
| REQ-5 lamp scheduling + ordering | scheduling cases |
| REQ-6 state projections | projection cases |
