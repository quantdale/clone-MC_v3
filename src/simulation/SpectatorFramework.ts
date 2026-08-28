/**
 * Spectator framework (195): the spectator-mode semantics closing the game-modes arc (192-195).
 * Pure, headless-safe predicates of mode: noclip movement, no gravity and no solid collision,
 * no interaction of any kind, invulnerability to targeting/damage, and the free spectator camera.
 *
 * Vanilla semantics — every predicate is true ONLY for 'spectator':
 *   noclip                    : passes through blocks and entities
 *   hasGravity / hasCollision : free flight without falling or solid collision (false)
 *   canInteract               : no blocks, entities, or items (false)
 *   isAttackable              : mobs neither target nor damage spectators (false)
 *   spectatorCameraAvailable  : the free camera with entity attachment
 *
 * Complements 192's canFly (spectator flies) and 194's rules (spectator never breaks/places).
 */
import type { GameMode } from './GameModeFramework';

/** Whether the mode passes through blocks and entities (spectator only). */
export function noclip(mode: GameMode): boolean {
  return mode === 'spectator';
}

/** Whether the mode is subject to gravity (false only for spectator). */
export function hasGravity(mode: GameMode): boolean {
  return mode !== 'spectator';
}

/** Whether the mode collides with solid geometry (false only for spectator). */
export function hasCollision(mode: GameMode): boolean {
  return mode !== 'spectator';
}

/** Whether the mode can interact with blocks, entities, or items (false only for spectator). */
export function canInteract(mode: GameMode): boolean {
  return mode !== 'spectator';
}

/** Whether the mode can be targeted/damaged by mobs (false only for spectator). */
export function isAttackable(mode: GameMode): boolean {
  return mode !== 'spectator';
}

/** Whether the free spectator camera is available (spectator only). */
export function spectatorCameraAvailable(mode: GameMode): boolean {
  return mode === 'spectator';
}
