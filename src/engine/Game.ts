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
import type { InventorySnapshot } from '../inventory/Inventory';
import { Hotbar } from '../inventory/Hotbar';
import { Crosshair } from '../ui/Crosshair';
import { HUD } from '../ui/HUD';
import { LoadingIndicator } from '../ui/LoadingIndicator';
import { DebugOverlay } from '../ui/DebugOverlay';
import { CraftingPanel } from '../ui/CraftingPanel';
import type { CraftingRecipe } from '../inventory/Crafting';
import { SurvivalSystem } from '../player/SurvivalSystem';
import type { SurvivalEvent, SurvivalSnapshot } from '../player/SurvivalSystem';
import { resolveFoodConsume, applyConsumeEffects } from '../player/FoodComponentRuntime';
import { StatusEffectManager } from '../data/StatusEffectManager';
import { createDefaultStatusEffectRegistry } from '../data/StatusEffect';
import { createDefaultAttributeRegistry } from '../data/AttributeRegistry';
import { ExperienceSystem } from '../player/ExperienceSystem';
import type { ExperienceSnapshot } from '../player/ExperienceSystem';
import { worldToChunk } from '../world/WorldCoordinates';
import { GameAudio } from '../audio/GameAudio';
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

interface GameSaveSnapshot {
  version: 1;
  seed: number;
  player: {
    position: [number, number, number];
    yaw: number;
    pitch: number;
  };
  inventory: InventorySnapshot;
  survival: SurvivalSnapshot;
  experience: ExperienceSnapshot;
}

