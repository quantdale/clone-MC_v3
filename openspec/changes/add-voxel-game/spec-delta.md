# Spec Delta — add-voxel-game

This change adds the original capability specs plus the survival/inventory/world-simulation expansion. There were no pre-existing specs to remove.

## Added

- **`rendering`** — WebGL renderer, game loop, responsive canvas, chunk meshes with hidden-face removal, texture atlas, shared materials, culling, fog, transparency, disposal.
- **`world-generation`** — seeded deterministic terrain, layer composition, distant biomes, protected caves, trees, chunk-boundary continuity, negative coordinates.
- **`chunk-system`** — storage, coordinate conversion, lifecycle, cross-chunk lookup, dirty state, bounded queues, stale-job guards, disposal.
- **`chunk-streaming`** — load/unload around player, frame-distributed work, deterministic regeneration, sparse edit overlays, and seed-scoped browser save snapshots.
- **`player-controller`** — pointer lock, mouse look, WASD/sprint/jump, gravity, delta-time movement, AABB voxel collision, safe spawn.
- **`block-interaction`** — Amanatides & Woo raycast, targeting, break/place, placement validation, bedrock, cooldown, outline, remesh.
- **`block-registry`** — centralized definitions, properties, the nine core blocks plus glass/snow/gravel/planks, ores, masonry, lava, apple, tools, material drops, and original procedural textures.
- **`inventory-hotbar`** — stackable hotbar/storage slots, icons, highlight, number-key + wheel selection with wraparound, name display, item collection/food, nine transactional recipes, durable tools, and placement integration.
- **`survival-system`** — health, hunger, saturation, fall damage, drowning, regeneration, apples, death/respawn, and validated state snapshots.
- **`world-simulation`** — bounded sand/gravel settling, deterministic passive critter ambience, pause-safe updates, and disposal.
- **`lighting-environment`** — hemisphere + directional light, synchronized day/night sky, fog, procedural clouds, and water presentation.
- **`user-interface`** — crosshair, FPS, loading indicator, pointer-lock messaging, error state, debug overlay, desktop usability.
- **Inventory/crafting UI delta** — pause-safe inventory grid, stack quantities, nine transactional recipe actions, tool durability, mining progress, survival HUD, world clock, and action toasts.
- **`performance`** — ~60 FPS target at render distance 8, bounded per-frame work, memory discipline, allocation avoidance, localized rebuild, test coverage.

## Implementation refinements (no spec drift)

Two behaviors were refined during implementation to satisfy robustness requirements without changing the public contract:

1. **Chunk streaming readiness** — `isReady` now evaluates the player's spawn chunk (not the origin), and spawn work is queued through frame budgets while the game gates physics until the local visible safety ring is ready. This strengthens the existing "safe spawn" and "no fall-through" requirements without blocking the first paint.
2. **Collision safety** — `World.isSolid` returns solid below the world's bedrock floor as a guard against any residual fall-through (e.g. during a chunk-generation race).

These are covered by the existing scenarios and by the added unit tests; the new survival, inventory, interaction, UI, and world-simulation requirements are documented in their capability specs.

## Status

- Proposal: **complete**
- Design: **complete**
- Tasks: **100% complete** for the original capability set and expansion tasks 16.1–16.13.
- Implementation: **complete**
- Verification: **complete** for the expanded pass (see `verification.md`)
