# Spec: rendering

## Contract

- **Purpose**: Render the voxel world with a Three.js WebGL renderer and a delta-time game loop, producing chunk-based meshes with a texture atlas, culling, fog, and transparency, and releasing GPU resources on unload.
- **Scope**: Owns the WebGL renderer, game loop, canvas resize, chunk meshing, texture atlas, materials, fog, water/glass transparency, and GPU resource disposal. Does not cover audio, post-processing, or the day-night cycle (covered by lighting-environment).
- **Functional requirements**: WebGL renderer and game loop; responsive canvas; chunk-based voxel meshes; texture atlas and material reuse; culling, fog, and transparency; GPU resource disposal.
- **Non-functional requirements**: Non-stretched rendering at any window size; ≤2 meshes per chunk; no GPU resource leaks during normal exploration.
- **Inputs and outputs**: Inputs: chunk block data, block-registry UV definitions, window resize events, `devicePixelRatio`. Outputs: `ChunkMeshResult` geometries (opaque/transparent), scene graph meshes, disposed GPU resources.
- **Core data structures**: `ChunkMeshResult`, `ChunkState`, WebGLRenderer, `THREE.BufferGeometry`, `THREE.Material`, texture atlas.
- **Dependencies**: chunk-system (block data), chunk-streaming (load/unload), block-registry (per-face UVs), math (coordinates), config.
- **Error and edge-case behavior**: Chunk unload disposes its geometries and removes them from the scene; high-DPI pixel ratio is capped at `maxPixelRatio`; large frame times are clamped to `maxDeltaTime`; a chunk with no faces of a category yields a null geometry for that category; renderer context loss enters a visible recoverable/fatal state without silently continuing with invalid GPU resources.
- **Performance expectations**: Mesh generation is bounded per chunk (never one mesh per block); hidden-face removal avoids emitting internal faces; resource disposal prevents unbounded GPU memory growth — see performance spec.
- **Acceptance criteria**: The scenarios in "WebGL renderer and game loop", "Responsive canvas", "Chunk-based voxel meshes", "Texture atlas and material reuse", "Culling, fog, and transparency", and "GPU resource disposal" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/ChunkMesher.test.ts` plus e2e `tests/e2e/game.spec.ts`; verification matrix rows REND-01 through REND-06.

## ADDED Requirements

### Requirement: WebGL renderer and game loop
The system SHALL render the scene with a Three.js `WebGLRenderer` and a perspective camera, driven by a `requestAnimationFrame` loop with delta-time handling that clamps unusually large frame times.

#### Scenario: Loop updates with delta time
- **WHEN** the animation frame callback fires
- **THEN** game logic receives a delta time in seconds, clamped to a configured maximum (e.g. 100 ms)

#### Scenario: Pixel ratio handling
- **WHEN** the renderer initializes on a high-DPI display
- **THEN** the pixel ratio is set from `window.devicePixelRatio` (capped at a configured maximum)

### Requirement: Responsive canvas
The renderer SHALL resize the canvas and update the camera aspect ratio when the window size changes.

#### Scenario: Window resize
- **WHEN** the browser window is resized
- **THEN** the canvas matches the new viewport size and the rendered image is not stretched

### Requirement: Chunk-based voxel meshes
The system SHALL render voxel terrain as a small, controlled number of meshes per chunk and SHALL NOT create one mesh per block. Mesh generation SHALL remove all internal faces that cannot be seen (hidden-face removal). If greedy meshing is not implemented, the chosen meshing approach SHALL be documented and performance criteria still met.

#### Scenario: Internal faces removed
- **WHEN** a solid chunk interior is meshed
- **THEN** faces between two opaque adjacent blocks are not emitted into the geometry

#### Scenario: One mesh per render category
- **WHEN** a chunk containing opaque blocks and transparent water/glass is meshed
- **THEN** it produces at most one opaque mesh and one transparent mesh

### Requirement: Texture atlas and material reuse
Block textures SHALL be packed into a texture atlas and rendered through shared materials; block faces SHALL map to their configured atlas UV coordinates.

#### Scenario: Per-face texture mapping
- **WHEN** a grass block is meshed
- **THEN** its top, bottom, and side faces sample the top/bottom/side atlas tiles configured in the block registry

### Requirement: Culling, fog, and transparency
The system SHALL rely on frustum culling for chunk meshes, apply distance fog, and render water with transparency so submerged blocks remain partially visible.

#### Scenario: Water transparency
- **WHEN** a chunk contains water above solid blocks
- **THEN** the water is rendered with a transparent material and does not fully occlude blocks below it

### Requirement: GPU resource disposal
Geometries, materials, and textures owned by a chunk SHALL be disposed when the chunk unloads, and no GPU resource SHALL leak during normal exploration.

#### Scenario: Chunk unload disposal
- **WHEN** a chunk is unloaded from the scene
- **THEN** its geometries are disposed and removed from the scene graph
