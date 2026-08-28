# Spec: incremental-light-updates

## Contract

After a block edit, light MUST be updated incrementally and correctly: `updateLightAfterEdit(world,
x, y, z)` MUST remove sky/block light that depended on the edited cell (without crossing opaque
cells or zeroing cells with independent light) and MUST re-propagate from every surviving lit cell
and luminance source. The result MUST equal a full recompute (067 sky + 068 block) of the edited
world, and identical edits MUST produce identical results.

## Definitions

- **Removal phase**: BFS from the edited cell zeroing cells with `0 < value < pathLevel`; opaque
  cells block the BFS.
- **Re-add phase**: BFS from every surviving lit cell (falloff `v - 1`), after seeding block-light
  sources with their luminance (clamped to 15).

## Invariants

- Removal never zeroes cells whose light is ≥ the removed path's level (independent sources remain).
- Re-add only raises values (≤ 15), so it terminates.
- Neighbor order is fixed (`-x, +x, -y, +y, -z, +z`) everywhere.
- Post-edit `updateLightAfterEdit` equals `computeSkyLight` + `computeBlockLight` on the edited world.

## Requirements

### Requirement: placement darkens
Placing an opaque block MUST remove the light that passed through its cell.

#### Scenario: block in open air
- **GIVEN** a lit all-air world
- **WHEN** an opaque block is placed and `updateLightAfterEdit` runs at its position
- **THEN** cells below the block (behind it) become darker, and the result equals a full recompute.

### Requirement: breaking lights up
Removing an opaque block MUST let light fill the opened cell.

#### Scenario: hole opened
- **GIVEN** a world with an opaque block under open sky
- **WHEN** the block is removed and `updateLightAfterEdit` runs at its position
- **THEN** the opened cell and neighbors gain light, and the result equals a full recompute.

### Requirement: new sources propagate
Placing a light-emitting block MUST spread block light.

#### Scenario: torch placed
- **GIVEN** a dark air region
- **WHEN** a torch (luminance 14) is placed and `updateLightAfterEdit` runs at its position
- **THEN** the surroundings are lit with −1 falloff, and the result equals a full recompute.

### Requirement: equivalence on fixtures
For the placement/break/source fixtures, every cell after `updateLightAfterEdit` MUST match the full
recompute of the edited world.

#### Scenario: fixture matrix
- **GIVEN** the three edited fixture worlds
- **WHEN** `updateLightAfterEdit` runs and separately full recompute runs
- **THEN** every sky and block light value is equal.

### Requirement: determinism
Identical edits MUST produce identical results.

#### Scenario: repeatability
- **GIVEN** an edited fixture
- **WHEN** `updateLightAfterEdit` runs twice (on identical copies)
- **THEN** every cell reads the same value in both runs.

## Error and failure behavior

- World accessor exceptions propagate (caller bug).

## Performance and resource bounds

Removal is local to the affected region; re-add is O(cells × 15) worst case but typically small.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Equivalence with full recompute prevents light artifacts after edits.

## Observability

Per-cell reads expose the result.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Placement darkens | block placement → darker behind; equals recompute |
| Breaking lights up | hole → lit; equals recompute |
| New sources propagate | torch → falloff; equals recompute |
| Equivalence on fixtures | all cells match full recompute |
| Determinism | identical runs identical |
