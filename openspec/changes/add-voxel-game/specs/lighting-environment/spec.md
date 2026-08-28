# Spec: lighting-environment

## Contract

- **Purpose**: Provide scene lighting, sky, distance fog, and clouds that make block surfaces readable and mask the chunk-unload boundary, present water as a distinct semi-transparent liquid, and support a stable day-night cycle.
- **Scope**: Owns hemisphere/ambient + directional sunlight, sky/background, fog tuning, water material/transparency, and the optional day-night cycle. Does not cover mesh generation (rendering) or the renderer/camera setup (rendering).
- **Functional requirements**: Scene lighting; sky, fog, and clouds; water presentation; day-night cycle.
- **Non-functional requirements**: Block top and side faces are visually distinguishable; fog progressively obscures chunks at the render-distance edge; the day-night cycle (if enabled) introduces no flickering, broken shadows, or excessive per-frame cost.
- **Inputs and outputs**: Inputs: render distance (for fog tuning), water block presence, seed, daylight factor, sun direction. Outputs: scene lights, sky/fog/cloud parameters, water material/transparency, day-night light state.
- **Core data structures**: `Lighting` (hemisphere + directional sun, `dayNight` config), `Environment` (sky/fog), water material, fog color/concentration.
- **Dependencies**: rendering (Materials, TextureAtlas), config (fog near/far/color, `dayNight`), world (water block rendering).
- **Error and edge-case behavior**: Fog is tuned to render distance so distant chunks are obscured rather than popping jarringly; water renders semi-transparent and tinted so it does not fully occlude blocks below; the day-night cycle and cloud tint advance smoothly, while the headless tier disables clouds for predictable performance.
- **Performance expectations**: Lighting is a fixed set of lights, fog, and a bounded cloud layer with constant per-frame cost; shadows are included only when they do not cause unacceptable cost; headless sessions use the conservative quality tier — see performance spec.
- **Acceptance criteria**: The scenarios in "Scene lighting", "Sky and fog", "Water presentation", and "Optional day-night cycle" encode the pass/fail conditions.
- **Verification method**: Pixel probes (lit faces, sky/fog, water) plus e2e `tests/e2e/game.spec.ts` and unit `tests/unit/ChunkMesher.test.ts`; verification matrix rows LIGHT-01 through LIGHT-04.

## ADDED Requirements

### Requirement: Scene lighting
The scene SHALL include ambient or hemisphere lighting plus directional sunlight with sensible direction and intensity, so block surfaces are visually distinguishable. Shadows are included only when they do not cause unacceptable performance cost.

#### Scenario: Readable surfaces
- **WHEN** the scene renders terrain
- **THEN** top and side faces of blocks are visually distinguishable under the lighting setup

### Requirement: Sky and fog
The scene SHALL include a sky or background treatment and distance fog tuned for visual quality and to mask the chunk unload boundary.

#### Scenario: Fog at distance
- **WHEN** chunks approach the edge of render distance
- **THEN** fog progressively obscures them so pop-in is not visually jarring

### Requirement: Water presentation
Water SHALL be visually distinct (color/transparency) and recognizable as a liquid surface.

#### Scenario: Water appearance
- **WHEN** water is rendered
- **THEN** it appears semi-transparent and tinted distinctly from opaque terrain blocks

### Requirement: Optional day-night cycle
A day-night cycle MAY be implemented only after mandatory features are stable; if implemented, it MUST NOT introduce flickering, broken shadows, or excessive per-frame cost.

#### Scenario: Stable cycle (optional)
- **WHEN** a day-night cycle is active
- **THEN** light transitions are smooth and no new recurring console warnings or frame hitches appear
