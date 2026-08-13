# Spec: survival-system

## Contract

- **Purpose**: Add a compact Minecraft-inspired survival loop with health, hunger, saturation, fall damage, drowning, lava damage, regeneration, food, death, and respawn.
- **Scope**: Owns deterministic survival state and rules. Rendering, input collection, and spawn positioning remain in the engine/UI layers.
- **Functional requirements**: Health; hunger; saturation; fall damage; drowning; lava damage; hunger drain; natural regeneration; food consumption; death/respawn; validated persistence.
- **Non-functional requirements**: Rules are independent of Three.js rendering, clamp frame deltas, and never allow malformed saved state to escape.
- **Inputs and outputs**: Inputs: delta time, sprinting, head-submerged state, in-lava state, landing distance, food use. Outputs: survival snapshot, HUD values, damage/heal/hunger/death events.
- **Core data structures**: `SurvivalSystem`, `SurvivalSnapshot`, `SurvivalEvent`.
- **Dependencies**: `Player` for velocity reset, `PlayerPhysics` for landing distance, `Game` for respawn and UI, `Inventory` for apples.
- **Error and edge-case behavior**: Damage has a short invulnerability window; starvation, drowning, and lava damage tick over time; full hunger rejects food; death resets through the composition root; invalid snapshots are rejected.
- **Performance expectations**: Constant-time arithmetic per active frame with no world scans beyond the head-water sample owned by `Game`.
- **Verification method**: `tests/unit/SurvivalSystem.test.ts`, `tests/unit/PlayerPhysics.test.ts`, and browser survival HUD/crafting tests.

## Requirements

### Requirement: Survival state

The system SHALL maintain health in [0,20], hunger in [0,20], and saturation in [0,20].

### Requirement: Environmental damage

The system SHALL apply damage for landings above the safe threshold, prolonged head submersion, and periodic exposure to lava.

#### Scenario: Lava exposure
- **WHEN** the player's body overlaps a lava voxel for the damage interval
- **THEN** health decreases and a damage event identifies lava as the cause

### Requirement: Food and regeneration

The system SHALL drain hunger faster while sprinting, consume saturation before hunger, allow apples to restore hunger/saturation, and regenerate health when well fed.

### Requirement: Death and persistence

The system SHALL emit death at zero health, support a respawn reset, and round-trip a versioned validated snapshot.
