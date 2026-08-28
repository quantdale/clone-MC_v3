# Spec: world-generation

## Contract

- **Purpose**: Produce deterministic, seamless voxel terrain from a configurable seed — layered ground with water, rare deep lava pockets, bedrock, distant biomes, protected caves, and trees — that is identical for identical seed and coordinates.
- **Scope**: Owns seeded noise, terrain height and layer composition, biome/cave variation, water placement, trees, negative-coordinate continuity, and across-chunk-boundary consistency. Does not cover chunk storage/lifecycle (chunk-system) or background streaming (chunk-streaming).
- **Functional requirements**: Seeded deterministic generation; terrain composition; coal/iron ore distribution; deep lava pockets; biomes and caves; trees; chunk-boundary continuity; negative coordinates.
- **Non-functional requirements**: Correctness of determinism — world-critical generation MUST NOT use `Math.random()`; the same seed always yields the same base terrain.
- **Inputs and outputs**: Inputs: seed, chunk coordinates (including negative), config (sea level, bedrock Y, chunk dimensions). Outputs: a full chunk's `Uint8Array` block data for the base terrain.
- **Core data structures**: `Chunk` block data (`Uint8Array`), `BlockId`, seeded PRNG, noise height function.
- **Dependencies**: math (PRNG, Noise), block-registry (block ids), config; consumed by chunk-streaming via `Chunk.generated`/`meshVersion`.
- **Error and edge-case behavior**: Episodes at negative chunk coordinates remain continuous across the origin; terrain below sea level fills with water and uses sand/gravel near water; bedrock occupies the lowest layer (y=0); caves and lava pockets stay below the surface and outside the protected spawn ring; trees near a chunk border appear exactly once — the neighbor chunk contributes canopy blocks only, with no duplicate tree.
- **Performance expectations**: Generation is fast and deterministic; per-frame generation work is bounded by the streaming budgets (`generatePerFrame`) — see performance spec.
- **Acceptance criteria**: The scenarios in "Seeded deterministic generation", "Terrain composition", "Trees", "Chunk-boundary continuity", and "Negative coordinates" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/TerrainGenerator.test.ts` and `tests/unit/Noise.test.ts`; verification matrix rows WORLD-01 through WORLD-06.

## ADDED Requirements

### Requirement: Seeded deterministic generation
Terrain generation SHALL be driven by a configurable seed using seeded noise; world-critical generation MUST NOT use `Math.random()`. The same seed and coordinates SHALL always produce the same base terrain.

#### Scenario: Deterministic regeneration
- **WHEN** the same chunk coordinates are generated twice with the same seed
- **THEN** the resulting block data is identical

#### Scenario: Different seeds differ
- **WHEN** two worlds are generated with different seeds
- **THEN** their terrain height maps differ

### Requirement: Terrain composition
Generated terrain SHALL include visible height variation and the following layers: grass at the surface, dirt subsurface, stone at depth, sand near water level, water filling depressions below sea level, and bedrock at the bottom of the world.

#### Scenario: Layer ordering
- **WHEN** a vertical column of generated terrain is inspected
- **THEN** it contains grass over dirt over stone, with bedrock at the lowest layer

#### Scenario: Water and sand placement
- **WHEN** terrain height falls below the configured sea level
- **THEN** the depression is filled with water and adjacent low terrain uses sand

### Requirement: Trees
The world SHALL generate trees with wood/log trunks and leaves, placed deterministically from the seed.

#### Scenario: Tree structure
- **WHEN** a tree is generated
- **THEN** it consists of a vertical log trunk topped by a leaves canopy

### Requirement: Underground ores

The generator SHOULD embed deterministic coal and iron ore clusters in underground stone outside the protected spawn ring.

#### Scenario: Ore determinism
- **WHEN** the same seed and distant chunk coordinates are generated twice
- **THEN** coal and iron ore positions match exactly

### Requirement: Deep lava pockets

The generator SHOULD place rare deterministic lava pockets in deep underground stone outside the protected spawn ring, and lava cells SHALL remain available to the physics and survival systems.

#### Scenario: Lava determinism
- **WHEN** the same seed and distant chunk coordinates are generated twice
- **THEN** the lava pocket positions match exactly and are not generated in the protected spawn ring

### Requirement: Biomes and caves
The world SHALL derive distant biome surfaces and subterranean cave pockets from the same deterministic seed/coordinate functions used by terrain generation. The spawn ring SHALL remain safe for initial traversal.

#### Scenario: Distant biome variety
- **WHEN** columns are sampled at increasing distances from spawn
- **THEN** the same seed produces repeatable plains, forest, desert, or taiga regions with matching surface blocks

#### Scenario: Protected cave carving
- **WHEN** a subterranean column is generated outside the spawn safety ring
- **THEN** deterministic cave air pockets may replace stone/dirt below the surface without carving through the surface layer

### Requirement: Chunk-boundary continuity
Terrain SHALL be continuous across chunk boundaries, and trees crossing chunk borders SHALL appear exactly once with no clipping or duplication.

#### Scenario: Seamless terrain
- **WHEN** two adjacent chunks are generated independently
- **THEN** block columns along their shared boundary match the same height function with no visible seam

#### Scenario: Cross-border tree
- **WHEN** a tree trunk is near a chunk border so its canopy extends into a neighbor chunk
- **THEN** the neighbor chunk contains the canopy blocks exactly once and no duplicate tree is generated in the neighbor

### Requirement: Negative coordinates
World generation SHALL produce correct, seamless terrain at negative world coordinates and across the origin.

#### Scenario: Negative-coordinate terrain
- **WHEN** chunks at negative coordinates are generated
- **THEN** terrain is continuous with terrain across the origin at the same seed
