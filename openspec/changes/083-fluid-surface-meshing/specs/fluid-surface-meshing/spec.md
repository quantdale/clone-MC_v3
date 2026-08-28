# Spec: fluid-surface-meshing

## Contract

`meshFluidSurface(world, fluidId, light, x, y, z)` MUST return the deterministic surface quads of
the fluid cell at `(x, y, z)`: a top face at `y + fluidSurfaceHeight(level)` when the cell above is
not the same fluid, and side faces against neighbors per the height rules below. `meshFluidSurfaces`
MUST batch over positions in input order. Quads MUST be 062-shaped with `blockId = fluidId` and
070/071 corner light/AO. Emission order per cell MUST be up, then `-x, +x, -z, +z`. Cells without
the fluid MUST produce no quads.

## Definitions

- **Surface**: `fluidSurfaceHeight(level)` (076): 1 for source/falling, `(8 - level) / 8` for
  flowing 1-7.
- **Own top**: `y + surface(own level)`.
- **Neighbor top**: for a same-fluid neighbor, `nY + surface(nLevel)`; otherwise `y` (cell
  bottom).

## Invariants

- Top face plane is exactly `y + surface(own level)`.
- Side faces: same-fluid neighbor with `neighborTop >= ownTop` → none; same-fluid neighbor with
  lower top → span `[neighborTop, ownTop]`; non-same-fluid/air neighbor → span `[y, ownTop]`.
- Zero-height sides are never emitted.
- Per-cell emission order: up, `-x, +x, -z, +z`.
- Quads carry `vertexLights`/`vertexAO` from 070/071 sampling with the face's own cell context.

## Requirements

### Requirement: top face
The top face MUST be emitted at the surface plane only when the cell above is not the same fluid.

#### Scenario: source in air
- **GIVEN** a source cell with air above
- **WHEN** meshing runs
- **THEN** an up quad at `y + 1` is emitted.

#### Scenario: flowing surface plane
- **GIVEN** a flowing level-4 cell with air above
- **WHEN** meshing runs
- **THEN** the up quad is at `y + 0.5`.

#### Scenario: covered by the same fluid
- **GIVEN** a cell with the same fluid directly above
- **WHEN** meshing runs
- **THEN** no top face is emitted.

### Requirement: side faces
Side faces MUST follow the height rules.

#### Scenario: against air
- **GIVEN** a source with air to the east
- **WHEN** meshing runs
- **THEN** an east side quad spans `[y, y + 1]`.

#### Scenario: step against lower water
- **GIVEN** a source (top y+1) with same-fluid level-4 water (top nY + 0.5) to the north
- **WHEN** meshing runs
- **THEN** a north side quad spans `[nY + 0.5, y + 1]`.

#### Scenario: equal or higher neighbor
- **GIVEN** two same-fluid cells with equal surfaces, or a neighbor with a higher surface
- **WHEN** meshing runs
- **THEN** no side face is emitted between them.

#### Scenario: zero-height skip
- **GIVEN** a side whose computed height is 0
- **WHEN** meshing runs
- **THEN** no quad is emitted for it.

### Requirement: fluid identity
Cells without the fluid MUST produce no quads; `blockId` MUST be the fluid id.

#### Scenario: empty and foreign cells
- **GIVEN** an empty cell and a lava cell when meshing water
- **WHEN** meshing runs
- **THEN** both produce no quads; water quads carry the water id.

### Requirement: light and AO
Quads MUST carry 070/071 corner data sampled from the supplied `LightSampler`.

#### Scenario: lit quads
- **GIVEN** a light sampler with known values
- **WHEN** meshing runs
- **THEN** every emitted quad has 4 `vertexLights` and 4 `vertexAO` entries matching the sampler.

### Requirement: order and determinism
Identical inputs MUST produce identical quads in the fixed order.

#### Scenario: repeated and batched runs agree
- **GIVEN** identical worlds
- **WHEN** meshing runs twice, and the batch runs over the same positions
- **THEN** outputs are deeply equal and per-cell order is up-then-sides.

## Error and failure behavior

None: meshing is total over cell reads; accessor exceptions propagate.

## Performance and resource bounds

Per cell: ≤ 5 neighbor reads; ≤ 5 quads.

## Compatibility and migration

Additive; no existing modules touched.

## Security and integrity

Not applicable.

## Observability

Quads are plain data; tests assert exact planes and extents.

## Verification mapping

- `tests/unit/FluidSurfaceMesher.test.ts` — top-face scenarios, side-face scenarios, identity,
  light/AO attachment, order and determinism.
