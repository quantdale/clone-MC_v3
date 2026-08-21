import * as THREE from 'three';
import { CONFIG } from '../config';
import { GameLoop } from './GameLoop';
import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { ResourceManager } from './ResourceManager';
import { Lighting } from '../rendering/Lighting';
import { Environment } from '../rendering/Environment';
import { TextureAtlas } from '../rendering/TextureAtlas';
import { Materials } from '../rendering/Materials';
import { BlockId, BlockRegistry, createDefaultBlockRegistry, createDefaultBlockTags } from '../world/BlockRegistry';
import {
  ItemTypeRegistry,
  ItemId,
  createDefaultItemRegistry,
  createDefaultItemTags,
  validateItemBlockCrossReferences,
} from '../inventory/ItemRegistry';
import { HarvestRules } from '../world/HarvestRules';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { ChunkMesher } from '../world/ChunkMesher';
import { World } from '../world/World';
import type { WorldEditSnapshot } from '../world/World';
import { BlockStateRegistry, createDefaultBlockStateRegistry } from '../world/BlockStateRegistry';
import { BlockBehaviorRegistry } from '../simulation/BlockBehavior';
import { CropBlockBehavior } from '../simulation/CropBehavior';
import { FarmlandBlockBehavior } from '../simulation/FarmlandBehavior';
import { FireBlockBehavior } from '../simulation/FireBehavior';
import { bonemealTarget } from '../simulation/Bonemeal';
import { RandomTickSelector } from '../simulation/RandomTickSelector';
import { WorldBlockAccess } from '../simulation/WorldBlockAccess';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { PlayerPhysics } from '../player/PlayerPhysics';
import { PlayerInteraction } from '../player/PlayerInteraction';
import type { InteractionAction } from '../player/PlayerInteraction';
import { ItemEntityManager } from '../simulation/ItemEntityManager';
import { XpOrbManager } from '../simulation/XpOrbManager';
import { LootTableRegistry, buildCurrentLootTables } from '../inventory/LootTable';
import { createDefaultEnchantmentRegistry, type EnchantmentRegistry } from '../inventory/EnchantmentRegistry';
import {
  createSession,
  type EnchantingTableSession,
  type EnchantApplyResult,
} from '../inventory/EnchantingTable';
import { Inventory } from '../inventory/Inventory';
import { Hotbar } from '../inventory/Hotbar';
import { Crosshair } from '../ui/Crosshair';
import { HUD } from '../ui/HUD';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { LoadingIndicator } from '../ui/LoadingIndicator';
import { DebugOverlay } from '../ui/DebugOverlay';
import { CraftingPanel } from '../ui/CraftingPanel';
import type { CraftingRecipe } from '../inventory/Crafting';
import { SurvivalSystem } from '../player/SurvivalSystem';
import type { SurvivalEvent } from '../player/SurvivalSystem';
import { resolveFoodConsume, applyConsumeEffects } from '../player/FoodComponentRuntime';
import { StatusEffectManager } from '../data/StatusEffectManager';
import { createDefaultStatusEffectRegistry } from '../data/StatusEffect';
import { createDefaultAttributeRegistry } from '../data/AttributeRegistry';
import { ExperienceSystem } from '../player/ExperienceSystem';
import { worldToChunk } from '../world/WorldCoordinates';
import { GameAudio } from '../audio/GameAudio';
import {
  GamePersistence,
  type GamePlayerSnapshot,
} from '../storage/GamePersistence';
import { WorldLife } from '../world/WorldLife';
import { createDefaultEntityRegistry } from '../data/EntityType';
import { createDefaultBiomeRegistry } from '../data/Biome';
import { createResourceId, type ResourceId } from '../data/ResourceId';
import {
  PassiveMobWorldAdapter,
  PassiveMobSystem,
  SPAWN_CAP,
  SPAWN_CYCLE_INTERVAL_TICKS,
  type ChunkCoord,
} from '../simulation/PassiveMobBaseline';
import { PassiveMobRenderer } from '../rendering/PassiveMobRenderer';
import {
  HostileMobSystem,
  HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS,
} from '../simulation/HostileMobBaseline';
import { HostileMobRenderer } from '../rendering/HostileMobRenderer';
import { BreedingSystem, type BreedableSpecies } from '../simulation/AnimalBreeding';
import {
  clearAll,
  resolveFrame,
  type DeviceFrame,
  type ResolvedInputFrame,
} from '../simulation/InputCoordinator';
import {
  gamepadFrame,
  keyboardActions,
  loadWithFallback,
  type RawGamepadSnapshot,
} from '../simulation/InputWiring';
import {
  createDefaultKeybindings,
  deserializeKeybindings,
  type KeybindingState,
} from '../simulation/KeybindingFramework';
import {
  createDefaultSettings,
  deserializeSettings,
} from '../simulation/SettingsFramework';
import {
  createDefaultAccessibility,
  deserializeAccessibility,
  type AccessibilityStore,
} from '../simulation/AccessibilityFramework';
import { resolveTouches, type TouchPoint } from '../simulation/TouchFramework';
import { FixedTickDriver } from './FixedTickDriver';
import { TICK_RATE } from './SimulationClock';
import { RenderInterpolator } from './RenderInterpolator';
import { RenderPerformanceMonitor } from '../rendering/RenderPerformanceMonitor';
import { BlockShapeTable } from '../world/VoxelShape';
import type { SelectionShapeWorld } from '../world/ShapeRaycast';

/**
 * Wires the entire game together: renderer, world, player, interaction, UI, and
 * the main loop. Owns the app lifecycle and disposes all resources on stop.
 *
 * Persistence (249-DL-001 / 249-DL-005): localStorage is no longer an
 * authoritative save path. All durable state flows through the
 * {@link GamePersistence} facade — either injected pre-opened via the
 * `bootstrap.persistence` option (the production `main.ts` path) or composed
 * internally via `createProductionGamePersistence` with `start()` gated on its
 * async open. Save failures surface through the `#save-status` banner instead
 * of failing silently.
 */

/**
 * The seed resolved from the URL ?seed= override, or the configured default.
 * Module-level so `main.ts` can resolve the same seed before constructing the
 * Game (it must open persistence with it first).
 */
export function resolveGameSeed(): number {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  if (seedParam !== null && seedParam !== '') {
    const n = Number(seedParam);
    if (Number.isFinite(n)) {
      return n >>> 0;
    }
  }
  return CONFIG.seed;
}

/** Test-only render-quality overrides (245), applied only by the VITE_E2E boot seam. */
export interface GameQualityOverrides {
  /** Integer chunk radius applied to World/Environment creation. */
  renderDistance?: number;
  /** Camera field of view in degrees. */
  fov?: number;
  /** Fixed daylight factor (0-1) the day-night clock is frozen at. */
  brightness?: number;
}

export class Game {
  private readonly blockRegistry: BlockRegistry;
  private readonly itemRegistry: ItemTypeRegistry;
  /** Test hook: the inventory item registry (used by E2E hooks). */
  readonly registry: ItemTypeRegistry;
  /** Block-state registry (007) backing canonical state reads/writes. */
  private readonly stateRegistry: BlockStateRegistry;
  /** Block behaviors (050): crop growth registered against the wheat block. */
  private readonly behaviorRegistry: BlockBehaviorRegistry;
  private readonly cropBehavior: CropBlockBehavior;
  private readonly farmlandBehavior: FarmlandBlockBehavior;
  private readonly fireBehavior: FireBlockBehavior;
  /** Deterministic random-tick selection (048) per ticking section. */
  private readonly randomTickSelector: RandomTickSelector;
  /** Behavior-facing world access adapter (125). */
  private readonly worldBlockAccess: WorldBlockAccess;
  /** Monotonic simulation tick counter driving random-tick seeding. */
  private simTick = 0;
  /**
   * Fixed-tick owner (044/045): turns rAF frame deltas into deterministic
   * 20 TPS ticks. The tick body ({@link runFixedTick}) runs the whole ordered
   * simulation pipeline; per-frame presentation stays in {@link update}.
   */
  private readonly tickDriver: FixedTickDriver;
  /** Player eye-pose interpolation between the previous and current ticks (045). */
  private readonly playerInterpolator = new RenderInterpolator();
  /** Render performance observability (audit 05): fed by render() + World's monitor. */
  private readonly perfMonitor = new RenderPerformanceMonitor(() => performance.now());
  /**
   * Observability handle handed to World (audit 05): World pushes queue depths,
   * oldest-job age, and upload bytes each frame straight into the monitor.
   */
  private readonly worldMonitor = {
    setQueueDepth: (kind: 'generate' | 'mesh' | 'upload' | 'unload', depth: number): void => {
      this.perfMonitor.setQueueDepth(kind, depth);
    },
    setOldestJobAgeMs: (ageMs: number): void => {
      this.perfMonitor.setOldestJobAgeMs(ageMs);
    },
    recordUploadBytes: (bytes: number): void => {
      this.perfMonitor.recordUploadBytes(bytes);
    },
  };
  /** Selection/collision shape table (056); unregistered ids answer full cubes. */
  private readonly blockShapes = new BlockShapeTable();
  /** Shape-aware selection raycast adapter (058) over {@link blockShapes} + world lookups. */
  private readonly selectionShapes: SelectionShapeWorld;
  private readonly atlas: TextureAtlas;
  private readonly materials: Materials;
  private readonly renderer: Renderer;
  private readonly input: InputManager;
  /** E2E helper: exposes InputManager so tests can await the async lock flag. */
  get inputHandle(): InputManager { return this.input; }
  private readonly loop: GameLoop;
  private readonly resources: ResourceManager;
  private readonly lighting: Lighting;
  private readonly environment: Environment;
  private readonly worldLife: WorldLife;
  /** Passive mob baseline (145): world adapter, entity/AI/physics system, and mesh renderer. */
  private readonly passiveMobWorld: PassiveMobWorldAdapter;
  private readonly passiveMobs: PassiveMobSystem;
  private readonly passiveMobRenderer: PassiveMobRenderer;
  /** Hostile mob baseline (146): entity/AI/physics/melee system and mesh renderer, reusing passiveMobWorld. */
  private readonly hostileMobs: HostileMobSystem;
  private readonly hostileMobRenderer: HostileMobRenderer;
  /** Animal breeding (147): love-mode/cooldown/child-spawn system operating on passiveMobs' pig population. */
  private readonly breeding: BreedingSystem;
  private readonly pigBreedableSpecies: BreedableSpecies;
  private readonly overworldDimension: ResourceId;
  private readonly audio: GameAudio;

