# Design: 293-raider-and-patrol-rendering

## Context/current state

On `origin/main` `cef8f32` (292 VERIFIED):

- `Game.raidEntityManager` holds raid-wave raiders spawned by
  `RaidWaveController` → `createEntityManagerRaidBackend` (type keys
  `pillager`/`vindicator`/`ravager`/`witch`, registry ids
  `minecraft:entity_type/<key>`), dimension `minecraft:overworld`.
  Placement yaw = `atan2(center.x − x, center.z − z)` (radians, facing the
  raid center; ring radius 2 + wave around the center).
- `Game.patrolEntityManager` holds 1–4 patrol pillagers (291); spawn yaw is
  `rng.nextFloat() · 2π` (radians); `pillagerPatrol.getCaptainId()` names the
  captain.
- 288 combat moves raiders by velocity only; it never rewrites yaw.
- `EntityManager.getInDimension(dim)` returns ACTIVE entities in spawn order;
  dead (REMOVED) or despawned entities are excluded.
- Existing renderers: `PassiveMobRenderer` / `HostileMobRenderer` — per-id
  `THREE.Group` pools of box meshes over shared geometry/material, synced in
  the fixed tick, tracked by `ResourceManager`, yaw converted from degrees.
- `Game.render()` runs every loop frame, paused or not; `update()` gates the
  fixed tick (the headless E2E sits paused on the start overlay).
- Neither raid nor patrol entities have any renderer.

## Target state

`src/rendering/RaiderRenderer.ts` draws one group per ACTIVE raider/patrol
member, synced once per rendered frame from a pure projection of both managers.

## Invariants

- I1. After `sync(entries)` the scene holds exactly one raider group per entry
  key and no other raider groups.
- I2. Keys are namespaced by source (`raid:<id>`, `patrol:<id>`); the same
  numeric id in both managers yields two groups.
- I3. Geometries/materials are allocated only in the constructor (fixed
  count, independent of entity count) and disposed exactly once in `dispose`;
  `sync` never allocates geometry/material.
- I4. Each group's children share the renderer's resources; removing a group
  disposes nothing (shared) and leaves no scene reference.
- I5. The renderer never touches lights, fog, background, shared world
  materials, the texture atlas or the camera.
- I6. With zero entries the renderer contributes zero scene children.
- I7. Only entities of the four raider kinds are drawn; unknown types are
  skipped and counted.
- I8. Change 258 stays BLOCKED; no GPU work; goldens untouched.

## API and data model

```ts
export type RaiderKind = 'pillager' | 'vindicator' | 'ravager' | 'witch';
export const RAIDER_KINDS: readonly RaiderKind[];
export const RAIDER_MOVE_FACING_EPSILON = 0.01; // blocks/s horizontal

export interface RaiderRenderEntry {
  readonly key: string;           // 'raid:<id>' | 'patrol:<id>'
  readonly source: 'raid' | 'patrol';
  readonly entityId: number;
  readonly kind: RaiderKind;
  readonly captain: boolean;      // patrol captain only
  readonly x: number; readonly y: number; readonly z: number;
  readonly facing: number;        // radians; model +Z faces (sin f, cos f)
}

export function raiderKindOf(typeId: ResourceId): RaiderKind | null;
export function raiderFacing(e: EntityInstance): number;
export function projectRaiderRenderEntries(
  raid: readonly EntityInstance[], patrol: readonly EntityInstance[],
  captainId: number | null,
): { entries: RaiderRenderEntry[]; skipped: number };

export interface RaiderMeshView {
  readonly key: string; readonly kind: RaiderKind; readonly captain: boolean;
  readonly x: number; readonly y: number; readonly z: number;
  readonly rotationY: number; readonly childCount: number;
  readonly inScene: boolean; readonly visible: boolean;
}

export class RaiderRenderer {
  constructor(scene: THREE.Scene);
  sync(entries: readonly RaiderRenderEntry[]): void;
  setVisible(visible: boolean): void;
  get size(): number;
  getMeshes(): RaiderMeshView[];
  resourceCounts(): { geometries: number; materials: number };
  dispose(): void;   // idempotent
}
```

Groups: `name = 'raider-<kind>'` (+ `'-captain'` suffix for the captain),
`userData = { raiderKey, raiderKind, raiderCaptain: true|false }`.

## Models (feet at y = 0, front = +Z; all boxes)

