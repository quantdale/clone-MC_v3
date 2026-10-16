# Design

## Input lifecycle

`InputManager` treats `requestPointerLock()` as either a synchronous or promise-returning browser API. Rejections and `pointerlockerror` share one reset path. Blur and hidden-document transitions clear movement, mouse deltas, and queued combat actions and notify `Game` to show the pause overlay.

## Streaming remesh recovery

`World.enqueueMeshWithRetry()` wraps the bounded active mesh queue. Generation, edits, boundary-neighbor invalidation, and preload all use the wrapper. A parked job stores its latest mesh version and is re-admitted as capacity becomes available; an active job supersedes any stale parked copy.

## Movement

Physics resolves vertical contact before horizontal axes in each sub-step. A grounded horizontal collision may raise the player by the configured `CONFIG.player.stepHeight` when the raised AABB is clear. Two-block obstacles remain blocking, and airborne/jumping movement does not receive step assistance.

## Ray traversal

`raycastVoxel` validates finite inputs, normalizes the direction, and uses the central `CONFIG.maxRaySteps` limit. This keeps maximum reach and returned distance in world-block units for callers that provide non-unit vectors.

## Lighting

`Lighting` tracks a reusable sun direction and moves the directional light plus target around the player when the focus changes. The shadow camera remains configured around that moving focus, so streamed terrain continues to receive shadows without per-frame object allocation.

## Teardown and bootstrap

Lighting is registered with `ResourceManager`, removes its scene-owned objects on disposal, and `Game.showError()` stops the loop, releases input, and hides gameplay HUD elements. The application bootstrap has a page-level duplicate guard.
