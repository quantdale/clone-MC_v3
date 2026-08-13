import * as THREE from 'three';
import { CONFIG } from '../config';
import { Player } from './Player';
import { InputState } from '../engine/InputTypes';
import { WorldAccess } from '../world/WorldAccess';
import { BlockRegistry, BlockId } from '../world/BlockRegistry';
import { BlockSelector } from '../inventory/BlockSelector';
import { raycastVoxel, RaycastResult } from '../math/DDA';

export type InteractionAction = 'break' | 'place' | 'blocked' | 'empty';

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
  private readonly onAction?: (action: InteractionAction, blockId?: number) => void;
  private readonly onBreakProgress?: (progress: number) => void;
  private readonly onToolBreak?: () => void;

  private readonly eyePos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();

  private target: RaycastResult | null = null;
  private elapsed = 0;
  private lastActionTime = -Infinity;
  private breaking = false;
  private breakProgress = 0;
  private breakTargetKey = '';

  private readonly outline: THREE.LineSegments;

  constructor(opts: {
    world: WorldAccess;
    registry: BlockRegistry;
    selector: BlockSelector;
    player: Player;
    camera: THREE.Camera;
    input?: InputState;
    onAction?: (action: InteractionAction, blockId?: number) => void;
    onBreakProgress?: (progress: number) => void;
    onToolBreak?: () => void;
  }) {
    this.world = opts.world;
    this.registry = opts.registry;
    this.selector = opts.selector;
    this.player = opts.player;
    this.camera = opts.camera;
    this.input = opts.input;
    this.onAction = opts.onAction;
    this.onBreakProgress = opts.onBreakProgress;
    this.onToolBreak = opts.onToolBreak;

    // A centered unit-cube wireframe marks the targeted block. Keeping the
    // geometry centered and placing it at block + 0.5 avoids the classic
    // half-block selection-line offset.
    // A plain Mesh with a LineBasicMaterial would render as a solid black cube,
    // fully occluding the block it is meant to outline.
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const material = new THREE.LineBasicMaterial({
      color: 0xffe08a,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });
    this.outline = new THREE.LineSegments(geometry, material);
    this.outline.visible = false;
    this.outline.renderOrder = 3;
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

    const targetKey = this.target
      ? `${this.target.blockX},${this.target.blockY},${this.target.blockZ}`
      : '';
    if (targetKey !== this.breakTargetKey) {
      this.resetBreakProgress();
      this.breakTargetKey = targetKey;
    }

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

    if (this.input) {
      const breakRequested = this.input.consumeBreak();
      const breakClick = this.input.consumeBreakClick?.() ?? false;
      if (breakRequested && this.elapsed >= this.lastActionTime + CONFIG.actionCooldown) {
        this.beginBreak(this.input.isBreakHeld());
      }

      if (this.breaking) {
        if (!this.input.isBreakHeld()) {
          if (breakClick && this.target) {
            this.finishBreak(this.world.getBlock(this.target.blockX, this.target.blockY, this.target.blockZ));
          } else {
            this.resetBreakProgress();
          }
        } else {
          this.advanceBreak(d);
        }
      }

      if (!breakRequested && this.elapsed >= this.lastActionTime + CONFIG.actionCooldown && this.input.consumePlace()) {
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

  /** Clear a stale selection while the world is streaming or the game is paused. */
  clearTarget(): void {
    this.target = null;
    this.outline.visible = false;
    this.breakTargetKey = '';
    this.resetBreakProgress();
  }

  private beginBreak(held: boolean): void {
    if (!this.target) {
      this.onAction?.('blocked');
      return;
    }
    const blockId = this.world.getBlock(this.target.blockX, this.target.blockY, this.target.blockZ);
    const def = this.registry.get(blockId);
    if (!def.breakable || !Number.isFinite(def.hardness)) {
      this.onAction?.('blocked', blockId);
      return;
    }
    if (held) {
      this.breaking = true;
      return;
    }
    this.finishBreak(blockId);
  }

  private advanceBreak(dt: number): void {
    if (!this.target) {
      this.resetBreakProgress();
      return;
    }
    const blockId = this.world.getBlock(this.target.blockX, this.target.blockY, this.target.blockZ);
    const def = this.registry.get(blockId);
    if (!def.breakable || !Number.isFinite(def.hardness)) {
      this.resetBreakProgress();
      return;
    }
    const duration = this.getBreakDuration(def);
    this.breakProgress = Math.min(1, this.breakProgress + dt / duration);
    this.onBreakProgress?.(this.breakProgress);
    if (this.breakProgress >= 1) {
      this.finishBreak(blockId);
      this.lastActionTime = this.elapsed;
    }
  }

  private finishBreak(blockId: number): void {
    if (!this.target) return;
    const selectedTool = this.registry.get(this.selector.getSelectedBlockId());
    this.world.setBlock(this.target.blockX, this.target.blockY, this.target.blockZ, BlockId.Air);
    const dropId = this.registry.get(blockId).dropId ?? blockId;
    this.selector.addItem?.(dropId, 1);
    if (blockId === BlockId.Leaves) {
      this.selector.addItem?.(BlockId.Apple, 1);
    }
    if (selectedTool.maxDurability !== undefined && this.selector.damageSelectedItem) {
      if (this.selector.damageSelectedItem(1, selectedTool.maxDurability)) {
        this.onToolBreak?.();
      }
    }
    this.onAction?.('break', dropId);
    this.lastActionTime = this.elapsed;
    this.resetBreakProgress();
  }

  /** Resolve the effective break duration, applying the selected tool bonus. */
  private getBreakDuration(def: { hardness: number; preferredTool?: number }): number {
    let duration = def.hardness;
    const tool = this.registry.get(this.selector.getSelectedBlockId());
    if (
      def.preferredTool !== undefined &&
      tool.toolKind === def.preferredTool &&
      tool.toolPower !== undefined &&
      (this.selector.getSlotCount?.() ?? 1) > 0
    ) {
      duration /= tool.toolPower;
    }
    return Math.max(0.08, duration);
  }

  private resetBreakProgress(): void {
    this.breaking = false;
    this.breakProgress = 0;
    this.onBreakProgress?.(0);
  }

  private placeBlock(): boolean {
    if (!this.target) {
      return false;
    }
    const selectedId = this.selector.getSelectedBlockId();
    const selected = this.registry.get(selectedId);
    if (!selected.placeable) {
      this.onAction?.('blocked', selectedId);
      return false;
    }
    if (this.selector.getSlotCount && this.selector.getSlotCount() <= 0) {
      this.onAction?.('empty', selectedId);
      return false;
    }

    // Placement cell is the targeted block offset by the face normal.
    const bx = Math.floor(this.target.blockX + this.target.nx);
    const by = Math.floor(this.target.blockY + this.target.ny);
    const bz = Math.floor(this.target.blockZ + this.target.nz);

    // Guard against placement outside the world's vertical bounds (e.g. on top
    // of a y=63 block). Rejecting here avoids the phantom-edit path in setBlock.
    if (by < 0 || by >= CONFIG.chunk.height) {
      this.onAction?.('blocked', selectedId);
      return false;
    }

    if (this.world.isSolid(bx, by, bz)) {
      this.onAction?.('blocked', selectedId);
      return false;
    }

    // Reject if the placement would intersect the player AABB.
    if (this.intersectsPlayer(bx, by, bz)) {
      this.onAction?.('blocked', selectedId);
      return false;
    }

    if (this.selector.consumeSelected && !this.selector.consumeSelected()) {
      return false;
    }
    this.world.setBlock(bx, by, bz, selectedId);
    if (this.world.getBlock(bx, by, bz) !== selectedId) {
      this.selector.addItem?.(selectedId, 1);
      this.onAction?.('blocked', selectedId);
      return false;
    }
    this.onAction?.('place', selectedId);
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
