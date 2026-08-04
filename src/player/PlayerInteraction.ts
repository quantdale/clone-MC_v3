import * as THREE from 'three';
import { CONFIG } from '../config';
import { Player } from './Player';
import { InputState } from '../engine/InputTypes';
import { WorldAccess } from '../world/WorldAccess';
import { BlockRegistry, BlockId } from '../world/BlockRegistry';
import { BlockSelector } from '../inventory/BlockSelector';
import { raycastVoxel, RaycastResult } from '../math/DDA';

/**
 * Player interaction.
 *
 * Casts a ray from the camera through the world to find the targeted block, and
 * handles break/place actions with a cooldown. Also maintains a selection
 * outline mesh that marks the targeted block.
 *
 * `input` is optional to keep the documented constructor signature valid; when
 * provided, break/place actions are consumed from it.
 */
export class PlayerInteraction {
  private readonly world: WorldAccess;
  private readonly registry: BlockRegistry;
  private readonly selector: BlockSelector;
  private readonly player: Player;
  private readonly camera: THREE.Camera;
  private readonly input?: InputState;

  private readonly eyePos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();

  private target: RaycastResult | null = null;
  private elapsed = 0;
  private lastActionTime = -Infinity;

  private readonly outline: THREE.LineSegments;

  constructor(opts: {
    world: WorldAccess;
    registry: BlockRegistry;
    selector: BlockSelector;
    player: Player;
    camera: THREE.Camera;
    input?: InputState;
  }) {
    this.world = opts.world;
    this.registry = opts.registry;
    this.selector = opts.selector;
    this.player = opts.player;
    this.camera = opts.camera;
    this.input = opts.input;

    // A wireframe edges box (unit cube spanning 0..1) marks the targeted block.
    // A plain Mesh with a LineBasicMaterial would render as a solid black cube,
    // fully occluding the block it is meant to outline.
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    geometry.translate(0.5, 0.5, 0.5);
    const material = new THREE.LineBasicMaterial({ color: 0x000000 });
    this.outline = new THREE.LineSegments(geometry, material);
    this.outline.visible = false;
  }

  update(dt: number): void {
    const d = Math.min(dt, CONFIG.maxDeltaTime);
    this.elapsed += d;

    // Compute the ray from the camera through the eye position.
    this.eyePos.copy(this.player.eyePosition);
    this.camera.getWorldDirection(this.dir);
    this.origin.copy(this.eyePos);

    this.target = raycastVoxel(
      this.world,
      this.origin.x,
      this.origin.y,
      this.origin.z,
      this.dir.x,
      this.dir.y,
      this.dir.z,
      CONFIG.reach,
    );

    // Update the selection outline.
    if (this.target) {
      this.outline.position.set(
        this.target.blockX + 0.5,
        this.target.blockY + 0.5,
        this.target.blockZ + 0.5,
      );
      this.outline.visible = true;
    } else {
      this.outline.visible = false;
    }

    // Actions are subject to the cooldown.
    if (this.input && this.elapsed >= this.lastActionTime + CONFIG.actionCooldown) {
      if (this.input.consumeBreak()) {
        // Only start the cooldown when the action actually did something, so a
        // click on empty space (no target) doesn't waste the cooldown window.
        if (this.breakBlock()) {
          this.lastActionTime = this.elapsed;
        }
      } else if (this.input.consumePlace()) {
        if (this.placeBlock()) {
          this.lastActionTime = this.elapsed;
        }
      }
    }
  }

  /** Add the target outline mesh to the scene; caller must dispose it. */
  addTargetOutline(): THREE.LineSegments | null {
    return this.outline;
  }

  /** The currently targeted block coordinates, or null. */
  getTarget(): { blockX: number; blockY: number; blockZ: number } | null {
    if (!this.target) {
      return null;
    }
    return {
      blockX: this.target.blockX,
      blockY: this.target.blockY,
      blockZ: this.target.blockZ,
    };
  }

  private breakBlock(): boolean {
    if (!this.target) {
      return false;
    }
    const def = this.registry.get(
      this.world.getBlock(this.target.blockX, this.target.blockY, this.target.blockZ),
    );
    if (def.breakable) {
      this.world.setBlock(this.target.blockX, this.target.blockY, this.target.blockZ, BlockId.Air);
      return true;
    }
    return false;
  }

  private placeBlock(): boolean {
    if (!this.target) {
      return false;
    }
    const selectedId = this.selector.getSelectedBlockId();
    const selected = this.registry.get(selectedId);
    if (!selected.placeable) {
      return false;
    }

    // Placement cell is the targeted block offset by the face normal.
    const bx = Math.floor(this.target.blockX + this.target.nx);
    const by = Math.floor(this.target.blockY + this.target.ny);
    const bz = Math.floor(this.target.blockZ + this.target.nz);

    // Guard against placement outside the world's vertical bounds (e.g. on top
    // of a y=63 block). Rejecting here avoids the phantom-edit path in setBlock.
    if (by < 0 || by >= CONFIG.chunk.height) {
      return false;
    }

    if (this.world.isSolid(bx, by, bz)) {
      return false;
    }

    // Reject if the placement would intersect the player AABB.
    if (this.intersectsPlayer(bx, by, bz)) {
      return false;
    }

    this.world.setBlock(bx, by, bz, selectedId);
    return true;
  }

  private intersectsPlayer(bx: number, by: number, bz: number): boolean {
    const minPX = this.player.position.x - this.player.radius;
    const maxPX = this.player.position.x + this.player.radius;
    const minPY = this.player.position.y;
    const maxPY = this.player.position.y + this.player.height;
    const minPZ = this.player.position.z - this.player.radius;
    const maxPZ = this.player.position.z + this.player.radius;

    return (
      maxPX > bx &&
      minPX < bx + 1 &&
      maxPY > by &&
      minPY < by + 1 &&
      maxPZ > bz &&
      minPZ < bz + 1
    );
  }

  /** Releases the target outline's geometry and material. */
  dispose(): void {
    this.outline.geometry.dispose();
    if (!Array.isArray(this.outline.material)) {
      this.outline.material.dispose();
    }
  }
}