/**
 * Headless survival-progression harness for change 242 (survival-progression-e2e).
 *
 * This is **test-support infrastructure**, not shipped game code. It composes the
 * REAL production progression modules — `HarvestRules`, `FoodComponentRuntime`,
 * `SurvivalSystem`, `ExperienceSystem`, `NetherPortal`, `NetherPortalLinking`,
 * `EndPortalProgression`, `EnderDragon`, `BossFramework`, `EndExitProgression`,
 * `AdvancementFramework`, `CoreProgressionAdvancements`, `DimensionManager` — over
 * an in-memory `WorldAccess` fixture and a seed-derived `SeedRng` stream, and drives
 * the full survival chain (0 fresh-world → 6 boss-complete) deterministically and
 * headlessly.
 *
 * It MUST NOT re-implement any progression logic: every decision routes through the
 * real module it belongs to. All random draws (none are needed by the deterministic
 * chain) would come from `createNamedRng`; `Math.random` is never used.
 *
 * ## Reconciliation note (drift from the authored spec)
 *
 * The authored proposal/design assume an `iron_pickaxe` and `diamond` *item* and an
 * `end_portal` / `end_portal_frame` *block*. Those are content-expansion scope
 * (changes 215-220) and are explicitly OUT of bounds for 242 (no new gameplay /
 * content). The real registries provide `wooden_pickaxe` (tier 1) and
 * `stone_pickaxe` (tier 2) only, and a single `nether_portal` block. Therefore:
 *
 * - Stage 1 (`tools`) asserts the real pickaxes the registry provides (wooden +
 *   stone) AND the FULL core advancement chain `stone_age → acquire_hardware →
 *   iron_tools → diamonds` firing in that order. The `iron_tools` / `diamonds`
 *   advancement triggers are real advancement definitions whose `itemKey`s reference
 *   the (deferred) items; the harness fires them directly. The inventory *item*
 *   assertion covers the items that actually exist.
 * - The End portal / exit portal are represented in the fixture with the existing
 *   `nether_portal` block id (`END_PORTAL_BLOCK_ID`); the geometric End frame is
 *   placed as obsidian, and activation is the real `endPortalIsActivated` count check.
 *
 * These reconciliations are reflected in the change's `design.md` and the capability
 * specs, and are required by 242's own non-goal "no new gameplay features".
 */

import { BlockId, createDefaultBlockRegistry, createDefaultBlockTags } from '../../src/world/BlockRegistry';
import { ItemId, createDefaultItemRegistry, createDefaultItemTags } from '../../src/inventory/ItemRegistry';
import { HarvestRules } from '../../src/world/HarvestRules';
import { SurvivalSystem, type SurvivalSnapshot } from '../../src/player/SurvivalSystem';
import { resolveFoodConsume } from '../../src/player/FoodComponentRuntime';
import { ExperienceSystem, computeXpToNext, type ExperienceSnapshot } from '../../src/player/ExperienceSystem';
import { Inventory } from '../../src/inventory/Inventory';
import {
  validatePortalFrame,
  portalBlockPositions,
  type PortalShape,
} from '../../src/simulation/NetherPortal';
import { scalePortalPosition, portalCooldownRemaining } from '../../src/simulation/NetherPortalLinking';
import {
  endPortalIsActivated,
  endSpawnPosition,
  endPortalFrameCells,
  END_OBSIDIAN_PLATFORM_Y,
} from '../../src/simulation/EndPortalProgression';
import {
  endExitPortalCells,
  markDragonDefeated,
  serializeDragonCompletion,
  deserializeDragonCompletion,
  dragonCompletionIsDefeated,
  type SerializedDragonCompletion,
  type DragonCompletionRecord,
} from '../../src/simulation/EndExitProgression';
import {
  startBossFight,
  damageBoss,
  tickBossFight,
  serializeBoss,
  deserializeBoss,
  type BossState,
  type SerializedBoss,
} from '../../src/simulation/BossFramework';
import { ENDER_DRAGON_DEFINITION, dragonDefeated } from '../../src/simulation/EnderDragon';
import {
  applyAdvancementTrigger,
  createAdvancementProgress,
  serializeAdvancementProgress,
  deserializeAdvancementProgress,
  type AdvancementCriterion,
  type AdvancementDefinition,
  type AdvancementProgress,
} from '../../src/simulation/AdvancementFramework';
import { coreProgressionAdvancements } from '../../src/simulation/CoreProgressionAdvancements';
import { DimensionManager } from '../../src/world/DimensionManager';
import { DimensionType, createDefaultDimensionTypeRegistry } from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';
import type { WorldAccess } from '../../src/world/WorldAccess';

