# Proposal: 293-raider-and-patrol-rendering

## Problem

Raid-wave raiders (284: pillager, vindicator, ravager, witch; combat 288) and
pillager patrols (291) are fully simulated — they move, shoot, melee, die and
drive the raid bar — but nothing draws them. `raidEntityManager` and
`patrolEntityManager` have no renderer, so the player is attacked by invisible
enemies and cannot find the patrol captain whose kill grants Bad Omen.

## Goals

- A `RaiderRenderer` that draws every ACTIVE raid-wave raider and patrol
  pillager in the Game's current entity dimension (overworld) using the
  box-mesh pattern of `HostileMobRenderer` / `PassiveMobRenderer`.
- Distinct silhouettes/colours per raider type: pillager (brown robe +
  crossbow), vindicator (charcoal coat + axe), witch (purple robe + hat),
  ravager (large quadruped with horns).
- The patrol captain is visibly distinct: an ominous-banner block (white
  panel + dark emblem) on its back.
- Correct facing: the model faces the entity's horizontal movement direction
  while moving and its stored spawn yaw otherwise.
- Meshes appear/disappear with the simulation: removed on death, despawn,
  patrol clear/dismissal, raid end/replacement, pagehide clear, and dispose.
- No leaks: a fixed set of shared geometries/materials per renderer instance,
  disposed exactly once on dispose; per-entity cost is a `THREE.Group` of
  shared-resource meshes (4–9 boxes).
- No change to shared scene setup (lights, fog, materials, atlas, camera) so
  visual goldens (fresh worlds, no raiders) cannot move.
- Unit tests (projection, sync add/update/remove, kinds, captain, yaw,
  visibility, disposal/leak) and a browser E2E over existing debug seams with a
  non-golden screenshot sanity check.

## Non-goals

- No animation (walking/arm swing), textures, skins, name tags, banners as
  items, or held-item models beyond the static boxes.
- No change to raid/patrol simulation, combat, spawn rules or entity yaw
  semantics (the stored yaw stays as authored by 284/291).
- No rendering for other entity managers (pigs/zombies unchanged), no LOD,
  no instancing, no GPU/FPS work; Change 258 stays BLOCKED.
- No golden updates; no change to the visual matrix.

## Preconditions

- Changes 282–292 VERIFIED and published; `origin/main` = `cef8f32`.
- `raidEntityManager` / `patrolEntityManager` (`EntityManager.getInDimension`
  returns ACTIVE entities only), `PillagerPatrolSystem.getCaptainId()`.
- Existing seams: `debugStartRaid`, `debugClearRaidWave`,
  `debugDamageRaidEntity`, `getRaidWaveEntityIds`, `debugSpawnPatrol`,
  `getPatrolState`, `debugDamagePatrolEntity`, `testSetCameraPose`.

## Dependencies

- `src/rendering/HostileMobRenderer.ts` (pattern), `three`
- `src/simulation/EntityManager.ts`, `src/simulation/PillagerPatrol.ts`
- `src/engine/Game.ts` (construction, `render()`, `ResourceManager`)

## Proposed change

1. Author this package; CHANGE_SEQUENCE row + overrides addendum; 293 sole
   ACTIVE.
2. New `src/rendering/RaiderRenderer.ts`: kind mapping, pure projection of
   raid + patrol entities into render entries, shared resources, per-key
   group pool with `sync`, visibility toggle, introspection, `dispose`.
3. Game: construct + track the renderer; sync once per rendered frame (runs
   while paused, so debug/clear changes show immediately); seams
   `getRaiderRenderState`, `debugSetRaiderMeshesVisible`.
4. Unit + browser E2E; full gates; VERIFIED 100%; publish.

## Compatibility and migration

Presentation only; no persistence, no stored-data change, no simulation
change. Worlds without raids/patrols render byte-identically (the renderer
adds nothing to the scene until an entity exists).

## Risks

- Id collisions between the two managers → render keys are namespaced
  (`raid:<id>`, `patrol:<id>`).
- Golden drift → nothing is added to the scene without raiders; no shared
  scene/material/light/atlas edits (source-guarded).
- Leaks → shared resources only, counted and disposal-tested.
- Per-frame cost → O(active raiders) (≤ ~25 raid + 4 patrol), no allocation of
  geometry/materials after construction.
- Yaw unit mismatch (raid/patrol yaw stored in radians despite the degree doc
  on `EntityTransform`) → renderer treats raider yaw as radians, documented.

## Rollback strategy

Revert the 293 commits; nothing persisted.

## Definition of Done

- Package passes the SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; full baseline gates green (visual:176
  SwiftShader drift documented, goldens untouched; enchanting:227 green).
- C293 exact; VERIFIED 100%; published by fast-forward; 258 still BLOCKED.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