/**
 * Wires the entire game together: renderer, world, player, interaction, UI, and
 * the main loop. Owns the app lifecycle and disposes all resources on stop.
 */
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
  private readonly saveStorageKey: string;
  private readonly spawnPosition: THREE.Vector3;

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
  ) {
    this.seed = seed ?? this.resolveSeed();
    this.gameCanvas = canvas;

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
      materials: { opaque: this.materials.opaque, transparent: this.materials.transparent },
      renderDistance,
      simulationDistance: this.runtimeSimulationDistance(),
      stateRegistry: this.stateRegistry,
    });
    this.worldBlockAccess = new WorldBlockAccess(this.world);
    this.saveStorageKey = `voxel-game-edits-v1:${this.seed}`;
    this.loadSavedEdits();

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
    this.loadPlayerState();

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
    this.physics = new PlayerPhysics(this.world, this.blockRegistry);
    this.itemEntities = new ItemEntityManager({ itemRegistry: this.itemRegistry, rng: Math.random });
    this.experience = new ExperienceSystem();
    this.xpOrbs = new XpOrbManager({ rng: Math.random });
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
    this.showOverlay();
    this.loop.start();
  }

  /** Dispose all resources and stop the loop. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.loop.stop();
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.saveEdits();
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

    // Player chunk used for streaming + debug.
    const [pcx, , pcz] = worldToChunk(this.player.position.x, this.player.position.y, this.player.position.z);

    // Stream before physics. Until the local safety ring is visible, hold the
    // player in place so collision queries never treat an ungenerated chunk as
    // empty space and make the player fall through the spawn area.
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
    if (simulationActive) {
      this.controller.update(dt);
      this.physics.update(this.player, dt);
      this.tickRandomBlocks();
      this.itemEntities.tickItemEntities(dt);
      this.itemEntities.mergeEntities();
      this.itemEntities.despawnExpired();
      const collected = this.itemEntities.collectPlayerDrops(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z,
        (id, count) => this.inventory.addItem(id, count),
      );
      if (collected > 0) this.hotbar.render();
      this.xpOrbs.tickItemEntities(
        dt,
        this.player.position.x,
        this.player.position.y,
        this.player.position.z,
        this.experience,
      );
      this.worldLife.update(dt, this.player.position);
      this.tickPassiveMobs(dt);
      this.passiveMobRenderer.sync(this.passiveMobs.getActivePigs());
      this.tickHostileMobs(dt);
      this.hostileMobRenderer.sync(this.hostileMobs.getActiveZombies());
      this.breeding.tick(this.passiveMobs.getManager(), this.passiveMobs.getActivePigs(), this.pigBreedableSpecies, SPAWN_CAP);
      const headY = Math.floor(this.player.position.y + CONFIG.player.eyeHeight);
      const headSubmerged = this.world.getBlock(
        Math.floor(this.player.position.x),
        headY,
        Math.floor(this.player.position.z),
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
    } else {
      this.controller.update(0);
      this.player.velocity.set(0, 0, 0);
      if (!worldReady) {
        this.player.onGround = false;
        this.interaction.clearTarget();
      }
    }

    // Camera follows the player's eye.
    const eye = this.player.eyePosition;
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
    this.renderer.camera.position.copy(eye);
    this.renderer.camera.position.y += bobAmount;
    this.renderer.camera.rotation.set(0, 0, 0);
    this.renderer.camera.rotateY(this.player.yaw);
    this.renderer.camera.rotateX(this.player.pitch);

    // Raycast from the camera after it has followed the current player pose so
    // selection and block actions never lag one frame behind movement/look.
    if (simulationActive) {
      this.interaction.update(dt);
    }

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

  private render(): void {
    if (this.disposed) {
      return;
    }
    this.renderer.render();
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

  /** Persist edits when the tab is backgrounded or the game is disposed. */
  private readonly onPageHide = (): void => {
    this.saveEdits();
  };

  private loadSavedEdits(): void {
    try {
      const raw = window.localStorage.getItem(this.saveStorageKey);
      if (raw) {
        this.world.importEdits(JSON.parse(raw) as unknown);
      }
    } catch {
      // Storage can be disabled or contain malformed data. A fresh world is a
      // safe fallback and should not prevent the renderer from starting.
    }
  }

  private loadPlayerState(): void {
    try {
      const raw = window.localStorage.getItem(this.stateStorageKey());
      if (!raw) return;
      const snapshot = JSON.parse(raw) as unknown;
      if (!this.isGameSaveSnapshot(snapshot) || snapshot.seed !== this.seed) return;
      const [x, y, z] = snapshot.player.position;
      this.player.position.set(x, y, z);
      this.player.yaw = snapshot.player.yaw;
      this.player.pitch = snapshot.player.pitch;
      this.inventory.restore(
        snapshot.inventory,
        (id) => this.itemRegistry.has(id),
        (id) => this.itemRegistry.getByLegacyId(id)?.maxDurability ?? 0,
      );
      this.survival.restore(snapshot.survival);
      this.experience.restore(snapshot.experience);
    } catch {
      // A missing, corrupt, or unavailable browser save falls back to the
      // deterministic spawn state without preventing the game from starting.
    }
  }

  private saveEdits(): void {
    try {
      const snapshot = this.world.exportEdits();
      window.localStorage.setItem(this.saveStorageKey, JSON.stringify(snapshot));
    } catch {
      // Quota/private-mode errors are non-fatal; the active world remains
      // playable and the in-memory overlay still survives chunk unloads.
    }
    this.savePlayerState();
  }

  private savePlayerState(): void {
    try {
      const snapshot: GameSaveSnapshot = {
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
      window.localStorage.setItem(this.stateStorageKey(), JSON.stringify(snapshot));
    } catch {
      // Browser storage is an enhancement; memory-only play remains valid.
    }
  }

  private stateStorageKey(): string {
    return `voxel-game-state-v1:${this.seed}`;
  }

  private isGameSaveSnapshot(value: unknown): value is GameSaveSnapshot {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<GameSaveSnapshot>;
    const player = candidate.player;
    return (
      candidate.version === 1 &&
      Number.isInteger(candidate.seed) &&
      typeof player === 'object' &&
      player !== null &&
      Array.isArray(player.position) &&
      player.position.length === 3 &&
      player.position.every((part) => typeof part === 'number' && Number.isFinite(part)) &&
      typeof player.yaw === 'number' &&
      Number.isFinite(player.yaw) &&
      typeof player.pitch === 'number' &&
      Number.isFinite(player.pitch) &&
      typeof candidate.inventory === 'object' &&
      candidate.inventory !== null &&
      typeof candidate.survival === 'object' &&
      candidate.survival !== null &&
      typeof candidate.experience === 'object' &&
      candidate.experience !== null &&
      player.position[1] >= CONFIG.bedrockY &&
      player.position[1] < CONFIG.chunk.height
    );
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

  private resolveSeed(): number {
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
