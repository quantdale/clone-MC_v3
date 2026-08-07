import { CONFIG } from '../config';
import { Player } from './Player';
import { WorldAccess } from '../world/WorldAccess';
import { BlockRegistry } from '../world/BlockRegistry';

/**
 * Axis-aligned bounding box collision resolution for the player.
 *
 * The player AABB is half-width = player.radius, full height = player.height.
 * Movement is integrated axis by axis: for each axis, the position is advanced
 * by velocity * dt, then every voxel the AABB overlaps is checked for solid
 * blocks. On a collision the position is clamped back to the block boundary and
 * that axis's velocity is zeroed. Resolving downward (Y) motion sets onGround.
 *
 * Downward velocity is capped at a terminal limit so a long fall cannot
 * accumulate unbounded speed, and the frame's movement is sub-stepped so each
 * step's displacement stays below a fraction of a block. Together these prevent
 * fast movement from tunneling through thin solid surfaces.
 */
export class PlayerPhysics {
  /** Maximum downward speed in blocks per second. */
  private static readonly TERMINAL_VELOCITY = 54;
  /** Maximum displacement per integration sub-step, in blocks. */
  private static readonly MAX_SUBSTEP_DISPLACEMENT = 0.25;
  private readonly world: WorldAccess;
  private readonly registry: BlockRegistry;

  constructor(world: WorldAccess, registry: BlockRegistry) {
    this.world = world;
    this.registry = registry;
    // Kept for the documented constructor signature; solidity is resolved
    // through world.isSolid per spec.
    void this.registry;
  }

  update(player: Player, dt: number): void {
    const d = Math.min(dt, CONFIG.maxDeltaTime);

    // Ground contact is not persistent: clear it at the start of every step so
    // walking off a ledge correctly leaves the player airborne. A downward
    // collision below re-sets it during resolution.
    player.onGround = false;

    // Apply gravity and clamp downward velocity to a terminal limit.
    player.velocity.y -= CONFIG.player.gravity * d;
    if (player.velocity.y < -PlayerPhysics.TERMINAL_VELOCITY) {
      player.velocity.y = -PlayerPhysics.TERMINAL_VELOCITY;
    }

    // Sub-step the integration so a single step's displacement cannot exceed a
    // fraction of a block, preventing tunneling through thin solid surfaces.
    const maxDisp =
      Math.max(
        Math.abs(player.velocity.x),
        Math.abs(player.velocity.y),
        Math.abs(player.velocity.z),
      ) * d;
    const steps = Math.max(1, Math.ceil(maxDisp / PlayerPhysics.MAX_SUBSTEP_DISPLACEMENT));
    const subDt = d / steps;

    for (let i = 0; i < steps; i++) {
      this.moveAxis(player, 'x', subDt);
      this.moveAxis(player, 'y', subDt);
      this.moveAxis(player, 'z', subDt);
    }
  }

  private moveAxis(player: Player, axis: 'x' | 'y' | 'z', dt: number): void {
    const disp = player.velocity[axis] * dt;
    if (disp === 0) {
      return;
    }

    player.position[axis] += disp;

    // Resolve all overlapping solid voxels, not just the first one. After
    // resolving against one voxel the AABB may still intersect another (e.g.
    // a tight corner), so loop until the axis is fully clear.
    let safety = 0;
    while (safety < 10) {
      safety++;
      const sign = Math.sign(disp);
      const minX = player.position.x - player.radius;
      const maxX = player.position.x + player.radius;
      const minY = player.position.y;
      const maxY = player.position.y + player.height;
      const minZ = player.position.z - player.radius;
      const maxZ = player.position.z + player.radius;

      // Scan the voxel cells overlapped by the AABB.
      const x0 = Math.floor(minX);
      const x1 = Math.floor(maxX);
      const y0 = Math.floor(minY);
      const y1 = Math.floor(maxY);
      const z0 = Math.floor(minZ);
      const z1 = Math.floor(maxZ);

      let hit = false;
      for (let z = z0; z <= z1 && !hit; z++) {
        for (let y = y0; y <= y1 && !hit; y++) {
          for (let x = x0; x <= x1 && !hit; x++) {
            if (!this.world.isSolid(x, y, z)) {
              continue;
            }

            // Full 3D AABB overlap with the voxel cell.
            if (
              maxX > x &&
              minX < x + 1 &&
              maxY > y &&
              minY < y + 1 &&
              maxZ > z &&
              minZ < z + 1
            ) {
              this.resolve(player, axis, sign, x, y, z);
              hit = true;
            }
          }
        }
      }

      if (!hit) {
        break;
      }
    }
  }

  private resolve(player: Player, axis: 'x' | 'y' | 'z', sign: number, x: number, y: number, z: number): void {
    if (axis === 'x') {
      player.position.x = sign > 0 ? x - player.radius : x + 1 + player.radius;
      player.velocity.x = 0;
    } else if (axis === 'y') {
      if (sign < 0) {
        player.position.y = y + 1;
        player.onGround = true;
      } else {
        player.position.y = y - player.height;
      }
      player.velocity.y = 0;
    } else {
      player.position.z = sign > 0 ? z - player.radius : z + 1 + player.radius;
      player.velocity.z = 0;
    }
  }
}