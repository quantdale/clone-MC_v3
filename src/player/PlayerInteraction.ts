import * as THREE from 'three';
import { CONFIG } from '../config';
import { Player } from './Player';
import { InputState } from '../engine/InputTypes';
import { WorldAccess } from '../world/WorldAccess';
import { BlockRegistry, BlockId, type BlockTypeDefinition } from '../world/BlockRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../data/DimensionTypes';
import { ItemTypeRegistry, ItemId } from '../inventory/ItemRegistry';
import { type HarvestRules } from '../world/HarvestRules';
import { BlockSelector } from '../inventory/BlockSelector';
import {
  getEnchantmentLevel,
  silkTouchActive,
  fortuneBonusCount,
} from '../inventory/EnchantmentApplication';
import type { EnchantmentRegistry } from '../inventory/EnchantmentRegistry';
import { type LootTableRegistry, type RandomSource, type LootContext, type LootStack, evaluate } from '../inventory/LootTable';
import { raycastVoxel, RaycastResult } from '../math/DDA';
import { raycastSelection, type SelectionShapeWorld } from '../world/ShapeRaycast';
import type { ItemEntityManager } from '../simulation/ItemEntityManager';
import type { XpOrbManager } from '../simulation/XpOrbManager';
import { createSpawnPosition } from '../world/ItemEntity';

export type InteractionAction = 'break' | 'place' | 'blocked' | 'empty' | 'use';