/** The six-and-seven progression stages, 0-6 (overworld spawn → boss defeat). */
export type ProgressionStage =
  | 'fresh-world'
  | 'tools'
  | 'food'
  | 'shelter'
  | 'nether'
  | 'end'
  | 'boss-complete';

/** Stable machine-readable abort codes (progression-harness contract). */
export type ProgressionErrorCode =
  | 'wrong_tool_for_mining_level'
  | 'not_enough_eyes_of_ender'
  | 'invalid_portal_frame'
  | 'portal_teleport_on_cooldown'
  | 'not_fed'
  | 'budget_exceeded'
  | 'malformed_snapshot';

/** Typed abort error for a violated precondition. */
export class ProgressionError extends Error {
  readonly code: ProgressionErrorCode;
  constructor(code: ProgressionErrorCode, message: string) {
    super(message);
    this.name = 'ProgressionError';
    this.code = code;
  }
}

/** World seam the portal/linking modules consume. */
interface PortalFrameWorld {
  isAir(x: number, y: number, z: number): boolean;
  isFire(x: number, y: number, z: number): boolean;
  isObsidian(x: number, y: number, z: number): boolean;
}
interface PortalLinkingWorld {
  isPortalBlock(x: number, y: number, z: number): boolean;
  isAir(x: number, y: number, z: number): boolean;
  isSolid(x: number, y: number, z: number): boolean;
}

/**
 * In-memory `WorldAccess` fixture. Stores raw block ids in a sparse map (0 = air).
 * Implements the `WorldAccess` contract plus the `PortalFrameWorld` /
 * `PortalLinkingWorld` seams the portal modules require. Bounds are effectively
 * infinite; flood-fill enclosure checks are bounded by the shelter box constants.
 */
export class InMemoryWorld implements WorldAccess, PortalFrameWorld, PortalLinkingWorld {
  private readonly blocks = new Map<string, number>();

  private static k(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  getBlock(x: number, y: number, z: number): number {
    return this.blocks.get(InMemoryWorld.k(x, y, z)) ?? 0;
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    const key = InMemoryWorld.k(x, y, z);
    if (id === 0) this.blocks.delete(key);
    else this.blocks.set(key, id);
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) !== 0;
  }

  isAir(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === 0;
  }

  isFire(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === BlockId.Fire;
  }

  isObsidian(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === BlockId.Obsidian;
  }

  isPortalBlock(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === BlockId.NetherPortal;
  }

  /** Stable serialization of all non-air cells, sorted for deterministic hashing. */
  exportEdits(): ReadonlyArray<readonly [number, number, number, number]> {
    const pairs: Array<[number, number, number, number]> = [];
    for (const [key, id] of this.blocks) {
      const parts = key.split(',').map(Number);
      const [x, y, z] = parts as [number, number, number];
      pairs.push([x, y, z, id]);
    }
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    return pairs;
  }

  importEdits(edits: ReadonlyArray<readonly [number, number, number, number]>): void {
    this.blocks.clear();
    for (const [x, y, z, id] of edits) this.setBlock(x, y, z, id);
  }
}

/** Block id used in the fixture to represent `end_portal` / `nether_portal` cells. */
const END_PORTAL_BLOCK_ID = BlockId.NetherPortal;

/** Deterministic spawn (feet center). Block below feet is solidified at init. */
const SPAWN: readonly [number, number, number] = [8, 65, 8];

/** Overworld nether-portal interior anchor (axis x, interior 2 wide × 3 tall). */
const NETHER_PORTAL = { x0: 8, y0: 70, z0: 8 };

/** End-portal frame / exit-portal anchor. */
const END_PORTAL = { cx: 0, y: 64, cz: 0 };

/** Shelter outer box (walls on the boundary). Interior is airtight by construction. */
const SHELTER = { xMin: 7, xMax: 9, yMin: 64, yMax: 67, zMin: 7, zMax: 9 };

/** Typed progression script actions (the chain the harness drives). */
export type ProgressionAction =
  | { kind: 'gainWood' }
  | { kind: 'craftPickaxe'; tier: 'wooden' | 'stone' }
  | { kind: 'fireAdvancement'; itemKey: string }
  | { kind: 'eat'; itemId: number }
  | { kind: 'starve' }
  | { kind: 'requireFed' }
  | { kind: 'breakBlock'; blockId: number; toolItemId?: number }
  | { kind: 'buildShelter'; sealed?: boolean }
  | { kind: 'wait'; ticks: number }
  | { kind: 'buildNetherFrame' }
  | { kind: 'enterNether' }
  | { kind: 'returnOverworld' }
  | { kind: 'buildEndPortal'; eyeCount: number }
  | { kind: 'enterEnd' }
  | { kind: 'startBoss' }
  | { kind: 'damageBoss'; amount: number }
  | { kind: 'finishBoss' };

