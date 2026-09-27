# Spec: raider-and-patrol-rendering

## Contract

The Game MUST draw every ACTIVE raid-wave raider and patrol pillager of its
current entity dimension as a box-mesh group with a per-kind silhouette, MUST
mark the patrol captain visibly, MUST keep the drawn set equal to the live set
on every rendered frame, and MUST release every scene reference and GPU
resource it owns on dispose. It MUST NOT alter shared scene setup or any
simulation state. It does not own raid/patrol simulation, persistence or
animation.

## Definitions

- **Entry**: a projected `{ key, source, entityId, kind, captain, x, y, z,
  facing }` for one ACTIVE raider.
- **Raider group**: a `THREE.Group` named `raider-<kind>[-captain]` with
  `userData.raiderKey`.
- **Live set**: ACTIVE entities of `raidEntityManager` ∪ `patrolEntityManager`
  in the overworld with a raider kind.

## Invariants

- I1. Drawn keys = live-set keys after each sync.
- I2. Namespaced keys; no cross-manager collision.
- I3. Constant geometry/material count; disposed once.
- I4. No shared scene setup changes.
- I5. Empty live set ⇒ zero raider scene children.
- I6. 258 stays BLOCKED.

## Requirements

### Requirement: Projection

Projection MUST include every ACTIVE raid/patrol entity whose type path is
`entity_type/pillager|vindicator|ravager|witch`, key it `raid:<id>` or
`patrol:<id>`, set `captain` only for the patrol entity whose id equals the
captain id, and skip unknown kinds or non-finite positions (counted).

#### Scenario: Colliding ids

- **GIVEN** raid entity id 1 (vindicator) and patrol entity id 1 (pillager,
  captain)
- **THEN** entries are `raid:1` vindicator non-captain and `patrol:1`
  pillager captain

#### Scenario: Unknown type skipped

- **GIVEN** a zombie in the raid manager
- **THEN** it yields no entry and `skipped` is 1

### Requirement: Sync add/update/remove

`sync` MUST add a group for each new key, update position/rotation for
existing keys without rebuilding, rebuild when kind/captain changes, and remove
groups for absent keys.

#### Scenario: Live set changes

- **GIVEN** synced keys A, B
- **WHEN** synced with B (moved) and C
- **THEN** the scene holds B (same object, new position) and C; A is gone

### Requirement: Distinct silhouettes and captain marker

Each kind MUST use its own part set/colour (pillager 6 parts with crossbow,
vindicator 6 with axe, witch 7 with hat, ravager 9 and larger than an
illager), and the captain MUST carry 2 extra banner parts.

#### Scenario: Ravager larger

- **THEN** a ravager group's bounding box volume exceeds a pillager's and its
  width exceeds 1 block

#### Scenario: Captain distinct

- **THEN** the captain group has pillager parts + 2 and a banner-coloured
  child; non-captain pillagers have none

### Requirement: Facing

Rotation MUST equal the moving direction `atan2(vx, vz)` when horizontal speed
> 0.01, else the stored yaw as radians, else 0 for non-finite input.

#### Scenario: Stationary uses stored yaw

- **GIVEN** yaw 1.25 rad, zero velocity
- **THEN** `rotation.y` is 1.25

#### Scenario: Moving faces velocity

- **GIVEN** velocity (1, 0, 0)
- **THEN** `rotation.y` is π/2

### Requirement: Removal and disposal without leaks

Groups MUST disappear on the next frame after death, despawn, patrol clear,
raid end/replacement or dispose; `dispose` MUST remove all groups and dispose
every shared geometry/material exactly once; `sync` MUST NOT allocate
geometry/material.

#### Scenario: Many syncs, constant resources

- **WHEN** 200 syncs over up to 30 entities of all kinds
- **THEN** `resourceCounts()` is unchanged and after dispose every resource
  fired its `dispose` event exactly once and the scene is empty

#### Scenario: In-game lifecycle

- **GIVEN** a started raid (wave spawned) and a forced patrol
- **THEN** raider groups = raid + patrol entities with matching kinds and one
  captain
- **WHEN** a raid entity is killed / the raid is cleared to VICTORY / a raid
  start dismisses the patrol / the game is disposed
- **THEN** the corresponding groups disappear (0 after dispose)

### Requirement: Scene isolation

The renderer MUST only add/remove its own groups; lights, fog, background,
world materials, atlas and camera MUST be untouched; with no raiders it MUST
add nothing.

#### Scenario: Fresh world

- **GIVEN** a fresh world with no raid/patrol
- **THEN** zero raider groups exist in the scene

## Error and failure behavior

Unknown kinds/non-finite positions skipped; non-finite facing → 0; sync after
dispose and double dispose are no-ops.

## Performance and resource bounds

≈ 17 geometries / 12 materials per renderer; ≤ 9 meshes per entity; O(n)
per-frame sync.

## Compatibility and migration

Presentation only.

## Security and integrity

No input surface beyond simulation state.

## Observability

`getRaiderRenderState()`.

## Verification mapping

| Requirement | Unit | E2E |
|---|---|---|
| Projection | RaiderRenderer.test.ts | raider-rendering (expected vs meshes) |
| Sync | RaiderRenderer.test.ts | raider-rendering (kill/clear) |
| Silhouettes/captain | RaiderRenderer.test.ts | raider-rendering (kinds, 1 captain) |
| Facing | RaiderRenderer.test.ts | raider-rendering (rotation = expected facing) |
| Removal/disposal | RaiderRenderer.test.ts | raider-rendering (dispose → 0) |
| Scene isolation | RaiderRenderer.test.ts + Game source guard | raider-rendering (fresh world 0) + visual matrix unchanged class |
