# Proposal

The first implementation pass satisfied the core voxel-game contract but left several production-quality edges: pointer-lock requests could reject without a handled promise, focus changes could leave transient input active, full mesh queues could strand dirty chunks, one-block terrain steps required jumping, DDA callers could receive incorrect distances from non-unit directions, and directional shadows stayed centered at the world origin.

This follow-up hardens those paths, improves movement and target feedback, and records the headless/production verification contract without adding server-side or multiplayer scope.

## Goals

- Preserve playable state through pointer-lock, focus, visibility, and runtime-error transitions.
- Guarantee dirty chunk remesh jobs are retained until they can run.
- Make first-person traversal comfortable on ordinary one-block terrain.
- Keep raycast reach/distance semantics correct for all finite direction vectors.
- Keep shadow coverage useful as the player explores streamed chunks.
- Keep the production build free of test-only game handles.

## Non-goals

Mobs, mobile controls, and greedy meshing remain documented scope extensions rather than prerequisites for this change. Local player snapshots, crafting, and procedural audio are now implemented by the follow-up expansion pass.