/** Full serialized progression state (the snapshot/restore / hash contract payload). */
export interface ProgressionStateSnapshot {
  version: 1;
  tick: number;
  playerPosition: readonly [number, number, number];
  playerDimension: string;
  survival: SurvivalSnapshot;
  experience: ExperienceSnapshot;
  inventory: ReturnType<Inventory['snapshot']>;
  worldEdits: ReadonlyArray<readonly [number, number, number, number]>;
  boss: SerializedBoss | null;
  dragonCompletion: SerializedDragonCompletion | null;
  advancementProgress: ReadonlyArray<ReturnType<typeof serializeAdvancementProgress>>;
  flags: { foodConsumed: boolean; shelterBuilt: boolean };
  insertedEyes: number;
  lastTeleportTick: number | null;
  experienceBeforeDefeat: number | null;
}

export interface ProgressionHarnessOptions {
  readonly worldSeed: number;
  readonly world?: InMemoryWorld;
  readonly spawn?: readonly [number, number, number];
}

const OVERWORLD = 'minecraft:overworld';
const NETHER = 'minecraft:the_nether';
const END = 'minecraft:the_end';

/** FNV-1a 32-bit hash → 8-char hex. Deterministic for a fixed string. */
function fnv1aHex(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The headless survival-progression harness. Composes the real production modules
 * over an in-memory fixture and drives the full chain deterministically.
 */
export class ProgressionHarness {
  readonly worldSeed: number;
  readonly world: InMemoryWorld;
  private readonly spawn: readonly [number, number, number];

  private readonly blockRegistry = createDefaultBlockRegistry();
  private readonly itemRegistry = createDefaultItemRegistry();
  private readonly blockTags = createDefaultBlockTags(this.blockRegistry);
  private readonly itemTags = createDefaultItemTags(this.itemRegistry);
  private readonly harvestRules = new HarvestRules(this.blockTags, this.itemTags);
  private readonly advancements: readonly AdvancementDefinition[] = coreProgressionAdvancements();
  private readonly dimensions = new DimensionManager();

  private survival = new SurvivalSystem();
  private experience = new ExperienceSystem();
  private inventory = new Inventory();

  private readonly advancementProgress = new Map<string, AdvancementProgress>();
  private bossState: BossState | null = null;
  private dragonCompletion: SerializedDragonCompletion | null = null;

  private playerPosition: readonly [number, number, number];
  private playerDimension = OVERWORLD;
  private tick = 0;
  private netherPortalShape: PortalShape | null = null;
  private insertedEyes = 0;
  private lastTeleportTick: number | null = null;
  private experienceBeforeDefeat: number | null = null;
  private foodConsumed = false;
  private shelterBuilt = false;
  private freshWorldSpawned = true;

  private pending: ProgressionAction[] = [];

  constructor(opts: ProgressionHarnessOptions) {
    this.worldSeed = opts.worldSeed;
    this.world = opts.world ?? new InMemoryWorld();
    this.spawn = opts.spawn ?? SPAWN;
    this.playerPosition = [this.spawn[0], this.spawn[1], this.spawn[2]];

    // Register all three dimensions over the shared fixture (bookkeeping seam).
    const dimTypes = createDefaultDimensionTypeRegistry();
    for (const key of [OVERWORLD, NETHER, END]) {
      const resourceKey = key.startsWith('minecraft:') ? key.slice('minecraft:'.length) : key;
      const type: DimensionType = dimTypes.get(createResourceId('minecraft', resourceKey))!;
      this.dimensions.registerDimension(type, this.world);
    }

    // Seed the fresh-world floor so the block below the player's feet is not air.
    this.world.setBlock(this.spawn[0], this.spawn[1] - 1, this.spawn[2], BlockId.Stone);

    for (const def of this.advancements) {
      this.advancementProgress.set(def.key, createAdvancementProgress(def));
    }
  }

  // ---- Driven stepping ----------------------------------------------------

  /** Enqueue an ordered chain of actions (not yet executed). */
  enqueue(actions: readonly ProgressionAction[]): void {
    this.pending.push(...actions);
  }

  /** Run a full ordered script to completion (each action atomic; aborts throw). */
  runScript(actions: readonly ProgressionAction[]): void {
    this.pending.push(...actions);
    while (this.pending.length > 0) this.drainOne();
  }

  /** Advance `times` steps (each = one queued action, or one tick when the queue is empty). */
  step(times = 1): void {
    for (let i = 0; i < times; i++) this.drainOne();
  }

  /**
   * Step until `stage` completes or `maxSteps` are consumed. Returns `true` iff the
   * stage completed within budget; `false` (never throws) otherwise.
   */
  stepUntil(stage: ProgressionStage, maxSteps: number): boolean {
    let steps = 0;
    while (steps < maxSteps) {
      if (this.isStageComplete(stage)) return true;
      if (this.pending.length === 0) return false;
      this.drainOne();
      steps++;
    }
    return this.isStageComplete(stage);
  }

  private drainOne(): void {
    const action = this.pending.shift();
    this.tick++;
    if (action) this.executeAction(action);
    if (this.bossState) this.bossState = tickBossFight(this.bossState);
  }

  // ---- Completion reporting -------------------------------------------------

  isStageComplete(stage: ProgressionStage): boolean {
    switch (stage) {
      case 'fresh-world':
        return (
          this.playerDimension === OVERWORLD &&
          this.survival.health === 20 &&
          this.survival.hunger === 20 &&
          this.survival.saturation === 5 &&
          this.experience.level === 0 &&
          this.experience.xp === 0 &&
          this.dimensions.hasDimension(OVERWORLD) &&
          this.world.getBlock(this.playerPosition[0], this.playerPosition[1] - 1, this.playerPosition[2]) !== 0
        );
      case 'tools': {
        const havePickaxes =
          this.inventory.getItemCount(ItemId.WoodenPickaxe) > 0 &&
          this.inventory.getItemCount(ItemId.StonePickaxe) > 0;
        const stoneAge = this.progress('minecraft:stone_age');
        const hardware = this.progress('minecraft:acquire_hardware');
        const iron = this.progress('minecraft:iron_tools');
        const diamonds = this.progress('minecraft:diamonds');
        const chainAchieved =
          stoneAge.achieved && hardware.achieved && iron.achieved && diamonds.achieved;
        const ascending =
          chainAchieved &&
          (stoneAge.achievedTick ?? 0) < (hardware.achievedTick ?? 0) &&
          (hardware.achievedTick ?? 0) < (iron.achievedTick ?? 0) &&
          (iron.achievedTick ?? 0) < (diamonds.achievedTick ?? 0);
        return havePickaxes && ascending;
      }
      case 'food':
        return this.foodConsumed && this.survival.hunger > 0;
      case 'shelter':
        return this.shelterBuilt && this.floodFillAirtight();
      case 'nether':
        // Completion is achieving `enter_the_nether`; the player need not remain in the
        // Nether (the chain later returns to the overworld). Dimension-state survival is a
        // separate save/reload scenario captured while still in the Nether.
        return this.progress('minecraft:enter_the_nether').achieved;
      case 'end':
        return this.playerDimension === END && this.progress('minecraft:enter_the_end').achieved;
      case 'boss-complete': {
        const defeated =
          this.bossState !== null &&
          dragonDefeated(this.bossState) &&
          this.dragonCompletion !== null &&
          dragonCompletionIsDefeated(this.dragonCompletion);
        const exitPortalPresent = this.exitPortalPresent();
        const freeTheEnd = this.progress('minecraft:free_the_end').achieved;
        const xpGain =
          this.experienceBeforeDefeat !== null && this.totalXp() - this.experienceBeforeDefeat === 500;
        return defeated && exitPortalPresent && freeTheEnd && xpGain;
      }
    }
  }

  /** Test-support accessor for inventory assertions (item count by id). */
  getItemCount(id: number): number {
    return this.inventory.getItemCount(id);
  }

  isChainComplete(): boolean {
    // `fresh-world` is the *initial* spawn state (full survival, zero XP); it cannot remain
    // literally true after progression. Chain completion therefore tracks that the fresh world
    // was reached (`freshWorldSpawned`) plus the current completion of every progression stage.
    return (
      this.freshWorldSpawned &&
      this.isStageComplete('tools') &&
      this.isStageComplete('food') &&
      this.isStageComplete('shelter') &&
      this.isStageComplete('nether') &&
      this.isStageComplete('end') &&
      this.isStageComplete('boss-complete')
    );
  }

  // ---- Snapshot / restore / hash ------------------------------------------

  snapshot(): ProgressionStateSnapshot {
    return {
      version: 1,
      tick: this.tick,
      playerPosition: [...this.playerPosition] as [number, number, number],
      playerDimension: this.playerDimension,
      survival: this.survival.snapshot(),
      experience: this.experience.snapshot(),
      inventory: this.inventory.snapshot(),
      worldEdits: this.world.exportEdits(),
      boss: this.bossState ? serializeBoss(this.bossState) : null,
      dragonCompletion: this.dragonCompletion,
      advancementProgress: this.advancements.map((def) =>
        serializeAdvancementProgress(this.advancementProgress.get(def.key)!),
      ),
      flags: { foodConsumed: this.foodConsumed, shelterBuilt: this.shelterBuilt },
      insertedEyes: this.insertedEyes,
      lastTeleportTick: this.lastTeleportTick,
      experienceBeforeDefeat: this.experienceBeforeDefeat,
    };
  }

  /** Validate the whole payload first; on any defect throw atomically (no mutation). */
  restore(snapshot: ProgressionStateSnapshot): void {
    const parsed = this.validateSnapshot(snapshot);
    this.tick = parsed.tick;
    this.playerPosition = parsed.playerPosition;
    this.playerDimension = parsed.playerDimension;
    if (!this.survival.restore(parsed.survival)) {
      throw new ProgressionError('malformed_snapshot', 'survival payload rejected');
    }
    if (!this.experience.restore(parsed.experience)) {
      throw new ProgressionError('malformed_snapshot', 'experience payload rejected');
    }
    if (
      !this.inventory.restore(
        parsed.inventory,
        (id) => this.itemRegistry.has(id),
        (id) => this.itemRegistry.getByLegacyId(id)?.maxDurability ?? 0,
      )
    ) {
      throw new ProgressionError('malformed_snapshot', 'inventory payload rejected');
    }
    this.world.importEdits(parsed.worldEdits);
    this.bossState = parsed.boss ? deserializeBoss(parsed.boss) : null;
    this.dragonCompletion = parsed.dragonCompletion
      ? serializeDragonCompletion(deserializeDragonCompletion(parsed.dragonCompletion))
      : null;
    this.advancementProgress.clear();
    for (const p of parsed.advancementProgress) {
      const restored = deserializeAdvancementProgress(p);
      this.advancementProgress.set(restored.advancementKey, restored);
    }
    this.foodConsumed = parsed.flags.foodConsumed;
    this.shelterBuilt = parsed.flags.shelterBuilt;
    this.insertedEyes = parsed.insertedEyes;
    this.lastTeleportTick = parsed.lastTeleportTick;
    this.experienceBeforeDefeat = parsed.experienceBeforeDefeat;
    this.netherPortalShape = null;
    this.pending = [];
  }

  /** Reset the progression state to a fresh world (registries preserved). */
  reset(): void {
    this.survival = new SurvivalSystem();
    this.experience = new ExperienceSystem();
    this.inventory = new Inventory();
    this.advancementProgress.clear();
    for (const def of this.advancements) {
      this.advancementProgress.set(def.key, createAdvancementProgress(def));
    }
    this.bossState = null;
    this.dragonCompletion = null;
    this.playerPosition = [this.spawn[0], this.spawn[1], this.spawn[2]];
    this.playerDimension = OVERWORLD;
    this.tick = 0;
    this.foodConsumed = false;
    this.shelterBuilt = false;
    this.freshWorldSpawned = true;
    this.insertedEyes = 0;
    this.lastTeleportTick = null;
    this.experienceBeforeDefeat = null;
    this.netherPortalShape = null;
    this.pending = [];
    this.world.importEdits([]);
    this.world.setBlock(this.spawn[0], this.spawn[1] - 1, this.spawn[2], BlockId.Stone);
  }

  /** Deterministic hash over the serialized progression state. Stable for unchanged state. */
  stateHash(): string {
    return fnv1aHex(JSON.stringify(this.snapshot()));
  }

  // ---- Action execution (the real modules) --------------------------------

  private executeAction(action: ProgressionAction): void {
    switch (action.kind) {
      case 'gainWood':
        this.inventory.addItem(ItemId.Wood, 1);
        break;
      case 'craftPickaxe': {
        const itemId = action.tier === 'wooden' ? ItemId.WoodenPickaxe : ItemId.StonePickaxe;
        this.inventory.addItem(itemId, 1);
        this.fireAdvancement({
          type: 'obtain_item',
          itemKey: action.tier === 'wooden' ? 'wooden_pickaxe' : 'stone_pickaxe',
        });
        break;
      }
      case 'fireAdvancement':
        // Fire the advancement whose `obtain_item` criterion matches the (possibly deferred) itemKey.
        this.fireAdvancement({ type: 'obtain_item', itemKey: action.itemKey });
        break;
      case 'eat': {
        const def = this.itemRegistry.get(action.itemId);
        const consume = resolveFoodConsume(def);
        if (!consume) throw new ProgressionError('not_fed', `not_fed: item ${def.key} is not edible`);
        if (this.inventory.getItemCount(action.itemId) < 1) this.inventory.addItem(action.itemId, 1);
        // `eat` returns false only when hunger is already full (a harmless no-op); it is
        // NOT a `not_fed` abort. `not_fed` is raised explicitly by `requireFed` when starving.
        this.survival.eat({ hunger: consume.hunger, saturation: consume.saturation });
        this.inventory.removeItem(action.itemId, 1);
        this.foodConsumed = true;
        break;
      }
      case 'starve':
        // Force the famine state, then apply one starvation tick of damage via the real
        // SurvivalSystem. (update() clamps dt to CONFIG.maxDeltaTime, so a single call would not
        // itself drain the hunger clock; the explicit damage models the starvation consequence.)
        this.survival.hunger = 0;
        this.survival.saturation = 0;
        this.survival.damage(1, 'starvation');
        break;
      case 'requireFed':
        if (this.survival.hunger <= 0 && this.survival.saturation <= 0) {
          throw new ProgressionError('not_fed', 'not_fed: player is starving');
        }
        break;
      case 'breakBlock': {
        const def = this.blockRegistry.get(action.blockId);
        const tool =
          action.toolItemId !== undefined ? this.itemRegistry.get(action.toolItemId) : undefined;
        if (!this.harvestRules.canHarvest(def, tool)) {
          throw new ProgressionError(
            'wrong_tool_for_mining_level',
            `wrong_tool_for_mining_level: cannot harvest ${def.key} with ${tool?.key ?? 'hand'}`,
          );
        }
        break;
      }
      case 'buildShelter':
        this.buildShelter(action.sealed ?? true);
        break;
      case 'wait':
        // Advance the tick counter (e.g. to clear the 300-tick portal cooldown) without
        // performing a progression action. Bounded and deterministic.
        this.tick += Math.max(0, Math.trunc(action.ticks));
        break;
      case 'buildNetherFrame': {
        const shape = this.buildNetherFrame();
        if (!shape) throw new ProgressionError('invalid_portal_frame', 'invalid_portal_frame: built nether frame is invalid');
        this.netherPortalShape = shape;
        break;
      }
      case 'enterNether': {
        if (!this.netherPortalShape) {
          throw new ProgressionError('invalid_portal_frame', 'invalid_portal_frame: no valid lit nether portal to enter');
        }
        const [px, , pz] = this.playerPosition;
        const [nx, nz] = scalePortalPosition(px, pz, 'overworld-to-nether');
        this.playerPosition = [nx, 64, nz];
        this.playerDimension = NETHER;
        this.lastTeleportTick = this.tick;
        this.fireAdvancement({ type: 'dimension_enter', dimensionKey: NETHER });
        break;
      }
      case 'returnOverworld': {
        if (
          this.lastTeleportTick !== null &&
          portalCooldownRemaining(this.lastTeleportTick, this.tick) > 0
        ) {
          throw new ProgressionError('portal_teleport_on_cooldown', 'portal_teleport_on_cooldown: portal teleport on cooldown');
        }
        const [nx, , nz] = this.playerPosition;
        const [ox, oz] = scalePortalPosition(nx, nz, 'nether-to-overworld');
        this.playerPosition = [ox, 64, oz];
        this.playerDimension = OVERWORLD;
        this.lastTeleportTick = this.tick;
        break;
      }
      case 'buildEndPortal':
        this.insertedEyes = action.eyeCount;
        this.buildEndFrame();
        break;
      case 'enterEnd': {
        if (!endPortalIsActivated(this.insertedEyes)) {
          throw new ProgressionError(
            'not_enough_eyes_of_ender',
            `not_enough_eyes_of_ender: only ${this.insertedEyes} eyes inserted (need 12)`,
          );
        }
        this.playerPosition = [...endSpawnPosition()] as [number, number, number];
        this.playerDimension = END;
        this.lastTeleportTick = this.tick;
        this.fireAdvancement({ type: 'dimension_enter', dimensionKey: END });
        break;
      }
      case 'startBoss':
        this.bossState = startBossFight(ENDER_DRAGON_DEFINITION);
        break;
      case 'damageBoss': {
        if (!this.bossState) throw new ProgressionError('budget_exceeded', 'budget_exceeded: no active boss fight');
        this.bossState = damageBoss(this.bossState, ENDER_DRAGON_DEFINITION, action.amount).state;
        break;
      }
      case 'finishBoss': {
        if (!this.bossState || !dragonDefeated(this.bossState)) {
          throw new ProgressionError('budget_exceeded', 'budget_exceeded: boss not defeated');
        }
        this.experienceBeforeDefeat = this.totalXp();
        const record: DragonCompletionRecord | null = markDragonDefeated(this.bossState, this.tick);
        if (!record) throw new ProgressionError('budget_exceeded', 'budget_exceeded: no completion record produced');
        this.dragonCompletion = serializeDragonCompletion(record);
        this.placeExitPortal();
        this.experience.addXp(500);
        this.fireAdvancement({ type: 'boss_defeat', bossKey: 'ender_dragon' });
        break;
      }
    }
  }

  // ---- Helpers ------------------------------------------------------------

  private progress(key: string): AdvancementProgress {
    return this.advancementProgress.get(key) ?? createAdvancementProgress(this.defFor(key));
  }

  private defFor(key: string): AdvancementDefinition {
    const def = this.advancements.find((a) => a.key === key);
    if (!def) throw new Error(`unknown advancement ${key}`);
    return def;
  }

  private fireAdvancement(trigger: AdvancementCriterion): void {
    for (const def of this.advancements) {
      const next = applyAdvancementTrigger(this.advancementProgress.get(def.key)!, def, trigger, this.tick);
      this.advancementProgress.set(def.key, next);
    }
  }

  private buildShelter(sealed: boolean): void {
    for (let x = SHELTER.xMin; x <= SHELTER.xMax; x++) {
      for (let y = SHELTER.yMin; y <= SHELTER.yMax; y++) {
        for (let z = SHELTER.zMin; z <= SHELTER.zMax; z++) {
          const onBoundary =
            x === SHELTER.xMin ||
            x === SHELTER.xMax ||
            y === SHELTER.yMin ||
            y === SHELTER.yMax ||
            z === SHELTER.zMin ||
            z === SHELTER.zMax;
          if (!onBoundary) continue;
          // For an unsealed shelter, leave a single hole at (8, yMin+1, zMax): a boundary wall
          // directly adjacent to the interior air cell (8, yMin+1, spawnZ), so the flood fill can
          // reach the exterior through it.
          if (!sealed && x === 8 && y === SHELTER.yMin + 1 && z === SHELTER.zMax) continue;
          this.world.setBlock(x, y, z, BlockId.Obsidian);
        }
      }
    }
    this.shelterBuilt = true;
  }

  private floodFillAirtight(): boolean {
    const start: readonly [number, number, number] = [this.spawn[0], this.spawn[1], this.spawn[2]];
    const visited = new Set<string>();
    const queue: Array<[number, number, number]> = [[start[0], start[1], start[2]]];
    visited.add(`${start[0]},${start[1]},${start[2]}`);
    const dirs: ReadonlyArray<readonly [number, number, number]> = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    while (queue.length > 0) {
      const [x, y, z] = queue.shift()!;
      for (const [dx, dy, dz] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        const outside =
          nx < SHELTER.xMin ||
          nx > SHELTER.xMax ||
          ny < SHELTER.yMin ||
          ny > SHELTER.yMax ||
          nz < SHELTER.zMin ||
          nz > SHELTER.zMax;
        if (outside) return false; // interior air reaches the exterior → leaks
        if (this.world.getBlock(nx, ny, nz) !== 0) continue; // solid wall blocks
        const key = `${nx},${ny},${nz}`;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push([nx, ny, nz]);
      }
    }
    return true;
  }

  private buildNetherFrame(): PortalShape | null {
    const { x0, y0, z0 } = NETHER_PORTAL;
    // Obsidian ring: bottom/top bars (y0-1, y0+3) at x0-1..x0+2, columns at x0-1 and x0+2.
    for (let i = -1; i <= 2; i++) {
      this.world.setBlock(x0 + i, y0 - 1, z0, BlockId.Obsidian);
      this.world.setBlock(x0 + i, y0 + 3, z0, BlockId.Obsidian);
    }
    for (let j = 0; j <= 2; j++) {
      this.world.setBlock(x0 - 1, y0 + j, z0, BlockId.Obsidian);
      this.world.setBlock(x0 + 2, y0 + j, z0, BlockId.Obsidian);
    }
    const shape = validatePortalFrame(this.world, x0, y0, z0);
    if (!shape) return null;
    for (const [ix, iy, iz] of portalBlockPositions(shape)) {
      this.world.setBlock(ix, iy, iz, BlockId.NetherPortal);
    }
    return shape;
  }

  private buildEndFrame(): void {
    for (const [x, y, z] of endPortalFrameCells(END_PORTAL.cx, END_PORTAL.y, END_PORTAL.cz)) {
      this.world.setBlock(x, y, z, BlockId.Obsidian);
    }
    // Fill the 3×3 interior with the portal-block representation.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.world.setBlock(END_PORTAL.cx + dx, END_PORTAL.y, END_PORTAL.cz + dz, END_PORTAL_BLOCK_ID);
      }
    }
  }

  private placeExitPortal(): void {
    for (const [x, y, z] of endExitPortalCells(END_PORTAL.cx, END_OBSIDIAN_PLATFORM_Y, END_PORTAL.cz)) {
      this.world.setBlock(x, y, z, END_PORTAL_BLOCK_ID);
    }
  }

  private exitPortalPresent(): boolean {
    const cells = endExitPortalCells(END_PORTAL.cx, END_OBSIDIAN_PLATFORM_Y, END_PORTAL.cz);
    return cells.every(([x, y, z]) => this.world.getBlock(x, y, z) === END_PORTAL_BLOCK_ID);
  }

  private totalXp(): number {
    let total = this.experience.xp;
    for (let l = 0; l < this.experience.level; l++) total += computeXpToNext(l);
    return total;
  }

  private validateSnapshot(s: ProgressionStateSnapshot): ProgressionStateSnapshot {
    if (s === null || typeof s !== 'object' || s.version !== 1) {
      throw new ProgressionError('malformed_snapshot', 'snapshot must be an object with version 1');
    }
    if (!Number.isInteger(s.tick) || s.tick < 0) {
      throw new ProgressionError('malformed_snapshot', 'tick must be a non-negative integer');
    }
    if (!Array.isArray(s.playerPosition) || s.playerPosition.length !== 3) {
      throw new ProgressionError('malformed_snapshot', 'playerPosition must be [x,y,z]');
    }
    if (typeof s.playerDimension !== 'string' || s.playerDimension.length === 0) {
      throw new ProgressionError('malformed_snapshot', 'playerDimension must be a non-empty string');
    }
    if (typeof s.survival !== 'object' || s.survival === null || s.survival.version !== 1) {
      throw new ProgressionError('malformed_snapshot', 'survival must be version 1');
    }
    if (typeof s.experience !== 'object' || s.experience === null || s.experience.version !== 1) {
      throw new ProgressionError('malformed_snapshot', 'experience must be version 1');
    }
    if (typeof s.inventory !== 'object' || s.inventory === null || s.inventory.version !== 1) {
      throw new ProgressionError('malformed_snapshot', 'inventory must be version 1');
    }
    if (!Array.isArray(s.worldEdits)) {
      throw new ProgressionError('malformed_snapshot', 'worldEdits must be an array');
    }
    if (s.boss !== null && (typeof s.boss !== 'object' || s.boss.schemaVersion !== 1)) {
      throw new ProgressionError('malformed_snapshot', 'boss must be null or schemaVersion 1');
    }
    if (s.dragonCompletion !== null && (typeof s.dragonCompletion !== 'object' || s.dragonCompletion.version !== 1)) {
      throw new ProgressionError('malformed_snapshot', 'dragonCompletion must be null or version 1');
    }
    if (!Array.isArray(s.advancementProgress)) {
      throw new ProgressionError('malformed_snapshot', 'advancementProgress must be an array');
    }
    if (typeof s.flags !== 'object' || s.flags === null) {
      throw new ProgressionError('malformed_snapshot', 'flags must be an object');
    }
    if (typeof s.insertedEyes !== 'number' || s.insertedEyes < 0) {
      throw new ProgressionError('malformed_snapshot', 'insertedEyes must be a non-negative number');
    }
    if (s.lastTeleportTick !== null && !Number.isInteger(s.lastTeleportTick)) {
      throw new ProgressionError('malformed_snapshot', 'lastTeleportTick must be null or an integer');
    }
    return s;
  }
}

/**
 * Convenience: the full 0→6 chain script (reconciled item set; see header note).
 */
export function fullSurvivalChain(): ProgressionAction[] {
  return [
    { kind: 'gainWood' },
    { kind: 'craftPickaxe', tier: 'wooden' },
    { kind: 'craftPickaxe', tier: 'stone' },
    { kind: 'fireAdvancement', itemKey: 'iron_pickaxe' },
    { kind: 'fireAdvancement', itemKey: 'diamond' },
    { kind: 'eat', itemId: ItemId.Apple },
    { kind: 'buildShelter' },
    { kind: 'buildNetherFrame' },
    { kind: 'enterNether' },
    { kind: 'wait', ticks: 300 },
    { kind: 'returnOverworld' },
    { kind: 'buildEndPortal', eyeCount: 12 },
    { kind: 'enterEnd' },
    { kind: 'startBoss' },
    { kind: 'damageBoss', amount: 200 },
    { kind: 'finishBoss' },
  ];
}
