import { canFly, type GameMode } from '../simulation/GameModeFramework';

/**
 * Minimal safe creative flight (265): hover with Space-ascend / Shift-descend.
 *
 * Pure/headless vertical-velocity resolver. The Game drives
 * `player.velocity.y` from this before `PlayerPhysics.update` and suppresses
 * gravity inside physics via the `isFlying` hook; `flying` also gates the
 * post-physics `fallDistance` reset. No DOM, no mutation, no throws.
 */

/** Blocks per second while ascending/descending (~2x walk, below terminal). */
export const CREATIVE_FLY_SPEED = 8.0;

/** Vertical flight input for one tick. */
export interface CreativeFlightInput {
  jump: boolean;
  sneak: boolean;
}

/** Resolved vertical motion. `verticalVelocity` is meaningful only when `flying` is true. */
export interface CreativeFlightResolution {
  flying: boolean;
  verticalVelocity: number;
}

/**
 * Resolve vertical flight motion for the mode. Non-fly modes return
 * `{ flying: false }` (callers MUST leave `velocity.y` untouched); fly modes
 * return jump → +speed, sneak → −speed, both/neither → 0 (hover).
 */
export function resolveCreativeFlightVelocity(
  mode: GameMode,
  input: CreativeFlightInput,
  flySpeed: number = CREATIVE_FLY_SPEED,
): CreativeFlightResolution {
  if (!canFly(mode)) {
    return { flying: false, verticalVelocity: 0 };
  }
  if (input.jump && !input.sneak) {
    return { flying: true, verticalVelocity: flySpeed };
  }
  if (input.sneak && !input.jump) {
    return { flying: true, verticalVelocity: -flySpeed };
  }
  return { flying: true, verticalVelocity: 0 };
}
