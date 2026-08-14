# Spec: render-vs-simulation-distance

## Contract

The world SHALL maintain two independent, non-negative spatial radii around the
player chunk: a **rendering radius** and a **simulation/ticking radius**. The
rendering radius governs chunk loading/generation/meshing/unloading. The simulation
radius governs which chunks are simulated. A pure classifier SHALL decide, for any
chunk coordinate, whether it lies within each radius of a given player chunk
coordinate.

## Definitions

- **Rendering radius (`renderDistance`)**: Chebyshev chunk radius inside which chunks
  are streamed, generated, meshed, unloaded, and counted toward readiness.
- **Simulation radius (`simulationDistance`)**: Chebyshev chunk radius inside which
  chunks are simulated (ticking).
- **Chebyshev distance**: `max(|cx-pcx|, |cz-pcz|)` between chunk coordinates.

## Invariants

- Both radii MUST be `>= 0`.
- Distance is Chebyshev, matching the existing `±rd` streaming loops.
- By convention `simulationDistance <= renderDistance`; the pure model does not
  enforce this but the runtime default sets them equal.

## Requirements

### Requirement: independent radii configuration
The configuration MUST expose `simulationDistance` independently of `renderDistance`,
with `simulationDistance` defaulting to the `renderDistance` value and a headless
override.

#### Scenario: defaults preserve current behavior
- **GIVEN** a fresh config
- **WHEN** `simulationDistance` is not explicitly changed
- **THEN** `CONFIG.simulationDistance` equals `CONFIG.renderDistance` (6) and
  `CONFIG.headless.simulationDistance` equals `CONFIG.headless.renderDistance` (2).

### Requirement: pure classifier distinguishes the two radii
`RenderSimulationDistance` MUST report membership in each radius independently using
Chebyshev distance.

#### Scenario: chunk on the rendering boundary is rendered
- **GIVEN** `RenderSimulationDistance(4, 2)` and player chunk `(0,0)`
- **WHEN** querying chunk `(4,0)`
- **THEN** `isWithinRenderDistance(4,0,0,0)` is `true` and
  `isWithinSimulationDistance(4,0,0,0)` is `false`.

#### Scenario: chunk just outside the rendering radius is neither
- **GIVEN** `RenderSimulationDistance(4, 2)` and player chunk `(0,0)`
- **WHEN** querying chunk `(5,0)`
- **THEN** both `isWithinRenderDistance` and `isWithinSimulationDistance` are `false`.

#### Scenario: chunk inside the simulation radius is within both
- **GIVEN** `RenderSimulationDistance(4, 2)` and player chunk `(-1,-1)`
- **WHEN** querying chunk `(0,0)`
- **THEN** `isWithinSimulationDistance(0,0,-1,-1)` is `true` and
  `isWithinRenderDistance(0,0,-1,-1)` is `true`.

#### Scenario: diagonal distance uses the max axis
- **GIVEN** `RenderSimulationDistance(2, 2)` and player chunk `(0,0)`
- **WHEN** querying chunk `(2,1)`
- **THEN** `isWithinRenderDistance(2,1,0,0)` is `true` (Chebyshev distance 2) and
  `isWithinRenderDistance(3,0,0,0)` is `false`.

### Requirement: radii must be non-negative
`RenderSimulationDistance` MUST reject a negative radius.

#### Scenario: negative radius throws
- **GIVEN** `renderDistance = -1` or `simulationDistance = -1`
- **WHEN** constructing `RenderSimulationDistance`
- **THEN** the constructor throws and no instance is created.

### Requirement: World keeps streaming on the rendering radius
`World` MUST continue to load, generate, mesh, and unload using the rendering radius
only; the simulation radius MUST NOT change streaming or unload scope by default.

#### Scenario: streaming scope equals render radius
- **GIVEN** a `World` with `renderDistance = 4` and `simulationDistance = 2`
- **WHEN** the player stands at chunk `(0,0)` and streaming settles
- **THEN** chunks are generated/meshed within `(4,4)` of the center and
  `getRenderDistance()` returns `4`, while `getSimulationDistance()` returns `2`.

### Requirement: World exposes a simulation gate
`World.isChunkSimulating(cx, cz)` MUST return whether `(cx,cz)` is within the
simulation radius of the stream center, and MUST return `false` before the first
stream/update sets a center.

#### Scenario: a far chunk is rendered but not simulated
- **GIVEN** a `World` streamed to center `(0,0)` with `renderDistance = 4`,
  `simulationDistance = 2`
- **WHEN** querying chunk `(3,0)`
- **THEN** `isChunkSimulating(3,0)` is `false` and `getRenderDistance()`-based
  streaming still includes it as rendered.

#### Scenario: a near chunk is both rendered and simulated
- **GIVEN** the same world streamed to `(0,0)`
- **WHEN** querying chunk `(2,0)`
- **THEN** `isChunkSimulating(2,0)` is `true`.

#### Scenario: no center yet means not simulating
- **GIVEN** a freshly constructed `World` that has not streamed
- **WHEN** `isChunkSimulating(0,0)` is called
- **THEN** it returns `false`.

### Requirement: runtime distinguishes the radii
`Game` MUST pass the runtime simulation distance into `World` while `Environment`
continues to receive the render distance.

#### Scenario: world and environment receive different radii hooks
- **GIVEN** the runtime in headless mode
- **WHEN** `Game` constructs `World` and `Environment`
- **THEN** `World` receives `simulationDistance` from `runtimeSimulationDistance()`
  and `Environment` receives the render distance (no behavioral regression).

## Error and failure behavior

- Constructing `RenderSimulationDistance` with a negative radius throws; no partial
  instance escapes.
- `World.isChunkSimulating` before the first center is `false` (no center).
- A `World` built without `simulationDistance` falls back to `CONFIG.simulationDistance`
  (default equal to `renderDistance`); streaming scope is unchanged.

## Performance and resource bounds

Classification is O(1) arithmetic with no allocation. `World` holds one small
classifier instance; streaming hot paths are untouched.

## Compatibility and migration

New config keys only; defaults preserve the prior single-radius behavior. No stored
or public data formats change.

## Security and integrity

None beyond input validation of non-negative radii.

## Observability

`World.getRenderDistance()` / `getSimulationDistance()` expose the active radii;
`isChunkSimulating` is the spatial gate consumed by future tick loops.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Independent radii config | `RenderSimulationDistance.test.ts` config default assertions via `fromConfig` |
| Pure classifier distinguishes radii | chebyshev + boundary scenarios |
| Radii non-negative | negative-radius throw test |
| World streams on render radius | World integration: getRenderDistance/getSimulationDistance |
| World simulation gate | World integration: isChunkSimulating far/near/no-center |
| Runtime distinguishes radii | `Game` wiring + existing E2E (no regression) |