  private readonly world: World;
  private readonly player: Player;
  private readonly controller: PlayerController;
  private readonly physics: PlayerPhysics;
  private readonly survival: SurvivalSystem;
  /** Active status effects for the player; ticked each frame and fed by consume. */
  playerEffects: StatusEffectManager;
  private readonly experience: ExperienceSystem;
  private readonly xpOrbs: XpOrbManager;
  private readonly interaction: PlayerInteraction;
  /** Enchantment definitions (118); fed to PlayerInteraction (119) for enchant reads. */
  private readonly enchantmentRegistry: EnchantmentRegistry;
  private readonly lootTables: LootTableRegistry;
  /** Active enchanting session opened via a `use` interaction, or null. */
  private enchantingSession: EnchantingTableSession | null = null;
  /** Harvest rules (114): tier/mineability-aware break speed and drop gating. */
  private readonly harvestRules: HarvestRules;
  /** Live world item-entity store (111); mined blocks drop into this. */
  readonly itemEntities: ItemEntityManager;
  private readonly inventory: Inventory;
  private readonly hotbar: Hotbar;
  private readonly skySunDirection = new THREE.Vector3();

  private readonly crosshair: Crosshair;
  private readonly hud: HUD;
  private readonly loading: LoadingIndicator;
  private readonly debugOverlay: DebugOverlay;
  private readonly craftingPanel: CraftingPanel;
  private readonly breakProgressEl: HTMLElement;
  private readonly breakProgressBarEl: HTMLElement;
  private readonly toastEl: HTMLElement;

  private readonly overlayEl: HTMLElement;
  private readonly overlayMessageEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly errorMessageEl: HTMLElement;
  private readonly spawnPosition: THREE.Vector3;

  // ── Durable persistence (249-DL-001 / 249-DL-005) ─────────────────────────
  /**
   * The production persistence facade, or null when storage composition failed.
   * Injected pre-opened via `bootstrap.persistence` (main.ts path) or composed
   * internally and opened asynchronously (see {@link selfOpenPromise}).
   */
  private readonly persistenceImpl: GamePersistence | null;
  /**
   * Pending open of a self-composed facade; null when persistence was injected
   * already open. Settles after the bulk-loaded initial state has been applied.
   */
  private readonly selfOpenPromise: Promise<void> | null;
  /** Persistent save-health banner driven by the facade's health surface. */
  private readonly saveStatusIndicator: SaveStatusIndicator;
  /** Unsubscribe for the facade's `onHealthChange` subscription. */
  private unsubscribeHealth: (() => void) | null = null;
  /**
   * Sticky degraded flag from boot-time load/migration problems; cleared only
   * by a later verified durable commit (SAVE-FAIL-3).
   */
  private bootSaveDegraded = false;
  /** Milliseconds since the last periodic durable player-state autosave. */
  private saveTimer = 0;

  // The interaction target outline is scene-owned; track it for cleanup.
  private readonly targetOutline: THREE.LineSegments | null;

  private lastSelection = -1;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private started = false;
  private disposed = false;
  private loadingShown = false;
  private contextLost = false;
  private pointerLocked = false;
  private craftingOpen = false;
  /** Whether the pause/start overlay is currently shown (246 playability input). */
  private overlayOpen = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private bobTime = 0;

  // ── Device input wiring (246) ─────────────────────────────────────────────
  /** The canvas owning the touch-capture listeners (kept for dispose). */
  private readonly gameCanvas: HTMLCanvasElement;
  /** Last resolved per-device input frame; rebuilt every update(). */
  private resolvedInput: ResolvedInputFrame = {
    actions: [],
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    breakHeld: false,
    useHeld: false,
    pickHeld: false,
    hotbarIndex: -1,
    hotbarDelta: 0,
    uiNav: { up: false, down: false, left: false, right: false, confirm: false, cancel: false },
    active: false,
  };
  /** Active 207 keybinding state feeding both InputManager and the frame build. */
  private keybindings: KeybindingState = createDefaultKeybindings();
  /** Active 208 accessibility store (reducedMotion/uiScale). */
  private accessibility: AccessibilityStore = createDefaultAccessibility();
  /** Active touches normalized to [0,1], with their previous point when known. */
  private readonly activeTouches = new Map<number, { point: TouchPoint; previous?: TouchPoint }>();

  /** Test-only hook (239): when true, the next `update` throws so the game
   *  enters its recoverable error state. Never set in production gameplay. */
  private failNextUpdate = false;

  /** Test-only hook (245): pin the camera to an exact yaw/pitch pose. */
  testSetCameraPose(yaw: number, pitch: number): void {
    this.player.yaw = yaw;
    this.player.pitch = pitch;
  }

  /** Test-only hook (245): freeze the day-night clock at a fixed daylight factor. */
  testFreezeDayNight(daylight: number): void {
    this.lighting.freezeDayNight(daylight);
  }

  /** Test-only hook (245): pin dynamic HUD/debug text to fixed constants. */
  testNormalizeHud(fpsText: string, worldTimeText: string, debugStatsText?: string): void {
    this.hud.setFixedText(fpsText, worldTimeText);
    if (debugStatsText !== undefined) {
      this.debugOverlay.setFixedText(debugStatsText);
    }
  }

  /** The seed resolved from the URL ?seed= override, or the configured default. */
  readonly seed: number;

