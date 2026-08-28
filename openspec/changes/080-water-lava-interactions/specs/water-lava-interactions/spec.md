# Spec: water-lava-interactions

## Contract

`resolveFluidContact(water, lava)` MUST return exactly one of `OBSIDIAN | COBBLESTONE | STONE |
NONE` per the classic MC table, with falling levels (8-15) classified as flowing and level 0 as
source. `applyFluidContact(world, ids, waterPos, lavaPos)` MUST, for non-NONE results, remove both
fluid cells and place the result block at the lava position; for NONE it MUST not mutate anything.
Both MUST be deterministic.

## Definitions

- **Source**: level 0.
- **Flowing**: levels 1-15 (falling 8-15 included).
- **Result blocks**: `InteractionBlockIds { obsidian, cobblestone, stone }` supplied by the caller.

## Invariants

- lava source + any water → OBSIDIAN.
- flowing lava + water source → STONE.
- flowing lava + flowing water → COBBLESTONE.
- Either side null → NONE.
- Apply order: remove water, remove lava, place block at the lava cell.

## Requirements

### Requirement: resolver matrix
`resolveFluidContact` MUST implement the table for every combination of water/lava forms.

#### Scenario: lava source obsidian
- **GIVEN** a lava source and water of any form (source, flowing, falling)
- **WHEN** the resolver runs
- **THEN** the result is OBSIDIAN.

#### Scenario: stone from water source
- **GIVEN** flowing lava (1-7 or 8-15) and a water source
- **WHEN** the resolver runs
- **THEN** the result is STONE.

#### Scenario: cobblestone from flowing water
- **GIVEN** flowing lava and flowing or falling water
- **WHEN** the resolver runs
- **THEN** the result is COBBLESTONE.

#### Scenario: no contact
- **GIVEN** either side without fluid
- **WHEN** the resolver runs
- **THEN** the result is NONE.

### Requirement: apply
`applyFluidContact` MUST clear both fluids and place the result block at the lava cell for
non-NONE results, and MUST not mutate for NONE.

#### Scenario: cobblestone placement
- **GIVEN** flowing water at W and flowing lava at L
- **WHEN** apply runs
- **THEN** both W and L have no fluid, L holds the cobblestone block id, and the result is
  COBBLESTONE.

#### Scenario: obsidian placement
- **GIVEN** any water at W and a lava source at L
- **WHEN** apply runs
- **THEN** L holds the obsidian block id and both fluids are cleared.

#### Scenario: none mutates nothing
- **GIVEN** water at W and no lava at L
- **WHEN** apply runs
- **THEN** nothing changes and the result is NONE.

### Requirement: determinism
Identical inputs MUST produce identical results.

#### Scenario: repeated calls agree
- **GIVEN** identical worlds and positions
- **WHEN** resolve and apply run twice
- **THEN** results and worlds are deeply equal.

## Error and failure behavior

- None: the resolver is total; apply's accessor exceptions propagate (caller trust).

## Performance and resource bounds

O(1) per call.

## Compatibility and migration

Additive; no existing module changes.

## Security and integrity

Not applicable.

## Observability

Results are plain strings; tests assert exact placements.

## Verification mapping

- `tests/unit/FluidInteraction.test.ts` — the full resolver matrix, apply per result kind, NONE
  non-mutation, falling classifications, determinism.
