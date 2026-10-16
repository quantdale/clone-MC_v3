# Spec: fluid-regression-suite

## Contract

The fluid regression suite MUST exercise the fluid stack (076-083 + 047) through deterministic
integration fixtures covering flow, boundaries, unload/reload, and bounded work, asserting exact
final states and exact or bounded tick/work counts without wall-clock timing. Identical runs MUST
produce identical results.

## Definitions

- **Wiring**: the test-local 077 handler: `stepWaterCell` → lava-contact checks in fixed 6-
  neighbor order (`-x,+x,-y,+y,-z,+z`) via `applyFluidContact` → re-schedule `affected` at
  `WATER_FLOW_INTERVAL`.
- **Waterlogged source-like read**: waterlogged cells surface as water level 0 for flow reads and
  never decay.
- **Steady state**: a tick with zero changes.

## Invariants

- Fixtures assert exact final states (snapshots) and exact/bounded tick counts.
- No wall-clock timing assertions.
- Out-of-bounds cells are never written.
- Unload/reload (047 serialize → deserialize) preserves the flow trajectory.

## Requirements

### Requirement: corridor fill
A source at the mouth of a 7-cell corridor MUST fill levels 1..7 with the 8th cell empty; cell `k`
MUST reach level `k` on dispatch cycle `k`.

#### Scenario: corridor steady state
- **GIVEN** a source at x=0 and an open corridor x=1..7 over a floor
- **WHEN** the wiring ticks until steady state
- **THEN** cells 1..7 hold levels 1..7, cell 8 is empty, cell `k` reaches level `k` on cycle `k`,
  and steady state is reached within 9 dispatch cycles.

### Requirement: waterfall pool
An elevated source MUST form a falling column, a flowing base (level 6), and a level-7 pool.

#### Scenario: waterfall final state
- **GIVEN** a source above an open column to a floor
- **WHEN** the wiring ticks until steady state
- **THEN** the column holds falling water, the base is flowing 6, the four pool neighbors are
  level 7, and steady state is reached within a bounded tick count.

### Requirement: source pool formation
Two sources with a one-cell gap MUST fill the gap and turn it into a source.

#### Scenario: pool
- **GIVEN** sources at (0,1,0) and (2,1,0) over a floor
- **WHEN** the wiring ticks until steady state
- **THEN** the gap cell (1,1,0) holds water level 0.

### Requirement: decay after removal
Removing the source MUST dry the pool completely within a bounded tick count.

#### Scenario: pool dries
- **GIVEN** a filled corridor pool
- **WHEN** the source is removed and the wiring ticks until steady state
- **THEN** every cell is empty of water.

### Requirement: boundaries
World edges and block walls MUST contain flow; no out-of-bounds writes.

#### Scenario: edge and wall containment
- **GIVEN** a source at a world edge and a source inside an L-shaped wall pocket
- **WHEN** the wiring ticks until steady state
- **THEN** no out-of-bounds cells are written and the pocket contains the water.

### Requirement: unload/reload
A 047 queue serialization round-trip mid-flow MUST NOT change the final state.

#### Scenario: round-trip equivalence
- **GIVEN** a corridor being filled
- **WHEN** the queue is serialized at tick 3 and restored into a fresh queue, then ticking
  continues to steady state; a control run ticks straight through
- **THEN** both final worlds are deeply equal.

### Requirement: bounded work
A large pool MUST reach steady state within a documented tick bound under a small per-tick
budget, deterministically.

#### Scenario: 64x64 pool
- **GIVEN** a 64×64 basin with one source and `maxPerTick = 50`
- **WHEN** the wiring ticks until steady state
- **THEN** steady state occurs within the documented bound, two runs produce identical snapshots,
  and the total processed-step count is reported and bounded.

### Requirement: determinism
Identical fixtures MUST produce identical results.

#### Scenario: repeated runs agree
- **GIVEN** any fixture
- **WHEN** it runs twice
- **THEN** final snapshots and tick counts are equal.

## Error and failure behavior

Fixture assertion failures name the fixture; production regressions surface as exact-state
mismatches.

## Performance and resource bounds

Largest fixture: 64×64 × ≤ ~70 ticks — well under a second.

## Compatibility and migration

Test-only; no production changes.

## Security and integrity

Not applicable.

## Observability

Each fixture asserts exact states and counts; failures name the fixture.

## Verification mapping

- `tests/unit/FluidRegression.test.ts` — all seven fixtures plus determinism.