  constructor(
    canvas: HTMLCanvasElement,
    seed?: number,
    quality?: GameQualityOverrides,
    bootstrap?: { persistence?: GamePersistence },
  ) {
    this.seed = seed ?? resolveGameSeed();
    this.gameCanvas = canvas;

    // Persistence composition happens first (249-DL-005): it has no
    // dependencies, and the World below must be constructed with the
    // durability bridge attached so every committed edit is captured.
    // An injected facade is ALREADY OPEN (main.ts awaited open()); its
    // bulk-loaded state is applied synchronously at the old load call sites.
    // Otherwise the production default is composed here and opened
    // asynchronously; `start()` gates the loop on that promise settling.
    if (bootstrap?.persistence) {
      this.persistenceImpl = bootstrap.persistence;
      this.selfOpenPromise = null;
    } else {
      const composed = GamePersistence.createProductionGamePersistence(this.seed);
      this.persistenceImpl = composed;
      this.selfOpenPromise = composed
        .open()
        .then((result) => {
          this.applyInitialEdits(result.initialEdits);
          this.applyInitialPlayerState(result.initialPlayerState);
          if (result.status !== 'ok') {
            this.bootSaveDegraded = true;
            this.refreshSaveStatus();
          }
        })
        .catch(() => {
          // Offline-first: an unusable storage layer degrades visibly instead
          // of preventing the game from starting (memory-only play).
          this.bootSaveDegraded = true;
          this.refreshSaveStatus();
        });
    }

    this.blockRegistry = createDefaultBlockRegistry();
    this.itemRegistry = createDefaultItemRegistry();
    this.registry = this.itemRegistry;
    validateItemBlockCrossReferences(this.blockRegistry, this.itemRegistry);
    this.stateRegistry = createDefaultBlockStateRegistry();
    this.cropBehavior = new CropBlockBehavior(BlockId.Wheat);
    this.farmlandBehavior = new FarmlandBlockBehavior();
    this.fireBehavior = new FireBlockBehavior();
    this.behaviorRegistry = new BlockBehaviorRegistry();
    this.behaviorRegistry.register(this.blockRegistry.get(BlockId.Wheat).key, this.cropBehavior);
    this.behaviorRegistry.register(this.blockRegistry.get(BlockId.Farmland).key, this.farmlandBehavior);
    this.behaviorRegistry.register(this.blockRegistry.get(BlockId.Fire).key, this.fireBehavior);
    this.randomTickSelector = new RandomTickSelector();
    this.lootTables = new LootTableRegistry(buildCurrentLootTables(this.blockRegistry, this.itemRegistry), this.itemRegistry);
    this.enchantmentRegistry = createDefaultEnchantmentRegistry();
    const blockTags = createDefaultBlockTags(this.blockRegistry);
    const itemTags = createDefaultItemTags(this.itemRegistry);
    this.harvestRules = new HarvestRules(blockTags, itemTags);
    this.atlas = new TextureAtlas();
    this.materials = new Materials(this.atlas);
    this.renderer = new Renderer(
      canvas,
      () => this.onContextLost(),
      () => this.onContextRestored(),
    );
    this.resources = new ResourceManager();
    this.resources.track(this.renderer);

    this.lighting = new Lighting(this.renderer.scene);
    this.resources.track(this.lighting);
    if (quality?.fov !== undefined) {
      this.renderer.camera.fov = quality.fov;
      this.renderer.camera.updateProjectionMatrix();
    }
    if (quality?.brightness !== undefined) {
      this.lighting.freezeDayNight(quality.brightness);
    }
    const renderDistance = quality?.renderDistance ?? this.runtimeRenderDistance();
    this.environment = new Environment(this.renderer.scene, renderDistance, this.seed);
    this.resources.track(this.environment);
    this.audio = new GameAudio();
    this.resources.track(this.audio);

    const mesher = new ChunkMesher({ registry: this.blockRegistry, atlas: this.atlas });
    const generator = new TerrainGenerator(this.blockRegistry, this.seed);
    this.worldLife = new WorldLife(this.renderer.scene, generator, this.seed);
    this.resources.track(this.worldLife);
    this.world = new World({
      registry: this.blockRegistry,
      seed: this.seed,
      scene: this.renderer.scene,
      mesher,
      generator,
      materials: {
        opaque: this.materials.opaque,
        transparent: this.materials.transparent,
        cutout: this.materials.cutout,
        fluid: this.materials.fluid,
      },
      renderDistance,
      simulationDistance: this.runtimeSimulationDistance(),
      stateRegistry: this.stateRegistry,
      editDurability: this.persistenceImpl ?? undefined,
      monitor: this.worldMonitor,
      // Atlas UV seam for the (currently disabled) worker-meshing path; the
      // sync mesher ignores it. Face index is WorkerMeshing's canonical
      // encoding: 0=up, 1=down, 2-5 sides.
      uvRectFor: (blockId, faceIndex) => {
        const def = this.blockRegistry.get(blockId);
        const tile =
          faceIndex === 0 ? def.topTile : faceIndex === 1 ? def.bottomTile : def.sideTile;
        return this.atlas.uv(tile);
      },
    });
    this.worldBlockAccess = new WorldBlockAccess(this.world);
    // Injected persistence is already open: apply its bulk-loaded edits now.
    // The self-composed path applies them when its open promise settles.
    if (this.selfOpenPromise === null) {
      this.applyInitialEdits(this.persistenceImpl?.initialEdits ?? null);
    }

    this.overworldDimension = createResourceId('minecraft', 'overworld');
    this.passiveMobWorld = new PassiveMobWorldAdapter({
      world: this.world,
      generator,
      biomeRegistry: createDefaultBiomeRegistry(),
    });
    const entityRegistry = createDefaultEntityRegistry();
    this.passiveMobs = new PassiveMobSystem(entityRegistry, this.seed);
    this.passiveMobRenderer = new PassiveMobRenderer(this.renderer.scene);
    this.resources.track(this.passiveMobRenderer);
    this.hostileMobs = new HostileMobSystem(entityRegistry, this.seed);
    this.hostileMobRenderer = new HostileMobRenderer(this.renderer.scene);
    this.resources.track(this.hostileMobRenderer);
    this.breeding = new BreedingSystem();
    this.pigBreedableSpecies = { typeId: entityRegistry.getByKey('pig')!.id, breedingFoodItemId: ItemId.Wheat };

    this.player = new Player();
    this.spawnPlayerSafely(generator);
    this.spawnPosition = this.player.position.clone();
    this.inventory = new Inventory();
    this.survival = new SurvivalSystem(undefined, (event, amount) => this.onSurvivalEvent(event, amount));
    this.playerEffects = new StatusEffectManager(
      createDefaultStatusEffectRegistry(),
      createDefaultAttributeRegistry(),
    );
    // Experience must exist before persisted player state is applied below —
    // the restore path calls this.experience.restore (249-DL-001 follow-up:
    // failures here are surfaced, not swallowed, so ordering must be correct).
    this.experience = new ExperienceSystem();
    // Injected persistence is already open: apply its bulk-loaded player
    // state now. The self-composed path applies it when its promise settles.
    if (this.selfOpenPromise === null) {
      this.applyInitialPlayerState(this.persistenceImpl?.initialPlayerState ?? null);
    }

    // Queue the spawn area before the loop starts. World work is then spread
    // across frames so the browser can paint the loading screen immediately.
    const [spawnChunkX, , spawnChunkZ] = worldToChunk(
      this.player.position.x,
      this.player.position.y,
      this.player.position.z,
    );
    this.world.preloadChunks(
      spawnChunkX,
      spawnChunkZ,
      Math.min(CONFIG.preloadRadius, renderDistance),
    );

    this.input = new InputManager(
      canvas,
      (locked) => this.onLockChange(locked),
      (message) => {
        // pointerlockerror (246): clear every device, then surface the
        // recoverable "Pointer lock failed" overlay message.
        this.applyFocusLoss();
        this.showInputError(message);
      },
    );
    // Load persisted 206/207/208 payloads through the corrupt-safe fallback and
    // hand them to the input path before any frame runs.
    this.loadInputConfiguration();
    this.attachTouchCapture();
    this.controller = new PlayerController(this.player, this.input);
    // Physics hooks (behavior-neutral where data is missing): the block
    // registry exposes no slipperiness yet, so friction stays a constant-1.0
    // table; sneak state has no InputManager/Controller source to read.
    this.physics = new PlayerPhysics(this.world, this.blockRegistry, {
      blockShapes: this.blockShapes,
      frictionForBlock: () => 1.0,
    });
    this.itemEntities = new ItemEntityManager({ itemRegistry: this.itemRegistry, rng: Math.random });
    this.xpOrbs = new XpOrbManager({ rng: Math.random });
    // Shape-aware selection (058): adapt world block lookups through the shape
    // table so raycasts honor partial shapes (slabs/fences/etc.); unregistered
    // ids answer full cubes, matching the pre-adapter behavior.
    this.selectionShapes = {
      getSelectionShape: (x, y, z) =>
        this.blockShapes.getSelectionShape(this.world.getBlock(x, y, z)),
    };
    this.interaction = new PlayerInteraction({
      world: this.world,
      registry: this.blockRegistry,
      itemRegistry: this.itemRegistry,
      selector: this.inventory,
      player: this.player,
      camera: this.renderer.camera,
      input: this.input,
      onAction: (action, blockId) => this.onInteractionAction(action, blockId),
      onBreakProgress: (progress) => this.setBreakProgress(progress),
      onToolBreak: () => {
        this.hotbar.render();
        this.showToast('Your tool broke');
      },
      lootTables: this.lootTables,
      harvestRules: this.harvestRules,
      enchantmentRegistry: this.enchantmentRegistry,
      rng: Math.random,
      itemEntities: this.itemEntities,
      xpOrbs: this.xpOrbs,
      xpOrbValue: CONFIG.xp.orbValue,
      selectionShapes: this.selectionShapes,
    });
    this.resources.track(this.interaction);

    // UI.
    const uiRoot = document.getElementById('ui-root');
    if (!uiRoot) {
      throw new Error('UI root element missing');
    }
    this.crosshair = new Crosshair(this.requireElement('crosshair'));
    this.hud = new HUD(this.requireElement('hud'));
    this.loading = new LoadingIndicator(this.requireElement('loading'));
    this.debugOverlay = new DebugOverlay(this.requireElement('debug-overlay'));
    this.breakProgressEl = this.requireElement('break-progress');
    this.breakProgressBarEl = this.requireElement('break-progress-bar');
    this.toastEl = this.requireElement('toast');
    this.saveStatusIndicator = new SaveStatusIndicator(this.requireElement('save-status'));
    if (this.persistenceImpl) {
      // Health transitions (probe/sink driven) refresh the banner live.
      this.unsubscribeHealth = this.persistenceImpl.onHealthChange(() => this.refreshSaveStatus());
    }
    const craftingEl = this.requireElement('crafting');
    this.overlayEl = this.requireElement('overlay');
    this.overlayMessageEl = this.requireElement('overlay-message');
    this.errorEl = this.requireElement('error');
    this.errorMessageEl = this.requireElement('error-message');

    const hotbarEl = document.getElementById('hotbar');
    if (!hotbarEl) {
      throw new Error('Hotbar element missing');
    }
    this.hotbar = new Hotbar(hotbarEl, this.inventory, this.atlas, this.itemRegistry);
    this.craftingPanel = new CraftingPanel(
      craftingEl,
      this.inventory,
      this.itemRegistry,
      this.atlas,
      (recipe) => this.onCrafted(recipe),
      () => this.closeCrafting(),
    );

    // Fixed-tick ownership (044): the driver turns frame deltas into bounded,
    // deterministic 20 TPS ticks; the tick body enforces the simulation order.
    this.tickDriver = new FixedTickDriver({
      tickRateHz: TICK_RATE,
      maxCatchUpTicks: CONFIG.budgets.maxCatchUpTicks,
      tick: (tickIndex) => this.runFixedTick(tickIndex),
    });

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
      (err) => {
        // A runtime error inside the loop stops the game and enters the error
        // state instead of freezing silently (see GameLoop.tick).
        const message = err instanceof Error ? err.message : String(err);
        this.showError(`The game stopped: ${message}`);
      },
    );

