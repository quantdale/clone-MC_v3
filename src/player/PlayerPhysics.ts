import { CONFIG } from '../config';
import { Player } from './Player';
import { WorldAccess } from '../world/WorldAccess';
import { BlockId, BlockRegistry } from '../world/BlockRegistry';

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
  private readonly world: WorldAccess;
  private readonly registry: BlockRegistry;
  private landingDistance = 0;

  constructor(world: WorldAccess, registry: BlockRegistry) {
    this.world = world;
    this.registry = registry;
    // Kept for the documented constructor signature; solidity is resolved
    // through world.isSolid per spec.
    void this.registry;
  }

  update(player: Player, dt: number): void {
    const d = Math.max(0, Math.min(dt, CONFIG.maxDeltaTime));
    this.landingDistance = 0;

    // Ground contact is not persistent: clear it at the start of every step so
    // walking off a ledge correctly leaves the player airborne. A downward
    // collision below re-sets it during resolution.
    player.onGround = false;
    player.inWater = this.isInWater(player);
    player.inLava = this.isInLava(player);

    // Apply reduced gravity and terminal velocity while swimming.
    const gravity = player.inWater
      ? CONFIG.player.waterGravity
      : player.inLava
        ? CONFIG.player.waterGravity * 0.75
        : CONFIG.player.gravity;
    const terminalVelocity = player.inWater
      ? CONFIG.player.waterTerminalVelocity
      : player.inLava
        ? CONFIG.player.waterTerminalVelocity
      : CONFIG.player.terminalVelocity;
    player.velocity.y -= gravity * d;
    if (player.velocity.y < -terminalVelocity) {
      player.velocity.y = -terminalVelocity;
    }
    if (player.velocity.y < 0) {
      player.fallDistance += -player.velocity.y * d;
    }

    // Sub-step the integration so a single step's displacement cannot exceed a
    // fraction of a block, preventing tunneling through thin solid surfaces.
    const maxDisp =
      Math.max(
        Math.abs(player.velocity.x),
        Math.abs(player.velocity.y),
        Math.abs(player.velocity.z),
      ) * d;
    const steps = Math.max(1, Math.ceil(maxDisp / CONFIG.player.maxSubstepDisplacement));
    const subDt = d / steps;

    for (let i = 0; i < steps; i++) {
      // Resolve vertical contact first. This establishes onGround before the
      // horizontal passes, allowing a grounded player to step up a one-block
      // ledge without introducing a special-case grounded probe.
      this.moveAxis(player, 'y', subDt);
      this.moveAxis(player, 'x', subDt);
      this.moveAxis(player, 'z', subDt);
    }
  }

  /** Return and clear the distance from the most recent landing. */
  consumeLandingDistance(): number {
    const distance = this.landingDistance;
    this.landingDistance = 0;
    return distance;
  }

  /** Sample the player's occupied vertical cells for a water voxel. */
  private isInWater(player: Player): boolean {
    const x = Math.floor(player.position.x);
    const z = Math.floor(player.position.z);
    const y0 = Math.floor(player.position.y + 0.1);
    const y1 = Math.floor(player.position.y + player.height - 0.1);
    for (let y = y0; y <= y1; y++) {
      if (this.world.getBlock(x, y, z) === BlockId.Water) {
        return true;
      }
    }
    return false;
  }

  /** Sample the player's occupied vertical cells for a lava voxel. */
  private isInLava(player: Player): boolean {
    const x = Math.floor(player.position.x);
    const z = Math.floor(player.position.z);
    const y0 = Math.floor(player.position.y + 0.1);
    const y1 = Math.floor(player.position.y + player.height - 0.1);
    for (let y = y0; y <= y1; y++) {
      if (this.world.getBlock(x, y, z) === BlockId.Lava) {
        return true;
      }
    }
    return false;
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
              if ((axis === 'x' || axis === 'z') && player.onGround && this.tryStepUp(player)) {
                // The one-block rise cleared the horizontal collision. The
                // loop re-checks the AABB at the stepped position before the
                // next movement sub-step.
                hit = true;
                continue;
              }
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

  /**
   * Attempt to lift a grounded player over a low obstacle. The horizontal
   * displacement has already been applied; if the raised AABB is clear, keep
   * the new feet height and treat the player as grounded on the step.
   */
  private tryStepUp(player: Player): boolean {
    const height = CONFIG.player.stepHeight;
    if (height <= 0) {
      return false;
    }
    player.position.y += height;
    if (this.isPlayerClear(player)) {
      player.velocity.y = 0;
      player.onGround = true;
      return true;
    }
    player.position.y -= height;
    return false;
  }

  /** Whether the player's current AABB overlaps any solid voxel. */
  private isPlayerClear(player: Player): boolean {
    const minX = player.position.x - player.radius;
    const maxX = player.position.x + player.radius;
    const minY = player.position.y;
    const maxY = player.position.y + player.height;
    const minZ = player.position.z - player.radius;
    const maxZ = player.position.z + player.radius;

    for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
      for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
        for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
          if (
            this.world.isSolid(x, y, z) &&
            maxX > x &&
            minX < x + 1 &&
            maxY > y &&
            minY < y + 1 &&
            maxZ > z &&
            minZ < z + 1
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private resolve(player: Player, axis: 'x' | 'y' | 'z', sign: number, x: number, y: number, z: number): void {
    if (axis === 'x') {
      player.position.x = sign > 0 ? x - player.radius : x + 1 + player.radius;
      player.velocity.x = 0;
    } else if (axis === 'y') {
      if (sign < 0) {
        player.position.y = y + 1;
        player.onGround = true;
        this.landingDistance = Math.max(this.landingDistance, player.fallDistance);
        player.fallDistance = 0;
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
