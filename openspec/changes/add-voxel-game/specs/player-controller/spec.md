# Spec: player-controller

## Contract

- **Purpose**: Drive the first-person camera and player movement via pointer-lock mouse look and WASD/sprint/jump/swimming, with gravity, ground detection, AABB voxel collision, and safe spawn placement.
- **Scope**: Owns pointer-lock mouse look, pitch clamping, input release handling, movement (delta-time based), sprint, gravity, ground detection, AABB collision, and safe spawn. Does not cover block targeting/breaking/placing (block-interaction) or hotbar selection (inventory-hotbar).
- **Functional requirements**: Pointer lock and mouse look; movement; gravity, water/lava fluid behavior, and ground detection; voxel collision with practical one-block step-up assistance; safe spawn; survival landing telemetry.
- **Non-functional requirements**: Movement is delta-time based so distance traveled is stable across frame rates; no fall-through of terrain; pointer-lock loss pauses input and shows a resume message.
- **Inputs and outputs**: Inputs: pointer-lock mouse deltas, WASD/sprint/jump keys, delta time, world block solidity, water, and lava. Outputs: camera yaw/pitch, player position/velocity, AABB collision volume, grounded state, water/lava state, and distance of the latest landing for survival damage.
- **Core data structures**: `PlayerController`, `PlayerPhysics`, `Player` (position, velocity, AABB with height/radius), `MouseDelta`, camera yaw/pitch.
- **Dependencies**: engine (InputManager, GameLoop), world (block solidity via `World`), config (sensitivity, `maxPitch`, player physics, `maxDeltaTime`), chunk-streaming (spawn preload).
- **Error and edge-case behavior**: Pitch clamps to ~±90° so the camera never flips; pointer lock loss, focus loss, or a hidden document stops transient input and shows a pause/click-to-resume overlay; moving into a solid block stops that axis while permitted grounded one-block steps are climbed; landing on a solid surface zeroes vertical velocity; water reduces gravity and movement speed and permits upward swimming; lava reduces movement speed without becoming a safe surface; the new session spawns with the collision volume not intersecting solid blocks and solid ground below.
- **Performance expectations**: Collision and movement use constant per-frame work with no per-frame allocation; axis-separated resolution avoids expensive swept checks — see performance spec.
- **Acceptance criteria**: The scenarios in "Pointer lock and mouse look", "Movement", "Gravity and ground detection", "Voxel collision", and "Safe spawn" encode the pass/fail conditions.
- **Verification method**: Unit tests `tests/unit/PlayerPhysics.test.ts` plus e2e `tests/e2e/game.spec.ts`; verification matrix rows PLAYER-01 through PLAYER-05.

## ADDED Requirements

### Requirement: Pointer lock and mouse look
The system SHALL use the Pointer Lock API for mouse look with configurable sensitivity and pitch clamping to approximately ±90°, and SHALL pause or release input when pointer lock is lost.

#### Scenario: Mouse look
- **WHEN** the mouse moves while pointer-locked
- **THEN** yaw and pitch update proportionally to movement scaled by sensitivity

#### Scenario: Pitch clamp
- **WHEN** the player looks straight up or down
- **THEN** pitch does not exceed the clamp and the camera does not flip

#### Scenario: Pointer lock lost
- **WHEN** pointer lock is released (e.g. Escape)
- **THEN** movement input stops and a pause/click-to-resume message is shown

### Requirement: Movement
The player SHALL move with WASD, sprint with a modifier key, and jump when grounded, with smooth acceleration/deceleration and movement computed from delta time so behavior is stable across frame rates.

#### Scenario: Frame-rate stability
- **WHEN** the same input is held for one real second at 30 FPS and at 120 FPS
- **THEN** the distance traveled is approximately equal

#### Scenario: Sprint
- **WHEN** the sprint key is held while moving
- **THEN** horizontal speed increases by the configured sprint multiplier

### Requirement: Gravity and ground detection
The player SHALL be subject to gravity, detect ground contact, and not fall through terrain.

#### Scenario: Falling
- **WHEN** the player is airborne
- **THEN** vertical velocity decreases by gravity until landing on solid ground

#### Scenario: Swimming
- **WHEN** the player's body overlaps a water voxel and the jump/swim control is held
- **THEN** water buoyancy reduces falling speed and applies the configured upward swimming impulse

#### Scenario: Lava movement
- **WHEN** the player's body overlaps a lava voxel
- **THEN** movement is slowed and gravity uses the fluid terminal velocity while survival rules receive lava exposure telemetry

### Requirement: Voxel collision
The player SHALL have an AABB collision volume and collide against solid voxels using axis-separated (or swept) resolution; movement through solid blocks SHALL be prevented.

#### Scenario: Wall collision
- **WHEN** the player moves horizontally into a solid block
- **THEN** movement along that axis stops while other axes remain free

#### Scenario: Standing on ground
- **WHEN** the player falls onto a solid surface
- **THEN** vertical velocity is zeroed and the player rests on top of the block

#### Scenario: One-block step
- **WHEN** a grounded player moves horizontally into an obstacle no higher than the configured step height
- **THEN** the player rises onto the obstacle if the raised collision volume is clear

#### Scenario: Oversized obstacle
- **WHEN** a grounded player moves into an obstacle higher than the configured step height
- **THEN** the obstacle remains blocking and the player does not tunnel through it

### Requirement: Safe spawn
The player SHALL spawn above valid terrain at a safe position, not inside solid blocks.

#### Scenario: Spawn placement
- **WHEN** a new session starts
- **THEN** the player's collision volume does not intersect any solid block and solid ground exists below

### Requirement: Landing telemetry

The physics system SHALL report and clear the downward distance accumulated before the most recent grounded landing so survival rules can apply fall damage without coupling to rendering.

#### Scenario: Fall distance
- **WHEN** an airborne player lands on solid terrain
- **THEN** the latest landing distance is available once and then resets
