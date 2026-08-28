# Spec: spectator-framework

## Contract
This capability adds the spectator-mode semantics: noclip movement, no gravity and no solid
collision, no interaction of any kind, invulnerability to targeting/damage, and the free spectator
camera — as pure predicates of mode, closing the game-modes arc (192-195).

## Definitions
- **Noclip**: the ability to pass through blocks and entities.
- **Spectator camera**: the free camera with entity attachment; unavailable in other modes.

## Invariants
- Pure and headless-safe: no world access, no mutation, no throws.
- Every predicate MUST be true ONLY for `'spectator'` and false for `survival`, `creative`, and
  `adventure`.
- The composed spectator profile MUST be: fly (192) + noclip + no gravity + no collision + no
  interaction + not attackable + camera available + no break/place (194).

## Requirements

### Requirement: noclip
`noclip(mode)` MUST be true exactly for `'spectator'`.

#### Scenario: noclip table
- **GIVEN** modes in order `survival`, `creative`, `adventure`, `spectator`
- **THEN** `noclip` is false, false, false, true

### Requirement: no gravity and no collision
`hasGravity(mode)` and `hasCollision(mode)` MUST be false exactly for `'spectator'` and true for
the other three modes.

#### Scenario: physics tables
- **GIVEN** modes in order `survival`, `creative`, `adventure`, `spectator`
- **THEN** both `hasGravity` and `hasCollision` are true, true, true, false

### Requirement: no interaction
`canInteract(mode)` MUST be false exactly for `'spectator'` (no blocks, entities, or items) and
true for the other three modes.

#### Scenario: interaction table
- **GIVEN** modes in order `survival`, `creative`, `adventure`, `spectator`
- **THEN** `canInteract` is true, true, true, false

### Requirement: invulnerability
`isAttackable(mode)` MUST be false exactly for `'spectator'` (mobs neither target nor damage
spectators) and true for the other three modes.

#### Scenario: attack table
- **GIVEN** modes in order `survival`, `creative`, `adventure`, `spectator`
- **THEN** `isAttackable` is true, true, true, false

### Requirement: spectator camera
`spectatorCameraAvailable(mode)` MUST be true exactly for `'spectator'`.

#### Scenario: camera table
- **GIVEN** modes in order `survival`, `creative`, `adventure`, `spectator`
- **THEN** `spectatorCameraAvailable` is false, false, false, true

### Requirement: composed spectator profile
A spectator player MUST combine 192's `canFly`, this module's noclip/no-gravity/no-collision/
no-interaction/not-attackable/camera predicates, and 194's break/place denial into one consistent
profile; no non-spectator mode MUST gain any spectator privilege.

#### Scenario: full profile
- **GIVEN** mode `spectator` and the predicates from 192, 194, and this module
- **THEN** `canFly` is true, `noclip` is true, `hasGravity`/`hasCollision` are false,
  `canInteract`/`isAttackable` are false, `spectatorCameraAvailable` is true, and
  `canBreakBlock`/`canPlaceBlock` are false; for `survival`, `creative`, and `adventure`, every
  spectator-only predicate (`noclip`, `spectatorCameraAvailable`) is false

## Error and failure behavior
- None — total functions, no throws, no state.

## Performance and resource bounds
- All predicates O(1) equality checks.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Total pure functions; a false predicate is the only signal a wiring needs to enforce the rule.

## Observability
- Predicates are total and inspectable per mode.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 noclip | `tests/unit/SpectatorFramework.test.ts` › noclip |
| REQ-2 physics | › gravity and collision |
| REQ-3 interaction | › interaction |
| REQ-4 invulnerability | › attackable |
| REQ-5 camera | › camera |
| REQ-6 composed profile | › composed spectator profile |
