# Spec: block-registry

## Contract

- **Purpose**: Provide a single source of truth mapping stable numeric block ids to full block definitions (name, solidity, opacity, breakability, placeability, collision, render category, per-face textures), including the nine required blocks, and ensure all textures are original/procedural.
- **Scope**: Owns the block id space, definition properties, the required block set, and texture provenance. Does not cover how blocks are stored in chunks (chunk-system) or generated (world-generation).
- **Functional requirements**: Centralized registry; block definition properties; required block set; original textures.
- **Non-functional requirements**: Block IDs MUST NOT be hard-coded across gameplay code — systems resolve properties through the registry; unknown ids resolve to an error or a defined fallback; copyrighted Minecraft textures must not be used.
- **Inputs and outputs**: Inputs: block id queries, mesher UV requests (per-face). Outputs: block definitions with ids, display names, flags, render categories, and per-face atlas UV coordinates.
- **Core data structures**: `BlockId` enum, block definition records, `BlockRegistry`, texture atlas tile→UV mapping.
- **Dependencies**: rendering (TextureAtlas consumes definitions to build tiles/UVs), world-generation and interaction query via the registry; config (atlas size).
- **Error and edge-case behavior**: Unknown ids are handled as an error or defined fallback rather than undefined behavior; the nine required types (air, grass, dirt, stone, sand, water, bedrock, wood/log, leaves) must register with valid definitions; grass returns distinct top/bottom/side UVs for the mesher.
- **Performance expectations**: Lookup is a constant-time id→definition map access used in hot meshing paths; the atlas is built once at init — see performance spec.
- **Acceptance criteria**: The scenarios in "Centralized registry", "Block definition properties", "Required block set", and "Original textures" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/BlockRegistry.test.ts` (5 tests) plus static review of `src/rendering/TextureAtlas.ts`; verification matrix rows REG-01 through REG-04.

## ADDED Requirements

### Requirement: Centralized registry
The system SHALL provide a centralized block registry mapping stable numeric identifiers to block definitions. Block IDs MUST NOT be hard-coded across gameplay code; systems SHALL resolve properties through the registry.

#### Scenario: Lookup by id
- **WHEN** a block id is queried in the registry
- **THEN** its full definition is returned, and unknown ids are handled as an error or a defined fallback

### Requirement: Block definition properties
Each block definition SHALL include: stable id, display name, solidity, opacity/transparency, breakability, placeability, collision behavior, render category, and texture coordinates with separate top, bottom, and side faces.

#### Scenario: Property access
- **WHEN** gameplay code asks whether a block is solid, opaque, or breakable
- **THEN** the answer comes from the registry definition for that block id

#### Scenario: Per-face textures
- **WHEN** the mesher requests texture UVs for a grass block
- **THEN** distinct atlas coordinates are returned for top, bottom, and side faces

### Requirement: Required block set
The registry SHALL define at minimum: air, grass, dirt, stone, sand, water, bedrock, wood/log, and leaves.

#### Scenario: All required blocks registered
- **WHEN** the registry initializes
- **THEN** all nine required block types are present with valid definitions

### Requirement: Original textures
All block textures SHALL be original procedural or locally created assets, or clearly permissive licensed assets; copyrighted Minecraft textures MUST NOT be used. Any third-party asset SHALL be documented with its license.

#### Scenario: Texture provenance
- **WHEN** the texture atlas is built
- **THEN** every tile is procedurally generated in code or sourced from a documented permissive asset
