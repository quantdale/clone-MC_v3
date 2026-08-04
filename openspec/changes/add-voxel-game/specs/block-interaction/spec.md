# Spec: block-interaction

## Contract

- **Purpose**: Enable the player to target, destroy, and place blocks through a robust voxel raycast, with a visible selection outline, input cooldown, and immediate localized remeshing.
- **Scope**: Owns raycast targeting (DDA), destroy/place actions, breakability enforcement, placement rejection rules, selection outline, action cooldown, and remesh triggering on modification. Does not cover movement (player-controller) or which block exists in the hotbar (inventory-hotbar).
- **Functional requirements**: Voxel raycast targeting; block destruction; block placement; interaction feedback and pacing; remesh after modification.
- **Non-functional requirements**: Targeted block and hit face are reported without floating-point selection errors; placement never intersects the player collision volume; bedrock cannot be destroyed.
- **Inputs and outputs**: Inputs: camera position/direction, destroy/place input, max reach, player AABB, world block solidity. Outputs: `RaycastResult` (block position, face normal, distance) or null, block writes, cooldown state, selection outline mesh.
- **Core data structures**: `RaycastResult`, `BlockSampler`, `DDA`/`raycastVoxel`, selection outline mesh, `actionCooldown`.
- **Dependencies**: math (`DDA.ts`), world (`World.setBlock` → enqueueMesh + neighbor dirty), block-registry (breakable/placeable/solid flags), inventory-hotbar (selected block type), player-controller (camera, AABB).
- **Error and edge-case behavior**: No solid block within `reach` reports no target; bedrock destroy is a no-op; placement into an occupied cell or the player's own AABB is rejected; holding the input repeats actions at most at `actionCooldown` rate; destroying a block on a chunk boundary remeshes both the owning and the adjacent chunk in the same update cycle.
- **Performance expectations**: Raycast is bounded by the configured reach with a step cap; a zero-length direction returns null (no infinite loop); hot paths reuse scratch vectors to avoid per-frame allocation; remesh is limited to dirty chunks plus boundary neighbors — see performance spec.
- **Acceptance criteria**: The scenarios in "Voxel raycast targeting", "Block destruction", "Block placement", "Interaction feedback and pacing", and "Remesh after modification" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/DDA.test.ts` (axial, diagonal, negatives, miss, reach) plus e2e `tests/e2e/game.spec.ts`; verification matrix rows BLOCK-01 through BLOCK-05.

## ADDED Requirements

### Requirement: Voxel raycast targeting
The system SHALL cast a ray from the camera center using a robust grid-traversal algorithm (e.g. Amanatides & Woo), up to a configured maximum reach, and SHALL accurately identify the targeted block and face without floating-point selection errors.

#### Scenario: Block hit
- **WHEN** the crosshair points at a solid block within reach
- **THEN** the targeted block position and the hit face normal are correctly reported

#### Scenario: Miss beyond reach
- **WHEN** no solid block lies within the maximum reach along the view ray
- **THEN** no target is reported

### Requirement: Block destruction
The player SHALL be able to destroy the targeted block, except blocks marked unbreakable such as bedrock.

#### Scenario: Destroy block
- **WHEN** the player activates destroy on a breakable targeted block
- **THEN** the block becomes air and the affected chunk remeshes immediately

#### Scenario: Bedrock unbreakable
- **WHEN** the player attempts to destroy bedrock
- **THEN** the bedrock remains unchanged

### Requirement: Block placement
The player SHALL place the selected block adjacent to the targeted face; placement SHALL be rejected inside the player's collision volume, in occupied cells, or in invalid positions.

#### Scenario: Place adjacent
- **WHEN** the player activates place on a targeted face
- **THEN** the selected block appears in the cell adjacent to that face

#### Scenario: No self-intersection
- **WHEN** the target cell would intersect the player's collision volume
- **THEN** placement is rejected

#### Scenario: No overwrite
- **WHEN** the target cell is already occupied by a solid block
- **THEN** placement is rejected

### Requirement: Interaction feedback and pacing
The system SHALL show a visible selection outline (or equivalent) on the targeted block and apply an input cooldown/debounce to prevent accidental repeated actions.

#### Scenario: Selection outline
- **WHEN** a block is targeted
- **THEN** an outline highlights the targeted block; it disappears when nothing is targeted

#### Scenario: Cooldown
- **WHEN** the destroy/place input is held
- **THEN** actions occur at most at the configured cooldown rate

### Requirement: Remesh after modification
Block changes SHALL trigger immediate remeshing of the affected chunk, including the neighbor chunk when the modified block is on a chunk boundary.

#### Scenario: Boundary edit remesh
- **WHEN** a block on a chunk boundary is destroyed
- **THEN** both the owning chunk and the adjacent chunk remesh in the same update cycle
