# Spec: chunk-streaming

## Contract

- **Purpose**: Load chunks within a configurable render distance around the player and unload them beyond it, distributing work across frames and preserving deterministic regeneration and in-session edits across unload/reload.
- **Scope**: Owns the streaming policy around the player, frame-distributed work, deterministic regeneration on reload, and in-session edit persistence via an overlay. Does not cover chunk storage internals (chunk-system) or network/server streaming.
- **Functional requirements**: Streaming around the player; frame-distributed work; deterministic regeneration; in-session edit persistence.
- **Non-functional requirements**: Bounded work per frame so ordinary movement does not freeze; unloaded chunks regenerate to identical base terrain; edits survive unload/reload without storing the entire world.
- **Inputs and outputs**: Inputs: player position, config render distance, block edits. Outputs: chunk load/unload decisions, per-frame generation/mesh/unload budgets, edit overlay applied on reload.
- **Core data structures**: `World` chunk map, chunk queues, `WorldStats` (loaded/pending counts), `editOverlay` / `applyEditOverlay`, `ChunkState`.
- **Dependencies**: chunk-system (storage, lifecycle, queues), world-generation (deterministic base terrain), config (budgets, render distance), player-controller (player position).
- **Error and edge-case behavior**: Fast movement that leaves many chunks to generate still respects the per-frame budget; a player returning to a previously unloaded area gets identical base terrain; broken/placed blocks persist via the overlay after unload/reload while the rest of the chunk matches seeded terrain.
- **Performance expectations**: Generation/mesh/unload work is budgeted per frame (`generatePerFrame`, `meshPerFrame`, `unloadPerFrame`); loaded chunk count stays bounded by render distance; memory stays flat — see performance spec.
- **Acceptance criteria**: The scenarios in "Streaming around the player", "Frame-distributed work", "Deterministic regeneration", and "In-session edit persistence" encode the pass/fail conditions.
- **Verification method**: e2e `tests/e2e/game.spec.ts` plus unit `tests/unit/World.test.ts`; verification matrix rows STREAM-01 through STREAM-04.

## ADDED Requirements

### Requirement: Streaming around the player
The system SHALL load chunks within a configurable render distance around the player and unload chunks beyond it, streaming dynamically as the player moves.

#### Scenario: Load on approach
- **WHEN** the player moves toward ungenerated terrain
- **THEN** chunks within render distance become generated, meshed, and visible

#### Scenario: Unload at distance
- **WHEN** a chunk falls outside the configured render distance
- **THEN** it is unloaded and its resources disposed

### Requirement: Frame-distributed work
Chunk generation and meshing work SHALL be distributed across frames (bounded work per frame) so ordinary movement does not cause long freezes.

#### Scenario: Bounded per-frame work
- **WHEN** many chunks need generation after fast movement
- **THEN** no more than the configured per-frame budget of generation/meshing jobs is processed per frame

### Requirement: Deterministic regeneration
Unloaded chunks SHALL regenerate to the identical base terrain from the seed when reloaded.

#### Scenario: Regeneration matches
- **WHEN** a player leaves an area, the chunk unloads, and the player returns
- **THEN** the regenerated base terrain is identical to the original

### Requirement: In-session edit persistence
Block edits made during the session SHALL survive chunk unload/reload via a modified-chunk overlay (or equivalent), without storing the entire generated world. Cross-restart persistence is optional.

#### Scenario: Broken block stays broken
- **WHEN** a player breaks a block, walks away until the chunk unloads, and returns
- **THEN** the block is still absent

#### Scenario: Placed block stays placed
- **WHEN** a player places a block, the chunk unloads and reloads
- **THEN** the placed block is present and the rest of the chunk matches seeded terrain
