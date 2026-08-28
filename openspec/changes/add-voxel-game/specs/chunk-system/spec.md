# Spec: chunk-system

## Contract

- **Purpose**: Provide fixed-size typed-array chunk storage with correct negative-coordinate conversion, automatic cross-chunk block lookup, explicit lifecycle states with bounded queues, and dirty/neighbor remeshing.
- **Scope**: Owns chunk storage, world↔chunk↔local coordinate conversion, lifecycle state machine, generation/meshing queues, stale-job guards, dirty tracking, unload and disposal. Does not cover terrain content (world-generation) or spawning/streaming policy (chunk-streaming).
- **Functional requirements**: Chunk storage and coordinate conversion; block lookup across boundaries; chunk lifecycle and queues; dirty state and neighbor remeshing; bounded granular-block settling; unload and disposal.
- **Non-functional requirements**: Queues MUST NOT grow without bound (`maxQueueSize`); stale asynchronous job results MUST be discarded; coordinate conversion MUST be correct for negative coordinates.
- **Inputs and outputs**: Inputs: world coordinates (block reads/writes, negative included), block edits, async generation/mesh job completions. Outputs: chunk+local coordinates, block ids, dirty state, unloaded/disposed chunks.
- **Core data structures**: `Chunk` (flat `Uint8Array`, 16×64×16), `ChunkState` (Pending/Generating/Generated/Meshing/Visible/Unloading), `meshVersion`, `chunkKey` string keys, `WorldStats`, meshing queues.
- **Dependencies**: block-registry (`BlockId`), math (`WorldCoordinates` helper exports), world-generation (terrain fill), rendering (meshes on unload).
- **Error and edge-case behavior**: World x=-1 maps to chunk x=-1 with local x=15 (floor division/modulo); out-of-bounds local reads return air (`getLocalSafe`); a chunk requested twice before generation completes runs only one job; a stale job completing for an unloaded/re-queued chunk is discarded via version guards; boundary edits mark and remesh the adjacent neighbor chunk.
- **Performance expectations**: Storage is a single `Uint8Array` per chunk; generation/mesh queues are bounded; only dirty chunks (plus boundary neighbors) are remeshed; unload releases storage and GPU resources — see performance spec.
- **Acceptance criteria**: The scenarios in "Chunk storage and coordinate conversion", "Block lookup across boundaries", "Chunk lifecycle and queues", "Dirty state and neighbor remeshing", and "Unload and disposal" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/WorldCoordinates.test.ts` and `tests/unit/World.test.ts`; verification matrix rows CHUNK-01 through CHUNK-06.

## ADDED Requirements

### Requirement: Chunk storage and coordinate conversion
The system SHALL store blocks in fixed-size chunks (e.g. 16×64×16) using an efficient typed-array layout, and SHALL provide world-to-chunk and world-to-local coordinate conversion that is correct for negative coordinates.

#### Scenario: Negative coordinate conversion
- **WHEN** world coordinate x = -1 is converted
- **THEN** it maps to chunk x = -1 with local x = 15 (for 16-wide chunks)

#### Scenario: Round-trip conversion
- **WHEN** any world coordinate is converted to chunk+local form and back
- **THEN** the original coordinate is recovered

### Requirement: Block lookup across boundaries
Block reads and writes SHALL resolve the owning chunk automatically, including across chunk boundaries.

#### Scenario: Cross-chunk read
- **WHEN** a block is queried at a coordinate in a neighboring chunk
- **THEN** the neighbor chunk's storage is consulted and the correct block is returned

### Requirement: Chunk lifecycle and queues
Chunks SHALL have explicit lifecycle states (e.g. pending, generating, generated, meshing, visible, unloading) and be processed through bounded generation and meshing queues. Queues MUST NOT grow without bound, and stale asynchronous job results SHALL be discarded.

#### Scenario: Stale job guard
- **WHEN** an async generation job completes for a chunk that has since been unloaded or re-queued
- **THEN** the stale result is discarded and does not overwrite current state

#### Scenario: No duplicate generation
- **WHEN** the same chunk is requested twice before generation completes
- **THEN** only one generation job runs for that chunk

### Requirement: Dirty state and neighbor remeshing
When a block changes, only the affected chunk SHALL be marked dirty; if the block lies on a chunk boundary, the relevant neighbor chunk SHALL also be marked dirty. Only dirty chunks are remeshed.

#### Scenario: Interior edit
- **WHEN** a block strictly inside a chunk is modified
- **THEN** only that chunk is marked dirty and remeshed

#### Scenario: Boundary edit
- **WHEN** a block on a chunk face is modified
- **THEN** the adjacent chunk across that face is also marked dirty and remeshed

### Requirement: Unload and disposal
Unloading a chunk SHALL remove its meshes from the scene, dispose GPU resources, and release its storage from the active chunk map.

#### Scenario: Unload releases resources
- **WHEN** a chunk is unloaded
- **THEN** it is absent from the loaded-chunk map and its geometry is disposed

### Requirement: Granular block settling

The world SHALL move unsupported sand and gravel downward through loaded air cells, process the work with a bounded per-update budget, and preserve the resulting edits through normal remeshing and persistence.

#### Scenario: Unsupported block falls
- **WHEN** a sand or gravel block has air directly below it in a loaded chunk
- **THEN** it moves down one cell during a later world update and the source cell becomes air
