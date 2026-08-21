# 02 — Physics and Gameplay Mechanics Audit

## Decision

Do **not** replace the existing player controller with a generic physics engine as the first move. Preserve a custom kinematic voxel controller and make it more rigorous. A physics library can later handle dynamic rigid bodies if needed.

## Verified current behavior

`src/player/PlayerPhysics.ts` performs axis-aligned voxel collision with substeps. It resolves Y then X then Z, uses full-block solidity through `world.isSolid`, and supports a configured one-block automatic step. Water/lava occupancy is sampled along the player's vertical center column. `PlayerController.ts` owns movement intent; `PlayerInteraction.ts` handles block interaction; `src/math` includes the raycasting math referenced by earlier audits.

`GameLoop.ts` passes a clamped variable frame delta to update and render. The repository also contains `SimulationClock.ts` and `RenderInterpolator.ts`, so implementation work must first prove how these are wired in `Game.ts` before changing timing.

## Main physics gaps to close

### 1. Collision shapes, not just `isSolid`
Full-cube collision is insufficient for stairs, slabs, fences/walls, doors/trapdoors, beds, chests, plants, fluids and many interactive blocks.

**Plan:** add a data-driven collision-shape query to block states. A block state returns zero or more local AABBs. Broad phase enumerates candidate voxel cells; narrow phase clips movement against those AABBs. Keep shape data immutable and registry-owned.

**Acceptance:** a shape fixture suite can place the player against every supported shape from all cardinal directions and prove no penetration/tunneling at maximum legal velocity.

### 2. Swept movement and robust stepping
The current substep approach is simple and defensible, but its cost rises with speed and it depends on a safety loop of 10 collision resolutions.

**Recommended evolution:** retain substeps initially, add metrics for `steps/update`, voxel probes and safety-loop saturation. If high-speed projectiles/entities need stronger guarantees, use swept AABB/slab tests or voxel DDA for the broad traversal rather than globally shrinking substep size.

**Stepping:** make step height a mechanic/state property; test step-up only when horizontal movement is blocked and the raised shape has head clearance, then settle onto support. A universal 1.0-block auto-step will not feel like Minecraft unless intentionally desired.

### 3. Fixed simulation semantics
Use an explicit logical tick for world mechanics. A recommended architecture is:

```text
rAF frame
  accumulate wall-clock time
  run <= N fixed simulation ticks
  capture previous/current render state
  render interpolated state
```

Target 20 TPS for Minecraft-style block/entity/random-tick systems. Player input can be sampled every frame but consumed deterministically at tick boundaries. Cap catch-up work (for example 4–5 ticks/frame) and discard/explain excess debt rather than freezing for seconds after a hidden tab.

### 4. Movement parity as behavior, not magic constants
Create golden movement traces for:

- standing/walking/sprinting distance over 1, 5 and 10 seconds;
- jump apex/time-to-apex/landing time;
- sprint-jump sequence;
- air control and friction transitions;
- walking off edges;
- head collision;
- diagonal normalization;
- crouch/sneak edge safety;
- water/lava entry, swimming and exit;
- ice/slime/honey/soul-sand-like surfaces if supported;
- ladders/vines/climbables;
- knockback and fall damage.

Record position/velocity/onGround/medium at each fixed tick. Tests should use tolerances and invariants rather than fragile frame-specific screenshots.

### 5. Ground/support model
Replace “downward collision this update means grounded” with an explicit support/contact query that distinguishes support surface, liquid, ladder/climbable and airborne state. This avoids edge cases at tiny downward velocities and enables friction/slipperiness based on the block below.

### 6. Fluids
Current player water/lava detection samples block IDs along one X/Z column. That cannot represent partial fluid levels or robust head/body immersion.

**Plan:** define fluid state separately from block solidity: fluid type, level/height, falling/source flags and local surface height. Sample body and eyes independently. Apply drag, buoyancy, swim acceleration, flow vectors, drowning/fire interactions and splash/sound effects through a medium-contact structure.

### 7. Raycasting and interactions
Use Amanatides-Woo style voxel traversal for block-cell traversal, then test the block state's interaction/selection shape within each visited cell. Separate:

- block target ray;
- entity target ray;
- selection shape;
- collision shape;
- occlusion shape;
- fluid hit rules.

This is necessary once blocks stop being full cubes.

### 8. Entity/projectile physics
Do not run every entity through player physics. Define tiers:

- items/XP: cheap gravity + ground collision + merge/attraction;
- mobs: kinematic capsule/AABB with navigation and step rules;
- projectiles: swept segment/voxel traversal to prevent tunneling;
- special dynamic blocks: purpose-built rules or optional rigid body.

Entity simulation must respect `simulationDistance` and per-tick budgets.

## Physics performance instrumentation

Add counters/timers for:

- player collision candidate cells/update;
- shape AABBs tested;
- substeps/update;
- collision safety-loop maximum;
- entity broad/narrow-phase counts;
- ray cells traversed/action;
- total physics ms/tick, p50/p95/p99;
- allocation count/bytes if measurable through profiler runs.

## Acceptance targets

- deterministic replay gives identical world/player state for the same seed/input stream on the same build;
- player never tunnels through supported collision shapes under legal gameplay velocities;
- physics p95 <= 1.5 ms/tick on reference desktop with ordinary entity load;
- no per-frame growth in temporary arrays/maps attributable to collision scanning;
- catch-up after a 1-second tab stall never executes unbounded simulation work;
- ray interaction chooses the nearest valid shape and does not select occluded cells.

## Tradeoff: Rapier/Jolt/cannon-es
A rigid-body library is valuable only if the game adopts many physically simulated objects. It adds WASM/JS size, world synchronization, coordinate/shape conversion and determinism complexity. For the Minecraft-like avatar/block world, custom kinematic collision remains the recommended primary path.