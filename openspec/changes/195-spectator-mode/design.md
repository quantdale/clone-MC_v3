# Design: 195-spectator-mode

## Context/current state
- 192 granted `canFly` to spectator; 194 made spectator unable to break/place. The remaining
  spectator identity — noclip, no gravity/collision, no interaction, invulnerability, and the free
  camera — is missing. 195 adds it as pure predicates, closing the game-modes arc (192-195).

## Target state
- `src/simulation/SpectatorFramework.ts` holding the five spectator-specific predicates, all total
  functions of `GameMode`.

## Invariants
- Pure and headless-safe: no world access, no mutation, no throws.
- Every predicate is true ONLY for `'spectator'` and false for the other three modes.
- Noclip means passing through blocks and entities; spectator ignores gravity and solid
  collision, cannot interact with anything, cannot be targeted/damaged, and is the only mode with
  the free spectator camera.

## API and data model
```ts
// src/simulation/SpectatorFramework.ts (new)
export function noclip(mode: GameMode): boolean;                    // spectator only
export function hasGravity(mode: GameMode): boolean;                // false only for spectator
export function hasCollision(mode: GameMode): boolean;              // false only for spectator
export function canInteract(mode: GameMode): boolean;               // false only for spectator
export function isAttackable(mode: GameMode): boolean;              // false only for spectator
export function spectatorCameraAvailable(mode: GameMode): boolean;  // spectator only
```

## Control/data flow
1. Physics asks `hasGravity`/`hasCollision`/`noclip` when integrating the player's motion.
2. Interaction entry points ask `canInteract`; combat/targeting asks `isAttackable`; the camera
   layer asks `spectatorCameraAvailable`.

## Detailed behavior
- `noclip('spectator')` = true; all other modes false.
- `hasGravity` / `hasCollision` = `mode !== 'spectator'`.
- `canInteract` / `isAttackable` = `mode !== 'spectator'`.
- `spectatorCameraAvailable('spectator')` = true; all other modes false.

## Failure modes
- None — total functions, no throws, no state.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- All predicates O(1) equality checks.

## Testing seams
- Tests drive each predicate across all four modes and compose the full spectator profile with
  192's `canFly` and 194's `canBreakBlock`/`canPlaceBlock`.

## Observability/debugging
- Predicates are total and inspectable; a false `canInteract`/`isAttackable` is the only signal a
  wiring needs to block interaction/combat.

## Affected files/symbols
- `src/simulation/SpectatorFramework.ts` (new).
- Tests: `tests/unit/SpectatorFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 192's predicates in place**: rejected — 192's `canFly` stays the flight rule, and
  spectator-specific semantics live in their own module so the arc's contracts stay independently
  testable.

## Downstream dependencies
- The game-modes wiring applies these rules (motion, interaction, combat, camera); 196+
  continue the "Dimensions and major progression" section; 242's e2e drives spectator mode.
