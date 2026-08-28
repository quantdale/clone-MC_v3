# Spec: lava-flow-simulation

## Contract

`stepLavaCell(world, lavaFluidId, x, y, z, spreadRange)` MUST perform exactly one deterministic
lava step with the 078 rule order, using `spreadRange` (a validated positive integer) as the
horizontal level cap (levels below it propose `L + 1`; range-level cells never spread), the
ground-conversion level minus one, and the decay-removal threshold. `LAVA_FLOW_INTERVAL`
MUST be 30. Identical inputs MUST produce identical results; non-lava cells MUST be no-ops.

## Definitions

- **spreadRange**: positive integer — max horizontal reach (3 overworld, 7 nether).
- **Rules**: downward spawn (falling 8 into empty replaceable below), falling→flowing
  `spreadRange - 1` at ground, horizontal spread proposal `L + 1` for levels below `spreadRange`
  (range-level cells never spread) into replaceable non-falling targets with worse flowing levels,
  source formation (≥ 2 horizontal sources), decay (+1 per step, removal at `spreadRange`) unless
  fed or water above.

## Invariants

- Rule order: downward spawn → ground conversion → horizontal spread → source formation → decay.
- Spread proposal applies only below `spreadRange`; ground conversion produces
  `spreadRange - 1`; the removal threshold is `spreadRange`.
- Falling cells are never overwritten horizontally.
- Neighbor order is fixed (`-x, +x, -z, +z`).

## Requirements

### Requirement: spread range
Lava MUST spread at most `spreadRange` blocks horizontally.

#### Scenario: overworld range 3
- **GIVEN** a source with a long open corridor and `spreadRange = 3`
- **WHEN** steps propagate along the corridor
- **THEN** levels reach 1, 2, 3 and the cell beyond stays empty.

#### Scenario: nether range 7
- **GIVEN** a source with a long open corridor and `spreadRange = 7`
- **WHEN** steps propagate along the corridor
- **THEN** levels reach 1..7 and the cell beyond stays empty.

### Requirement: ground conversion
A falling lava cell whose below is blocked MUST convert to flowing `spreadRange - 1`.

#### Scenario: overworld waterfall base
- **GIVEN** falling lava over a solid floor and `spreadRange = 3`
- **WHEN** the step runs
- **THEN** the cell becomes flowing level 2 (and spreads level 3 on its next step).

### Requirement: shared water rules
Downward spawn, source formation, decay, and falling protection MUST behave as in 078.

#### Scenario: downward spawn
- **GIVEN** lava with an empty replaceable cell below
- **WHEN** the step runs
- **THEN** the below cell becomes falling level 8.

#### Scenario: source formation
- **GIVEN** a flowing lava cell with two horizontal source neighbors
- **WHEN** the step runs
- **THEN** the cell becomes a source.

#### Scenario: decay and removal
- **GIVEN** unfed flowing lava at level `spreadRange - 1`
- **WHEN** the step runs
- **THEN** it becomes `spreadRange`, and a later unfed step removes it.

#### Scenario: falling never overwritten
- **GIVEN** a source next to a falling lava cell
- **WHEN** the step runs
- **THEN** the falling cell is unchanged.

### Requirement: range validation
Invalid `spreadRange` values MUST throw.

#### Scenario: invalid ranges rejected
- **GIVEN** `spreadRange` of 0, -1, 2.5, or NaN
- **WHEN** the step runs
- **THEN** it throws a descriptive error.

### Requirement: fluid isolation
The lava step MUST be a no-op for water cells, and the water step MUST be a no-op for lava cells.

#### Scenario: cross no-ops
- **GIVEN** a water cell and a lava cell
- **WHEN** `stepLavaCell` runs on the water cell and `stepWaterCell` on the lava cell
- **THEN** both report `{ changed: false, affected: [] }`.

### Requirement: determinism
Identical inputs MUST produce identical results.

#### Scenario: repeated steps agree
- **GIVEN** two identical worlds and cells
- **WHEN** both lava steps run
- **THEN** results and subsequent worlds are deeply equal.

## Error and failure behavior

- Invalid range → descriptive error; world accessor exceptions propagate. No other failure modes.

## Performance and resource bounds

Same as 078: O(1) reads/writes per step.

## Compatibility and migration

Additive; 078 untouched (types reused only).

## Security and integrity

Not applicable.

## Observability

Same shape as 078: `changed`/`affected` per step.

## Verification mapping

- `tests/unit/LavaFlowEngine.test.ts` — spread chains (3/7), cap boundary, ground conversion,
  downward spawn, source formation, decay ladder/removal, invalid ranges, cross no-ops,
  determinism.
