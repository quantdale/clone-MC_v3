# Spec: block-registry

## Contract

- **Purpose**: Provide a single source of truth mapping stable numeric block ids to full block definitions (name, solidity, opacity, breakability, placeability, hardness, collision, render category, per-face textures), including the core blocks plus expanded ore/building/surface and food items, and ensure all textures are original/procedural.
- **Scope**: Owns the block id space, definition properties, the required block set, and texture provenance. Does not cover how blocks are stored in chunks (chunk-system) or generated (world-generation).
- **Functional requirements**: Centralized registry; block definition properties; hardness metadata; preferred-tool metadata; required block set; expanded food/building/tool set; original textures.
- **Non-functional requirements**: Block IDs MUST NOT be hard-coded across gameplay code — systems resolve properties through the registry; unknown ids resolve to an error or a defined fallback; copyrighted Minecraft textures must not be used.
- **Inputs and outputs**: Inputs: block id queries, mesher UV requests (per-face), interaction break-time queries. Outputs: block definitions with ids, display names, flags, hardness, preferred tool, tool power/durability, render categories, and per-face atlas UV coordinates.
- **Core data structures**: `BlockId` enum, block definition records, `BlockRegistry`, texture atlas tile→UV mapping.
- **Dependencies**: rendering (TextureAtlas consumes definitions to build tiles/UVs), world-generation and interaction query via the registry; config (atlas size).
- **Error and edge-case behavior**: Unknown ids are handled as an error or defined fallback rather than undefined behavior; the core types plus glass, snow, gravel, planks, ores, masonry, lava, and apple register with valid definitions; non-breakable items use infinite hardness; grass returns distinct top/bottom/side UVs for the mesher.
- **Performance expectations**: Lookup is a constant-time id→definition map access used in hot meshing paths; the atlas is built once at init — see performance spec.
- **Acceptance criteria**: The scenarios in "Centralized registry", "Block definition properties", "Required block set", and "Original textures" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/BlockRegistry.test.ts` plus static review of `src/rendering/TextureAtlas.ts`; verification matrix rows REG-01 through REG-08.

## ADDED Requirements

### Requirement: Centralized registry
The system SHALL provide a centralized block registry mapping stable numeric identifiers to block definitions. Block IDs MUST NOT be hard-coded across gameplay code; systems SHALL resolve properties through the registry.

#### Scenario: Lookup by id
- **WHEN** a block id is queried in the registry
- **THEN** its full definition is returned, and unknown ids are handled as an error or a defined fallback

### Requirement: Block definition properties
Each block definition SHALL include: stable id, display name, solidity, opacity/transparency, breakability, placeability, relative hardness, optional drop mapping, optional tool metadata, collision behavior, render category, and texture coordinates with separate top, bottom, and side faces.

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

### Requirement: Expanded building blocks
The registry SHOULD provide transparent glass plus snow, gravel, and planks as placeable blocks with original atlas tiles, without changing the stable ids of the original core set.

#### Scenario: Expanded block lookup
- **WHEN** the hotbar or terrain requests an expanded block
- **THEN** the registry returns a valid definition and the mesher resolves its atlas tile without hard-coded gameplay properties

### Requirement: Original textures
All block textures SHALL be original procedural or locally created assets, or clearly permissive licensed assets; copyrighted Minecraft textures MUST NOT be used. Any third-party asset SHALL be documented with its license.

#### Scenario: Texture provenance
- **WHEN** the texture atlas is built
- **THEN** every tile is procedurally generated in code or sourced from a documented permissive asset

### Requirement: Ore and building registration

The registry SHALL provide coal ore, iron ore, cobblestone, bricks, and lava with stable ids, hardness values, render categories, original atlas tiles, and ore drop mappings where applicable.

### Requirement: Tool item registration

The registry SHALL provide stable non-placeable ids for sticks, wooden pickaxes, stone pickaxes, and a wooden axe, including tool family, speed, durability, and procedural atlas tiles.

### Requirement: Material drop registration

The registry SHALL provide stable non-placeable coal and raw-iron material ids, each with a procedural inventory tile, and ore definitions SHALL map to the corresponding material drop.

### Requirement: Food item registration

The registry SHALL provide a non-placeable Apple item with a procedural atlas tile so inventory and food systems can use a stable id without introducing external assets.
