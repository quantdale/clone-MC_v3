# Spec: water-flow-simulation

## Contract

`stepWaterCell(world, waterFluidId, x, y, z)` MUST perform exactly one deterministic water step for
the cell at `(x, y, z)`: non-water cells are no-ops; water follows the rules below in fixed order;
every fluid write is recorded in the returned `affected` list; a step that changes nothing returns
`changed: false` and an empty list. Identical worlds MUST produce identical results.

## Definitions

- **Water levels** (076): 0 = source, 1-7 = flowing, 8-15 = falling.
- **Empty replaceable cell**: a cell with no fluid whose `isReplaceable` is true.
- **Falling at ground**: a falling cell whose below is not an empty replaceable cell.
- **Feeder**: a horizontal water neighbor with a level strictly below the cell's own level.

## Invariants

- Neighbor order is fixed: `-x, +x, -z, +z`.
- Rule order per step: downward spawn, falling-to-flowing conversion, horizontal spread, source
  formation, decay.
- Falling cells are never overwritten horizontally.
- Downward spawn never targets an occupied fluid cell.
- Sources never decay.

## Requirements

### Requirement: downward propagation
Water MUST spawn falling water (level 8) into an empty replaceable cell below.

#### Scenario: source falls
- **GIVEN** a source with an empty replaceable cell below
- **WHEN** the step runs
- **THEN** the below cell becomes falling (level 8), `changed` is true, and `affected` contains the
  below cell.

#### Scenario: flowing and falling fall
- **GIVEN** a flowing (level 3) or falling (level 8) cell with an empty replaceable cell below
- **WHEN** the step runs
- **THEN** the below cell becomes falling (level 8) in both cases.

#### Scenario: no spawn onto water
- **GIVEN** a water cell with water below
- **WHEN** the step runs
- **THEN** nothing changes in the below cell.

### Requirement: falling at ground
A falling cell whose below is blocked MUST convert to flowing level 7.

#### Scenario: waterfall base
- **GIVEN** a falling cell with a non-replaceable cell below
- **WHEN** the step runs
- **THEN** the cell becomes flowing level 7 and `affected` contains the cell itself.

### Requirement: horizontal spread
With below blocked, water MUST spread horizontally in fixed order: sources propose level 1,
flowing `L` proposes `min(L + 1, 7)`, into replaceable neighbors that are empty or carry worse
flowing water (level in 1-7 above the proposal). Falling neighbors MUST NOT be targeted.

#### Scenario: source spreads
- **GIVEN** a source with an empty replaceable east neighbor
- **WHEN** the step runs
- **THEN** the neighbor becomes flowing level 1.

#### Scenario: flowing spreads with falloff
- **GIVEN** flowing level 2 with an empty replaceable north neighbor
- **WHEN** the step runs
- **THEN** the neighbor becomes flowing level 3.

#### Scenario: level cap
- **GIVEN** flowing level 7
- **WHEN** the step runs
- **THEN** no horizontal neighbor is added beyond level 7.

#### Scenario: improvement of worse water
- **GIVEN** a source next to a flowing level 5 cell
- **WHEN** the step runs
- **THEN** the flowing cell becomes level 1.

#### Scenario: falling never overwritten
- **GIVEN** a source next to a falling cell
- **WHEN** the step runs
- **THEN** the falling cell is unchanged.

### Requirement: source formation
A flowing cell with ≥ 2 horizontal source neighbors MUST become a source.

#### Scenario: two sources meet
- **GIVEN** a flowing cell with two horizontal source neighbors (e.g., north and east)
- **WHEN** the step runs
- **THEN** the cell becomes a source (level 0).

### Requirement: decay
A flowing cell with no water above and no feeder MUST advance `level + 1`; at level 7 it MUST be
removed. A cell with a feeder or water above MUST NOT decay.

#### Scenario: decay ladder
- **GIVEN** a flowing level 4 cell with no feeder and air above
- **WHEN** the step runs
- **THEN** the cell becomes level 5.

#### Scenario: removal at level 7
- **GIVEN** a flowing level 7 cell with no feeder and air above
- **WHEN** the step runs
- **THEN** the cell's fluid is removed.

#### Scenario: feeder blocks decay
- **GIVEN** a flowing level 4 cell with a horizontal level-3 neighbor
- **WHEN** the step runs
- **THEN** the cell stays level 4.

#### Scenario: water above blocks decay
- **GIVEN** a flowing level 4 cell with water above
- **WHEN** the step runs
- **THEN** the cell stays level 4.

### Requirement: non-water no-op
A non-water fluid (e.g., lava) or empty cell MUST be a no-op.

#### Scenario: lava untouched
- **GIVEN** a lava cell
- **WHEN** the step runs
- **THEN** `changed` is false and `affected` is empty.

### Requirement: determinism
Identical worlds MUST produce identical results.

#### Scenario: repeated steps agree
- **GIVEN** two identical worlds and cells
- **WHEN** both steps run
- **THEN** results and subsequent worlds are deeply equal.

## Error and failure behavior

- World accessor exceptions propagate (caller bug). No other failure modes: empty cells and
  non-water fluids are no-ops.

## Performance and resource bounds

One step reads ≤ 5 cells and writes ≤ 4; allocation is the result object + affected array.

## Compatibility and migration

Additive; 076 states consumed unchanged; no existing modules touched.

## Security and integrity

Not applicable: no I/O; the accessor is caller-trusted.

## Observability

`WaterStepResult` reports changed/affected; tests assert exact worlds after steps.

## Verification mapping

- `tests/unit/WaterFlowEngine.test.ts` — downward scenarios, ground conversion, spread scenarios
  (cap, improvement, falling protection), source formation, decay ladder/guards, non-water no-op,
  affected correctness, determinism.
