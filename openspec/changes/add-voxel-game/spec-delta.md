# Spec Delta — add-voxel-game

This change adds eleven new capability specs (greenfield project). There were no pre-existing specs to modify or remove.

## Added

- **`rendering`** — WebGL renderer, game loop, responsive canvas, chunk meshes with hidden-face removal, texture atlas, shared materials, culling, fog, transparency, disposal.
- **`world-generation`** — seeded deterministic terrain, layer composition, trees, chunk-boundary continuity, negative coordinates.
- **`chunk-system`** — storage, coordinate conversion, lifecycle, cross-chunk lookup, dirty state, bounded queues, stale-job guards, disposal.
- **`chunk-streaming`** — load/unload around player, frame-distributed work, deterministic regeneration, in-session edit persistence via overlay.
- **`player-controller`** — pointer lock, mouse look, WASD/sprint/jump, gravity, delta-time movement, AABB voxel collision, safe spawn.
- **`block-interaction`** — Amanatides & Woo raycast, targeting, break/place, placement validation, bedrock, cooldown, outline, remesh.
- **`block-registry`** — centralized definitions, properties, nine required blocks, original procedural textures.
- **`inventory-hotbar`** — slots, icons, highlight, number-key + wheel selection with wraparound, name display, placement integration.
- **`lighting-environment`** — hemisphere + directional light, sky, fog, water presentation, optional day-night cycle.
- **`user-interface`** — crosshair, FPS, loading indicator, pointer-lock messaging, error state, debug overlay, desktop usability.
- **`performance`** — ~60 FPS target at render distance 8, bounded per-frame work, memory discipline, allocation avoidance, localized rebuild, test coverage.

## Implementation refinements (no spec drift)

Two behaviors were refined during implementation to satisfy robustness requirements without changing the public contract:

1. **Chunk streaming readiness** — `isReady` now evaluates the player's spawn chunk (not the origin), and the spawn area is preloaded synchronously so the player never stands on un-generated terrain. This strengthens the existing "safe spawn" and "no fall-through" requirements.
2. **Collision safety** — `World.isSolid` returns solid below the world's bedrock floor as a guard against any residual fall-through (e.g. during a chunk-generation race).

These are covered by the existing scenarios and by the added unit tests; no requirement text needed to change.

## Status

- Proposal: **complete**
- Design: **complete**
- Tasks: **100% complete**
- Implementation: **complete**
- Verification: **complete** (see `verification.md`)