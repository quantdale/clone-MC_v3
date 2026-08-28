# Spec: world-simulation

## Contract

- **Purpose**: Add lightweight living-world behavior and block simulation that make exploration feel active without compromising deterministic generation or frame budgets.
- **Scope**: Owns unsupported sand/gravel settling and deterministic passive critter ambience. It does not own terrain generation, player survival damage, or hostile AI.
- **Functional requirements**: Bounded granular settling; deterministic passive critters; pause-safe updates; cleanup.
- **Non-functional requirements**: World simulation MUST be deterministic for a given seed and update sequence, MUST use bounded work, and MUST stop while gameplay is paused.
- **Inputs and outputs**: Inputs: loaded world cells, seed, player position, active simulation delta time. Outputs: moved granular blocks, critter scene groups, and disposed resources.
- **Core data structures**: `World` falling queue/set, `WorldLife`, deterministic seeded offsets, Three.js scene group.
- **Dependencies**: world-generation for terrain height, chunk-system for loaded cells and edits, engine `Game` for pause state and lifecycle, rendering for scene resources.
- **Error and edge-case behavior**: Unloaded cells are not treated as valid landing surfaces; falling work is skipped or retried until neighboring cells are loaded; critters that wander too far are repositioned near the player; disposal removes geometry/material resources.
- **Performance expectations**: No more than a small fixed number of falling blocks is processed per world update; the passive herd uses shared low-poly geometry/materials and constant-time movement.
- **Verification method**: `tests/unit/World.test.ts`, `tests/unit/WorldLife.test.ts`, and the Playwright passive-world-life smoke test; verification matrix rows WORLD-SIM-01 through WORLD-SIM-03.

## Requirements

### Requirement: Granular block settling

Unsupported sand and gravel SHALL move downward one loaded cell at a time, with a bounded update budget and normal world edit/remesh bookkeeping.

#### Scenario: Sand settles
- **WHEN** a loaded sand block has an air cell immediately below it
- **THEN** the sand moves down one cell during a later update and the original cell becomes air

### Requirement: Deterministic passive life

The world SHALL create a small deterministic herd of passive, visual-only critters from the world seed, with stable initial placement and low-poly shared resources.

#### Scenario: Same seed, same herd
- **WHEN** two sessions create passive world life with the same seed
- **THEN** they create the same number and initial arrangement of critters

### Requirement: Pause and disposal

World-life movement SHALL pause when the gameplay simulation is inactive, and disposing the world SHALL remove all critter scene objects and release their resources.

#### Scenario: Paused simulation
- **WHEN** the game is paused or the crafting modal is open
- **THEN** passive critters do not advance until the simulation resumes
