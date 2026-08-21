import { CONFIG } from '../config';
import { Player } from './Player';
import { WorldAccess } from '../world/WorldAccess';
import { BlockId, BlockRegistry } from '../world/BlockRegistry';
import { trampleFarmland } from '../simulation/FarmlandBehavior';
import { CollisionResolver, type CollisionBox, type ShapeWorld } from '../world/CollisionResolver';
import { BlockShapeTable, VoxelShape } from '../world/VoxelShape';

/**
 * Shape-aware kinematic player physics.
 *
 * Movement is integrated through the 057 `CollisionResolver` against 056
 * `VoxelShape` collision shapes instead of full-cube `world.isSolid`: broad
 * phase enumerates the voxel cells overlapped by (or swept along) the player
 * AABB, narrow phase clips against each cell's shape boxes. The substep
 * architecture, axis order (Y -> X -> Z), terminal velocity and farmland
 * trampling behavior are preserved. With no shape table entries registered
 * every solid block answers FULL_CUBE, which reproduces the previous
 * full-cube behavior exactly.
 *
 * Beyond collision this owns an explicit contact model:
 * - `SupportContact` distinguishes ground / climbable / liquid / airborne,
 *   replacing "downward collision this update means grounded";
 * - friction/slipperiness is read from the support block via an injectable
 *   callback (default 1.0 = no change);
 * - step height is configurable per instance and only applied when horizontal
 *   movement is blocked while grounded AND the raised shape has head clearance,
 *   after which the player settles down onto support;
 * - sneaking players (injectable predicate) cannot move horizontally off a
 *   supported edge;
 * - climbable blocks (injectable predicate, default none) suppress gravity;
 * - fluid immersion is sampled as body-box overlap at feet/body/eye points and
 *   reported as a `MediumContact` feeding drag/buoyancy/swim behavior.
 *
 * Everything is deterministic: fixed iteration orders, no randomness.
 */

/** Fluid medium type touching the player's body. */
export type MediumType = 'none' | 'water' | 'lava';

/**
 * Body/fluid immersion sample. `depthFraction` is the fraction of body sample
 * points submerged (0..1), `surfaceY` the highest fluid surface encountered
 * (-Infinity when dry), and `flowX`/`flowZ` the local flow vector components
 * (0 until per-cell flow data exists).
 */
export interface MediumContact {
  type: MediumType;
  depthFraction: number;
  surfaceY: number;
  flowX: number;
  flowZ: number;
}

/** Kind of contact supporting (or not supporting) the player this update. */
export type SupportKind = 'ground' | 'climbable' | 'liquid' | 'air';

/** Explicit support/contact query result for the most recent update. */
export interface SupportContact {
  kind: SupportKind;
  /** Block id of the support surface (or climbable block); Air otherwise. */
  blockId: number;
  /** Slipperiness multiplier of the support block (default 1.0). */
  friction: number;
}

/** Optional injection points; every default preserves prior behavior. */
export interface PlayerPhysicsOptions {
  /** Maximum automatic step-up rise in blocks. Default `CONFIG.player.stepHeight`. */
  stepHeight?: number;
  /** Whether a block id is climbable (ladder/vine). Default: none are. */
  isClimbable?: (blockId: number) => boolean;
  /** Slipperiness multiplier for a support block id. Default: always 1.0. */
  frictionForBlock?: (blockId: number) => number;
  /** Whether the player is currently sneaking. Default: never. */
  isSneaking?: () => boolean;
  /** Per-block shape overrides consulted before the full-cube default. */
  blockShapes?: BlockShapeTable;
}

export class PlayerPhysics {
  private readonly world: WorldAccess;
  private readonly registry: BlockRegistry;
  private readonly resolver = new CollisionResolver();
  private readonly shapes: BlockShapeTable;
  private readonly options: PlayerPhysicsOptions;
  private landingDistance = 0;
  private medium: MediumContact = {
    type: 'none',
    depthFraction: 0,
    surfaceY: Number.NEGATIVE_INFINITY,
    flowX: 0,
    flowZ: 0,
  };
  private support: SupportContact = { kind: 'air', blockId: BlockId.Air, friction: 1 };
  /** True once a downward collision or settle has grounded the player this update. */
  private landedThisUpdate = false;