| Kind | Parts (count) | Colours |
|---|---|---|
| pillager | body 0.6×0.9×0.35 @1.2, head 0.44³ @1.87, 2 legs 0.18×0.75×0.18 @0.375, crossed arms 0.62×0.2×0.26 @(0,1.3,0.22), crossbow 0.08×0.1×0.55 @(0.3,1.25,0.3) (6) | robe `0x5a4632`, skin `0x8f9488`, legs `0x2c2c30`, wood `0x6b4a2b` |
| vindicator | as pillager but axe 0.08×0.55×0.08 @(0.36,1.05,0.1) instead of crossbow (6) | coat `0x2f3540`, skin, legs, steel `0x9aa0a6` |
| witch | body + head + 2 legs + arms, hat brim 0.62×0.06×0.62 @2.12, hat crown 0.32×0.34×0.32 @2.32 (7) | robe `0x4a2a5a`, skin, legs, hat `0x2b1f33` |
| ravager | body 1.3×1.1×2.0 @1.35, head 0.8×0.8×0.9 @(0,1.5,1.35), 4 legs 0.4×0.8×0.4 @0.4 (±0.42, ±0.65), 2 horns 0.14×0.35×0.14 @(±0.3,2.0,1.35) (8) | hide `0x4a4038`, horn `0xd9cfa9` |
| captain add-on | banner panel 0.5×0.72×0.06 @(0,1.3,−0.24), emblem 0.2×0.3×0.02 @(0,1.35,−0.28) (+2) | banner `0xefefef`, emblem `0x3a3a3a` |

Shared resources: one `BoxGeometry` per distinct part size and one
`MeshLambertMaterial` per colour, created once (exactly 14 geometries, 12
materials as implemented). `resourceCounts()` reports them for leak tests.

## Control/data flow

`Game.render()` (every frame, before `renderer.render()`):
`syncRaiderRenderer()` →
`projectRaiderRenderEntries(raidEntityManager.getInDimension(overworld),
patrolEntityManager.getInDimension(overworld), pillagerPatrol.getCaptainId())`
→ `raiderRenderer.sync(entries)`.

`sync`: for each entry, reuse the group for `key` when its kind/captain
signature matches, else (re)build; set position and `rotation.y = facing`;
then remove groups whose key is absent (scene.remove + map delete).

## Detailed behavior

### Facing

`raiderFacing(e)`: if `hypot(vx, vz) > 0.01` → `atan2(vx, vz)` (moving
direction, since 288 combat never rewrites yaw); else `transform.yaw` treated
as radians (284/291 author radians: `atan2(dx, dz)` / `nextFloat·2π`);
non-finite → 0. With `rotation.y = facing` the model's +Z front points along
`(sin f, cos f)`.

### Removal paths

All removal is derived: any path that makes an entity non-ACTIVE or removes
it from a manager (death via combat or `debugDamage*`, distance despawn,
`pillagerPatrol.clear('raid-start'|'pagehide'|'dispose'|'replace')`,
`raidWaveController.clear('terminal'|'replace'|'clear')`) drops its group on
the next rendered frame. `dispose()` removes all groups and disposes shared
resources; Game disposal goes through `ResourceManager.dispose()`.

### Visibility

`setVisible(false)` hides every group (and groups created later) without
removing them — used only by the E2E screenshot sanity check and diagnostics.

## Failure modes

| Failure | Behavior |
|---|---|
| unknown entity type in a manager | skipped, counted, not drawn |
| non-finite position | entry skipped (counted) |
| non-finite yaw/velocity | facing 0 |
| sync after dispose | no-op |
| double dispose | no-op |

## Compatibility/migration

Presentation only; no persistence; no simulation change.

## Performance/resource constraints

Fixed 14 geometries / 12 materials; ≤ 8 meshes per entity; realistic peak
≈ 30 entities → ≤ 240 draw calls worst case, typically < 100.
Per-frame projection is O(entities) with small arrays; no GPU uploads after
the first frame of each new group (shared geometry already uploaded).

## Testing seams

- Unit: `tests/unit/RaiderRenderer.test.ts` (real `THREE.Scene`, GL-free).
- Game source guards: sync in `render()`, renderer tracked, no light/fog/
  atlas/material edits in the renderer module.
- E2E seams: `getRaiderRenderState()` →
  `{ visible, expected: RaiderRenderEntry[], meshes: RaiderMeshView[],
  sceneRaiderGroups: number, camera: {x,y,z} }`;
  `debugSetRaiderMeshesVisible(visible)`.

## Observability/debugging

`getRaiderRenderState()` (scene traversal count + renderer view + expected).

## Affected files/symbols

- New: `src/rendering/RaiderRenderer.ts`, `tests/unit/RaiderRenderer.test.ts`,
  `tests/e2e/raider-rendering.spec.ts`.
- Modified: `src/engine/Game.ts`.

## Rejected alternatives

- Sync in the fixed tick (like pigs/zombies): paused frames would show stale
  meshes after debug/clear operations; render-frame sync is cheap here.
- Two renderers (raid, patrol): duplicates resources; one renderer with
  namespaced keys is simpler.
- InstancedMesh: premature for ≤ 30 entities; complicates per-kind shapes.
- Rewriting entity yaw in simulation: out of scope (simulation unchanged).

## Downstream dependencies

None; later raid work (escalation, villagers) can reuse `RaiderRenderer`.
