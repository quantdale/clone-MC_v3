/**
 * Minecart physics (172): rail-constrained cart movement and collisions — the first consumer of
 * 171's rail shapes, and the last physics module of the redstone/automation arc (173 is the
 * regression-suite change that closes the section). Like 169, this is a pure core with zero
 * registry changes: the cart is a plain `MinecartState` (position + velocity), the world is a
 * caller-supplied seam, and one `tickMinecart` advances the cart exactly one fixed 20 TPS tick.
 *
 * Rail-following rules (deterministic; documented approximations of vanilla):
 * - `north_south` / `east_west` hold the cart at rail height (vy = 0) and zero the cross-axis
 *   motion, so a cart slides only along the rail's axis.
 * - An ascent raises/lowers the cart with the slope: on `ascending_east` the cart's vertical speed
 *   equals its horizontal speed toward east (vy = vx), and the symmetric rule applies to the other
 *   three ascents (one block up per block horizontal).
 * - A corner turns the cart: arriving moving north on `corner_north_east` exits east, etc. A cart
 *   not arriving from one of the corner's two directions stops at the corner.
 * - Speed is clamped to `MINECART_MAX_SPEED` (vanilla's 8 m/s = 0.4 blocks/tick) on rails.
 * - Off rails, the cart falls with `MINECART_GRAVITY` (vanilla's 0.04/tick^2) and horizontal motion
 *   decays by `MINECART_OFFRAIL_DECAY` per tick.
 * - Collisions: if the cart's next cell is blocking (a solid block, or the ground when falling),
 *   the cart stops — velocity zeroed, position unchanged.
 */
import type { RailShape } from './RailBlockStates';

/** A cart's kinematic state (position + velocity in blocks / per-tick units). */
export interface MinecartState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** The caller-supplied world seam: rail shapes at cells and solid-block queries. */
export interface MinecartWorld {
  getRailShapeAt(x: number, y: number, z: number): RailShape | null;
  isBlocking(x: number, y: number, z: number): boolean;
}

/** Maximum rail speed (vanilla: 8 m/s = 0.4 blocks/tick). */
export const MINECART_MAX_SPEED = 0.4;
/** Off-rail gravity per tick (vanilla entity gravity). */
export const MINECART_GRAVITY = 0.04;
/** Off-rail horizontal decay per tick. */
export const MINECART_OFFRAIL_DECAY = 0.98;

function clampSpeed(v: number): number {
  return Math.max(-MINECART_MAX_SPEED, Math.min(MINECART_MAX_SPEED, v));
}

/** Whether the cart's current cell contains a rail. */
export function minecartOnRails(state: MinecartState, world: MinecartWorld): boolean {
  return (
    world.getRailShapeAt(Math.floor(state.x), Math.floor(state.y), Math.floor(state.z)) !== null
  );
}

/** Advance the cart one fixed tick (pure: returns a new state, never mutates inputs). */
export function tickMinecart(state: MinecartState, world: MinecartWorld): MinecartState {
  const x = state.x;
  const y = state.y;
  const z = state.z;
  const shape = world.getRailShapeAt(Math.floor(x), Math.floor(y), Math.floor(z));

  let vx = state.vx;
  let vy = state.vy;
  let vz = state.vz;

  if (shape !== null) {
    vx = clampSpeed(vx);
    vy = clampSpeed(vy);
    vz = clampSpeed(vz);
    switch (shape) {
      case 'north_south':
        vx = 0;
        vy = 0;
        break;
      case 'east_west':
        vz = 0;
        vy = 0;
        break;
      case 'ascending_east':
        vz = 0;
        vy = vx;
        break;
      case 'ascending_west':
        vz = 0;
        vy = -vx;
        break;
      case 'ascending_north':
        vx = 0;
        vy = -vz;
        break;
      case 'ascending_south':
        vx = 0;
        vy = vz;
        break;
      case 'corner_north_east':
        if (vz < 0 && vx === 0) {
          vx = -vz;
          vz = 0;
        } else if (vx > 0 && vz === 0) {
          vz = -vx;
          vx = 0;
        } else {
          vx = 0;
          vz = 0;
        }
        break;
      case 'corner_north_west':
        if (vz < 0 && vx === 0) {
          vx = vz;
          vz = 0;
        } else if (vx < 0 && vz === 0) {
          vz = -vx;
          vx = 0;
        } else {
          vx = 0;
          vz = 0;
        }
        break;
      case 'corner_south_east':
        if (vz > 0 && vx === 0) {
          vx = vz;
          vz = 0;
        } else if (vx > 0 && vz === 0) {
          vz = -vx;
          vx = 0;
        } else {
          vx = 0;
          vz = 0;
        }
        break;
      case 'corner_south_west':
        if (vz > 0 && vx === 0) {
          vx = -vz;
          vz = 0;
        } else if (vx < 0 && vz === 0) {
          vz = -vx;
          vx = 0;
        } else {
          vx = 0;
          vz = 0;
        }
        break;
    }
    vy = clampSpeed(vy);
  } else {
    // Off rails: fall with gravity and decay horizontal motion.
    vy -= MINECART_GRAVITY;
    vx *= MINECART_OFFRAIL_DECAY;
    vz *= MINECART_OFFRAIL_DECAY;
  }

  const nx = x + vx;
  const ny = y + vy;
  const nz = z + vz;
  if (world.isBlocking(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
    // Collision: the destination cell is solid — stop dead at the current cell.
    return { x, y, z, vx: 0, vy: 0, vz: 0 };
  }
  return { x: nx, y: ny, z: nz, vx, vy, vz };
}