  constructor(world: WorldAccess, registry: BlockRegistry, options: PlayerPhysicsOptions = {}) {
    this.world = world;
    this.registry = registry;
    this.options = options;
    this.shapes = options.blockShapes ?? new BlockShapeTable();
    // Kept for the documented constructor signature; shape data is resolved
    // through the block-shape table per spec.
    void this.registry;
  }

  /**
   * Shape-world adapter: non-solid cells are EMPTY; solid cells answer their
   * registered collision shape or the full-cube default.
   */
  private readonly shapeWorld: ShapeWorld = {
    getCollisionShape: (x: number, y: number, z: number): VoxelShape => {
      if (!this.world.isSolid(x, y, z)) {
        return VoxelShape.EMPTY;
      }
      return this.shapes.getCollisionShape(this.world.getBlock(x, y, z));
    },
  };

  update(player: Player, dt: number): void {
    const d = Math.max(0, Math.min(dt, CONFIG.maxDeltaTime));
    this.landingDistance = 0;
    this.landedThisUpdate = false;

    // Sample fluid immersion before integration so gravity/drag use the
    // medium the body is actually in at the start of the step.
    this.medium = this.sampleMedium(player);
    player.inWater = this.medium.type === 'water';
    player.inLava = this.medium.type === 'lava';

    // Ground contact is not persistent: clear it at the start of every step so
    // walking off a ledge correctly leaves the player airborne. The explicit
    // support query at the end of the update re-establishes it.
    player.onGround = false;

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

    // Climbable contact suppresses gravity; vertical motion decays instead so
    // a climb hook can be driven by controller/Game input later.
    const onClimbable = this.probeClimbable(player);
    if (onClimbable) {
      player.velocity.y *= Math.max(0, 1 - 8 * d);
    } else {
      player.velocity.y -= gravity * d;
    }
    if (player.velocity.y < -terminalVelocity) {
      player.velocity.y = -terminalVelocity;
    }
    if (player.velocity.y < 0 && !onClimbable) {
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

    const sneaking = this.options.isSneaking?.() ?? false;
    for (let i = 0; i < steps; i++) {
      // Resolve vertical contact first. This establishes support before the
      // horizontal passes, allowing a grounded player to step up without a
      // special-case grounded probe.
      this.moveVertical(player, subDt);
      this.moveHorizontal(player, 'x', subDt, sneaking);
      this.moveHorizontal(player, 'z', subDt, sneaking);
    }

    // Explicit support/contact query replaces "downward collision means
    // grounded": standing still on any shape (full cube, slab top, fence post)
    // grounds the player whenever its collision volume lies under the feet.
    this.support = this.querySupport(player, onClimbable);
    player.onGround = this.support.kind === 'ground' || this.landedThisUpdate;
  }

  /** Return and clear the distance from the most recent landing. */
  consumeLandingDistance(): number {
    const distance = this.landingDistance;
    this.landingDistance = 0;
    return distance;
  }

  /** The most recent fluid-immersion sample (recomputed each update). */
  getMediumContact(): MediumContact {
    return this.medium;
  }

  /** The most recent explicit support/contact query result. */
  getSupportContact(): SupportContact {
    return this.support;
  }

  /** Friction multiplier of the current support block (1.0 when airborne). */
  getSupportFriction(): number {
    return this.support.friction;
  }

  /** Whether the eye-height sample point is inside a fluid cell. */
  isEyeSubmerged(): boolean {
    return this.medium.depthFraction > 0 && this.medium.surfaceY > this.lastEyeY;
  }

  private lastEyeY = Number.NEGATIVE_INFINITY;

  /**
   * Sample fluid immersion as body-box overlap at several vertical points
   * (feet, mid-body, upper body, eyes). Deterministic point sampling of the
   * occupied column; partial fluid levels refine this later via block states.
   */
  private sampleMedium(player: Player): MediumContact {
    const x = Math.floor(player.position.x);
    const z = Math.floor(player.position.z);
    const h = player.height;
    const samples = [0.1, h * 0.5, h - 0.1];
    this.lastEyeY = player.position.y + CONFIG.player.eyeHeight;
    const eyeCellY = Math.floor(this.lastEyeY);

    let type: MediumType = 'none';
    let surfaceY = Number.NEGATIVE_INFINITY;
    let submerged = 0;
    const total = samples.length + 1;

    for (const offset of samples) {
      const y = Math.floor(player.position.y + offset);
      const id = this.world.getBlock(x, y, z);
      if (id === BlockId.Water || id === BlockId.Lava) {
        submerged++;
        if (type === 'none') type = id === BlockId.Water ? 'water' : 'lava';
        const top = y + 1;
        if (top > surfaceY) surfaceY = top;
      }
    }
    // Eye sample feeds head-submersion logic (drowning/breath later).
    const eyeId = this.world.getBlock(x, eyeCellY, z);
    if (eyeId === BlockId.Water || eyeId === BlockId.Lava) {
      submerged++;
      if (type === 'none') type = eyeId === BlockId.Water ? 'water' : 'lava';
      const top = eyeCellY + 1;
      if (top > surfaceY) surfaceY = top;
    }

    return {
      type,
      depthFraction: submerged / total,
      surfaceY,
      // Per-cell flow vectors arrive with fluid block states; until then the
      // medium is still.
      flowX: 0,
      flowZ: 0,
    };
  }

  /** Whether any body cell holds a climbable block per the injected predicate. */
  private probeClimbable(player: Player): boolean {
    if (!this.options.isClimbable) {
      return false;
    }
    const x = Math.floor(player.position.x);
    const z = Math.floor(player.position.z);
    const y0 = Math.floor(player.position.y);
    const y1 = Math.floor(player.position.y + player.height - 0.1);
    for (let y = y0; y <= y1; y++) {
      if (this.options.isClimbable(this.world.getBlock(x, y, z))) {
        return true;
      }
    }
    return false;
  }

  /** Player AABB as a resolver `CollisionBox` (min-corner convention). */
  private boxOf(player: Player): CollisionBox {
    return {
      x: player.position.x - player.radius,
      y: player.position.y,
      z: player.position.z - player.radius,
      width: player.radius * 2,
      height: player.height,
      depth: player.radius * 2,
    };
  }

  private applyBox(player: Player, box: CollisionBox): void {
    player.position.x = box.x + player.radius;
    player.position.y = box.y;
    player.position.z = box.z + player.radius;
  }

  /** Vertical pass: integrate Y, snap to faces, record landings and trampling. */
  private moveVertical(player: Player, dt: number): void {
    const vy = player.velocity.y;
    if (vy === 0) {
      return;
    }
    const box = this.boxOf(player);
    const result = this.resolver.move(this.shapeWorld, box, 0, vy * dt, 0);
    this.applyBox(player, { ...box, y: result.y });
    if (result.collidedY) {
      if (vy < 0) {
        // Landed on whatever shape top snapped the feet. The support cell sits
        // just below the settled feet height.
        const cy = Math.floor(result.y - 1e-4);
        const cx = Math.floor(player.position.x);
        const cz = Math.floor(player.position.z);
        this.landedThisUpdate = true;
        this.landingDistance = Math.max(this.landingDistance, player.fallDistance);
        player.fallDistance = 0;
        // Landing on farmland tramples it back to dirt (126).
        trampleFarmland(this.world, cx, cy, cz);
      }
      player.velocity.y = 0;
    }
  }

  /**
   * Horizontal pass with sneak edge-safety and state-dependent stepping.
   * Order of checks after the raw move:
   * 1. sneaking + grounded: revert any move that would leave support;
   * 2. collided + grounded: attempt a step-up (head clearance checked, move
   *    retried while lifted, then settle onto support);
   * 3. still collided: clamp velocity to zero.
   */
  private moveHorizontal(player: Player, axis: 'x' | 'z', dt: number, sneaking: boolean): void {
    const v = player.velocity[axis];
    if (v === 0) {
      return;
    }
    const wasGrounded = player.onGround || this.landedThisUpdate;
    const startBox = this.boxOf(player);
    const delta = v * dt;
    const result =
      axis === 'x'
        ? this.resolver.move(this.shapeWorld, startBox, delta, 0, 0)
        : this.resolver.move(this.shapeWorld, startBox, 0, 0, delta);

    const movedBox: CollisionBox =
      axis === 'x'
        ? { ...startBox, x: result.x }
        : { ...startBox, z: result.z };

    // Sneak edge-safety: while sneaking and grounded, refuse horizontal moves
    // whose destination has no support beneath the footprint.
    if (sneaking && wasGrounded && !this.hasSupportBelow(movedBox)) {
      player.velocity[axis] = 0;
      return;
    }

    if (result.collidedX || result.collidedZ) {
      if (wasGrounded && this.tryStepUp(player, axis, delta)) {
        return;
      }
      player.velocity[axis] = 0;
    }

    this.applyBox(player, movedBox);
  }

  /**
   * Attempt to lift a grounded player over a low obstacle. The rise is capped
   * by the configured step height; it succeeds only when the raised AABB is
   * clear (head clearance), the horizontal motion can be retried while lifted,
   * AND the player then settles down onto support within that rise. On
   * success vertical velocity is zeroed and the player stays grounded. On
   * failure the player is left untouched.
   */
  private tryStepUp(player: Player, axis: 'x' | 'z', delta: number): boolean {
    const height = this.options.stepHeight ?? CONFIG.player.stepHeight;
    if (height <= 0 || delta === 0) {
      return false;
    }
    // Lift a hair past the exact rise so the boundary-inclusive overlap test
    // does not read the obstacle's own top face as head collision.
    const lift = height + 0.001;
    const startBox = this.boxOf(player);
    const raised = { ...startBox, y: startBox.y + lift };
    if (this.resolver.collides(this.shapeWorld, raised)) {
      return false;
    }
    // Retry the blocked horizontal move while lifted so the footprint moves
    // over the obstacle before settling back down onto its support surface.
    const stepped =
      axis === 'x'
        ? this.resolver.move(this.shapeWorld, raised, delta, 0, 0)
        : this.resolver.move(this.shapeWorld, raised, 0, 0, delta);
    if ((axis === 'x' ? stepped.collidedX : stepped.collidedZ) && Math.abs((axis === 'x' ? stepped.x : stepped.z) - (axis === 'x' ? raised.x : raised.z)) < 1e-9) {
      // Fully walled even at the raised height: nothing to step onto.
      return false;
    }
    const steppedBox: CollisionBox =
      axis === 'x'
        ? { ...raised, x: stepped.x }
        : { ...raised, z: stepped.z };
    // Settle: drop the lifted box back down; it must land within the rise,
    // otherwise there was no support to step onto.
    const settled = this.resolver.move(this.shapeWorld, steppedBox, 0, -lift, 0);
    if (!settled.collidedY) {
      return false;
    }
    this.applyBox(player, { ...steppedBox, y: settled.y });
    player.velocity.y = 0;
    if (axis === 'x' ? stepped.collidedX : stepped.collidedZ) {
      player.velocity[axis] = 0;
    }
    this.landedThisUpdate = true;
    return true;
  }

  /** Whether any collision shape overlaps the thin slab directly under `box`. */
  private hasSupportBelow(box: CollisionBox): boolean {
    return this.resolver.collides(this.shapeWorld, {
      x: box.x,
      y: box.y - 0.05,
      z: box.z,
      width: box.width,
      height: 0.05,
      depth: box.depth,
    });
  }

  /** Block id of the first collision shape under the player's footprint. */
  private probeSupportBlock(player: Player): number {
    const minX = player.position.x - player.radius;
    const maxX = player.position.x + player.radius;
    const minZ = player.position.z - player.radius;
    const maxZ = player.position.z + player.radius;
    const y = player.position.y - 0.05;
    const cy = Math.floor(y);
    for (let cz = Math.floor(minZ); cz <= Math.floor(maxZ); cz++) {
      for (let cx = Math.floor(minX); cx <= Math.floor(maxX); cx++) {
        const shape = this.shapeWorld.getCollisionShape(cx, cy, cz);
        if (!shape.isEmpty && shape.intersects(minX, y, minZ, maxX, y + 0.05, maxZ)) {
          return this.world.getBlock(cx, cy, cz);
        }
      }
    }
    return BlockId.Air;
  }

  /** Explicit support/contact query: ground vs climbable vs liquid vs air. */
  private querySupport(player: Player, onClimbable: boolean): SupportContact {
    if (onClimbable) {
      const x = Math.floor(player.position.x);
      const z = Math.floor(player.position.z);
      const y = Math.floor(player.position.y + player.height * 0.5);
      return { kind: 'climbable', blockId: this.world.getBlock(x, y, z), friction: 1 };
    }
    if (player.onGround || this.landedThisUpdate || this.hasSupportBelow(this.boxOf(player))) {
      const blockId = this.probeSupportBlock(player);
      const friction = this.options.frictionForBlock?.(blockId) ?? 1;
      return { kind: 'ground', blockId, friction };
    }
    if (this.medium.type !== 'none') {
      return { kind: 'liquid', blockId: BlockId.Air, friction: 1 };
    }
    return { kind: 'air', blockId: BlockId.Air, friction: 1 };
  }
}