    // Attach the target selection outline to the scene.
    this.targetOutline = this.interaction.addTargetOutline();
    if (this.targetOutline) {
      this.renderer.scene.add(this.targetOutline);
    }

    // Resize handling.
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', this.onPageHide);
    // Unified focus-loss clear (246): blur and hidden both zero every device.
    window.addEventListener('blur', this.onWindowFocusLoss);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Start the game loop and show the initial UI. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.loading.show();
    this.loading.setProgress(0);
    this.loadingShown = true;
    if (this.selfOpenPromise !== null) {
      // Self-composed persistence: defer the loop (and overlay) until open
      // settles so the bulk-loaded state is applied before the first frame.
      // On failure the game still starts memory-only with a visible warning.
      void this.selfOpenPromise.then(() => {
        if (this.disposed) {
          return;
        }
        this.showOverlay();
        this.loop.start();
      });
    } else {
      this.showOverlay();
      this.loop.start();
    }
  }

  /** Dispose all resources and stop the loop. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.loop.stop();
    // The fixed-tick driver and perf monitor hold no GPU/DOM resources — no
    // explicit teardown beyond stopping the loop that feeds them.
    this.tickDriver.pause();
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.savePlayerStateDurable();
    this.saveTimer = 0;
    void this.persistenceImpl?.dispose().catch(() => undefined);
    if (this.unsubscribeHealth !== null) {
      this.unsubscribeHealth();
      this.unsubscribeHealth = null;
    }
    this.input.dispose();
    this.detachTouchCapture();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('blur', this.onWindowFocusLoss);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    // Remove the scene-owned selection outline before disposing resources.
    if (this.targetOutline) {
      this.renderer.scene.remove(this.targetOutline);
    }
    this.world.dispose();
    this.materials.dispose();
    this.atlas.dispose();
    this.resources.dispose();
    this.hotbar.dispose();
    this.craftingPanel.hide();
  }

  /** Whether the renderer was successfully created (false → show error state). */
  get rendererOk(): boolean {
    return this.renderer.rendererCreated;
  }

  /**
   * Observability/test hook (239): live-resource counts for long-session leak
   * validation. `blockEntities` is always 0 in the single-player world because
   * block entities are not yet wired into it (see design.md reconciliation);
   * `activeEntities` sums the live passive and hostile mobs; `itemEntities` is
   * the live item-entity (+ xp-orb) set size. No gameplay behavior changes.
   */
  getLiveResourceCounts(): { blockEntities: number; activeEntities: number; itemEntities: number } {
    return {
      blockEntities: 0,
      activeEntities:
        this.passiveMobs.getActivePigs().length + this.hostileMobs.getActiveZombies().length,
      itemEntities: this.itemEntities.size,
    };
  }

  /** Test-only hook (239): force the next update to throw and enter the error state. */
  failSimulation(): void {
    this.failNextUpdate = true;
  }

  /** Show the unrecoverable initialization error state. */
  showError(message: string): void {
    this.loop.stop();
    this.input.releasePointerLock();
    this.crosshair.hide();
    this.hud.hide();
    this.hotbar.hide();
    this.setBreakProgress(0);
    this.toastEl.classList.add('hidden');
    this.errorMessageEl.textContent = message;
    this.errorEl.classList.remove('hidden');
    this.hideOverlay();
    this.loading.hide();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private update(dt: number): void {
    if (this.disposed) {
      return;
    }
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('239 test-injected simulation failure');
    }

    // Periodic durable autosave (abrupt-close durability): chunk edits are
    // already captured continuously by the World durability bridge, so only
    // the player state needs re-enqueueing here; the facade's coordinator
    // drains it on its own tick.
    this.saveTimer += dt * 1000;
    if (this.saveTimer >= 5000) {
      this.saveTimer = 0;
      this.persistenceImpl?.savePlayerState(this.buildPlayerSnapshot());
    }

    // Player chunk used for streaming + debug.
    const [pcx, , pcz] = worldToChunk(this.player.position.x, this.player.position.y, this.player.position.z);

    // World streaming stays frame-driven: it is time-budgeted background work
    // that must also progress while paused/loading, and its readiness gate
    // (`worldReady`) is what makes fixed ticks safe to run at all. Deterministic
    // world mutation (random/fluid ticks) runs inside the tick body instead.
    this.world.update(dt, pcx, pcz);
    const readyProgress = this.world.getReadyProgress(pcx, pcz);
    const worldReady = readyProgress >= 1;
    // Device input wiring (246): poll/assemble the four devices, resolve them
    // through the pure coordinator, then evaluate the playable-state rule.
    // Keyboard/mouse frames are active only while pointer-locked; gamepad/touch
    // drive lock-free; a paused/overlaid or still-loading game delivers nothing.
    const deviceFrame = this.buildDeviceFrame(worldReady);
    this.resolvedInput = resolveFrame(deviceFrame);
    // Feed the arbitrated analog movement into the controller path. While
    // pointer-locked the keyboard owns movement exactly as before (the external
    // contribution is zeroed); in lock-free play the resolved gamepad/touch
    // move drives the player.
    this.input.setExternalMove(this.pointerLocked ? { x: 0, y: 0 } : this.resolvedInput.move);
    this.maybeDismissOverlayForControllerPlay(deviceFrame, worldReady);
    const simulationActive =
      worldReady &&
      !this.craftingOpen &&
      !this.overlayOpen &&
      (this.pointerLocked || this.hasControllerInput(deviceFrame));

    // Pause/resume mapping (044): while inactive the driver's time anchor keeps
    // advancing but emits no ticks, and the paused wall time is never replayed
    // on resume. `advance` must run every frame either way.
    if (simulationActive) {
      this.tickDriver.resume();
    } else {
      this.tickDriver.pause();
    }
    this.tickDriver.advance(dt);

    if (!simulationActive) {
      this.controller.update(0);
      this.player.velocity.set(0, 0, 0);
      if (!worldReady) {
        this.player.onGround = false;
        this.interaction.clearTarget();
      }
    }

    // Camera presentation (045): blend the player eye pose between the previous
    // and current tick states with the driver alpha; before any tick has ever
    // run (or right after a teleport reset) fall back to the live pose.
    let eyeX: number;
    let eyeY: number;
    let eyeZ: number;
    if (this.playerInterpolator.hasState) {
      const rendered = this.playerInterpolator.interpolate(this.tickDriver.alpha);
      eyeX = rendered[0]!;
      eyeY = rendered[1]!;
      eyeZ = rendered[2]!;
    } else {
      const eye = this.player.eyePosition;
      eyeX = eye.x;
      eyeY = eye.y;
      eyeZ = eye.z;
    }
    const moving = simulationActive && (this.input.moveForward || this.input.moveBack || this.input.moveLeft || this.input.moveRight);
    if (moving && this.player.onGround && !this.player.inWater && !this.player.inLava) {
      this.bobTime += dt * (this.input.sprint ? 12 : 9);
    } else {
      this.bobTime += dt * 2;
    }
    const bobAmount =
      moving && this.player.onGround && !this.player.inWater && !this.player.inLava
        ? Math.sin(this.bobTime) * 0.018 * (this.accessibility.reducedMotion === true ? 0 : 1)
        : 0;
    this.applyCameraTransform(eyeX, eyeY + bobAmount, eyeZ);

    // Lighting / environment.
    this.lighting.update(simulationActive ? dt : 0, this.player.position);
    this.hud.setWorldTime(this.lighting.getTimeOfDayHours());
    this.environment.update(
      this.renderer.camera,
      this.lighting.getDaylightFactor(),
      this.lighting.getSunDirection(this.skySunDirection),
    );

    // Hide the loading indicator once the spawn area is ready.
    if (this.loadingShown) {
      this.loading.setProgress(readyProgress);
    }
    if (this.loadingShown && worldReady) {
      this.loading.hide();
      this.loadingShown = false;
      if (this.shouldShowHud()) {
        this.crosshair.show();
        this.hud.show();
        this.hotbar.show();
      }
    }

    // Hotbar selection (number keys + wheel).
    this.updateHotbar();

    if (this.input.consumeCraftingToggle()) {
      if (this.craftingOpen) {
        this.closeCrafting();
      } else {
        this.openCrafting();
      }
    }

    // F3 toggles the debug overlay.
    if (this.input.consumeDebugToggle()) {
      this.debugOverlay.toggle();
    }

    // FPS counter.
    this.updateFPS(dt);

    // Debug overlay.
    this.updateDebug(pcx, pcz);
  }

  /**
   * The deterministic fixed-tick body (044). Runs exactly `1/TICK_RATE`
   * seconds of simulation per call, in strict order — do not reorder:
   *
   *   1. entity activation refresh (scale wiring, both mob managers)
   *   2. player: controller -> physics -> interaction
   *   3. item entities -> xp orbs
   *   4. world ambient life -> passive mobs -> breeding -> hostile mobs
   *   5. random/fluid block ticks
   *   6. survival + status-effect systems
   *
   * World streaming/update deliberately stays frame-driven in {@link update}
   * (see the note there): it is budgeted background work that must progress
   * while paused/loading, and `worldReady` already gates tick execution.
   */
  private runFixedTick(tickIndex: number): void {
    const dt = 1 / TICK_RATE;

    // 1. Entity activation refresh: keep both managers' activation state in
    // sync with the player position each tick so activation-aware consumers
    // see current range data (fail-open until adopted by the systems).
    const px = this.player.position.x;
    const py = this.player.position.y;
    const pz = this.player.position.z;
    const simDistanceBlocks = this.runtimeSimulationDistance() * CONFIG.chunk.width;
    this.passiveMobs.getManager().updateActivation(px, py, pz, simDistanceBlocks);
    this.hostileMobs.getManager().updateActivation(px, py, pz, simDistanceBlocks);

    // 2. Player: controller, then physics, then interaction. Sync the camera
    // to the post-physics pose before the interaction raycast so selection and
    // block actions match what the player sees this tick (render bob is a
    // presentation-only offset applied in `update`).
    this.controller.update(dt);
    this.physics.update(this.player, dt);
    const eye = this.player.eyePosition;
    this.applyCameraTransform(eye.x, eye.y, eye.z);
    this.interaction.update(dt);

    // 3. Item entities, then xp orbs (collection order matters: items first so
    // xp pickup reads post-collection inventory state exactly as before).
    this.itemEntities.tickItemEntities(dt);
    this.itemEntities.mergeEntities();
    this.itemEntities.despawnExpired();
    const collected = this.itemEntities.collectPlayerDrops(
      px,
      py,
      pz,
      (id, count) => this.inventory.addItem(id, count),
    );
    if (collected > 0) this.hotbar.render();
    this.xpOrbs.tickItemEntities(dt, px, py, pz, this.experience);

    // 4. Mobs: ambient life, passive mobs (+ renderer sync), breeding, then
    // hostile mobs (+ renderer sync) — passive always precedes hostile.
    this.worldLife.update(dt, this.player.position);
    this.tickPassiveMobs(dt);
    this.passiveMobRenderer.sync(this.passiveMobs.getActivePigs());
    this.breeding.tick(this.passiveMobs.getManager(), this.passiveMobs.getActivePigs(), this.pigBreedableSpecies, SPAWN_CAP);
    this.tickHostileMobs(dt);
    this.hostileMobRenderer.sync(this.hostileMobs.getActiveZombies());

    // 5. Random/fluid ticks (048/050/125 dispatch over simulating sections).
    this.tickRandomBlocks();

    // 6. Survival + status systems.
    const headY = Math.floor(py + CONFIG.player.eyeHeight);
    const headSubmerged = this.world.getBlock(
      Math.floor(px),
      headY,
      Math.floor(pz),
    ) === BlockId.Water;
    this.survival.update(dt, this.player, {
      sprinting: this.input.sprint,
      headSubmerged,
      inLava: this.player.inLava,
      landingDistance: this.physics.consumeLandingDistance(),
    });
    this.playerEffects.tick(dt);
    if (this.input.consumeEat()) {
      this.tryEatSelected();
    }
    this.hud.setSurvival(this.survival.health, this.survival.hunger);

    // Snapshot the post-tick eye pose tagged with its tick index so the render
    // path can blend between consecutive tick states (045).
    this.playerInterpolator.setState([eye.x, eye.y, eye.z], tickIndex);
  }

  /** Point the camera from an eye position with the player's yaw/pitch. */
  private applyCameraTransform(eyeX: number, eyeY: number, eyeZ: number): void {
    this.renderer.camera.position.set(eyeX, eyeY, eyeZ);
    this.renderer.camera.rotation.set(0, 0, 0);
    this.renderer.camera.rotateY(this.player.yaw);
    this.renderer.camera.rotateX(this.player.pitch);
  }

  private render(): void {
    if (this.disposed) {
      return;
    }
    // Observability (audit 05): bracket the frame and feed renderer.info after
    // the draw; World feeds queue depths/upload bytes via `worldMonitor`.
    this.perfMonitor.beginFrame();
    this.renderer.render();
    const info = this.renderer.renderer?.info;
    if (info) {
      this.perfMonitor.recordRendererInfo({
        render: { calls: info.render.calls, triangles: info.render.triangles },
        memory: { geometries: info.memory.geometries, textures: info.memory.textures },
      });
    }
    this.perfMonitor.endFrame();
  }

  /**
   * Dispatch deterministic random ticks (048/050/125) over simulating chunks.
   * Increments the simulation tick counter, selects eligible cells per 16×16×16
   * section via the bounded {@link RandomTickSelector}, and invokes each
   * selected block's `onRandomTick` hook with the world adapter.
   */
  private tickRandomBlocks(): void {
    this.simTick++;
    const sectionsPerChunk = CONFIG.chunk.height / 16;
    this.world.forEachLoadedChunk((cx, cy, cz) => {
      if (!this.world.isChunkSimulating(cx, cz)) {
        return;
      }
      const sectionY0 = cy * sectionsPerChunk;
      for (let s = 0; s < sectionsPerChunk; s++) {
        const positions = this.randomTickSelector.selectEligible(
          cx,
          sectionY0 + s,
          cz,
          this.simTick,
          this.seed,
          (x, y, z) => this.isRandomTickEligible(x, y, z),
        );
        for (const [x, y, z] of positions) {
          const blockKey = this.blockRegistry.get(this.world.getBlock(x, y, z)).key;
          this.behaviorRegistry
            .getBehavior(blockKey)
            .onRandomTick?.({ x, y, z, tick: this.simTick, world: this.worldBlockAccess, seed: this.seed });
        }
      }
    });
  }

  /**
   * Passive mob baseline (145): throttled spawn-cycle sweep over currently-simulating chunks
   * (every {@link SPAWN_CYCLE_INTERVAL_TICKS} frames), then a per-frame AI/physics tick over the
   * live pig set restricted to the chunk-ticking set.
   */
  private tickPassiveMobs(dt: number): void {
    if (this.simTick % SPAWN_CYCLE_INTERVAL_TICKS === 0) {
      const seen = new Set<string>();
      const chunks: ChunkCoord[] = [];
      this.world.forEachLoadedChunk((cx, _cy, cz) => {
        const key = `${cx},${cz}`;
        if (!seen.has(key) && this.world.isChunkSimulating(cx, cz)) {
          seen.add(key);
          chunks.push({ cx, cz });
        }
      });
      this.passiveMobs.spawnCycle(this.passiveMobWorld, this.overworldDimension, chunks, (x, y, z) =>
        Math.hypot(x - this.player.position.x, y - this.player.position.y, z - this.player.position.z),
      );
    }
    this.passiveMobs.tick(dt, this.passiveMobWorld, (cx, cz) => this.world.isChunkSimulating(cx, cz));
  }

  /**
   * Hostile mob baseline (146): throttled spawn-cycle sweep over currently-simulating chunks
   * (every {@link HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS} frames), then a per-frame AI/physics/melee
   * tick over the live zombie set restricted to the chunk-ticking set. Reuses `passiveMobWorld`
   * (stateless, interface-shaped identically for both systems) rather than a second adapter.
   */
  private tickHostileMobs(dt: number): void {
    if (this.simTick % HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS === 0) {
      const seen = new Set<string>();
      const chunks: ChunkCoord[] = [];
      this.world.forEachLoadedChunk((cx, _cy, cz) => {
        const key = `${cx},${cz}`;
        if (!seen.has(key) && this.world.isChunkSimulating(cx, cz)) {
          seen.add(key);
          chunks.push({ cx, cz });
        }
      });
      this.hostileMobs.spawnCycle(this.passiveMobWorld, this.overworldDimension, chunks, (x, y, z) =>
        Math.hypot(x - this.player.position.x, y - this.player.position.y, z - this.player.position.z),
      );
    }
    this.hostileMobs.tick(
      dt,
      this.passiveMobWorld,
      (cx, cz) => this.world.isChunkSimulating(cx, cz),
      () => ({ x: this.player.position.x, y: this.player.position.y, z: this.player.position.z }),
      (amount) => this.survival.damage(amount, 'mob'),
    );
  }

  /** Whether the block at (x, y, z) has a registered `onRandomTick` behavior. */
  private isRandomTickEligible(x: number, y: number, z: number): boolean {
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.Air) {
      return false;
    }
    const behavior = this.behaviorRegistry.getBehavior(this.blockRegistry.get(id).key);
    return typeof behavior.onRandomTick === 'function';
  }

  private spawnPlayerSafely(generator: TerrainGenerator): void {
    // Find a spawn column that is above sea level, has flat terrain around it
    // (so the player isn't boxed in by a hill or pit), and has clear space
    // directly in front to move into.
    for (let attempt = 0; attempt < 128; attempt++) {
      const x = attempt * 7;
      const z = attempt * 11;
      const height = generator.getHeightAt(x, z);
      if (height <= CONFIG.seaLevel) {
        continue;
      }
      // Check the surrounding 5x5 area for flatness (±1 block).
      let flat = true;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const h = generator.getHeightAt(x + dx, z + dz);
          if (Math.abs(h - height) > 1) {
            flat = false;
            break;
          }
        }
        if (!flat) break;
      }
      if (!flat) {
        continue;
      }
      this.player.position.set(x + 0.5, height + 1, z + 0.5);
      return;
    }
    // Fallback: spawn above the origin terrain surface with a small clearance.
    // Using the actual terrain height avoids embedding the player inside a hill
    // (the fixed sea-level offset could be below a tall origin column). The
    // The streaming gate keeps the area safe while frame-budgeted preload
    // catches up, so fallback placement never embeds the player in terrain.
    const height = generator.getHeightAt(0, 0);
    this.player.position.set(0.5, Math.max(height, CONFIG.seaLevel) + 1, 0.5);
  }

  private updateHotbar(): void {
    const wheel = this.input.consumeHotbarDelta();
    if (wheel !== 0) {
      this.inventory.cycle(wheel);
    }
    const index = this.input.consumeHotbarIndex();
    if (index >= 0) {
      this.inventory.select(index);
    }
    if (this.inventory.selected !== this.lastSelection) {
      this.lastSelection = this.inventory.selected;
      this.hotbar.render();
      const id = this.inventory.getSelectedItemId();
      this.hud.setSelectedName(this.itemRegistry.getByLegacyId(id)?.name ?? '');
    }
  }

  private updateFPS(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      const sample = this.fpsFrames / this.fpsTime;
      this.fps = this.fps === 0 ? sample : this.fps * 0.75 + sample * 0.25;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.hud.setFPS(this.fps);
    }
  }

  private updateDebug(pcx: number, pcz: number): void {
    if (!this.debugOverlay.isVisible()) {
      return;
    }
    const stats = this.world.getStats();
    this.debugOverlay.update({
      position: [this.player.position.x, this.player.position.y, this.player.position.z],
      chunk: `${pcx},${pcz}`,
      loaded: stats.loadedChunks,
      pendingGen: stats.pendingGeneration,
      pendingMesh: stats.pendingMesh,
      triangles: stats.triangles,
    });
  }

  private onLockChange(locked: boolean): void {
    this.pointerLocked = locked;
    if (this.contextLost || !this.errorEl.classList.contains('hidden')) {
      return;
    }
    if (locked) {
      if (this.craftingOpen) {
        this.closeCrafting();
      }
      this.hideOverlay();
      // The HUD/crosshair only appear once the world is ready (see update()).
      if (!this.loadingShown) {
        this.crosshair.show();
        this.hud.show();
        this.hotbar.show();
      }
    } else {
      this.showOverlay();
      this.crosshair.hide();
      this.hud.hide();
      this.hotbar.hide();
      this.interaction.clearTarget();
      this.setBreakProgress(0);
    }
  }

  /** Invoked when the WebGL context is lost. */
  private onContextLost(): void {
    if (this.contextLost || this.renderer.rendererCreated) {
      return;
    }
    this.contextLost = true;
    this.loop.stop();
    this.input.releasePointerLock();
    this.showError('The graphics context was lost. Please reload the page to continue.');
  }

  /** Invoked when the WebGL context is restored after a loss. */
  private onContextRestored(): void {
    if (this.disposed) {
      return;
    }
    if (!this.renderer.rendererCreated) {
      this.showError('The graphics context could not be restored. Please reload the page to continue.');
      return;
    }
    this.contextLost = false;
    // Clear the context-loss error and return to the pause overlay so the
    // player can click the canvas to re-lock the pointer and resume.
    this.errorEl.classList.add('hidden');
    this.showOverlay();
    if (this.started) {
      this.loop.start();
    }
  }

  private showOverlay(message = 'Click to play'): void {
    this.overlayMessageEl.textContent = message;
    this.overlayEl.classList.remove('hidden');
    this.overlayOpen = true;
  }

  private hideOverlay(): void {
    this.overlayEl.classList.add('hidden');
    this.overlayOpen = false;
  }

  private openCrafting(): void {
    if (this.craftingOpen) return;
    this.craftingOpen = true;
    this.input.releasePointerLock();
    this.hideOverlay();
    this.crosshair.hide();
    this.hud.hide();
    this.hotbar.hide();
    this.craftingPanel.show();
    this.craftingPanel.render(this.itemRegistry);
  }

  private closeCrafting(): void {
    if (!this.craftingOpen) return;
    this.craftingOpen = false;
    this.craftingPanel.hide();
    this.showOverlay('Click to play');
    this.crosshair.hide();
    this.hud.hide();
    this.hotbar.hide();
  }

  private onCrafted(recipe: CraftingRecipe): void {
    this.hud.setSelectedName(`Crafted ${recipe.name}`);
    this.hotbar.render();
    this.audio.play('craft');
    this.craftingPanel.render(this.itemRegistry);
  }

  /** Show a recoverable input notice without trapping the player in the fatal error UI. */
  private showInputError(message: string): void {
    this.showOverlay(message);
    this.crosshair.hide();
    this.hud.hide();
    this.hotbar.hide();
    this.setBreakProgress(0);
    this.interaction.clearTarget();
  }

  // ── Device input wiring (246) ─────────────────────────────────────────────

  /** E2E observability (246): plain copy of the last resolved input frame. */
  resolvedInputView(): ResolvedInputFrame {
    const r = this.resolvedInput;
    return {
      actions: [...r.actions],
      move: { ...r.move },
      look: { ...r.look },
      breakHeld: r.breakHeld,
      useHeld: r.useHeld,
      pickHeld: r.pickHeld,
      hotbarIndex: r.hotbarIndex,
      hotbarDelta: r.hotbarDelta,
      uiNav: { ...r.uiNav },
      active: r.active,
    };
  }

  /** Load persisted 206/207/208 payloads; corrupt ones fall back to defaults. */
  private loadInputConfiguration(): void {
    const settings = this.loadStoredPayload(
      'voxel-game-settings-v1',
      deserializeSettings,
      createDefaultSettings,
      'settings',
    );
    // The settings store lives in InputManager (mouse look + autoJump read it).
    this.input.setSettings(settings.value);
    const keybindings = this.loadStoredPayload(
      'voxel-game-keybindings-v1',
      deserializeKeybindings,
      createDefaultKeybindings,
      'keybindings',
    );
    this.keybindings = keybindings.value;
    this.input.setBindings(keybindings.value);

    const accessibility = this.loadStoredPayload(
      'voxel-game-accessibility-v1',
      deserializeAccessibility,
      createDefaultAccessibility,
      'accessibility',
    );
    this.accessibility = accessibility.value;
    this.applyUiScale();
  }

  /**
   * Read one persisted payload: absent storage yields clean defaults; a broken
   * JSON payload or a throwing deserializer falls back to defaults with a
   * single console.warn (never fatal).
   */
  private loadStoredPayload<T>(
    key: string,
    deserialize: (input: unknown) => T,
    createDefault: () => T,
    label: string,
  ): { value: T; corrupted: boolean } {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      // Storage unavailable (private mode etc.) — defaults are safe.
    }
    if (raw === null || raw.length === 0) {
      return { value: createDefault(), corrupted: false };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn(`[voxel] corrupt persisted ${label} payload; using defaults`, err);
      return { value: createDefault(), corrupted: true };
    }
    const result = loadWithFallback(deserialize, createDefault, parsed);
    if (result.corrupted) {
      console.warn(`[voxel] corrupt persisted ${label} payload; using defaults`);
    }
    return result;
  }

  /** Apply 208's uiScale to the UI root (small=0.85, normal/auto=1, large=1.15). */
  private applyUiScale(): void {
    const uiRoot = document.getElementById('ui-root');
    if (!uiRoot) return;
    const scale =
      this.accessibility.uiScale === 'small' ? 0.85 : this.accessibility.uiScale === 'large' ? 1.15 : 1;
    uiRoot.style.fontSize = `${Math.round(scale * 100)}%`;
  }

  /** Capture touch pointers on the canvas, normalized to [0,1] (246). */
  private attachTouchCapture(): void {
    this.gameCanvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    this.gameCanvas.addEventListener('pointermove', this.onCanvasPointerMove);
    this.gameCanvas.addEventListener('pointerup', this.onCanvasPointerUp);
    this.gameCanvas.addEventListener('pointercancel', this.onCanvasPointerCancel);
  }

  private detachTouchCapture(): void {
    this.gameCanvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.gameCanvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.gameCanvas.removeEventListener('pointerup', this.onCanvasPointerUp);
    this.gameCanvas.removeEventListener('pointercancel', this.onCanvasPointerCancel);
  }

  private isTouchPointer(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  }

  private normalizePointerPoint(event: PointerEvent): TouchPoint {
    const rect = this.gameCanvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 1;
    const height = rect.height > 0 ? rect.height : 1;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / height)),
    };
  }

  private readonly onCanvasPointerDown = (event: PointerEvent): void => {
    if (!this.isTouchPointer(event)) return;
    this.activeTouches.set(event.pointerId, { point: this.normalizePointerPoint(event) });
  };

  private readonly onCanvasPointerMove = (event: PointerEvent): void => {
    if (!this.isTouchPointer(event)) return;
    const previous = this.activeTouches.get(event.pointerId)?.point;
    this.activeTouches.set(event.pointerId, {
      point: this.normalizePointerPoint(event),
      previous,
    });
  };

  private readonly onCanvasPointerUp = (event: PointerEvent): void => {
    if (!this.isTouchPointer(event)) return;
    this.activeTouches.delete(event.pointerId);
  };

  private readonly onCanvasPointerCancel = (event: PointerEvent): void => {
    if (!this.isTouchPointer(event)) return;
    this.activeTouches.delete(event.pointerId);
  };

  /** Poll navigator.getGamepads defensively; absence/failure degrades to null. */
  private pollGamepads(): RawGamepadSnapshot[] | null {
    try {
      const pads = navigator.getGamepads?.();
      if (!pads) return null;
      const snapshots: RawGamepadSnapshot[] = [];
      for (const pad of pads) {
        if (!pad) continue;
        snapshots.push({
          connected: pad.connected === true,
          buttons: Array.from(pad.buttons, (button) => ({ pressed: button?.pressed === true })),
          axes: Array.from(pad.axes, (axis) =>
            typeof axis === 'number' && Number.isFinite(axis) ? axis : 0,
          ),
        });
      }
      return snapshots;
    } catch {
      return null;
    }
  }

  /**
   * Assemble the per-frame DeviceFrame from the four devices. Keyboard/mouse
   * fields are zeroed unless pointer-locked (their contributions require lock);
   * gamepad/touch are read whenever present. The playable-state rule composes
   * `active`: never while paused/overlaid/crafting or before the world is ready;
   * keyboard/mouse only while locked; gamepad when connected; touch while down.
   */
  private buildDeviceFrame(worldReady: boolean): DeviceFrame {
    const locked = this.pointerLocked;
    const keyboard = locked
      ? {
          heldActions: keyboardActions(this.input.heldCodesView(), this.keybindings),
          hotbarIndex: this.input.peekHotbarIndex(),
          hotbarDelta: this.input.peekHotbarDelta(),
        }
      : { heldActions: [], hotbarIndex: -1, hotbarDelta: 0 };
    const mouseDelta = locked ? this.input.peekMouseDelta() : { dyaw: 0, dpitch: 0 };
    const touchState = resolveTouches(
      [...this.activeTouches.values()].map((touch) => ({
        point: touch.point,
        previous: touch.previous,
      })),
    );
    const frame: DeviceFrame = {
      keyboard,
      mouse: {
        look: { x: mouseDelta.dyaw, y: mouseDelta.dpitch },
        breakHeld: locked && this.input.isBreakHeld(),
        useHeld: locked && this.input.isUseHeld(),
        pickHeld: locked && this.input.isPickHeld(),
      },
      gamepad: gamepadFrame(this.pollGamepads()),
      touch: {
        actions: touchState.actions,
        move: touchState.move,
        look: touchState.lookDelta,
      },
    };
    const touchPresent = this.activeTouches.size > 0;
    return {
      ...frame,
      active:
        !this.overlayOpen &&
        !this.craftingOpen &&
        worldReady &&
        (this.pointerLocked || frame.gamepad.connected || touchPresent),
    };
  }

  /**
   * Lock-free play gate (246): true when a gamepad/touch is actually delivering
   * non-zero input this frame (keyboard/mouse require pointer lock instead).
   * Purely a device-contribution check — pause/overlay state is applied by the
   * callers, otherwise controller activity could never dismiss the overlay.
   */
  private hasControllerInput(frame: DeviceFrame): boolean {
    const gp = frame.gamepad;
    const gamepadDriving =
      gp.connected &&
      (gp.move.x !== 0 ||
        gp.move.y !== 0 ||
        gp.look.x !== 0 ||
        gp.look.y !== 0 ||
        gp.actions.length > 0);
    const touch = frame.touch;
    const touchDriving =
      touch.actions.length > 0 ||
      touch.move.x !== 0 ||
      touch.move.y !== 0 ||
      touch.look.x !== 0 ||
      touch.look.y !== 0;
    return gamepadDriving || touchDriving;
  }

  /**
   * Whether the crosshair/HUD/hotbar should be visible: pointer-locked play, or
   * an in-progress lock-free controller/touch session (overlay dismissed).
   */
  private shouldShowHud(): boolean {
    return this.pointerLocked || (!this.overlayOpen && !this.craftingOpen);
  }

  /**
   * Lock-free play (246): controller/touch activity dismisses the start/pause
   * overlay without pointer lock, mirroring what a canvas click does for
   * keyboard/mouse. Keyboard-only sessions keep today's click-to-play flow.
   */
  private maybeDismissOverlayForControllerPlay(frame: DeviceFrame, worldReady: boolean): void {
    if (!this.overlayOpen || !worldReady) return;
    if (this.craftingOpen || this.contextLost || !this.errorEl.classList.contains('hidden')) return;
    if (!this.hasControllerInput(frame)) return;
    this.hideOverlay();
    if (this.shouldShowHud()) {
      this.crosshair.show();
      this.hud.show();
      this.hotbar.show();
    }
  }

  /**
   * Unified focus-loss handling (246): zero every device for the next frame via
   * clearAll, and end any lock-free session by restoring the pause overlay.
   * Keyboard/mouse pause behavior is unchanged (InputManager clears its own
   * state and fires onLockChange(false), which shows the overlay as today).
   */
  private applyFocusLoss(): void {
    this.resolvedInput = resolveFrame({ ...clearAll(this.buildDeviceFrame(false)), active: false });
    if (
      !this.overlayOpen &&
      !this.pointerLocked &&
      !this.craftingOpen &&
      !this.contextLost &&
      this.errorEl.classList.contains('hidden')
    ) {
      this.showOverlay();
      this.crosshair.hide();
      this.hud.hide();
      this.hotbar.hide();
      this.interaction.clearTarget();
      this.setBreakProgress(0);
    }
  }

  private readonly onWindowFocusLoss = (): void => {
    this.applyFocusLoss();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.applyFocusLoss();
    }
  };

  private onInteractionAction(action: InteractionAction, blockId?: number): void {
    const name = blockId !== undefined
      ? (this.itemRegistry.getByLegacyId(blockId)?.name ?? this.blockRegistry.getByLegacyId(blockId)?.name ?? 'block')
      : 'block';
    switch (action) {
      case 'break':
        this.hotbar.render();
        this.audio.play('break');
        this.showToast(`Collected ${name}`);
        break;
      case 'place':
        this.hotbar.render();
        this.audio.play('place');
        this.showToast(`Placed ${name}`);
        break;
      case 'empty':
        this.showToast(`No ${name} left in this stack`);
        break;
      case 'blocked':
        this.showToast('That action is not possible here');
        break;
      case 'use':
        if (this.isBonemealSelected()) {
          this.useBonemeal();
        } else {
          this.openEnchanting();
        }
        break;
    }
  }

  /** Whether the selected hotbar item is bone meal (the fertilization item). */
  private isBonemealSelected(): boolean {
    return this.inventory.getSelectedStack()?.id === ItemId.BoneMeal;
  }

  /**
   * Use bone meal on the block under the crosshair. Applies growth via the
   * fertilization interface and, only when growth was applied, consumes exactly
   * one bone meal from the selected stack. A no-op target (air, mature crop,
   * non-fertilizable block) consumes nothing.
   */
  private useBonemeal(): void {
    const target = this.interaction.getTarget();
    if (!target) return;
    const applied = bonemealTarget(
      this.worldBlockAccess,
      target.blockX,
      target.blockY,
      target.blockZ,
      () => this.inventory.consumeSelected(),
    );
    if (!applied) return;
    this.hotbar.render();
    this.audio.play('place');
    this.showToast('Fertilized');
  }

  /**
   * Open an enchanting session for the currently held item by right-clicking an
   * enchanting table. The deferred DOM panel (a later change) will consume the
   * resulting {@link EnchantingTableSession}; here we build it and expose it for
   * headless consumers via {@link getEnchantingSession} / {@link applyEnchantingOffer}.
   */
  private openEnchanting(): void {
    const target = this.interaction.getTarget();
    const held = this.inventory.getSelectedStack();
    if (!target || !held || held.count <= 0) return;
    const itemDef = this.itemRegistry.getByLegacyId(held.id);
    if (!itemDef) return;
    const bookShelves = this.countBookshelves(target.blockX, target.blockY, target.blockZ);
    this.enchantingSession = createSession({
      stack: held,
      itemDef,
      bookShelves,
      playerLevel: this.experience.level,
      seed: this.seed,
      registry: this.enchantmentRegistry,
    });
  }

  /**
   * Count bookshelf blocks in the simplified 5×5×2 shell around an enchanting table
   * (clamped to 15). Kept in the interaction layer so the pure core stays
   * geometry-free; a more faithful occlusion-aware scan can replace it later.
   */
  private countBookshelves(cx: number, cy: number, cz: number): number {
    let count = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx === 0 && dz === 0) continue;
        for (let dy = 0; dy <= 1; dy++) {
          if (this.world.getBlock(cx + dx, cy + dy, cz + dz) === BlockId.Bookshelf) {
            count += 1;
          }
        }
      }
    }
    return Math.min(15, count);
  }

  /** The active enchanting session, or null when none is open. */
  getEnchantingSession(): EnchantingTableSession | null {
    return this.enchantingSession;
  }

  /**
   * Apply an offer from the active enchanting session. Returns the {@link
   * EnchantApplyResult}; on success the enchanted stack is written back to the held
   * slot and the spent lapis is removed from the inventory. No-op (null) when no
   * session is open.
   */
  applyEnchantingOffer(offerIndex: number): EnchantApplyResult | null {
    const session = this.enchantingSession;
    if (!session) return null;
    const lapisAvailable = this.inventory.getItemCount(ItemId.LapisLazuli);
    const result = session.apply(offerIndex, {
      experience: this.experience,
      lapisAvailable,
      registry: this.enchantmentRegistry,
    });
    if (result.ok && result.stack) {
      this.inventory.setSelectedStack(result.stack);
      if (result.lapisSpent && result.lapisSpent > 0) {
        this.inventory.removeItem(ItemId.LapisLazuli, result.lapisSpent);
      }
    }
    return result;
  }

  private setBreakProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    this.breakProgressBarEl.style.width = `${Math.round(clamped * 100)}%`;
    this.breakProgressEl.classList.toggle('hidden', clamped <= 0 || !this.pointerLocked);
  }

  private showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.toastEl.classList.add('hidden');
    }, 1500);
  }

  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Persist player state durably when the tab is backgrounded or disposed. */
  private readonly onPageHide = (): void => {
    this.savePlayerStateDurable();
    this.saveTimer = 0;
  };

  /** Apply a bulk-loaded edit snapshot; `importEdits` validates internally. */
  private applyInitialEdits(snapshot: WorldEditSnapshot | null): void {
    if (snapshot) {
      this.world.importEdits(snapshot);
    }
  }

  /**
   * Apply a bulk-loaded player snapshot. A foreign-seed or out-of-range state
   * falls back to the deterministic spawn state, mirroring the old localStorage
   * validation before the durable facade took over loading.
   */
  private applyInitialPlayerState(state: GamePlayerSnapshot | null): void {
    if (!state || state.seed !== this.seed) return;
    const [x, y, z] = state.player.position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (y < CONFIG.bedrockY || y >= CONFIG.chunk.height) return;
    this.player.position.set(x, y, z);
    this.player.yaw = state.player.yaw;
    this.player.pitch = state.player.pitch;
    this.inventory.restore(
      state.inventory,
      (id) => this.itemRegistry.has(id),
      (id) => this.itemRegistry.getByLegacyId(id)?.maxDurability ?? 0,
    );
    this.survival.restore(state.survival);
    this.experience.restore(state.experience);
  }

  /** The game-level player snapshot the facade persists. */
  private buildPlayerSnapshot(): GamePlayerSnapshot {
    return {
      version: 1,
      seed: this.seed,
      player: {
        position: [this.player.position.x, this.player.position.y, this.player.position.z],
        yaw: this.player.yaw,
        pitch: this.player.pitch,
      },
      inventory: this.inventory.snapshot(),
      survival: this.survival.snapshot(),
      experience: this.experience.snapshot(),
    };
  }

  /**
   * Enqueue the latest player state and flush it durably. The facade's flush
   * never throws; the belt-and-braces catch only guards against an unexpected
   * rejection and stays deliberately silent about health — failures surface
   * through `health` / `onHealthChange` / the save-status banner instead.
   */
  private savePlayerStateDurable(): void {
    const p = this.persistenceImpl;
    if (!p) return;
    p.savePlayerState(this.buildPlayerSnapshot());
    void p
      .flush()
      .then((r) => {
        // A verified durable commit clears the sticky boot warning (SAVE-FAIL-3).
        if (r.committed > 0) {
          this.bootSaveDegraded = false;
        }
        this.refreshSaveStatus();
      })
      .catch(() => undefined);
  }

  /**
   * Effective save status = worst of the live health and the sticky boot-time
   * warning; drives the persistent banner.
   */
  private refreshSaveStatus(): void {
    const health = this.persistenceImpl?.health ?? 'ok';
    const effective = health === 'ok' && this.bootSaveDegraded ? 'degraded' : health;
    this.saveStatusIndicator.setStatus(effective);
  }

  private onSurvivalEvent(event: SurvivalEvent, amount?: number): void {
    if (event === 'damage') {
      this.audio.play('damage');
      this.showToast(`Ouch! -${amount ?? 0} health`);
    } else if (event === 'death') {
      this.respawnPlayer();
    }
    this.hud.setSurvival(this.survival.health, this.survival.hunger);
  }

  /**
   * Eat the selected hotbar food item using its registry-defined nutrition, then
   * apply any food-borne status effects. A non-food selection or a full hunger bar
   * (survival.eat returns false) consumes nothing and applies no effects.
   */
  private tryEatSelected(): void {
    const stack = this.inventory.getSelectedStack();
    if (!stack) return;
    const def = this.itemRegistry.getByLegacyId(stack.id);
    if (!def || !def.isFood) return;
    const consume = resolveFoodConsume(def);
    if (!consume) return;
    if (!this.survival.eat({ hunger: consume.hunger, saturation: consume.saturation })) return;
    this.inventory.consumeSelected();
    applyConsumeEffects(this.playerEffects, consume.effects);
    this.hotbar.render();
    this.audio.play('eat');
    this.showToast(`Ate ${def.name}`);
  }

  private respawnPlayer(): void {
    this.player.position.copy(this.spawnPosition);
    this.player.velocity.set(0, 0, 0);
    this.player.onGround = false;
    this.player.inWater = false;
    this.player.inLava = false;
    this.player.fallDistance = 0;
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.survival.consumeDeath();
    this.playerEffects.clear();
    // Teleport discontinuity: never blend the camera across the respawn jump.
    this.playerInterpolator.notifyTeleport();
    this.interaction.clearTarget();
    this.showToast('You died. Respawned at spawn.');
  }

  private readonly onResize = (): void => {
    // Debounce resize events to avoid hammering the renderer during rapid
    // window resizing (e.g. dragging a corner).
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.renderer.resize();
    }, 100);
  };

  /** The durable persistence facade driving saves, or null (E2E observability). */
  get persistence(): GamePersistence | null {
    return this.persistenceImpl;
  }

  /** Keep automated/headless sessions responsive without changing desktop quality. */
  private runtimeRenderDistance(): number {
    const headless = typeof navigator !== 'undefined' && navigator.webdriver;
    return headless ? CONFIG.headless.renderDistance : CONFIG.renderDistance;
  }

  /** Simulation/ticking radius for the current runtime; headless uses its own override. */
  private runtimeSimulationDistance(): number {
    const headless = typeof navigator !== 'undefined' && navigator.webdriver;
    return headless ? CONFIG.headless.simulationDistance : CONFIG.simulationDistance;
  }

  private requireElement(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Required UI element missing: #${id}`);
    }
    return el;
  }
}