/** World coordinates of the affected block for an action (251). */
export interface InteractionCoords {
  x: number;
  y: number;
  z: number;
}

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
  private readonly itemRegistry: ItemTypeRegistry;
  private readonly selector: BlockSelector;
  private readonly player: Player;
  private readonly camera: THREE.Camera;
  private readonly input?: InputState;
  private readonly onAction?: (action: InteractionAction, blockId?: number, coords?: InteractionCoords) => void;
  private readonly onBreakProgress?: (progress: number) => void;
  private readonly onToolBreak?: () => void;
  private readonly lootTables?: LootTableRegistry;
  private readonly rng?: RandomSource;
  private readonly itemEntities?: ItemEntityManager;
  private readonly harvestRules?: HarvestRules;
  private readonly xpOrbs?: XpOrbManager;
  private readonly xpOrbValue: number;
  /** Optional enchantment registry (119) used to read selected-stack enchantments. */
  private readonly enchantmentRegistry?: EnchantmentRegistry;
  /** Optional selection-shape source; when absent targeting falls back to cell-level DDA. */
  private readonly selectionShapes?: SelectionShapeWorld;
  /**
   * Live game-mode rules (265): whether placing/using consumes the held stack
   * (192 `depletesItems`). Absent = always deplete (legacy survival behavior).
   */
  private readonly depletesItems: () => boolean;
  /**
   * Live game-mode rules (265): whether mining completes instantly (192
   * `instantBlockBreak` for creative). Absent = duration-based (legacy).
   */
  private readonly instantBreak: () => boolean;
  /**
   * Live game-mode rules (265): whether breaking spawns loot/XP and wears
   * tools. Creative instant-breaks are clean (no drops, no XP, no wear).
   * Absent = always drop (legacy).
   */
  private readonly dropsLoot: () => boolean;
  /**
   * Live game-mode rules (266): whether the targeted block may be broken
   * (adventure allow-list / spectator denial via the Game closure).
   * Absent = always allow (legacy).
   */
  private readonly canBreak: (blockId: number) => boolean;
  /**
   * Live game-mode rules (266): whether the resolved block may be placed
   * (adventure allow-list / spectator denial via the Game closure).
   * Absent = always allow (legacy).
   */
  private readonly canPlace: (blockId: number) => boolean;
  /**
   * Live game-mode rules (266): whether any block/entity/item interaction is
   * allowed at all (195 `canInteract`; false only for spectator). While false,
   * pending break/place/use inputs are drained silently: no action, no toast.
   * Absent = always interact (legacy).
   */
  private readonly canInteract: () => boolean;

  private readonly eyePos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();

  private target: RaycastResult | null = null;
  private elapsed = 0;
  private lastActionTime = -Infinity;
  private breaking = false;
  private breakProgress = 0;
  private breakTargetKey = '';
  /** A held break press that arrived during the prior action cooldown. */
  private breakPending = false;

  private readonly outline: THREE.LineSegments;

  constructor(opts: {
    world: WorldAccess;
    registry: BlockRegistry;
    itemRegistry: ItemTypeRegistry;
    selector: BlockSelector;
    player: Player;
    camera: THREE.Camera;
    input?: InputState;
    onAction?: (action: InteractionAction, blockId?: number, coords?: InteractionCoords) => void;
    onBreakProgress?: (progress: number) => void;
    onToolBreak?: () => void;
    lootTables?: LootTableRegistry;
    rng?: RandomSource;
    itemEntities?: ItemEntityManager;
    harvestRules?: HarvestRules;
    xpOrbs?: XpOrbManager;
    xpOrbValue?: number;
    enchantmentRegistry?: EnchantmentRegistry;
    /** Optional per-cell selection-shape source enabling shape-aware targeting. */
    selectionShapes?: SelectionShapeWorld;
    /** Live game-mode rule: item depletion on place/use (265; default always). */
    depletesItems?: () => boolean;
    /** Live game-mode rule: instant mining (265; default never). */
    instantBreak?: () => boolean;
    /** Live game-mode rule: loot/XP/tool-wear on break (265; default always). */
    dropsLoot?: () => boolean;
    /** Live game-mode rule: break permission for a numeric block id (266; default allow). */
    canBreak?: (blockId: number) => boolean;
    /** Live game-mode rule: place permission for a numeric block id (266; default allow). */
    canPlace?: (blockId: number) => boolean;
    /** Live game-mode rule: any interaction at all (266; default allow). */
    canInteract?: () => boolean;
  }) {
    this.world = opts.world;
    this.registry = opts.registry;
    this.itemRegistry = opts.itemRegistry;
    this.selector = opts.selector;
    this.player = opts.player;
    this.camera = opts.camera;
    this.input = opts.input;
    this.onAction = opts.onAction;
    this.onBreakProgress = opts.onBreakProgress;
    this.onToolBreak = opts.onToolBreak;
    this.lootTables = opts.lootTables;
    this.rng = opts.rng;
    this.itemEntities = opts.itemEntities;
    this.harvestRules = opts.harvestRules;
    this.xpOrbs = opts.xpOrbs;
    this.xpOrbValue = opts.xpOrbValue ?? 0;
    this.enchantmentRegistry = opts.enchantmentRegistry;
    this.selectionShapes = opts.selectionShapes;
    this.depletesItems = opts.depletesItems ?? (() => true);
    this.instantBreak = opts.instantBreak ?? (() => false);
    this.dropsLoot = opts.dropsLoot ?? (() => true);
    this.canBreak = opts.canBreak ?? (() => true);
    this.canPlace = opts.canPlace ?? (() => true);
    this.canInteract = opts.canInteract ?? (() => true);

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

    // Shape-aware targeting: when a selection-shape source is available the
    // DDA traversal tests each visited cell's SELECTION shape and the nearest
    // box hit wins; cells whose selection shape misses are skipped. Without
    // one, targeting falls back to the cell-level DDA raycast.
    if (this.selectionShapes) {
      const shapeHit = raycastSelection(
        this.selectionShapes,
        this.origin.x,
        this.origin.y,
        this.origin.z,
        this.dir.x,
        this.dir.y,
        this.dir.z,
        CONFIG.reach,
      );
      this.target = shapeHit
        ? {
            blockX: shapeHit.blockX,
            blockY: shapeHit.blockY,
            blockZ: shapeHit.blockZ,
            nx: shapeHit.nx,
            ny: shapeHit.ny,
            nz: shapeHit.nz,
            distance: shapeHit.distance,
            hitPointX: shapeHit.pointX,
            hitPointY: shapeHit.pointY,
            hitPointZ: shapeHit.pointZ,
          }
        : null;
    } else {
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
    }

    const targetKey = this.target
      ? `${this.target.blockX},${this.target.blockY},${this.target.blockZ}`
      : '';
    if (targetKey !== this.breakTargetKey) {
      this.resetBreakProgress();
      this.breakPending = false;
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
      // Spectator no-interaction (266): drain pending inputs silently so a
      // held button cannot queue actions for a later mode, and hide the
      // outline. No action and no toast (holding break must not spam).
      if (!this.canInteract()) {
        this.input.consumeBreak();
        this.input.consumeBreakClick?.();
        this.input.consumePlace();
        this.resetBreakProgress();
        this.outline.visible = false;
        return;
      }
      const breakRequested = this.input.consumeBreak();
      const breakClick = this.input.consumeBreakClick?.() ?? false;
      const breakReady = this.elapsed >= this.lastActionTime + CONFIG.actionCooldown;
      if (breakRequested) {
        if (breakReady && !this.breaking) {
          this.beginBreak(this.input.isBreakHeld());
          this.breakPending = false;
        } else if (this.input.isBreakHeld()) {
          // Preserve a held press across the action cooldown. The input layer
          // queues the initial mousedown once, so dropping it here would make
          // a human hold begun immediately after placing a block inert.
          this.breakPending = true;
        }
      }
      if (!this.breaking && this.breakPending && this.input.isBreakHeld() && breakReady) {
        this.beginBreak(true);
        this.breakPending = false;
      }
      if (!this.input.isBreakHeld()) {
        // A quick click released before the cooldown expires must not turn
        // into a delayed break after the user has let go.
        this.breakPending = false;
      }

      if (this.breaking) {
        if (!this.input.isBreakHeld()) {
          // Release ends the attempt. It completes only when the mining
          // progress actually reached 1 (hardening 2026-08-23): a quick click
          // previously called finishBreak unconditionally, letting ANY
          // breakable block pop instantly regardless of hardness/tool — the
          // exact shortcut the hardness-based duration contract exists for.
          if (breakClick && this.target && this.breakProgress >= 1) {
            this.finishBreak(this.world.getBlock(this.target.blockX, this.target.blockY, this.target.blockZ));
          } else {
            this.resetBreakProgress();
          }
        } else {
          this.advanceBreak(d);
        }
      }

      if (!breakRequested && !this.breakPending && breakReady && this.input.consumePlace()) {
        if (this.target) {
          const targetBlockId = this.world.getBlock(this.target.blockX, this.target.blockY, this.target.blockZ);
          const selectedId = this.selector.getSelectedItemId();
          // Right-clicking an enchanting table opens a session instead of placing.
          // Coords ride along (259, furnace parity) so the game can anchor the
          // panel without re-deriving the target.
          if (targetBlockId === BlockId.EnchantingTable) {
            this.onAction?.('use', targetBlockId, {
              x: this.target.blockX,
              y: this.target.blockY,
              z: this.target.blockZ,
            });
            this.lastActionTime = this.elapsed;
          } else if (targetBlockId === BlockId.Furnace) {
            // Right-clicking a furnace opens its container instead of placing
            // (251); the held stack is untouched regardless of what it is.
            this.onAction?.('use', targetBlockId, {
              x: this.target.blockX,
              y: this.target.blockY,
              z: this.target.blockZ,
            });
            this.lastActionTime = this.elapsed;
          } else if (targetBlockId === BlockId.BrewingStand) {
            // Right-clicking a brewing stand opens its container instead of
            // placing (260, furnace parity); the held stack is untouched
            // regardless of what it is.
            this.onAction?.('use', targetBlockId, {
              x: this.target.blockX,
              y: this.target.blockY,
              z: this.target.blockZ,
            });
            this.lastActionTime = this.elapsed;
          } else if (targetBlockId === BlockId.Bed) {
            // Right-clicking a bed runs the sleep rules instead of placing
            // (274, 260 container-use precedent); the held stack is untouched
            // regardless of what it is.
            this.onAction?.('use', targetBlockId, {
              x: this.target.blockX,
              y: this.target.blockY,
              z: this.target.blockZ,
            });
            this.lastActionTime = this.elapsed;
          } else if (selectedId === ItemId.BoneMeal) {
            // Bone meal is used on the block under the crosshair instead of placing.
            this.onAction?.('use', targetBlockId);
            this.lastActionTime = this.elapsed;
          } else if (this.placeBlock()) {
            this.lastActionTime = this.elapsed;
          }
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

  /** The current target block plus the face normal used for adjacent placement. */
  getTargetFace(): { blockX: number; blockY: number; blockZ: number; nx: number; ny: number; nz: number } | null {
    if (!this.target) {
      return null;
    }
    return {
      blockX: this.target.blockX,
      blockY: this.target.blockY,
      blockZ: this.target.blockZ,
      nx: this.target.nx,
      ny: this.target.ny,
      nz: this.target.nz,
    };
  }

  /** Clear a stale selection while the world is streaming or the game is paused. */
  clearTarget(): void {
    this.target = null;
    this.outline.visible = false;
    this.breakTargetKey = '';
    this.breakPending = false;
    this.resetBreakProgress();
  }

  private beginBreak(_held: boolean): void {
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
    // Adventure/spectator permission gate (266): denial surfaces 'blocked'
    // once per press; mining never starts.
    if (!this.canBreak(blockId)) {
      this.onAction?.('blocked', blockId);
      return;
    }
    // Both clicks and holds start a mining attempt (hardening 2026-08-23):
    // completion is owned by the duration-based progress, never by the press
    // style. A released click resets on the next update unless progress
    // already reached 1.
    this.breaking = true;
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
    // Adventure/spectator permission gate (266): the target may have changed
    // mid-mine. Silent reset (beginBreak already gave feedback per press).
    if (!this.canBreak(blockId)) {
      this.resetBreakProgress();
      return;
    }
    // Creative instant-break (265): a breakable targeted block completes on
    // the first mining update (unbreakable already refused above).
    if (this.instantBreak()) {
      this.finishBreak(blockId);
      this.lastActionTime = this.elapsed;
      return;
    }
    const duration = this.getBreakDuration(def, this.selectedEnchantLevel('efficiency'));
    this.breakProgress = Math.min(1, this.breakProgress + dt / duration);
    this.onBreakProgress?.(this.breakProgress);
    if (this.breakProgress >= 1) {
      this.finishBreak(blockId);
      this.lastActionTime = this.elapsed;
    }
  }

  private finishBreak(blockId: number): void {
    if (!this.target) return;
    const selectedTool = this.itemRegistry.getByLegacyId(this.selector.getSelectedItemId());
    const selectedStack = this.selector.getSelectedStack?.() ?? null;
    const { blockX, blockY, blockZ } = this.target;

    // Capture the broken block's state (e.g. a crop's `age`) before it is
    // removed so age-aware loot tables can read it (125).
    let properties: Record<string, string> | undefined;
    if (this.world.getBlockState) {
      const state = this.world.getBlockState(blockX, blockY, blockZ);
      const assigns = state.assignments;
      if (assigns.length > 0) {
        properties = {};
        for (const [name, value] of assigns) {
          properties[name] = value;
        }
      }
    }

    this.world.setBlock(blockX, blockY, blockZ, BlockId.Air);

    const def = this.registry.get(blockId);
    // Harvest gating (114): a block yields drops only when the held tool can
    // harvest it. Blocks requiring a tool (miningLevel > 0) drop nothing when
    // broken by hand or by the wrong/under-tier tool. When no harvest rules are
    // injected (legacy/test paths) the block always drops, preserving prior
    // behavior.
    const canHarvest = this.harvestRules ? this.harvestRules.canHarvest(def, selectedTool) : true;
    const stacks: LootStack[] = [];
    if (canHarvest) {
      if (this.lootTables && def.lootTable) {
        // Route the drop through the block's loot table. Evaluation is pure;
        // the resulting stacks become world item entities (111).
        const table = this.lootTables.get(def.lootTable);
        const ctx: LootContext = {
          blockId,
          toolItemId: this.selector.getSelectedItemId(),
          itemRegistry: this.itemRegistry,
          properties,
        };
        const rng = this.rng ?? Math.random;
        for (const stack of evaluate(table, ctx, rng, this.itemRegistry)) {
          stacks.push(stack);
        }
      } else {
        // Fallback retained for test and legacy paths that do not inject a loot
        // registry (e.g. unbreakable/edge cases). Mirrors pre-011 drop behavior.
        const dropRid = def.dropItem ?? def.resourceId;
        stacks.push({ item: this.itemRegistry.getByResourceId(dropRid).id, count: 1 });
      }
      // Leaf apples resolve exclusively through the leaves loot table
      // (270: probabilistic 1/200 apple pool); no unconditional push here.
    }

    // Enchantment application (119): Silk Touch replaces the drops with the block
    // itself; Fortune adds extra items to the primary drop. Silk Touch and Fortune
    // are mutually exclusive enchantments, so they never both apply. All reads are
    // guarded by `enchantmentRegistry` and `getSelectedStack` so legacy/no-enchant
    // callers keep the prior behavior.
    if (canHarvest && selectedStack && this.enchantmentRegistry) {
      const silkLevel = getEnchantmentLevel(selectedStack, 'silk_touch', this.enchantmentRegistry);
      if (silkTouchActive(silkLevel)) {
        const blockItemId = this.blockItemId(def);
        if (blockItemId !== undefined) {
          stacks.length = 0;
          stacks.push({ item: blockItemId, count: 1 });
        }
      } else {
        const fortuneLevel = getEnchantmentLevel(selectedStack, 'fortune', this.enchantmentRegistry);
        if (fortuneLevel > 0 && stacks.length > 0) {
          const bonus = fortuneBonusCount(fortuneLevel, this.rng ?? Math.random);
          const first = stacks[0]!;
          stacks[0] = { item: first.item, count: first.count + bonus };
        }
      }
    }

    // Creative clean-break (265): no loot spawns, no XP, no tool wear.
    const cleanBreak = !this.dropsLoot();
    if (cleanBreak) stacks.length = 0;
    // Spawn the resolved drops as world item entities at the block center.
    const primaryDropId = stacks[0]?.item;
    if (!cleanBreak && this.itemEntities && stacks.length > 0) {
      const spawn = createSpawnPosition(this.target.blockX, this.target.blockY, this.target.blockZ);
      this.itemEntities.spawnLootStacks(stacks, spawn.x, spawn.y, spawn.z, this.rng);
      if (this.xpOrbs && this.xpOrbValue > 0) {
        this.xpOrbs.spawnXpOrb(this.xpOrbValue, spawn.x, spawn.y, spawn.z, {
          vy: CONFIG.xp.orbSpawnUpVelocity,
        });
      }
    }

    if (!cleanBreak && selectedTool?.maxDurability !== undefined && this.selector.damageSelectedItem) {
      const unbreakingLevel = selectedStack && this.enchantmentRegistry
        ? getEnchantmentLevel(selectedStack, 'unbreaking', this.enchantmentRegistry)
        : 0;
      if (this.selector.damageSelectedItem(1, selectedTool.maxDurability, unbreakingLevel, this.rng ?? Math.random)) {
        this.onToolBreak?.();
      }
    }
    this.onAction?.('break', primaryDropId, {
      x: this.target.blockX,
      y: this.target.blockY,
      z: this.target.blockZ,
    });
    this.lastActionTime = this.elapsed;
    this.resetBreakProgress();
  }

  /** Level of `key` on the selected stack, or 0 when no registry/stack enchant. */
  private selectedEnchantLevel(key: string): number {
    if (!this.enchantmentRegistry) return 0;
    const stack = this.selector.getSelectedStack?.() ?? null;
    if (!stack) return 0;
    return getEnchantmentLevel(stack, key, this.enchantmentRegistry);
  }

  /** Item id for a block's own item form, or undefined when it has none. */
  private blockItemId(def: BlockTypeDefinition): number | undefined {
    try {
      return this.itemRegistry.getByResourceId(def.resourceId).id;
    } catch {
      return undefined;
    }
  }

  /** Resolve the effective break duration, applying the selected tool + Efficiency bonus. */
  private getBreakDuration(def: BlockTypeDefinition, efficiencyLevel = 0): number {
    const tool = this.itemRegistry.getByLegacyId(this.selector.getSelectedItemId());
    if (this.harvestRules) {
      return this.harvestRules.getBreakDuration(def, tool, efficiencyLevel);
    }
    // Legacy fallback retained for callers that do not inject harvest rules
    // (prior behavior: speed bonus only for the exact preferred tool with a
    // non-empty slot).
    let duration = def.hardness;
    if (
      def.preferredTool !== undefined &&
      tool?.toolKind === def.preferredTool &&
      tool?.toolPower !== undefined &&
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
    const selectedId = this.selector.getSelectedItemId();
    const selected = this.itemRegistry.getByLegacyId(selectedId);
    if (!selected || !selected.placeBlock) {
      this.onAction?.('blocked', selectedId);
      return false;
    }
    if (this.selector.getSlotCount && this.selector.getSlotCount() <= 0) {
      this.onAction?.('empty', selectedId);
      return false;
    }

    // Adventure/spectator permission gate (266): resolve the placed block id
    // first; unknown or denied ids refuse BEFORE any stack consume (I-3).
    let permissionId: number;
    try {
      permissionId = this.registry.getByResourceId(selected.placeBlock).id;
    } catch {
      this.onAction?.('blocked', selectedId);
      return false;
    }
    if (!this.canPlace(permissionId)) {
      this.onAction?.('blocked', selectedId);
      return false;
    }

    // Placement cell is the targeted block offset by the face normal.
    const bx = Math.floor(this.target.blockX + this.target.nx);
    const by = Math.floor(this.target.blockY + this.target.ny);
    const bz = Math.floor(this.target.blockZ + this.target.nz);

    // Guard against placement outside the world's vertical bounds (dimension-aware via OVERWORLD_DIMENSION_TYPE;
    // World/WorldAccess will also reject, but rejecting here avoids phantom-edit). Replace hard literal with dimension check.
    if (!OVERWORLD_DIMENSION_TYPE.containsY(by)) {
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

    // Creative no-deplete (265): placing never consumes the held stack (the
    // empty-hand guard above still refuses placement with nothing selected).
    if (this.depletesItems() && this.selector.consumeSelected && !this.selector.consumeSelected()) {
      return false;
    }
    const targetBlockId = permissionId;
    this.world.setBlock(bx, by, bz, targetBlockId);
    if (this.world.getBlock(bx, by, bz) !== targetBlockId) {
      this.selector.addItem?.(selectedId, 1);
      this.onAction?.('blocked', selectedId);
      return false;
    }
    this.onAction?.('place', selectedId, { x: bx, y: by, z: bz });
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
