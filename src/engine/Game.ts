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
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { PlayerPhysics } from '../player/PlayerPhysics';
import { PlayerInteraction } from '../player/PlayerInteraction';
import type { InteractionAction } from '../player/PlayerInteraction';
import { ItemEntityManager } from '../simulation/ItemEntityManager';
import { XpOrbManager } from '../simulation/XpOrbManager';
import { LootTableRegistry, buildCurrentLootTables } from '../inventory/LootTable';
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
import { ExperienceSystem } from '../player/ExperienceSystem';
import type { ExperienceSnapshot } from '../player/ExperienceSystem';
import { worldToChunk } from '../world/WorldCoordinates';
import { GameAudio } from '../audio/GameAudio';
import { WorldLife } from '../world/WorldLife';

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
export class Game {
  private readonly blockRegistry: BlockRegistry;
  private readonly itemRegistry: ItemTypeRegistry;
  /** Test hook: the inventory item registry (used by E2E hooks). */
  readonly registry: ItemTypeRegistry;
  private readonly atlas: TextureAtlas;
  private readonly materials: Materials;
  private readonly renderer: Renderer;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly resources: ResourceManager;
  private readonly lighting: Lighting;
  private readonly environment: Environment;
  private readonly worldLife: WorldLife;
  private readonly audio: GameAudio;

  private readonly world: World;
  private readonly player: Player;
  private readonly controller: PlayerController;
  private readonly physics: PlayerPhysics;
  private readonly survival: SurvivalSystem;
  private readonly experience: ExperienceSystem;
  private readonly xpOrbs: XpOrbManager;
  private readonly interaction: PlayerInteraction;
  private readonly lootTables: LootTableRegistry;
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
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private bobTime = 0;

  /** The seed resolved from the URL ?seed= override, or the configured default. */
  readonly seed: number;

  constructor(canvas: HTMLCanvasElement, seed?: number) {
    this.seed = seed ?? this.resolveSeed();

    this.blockRegistry = createDefaultBlockRegistry();
    this.itemRegistry = createDefaultItemRegistry();
    this.registry = this.itemRegistry;
    validateItemBlockCrossReferences(this.blockRegistry, this.itemRegistry);
    this.lootTables = new LootTableRegistry(buildCurrentLootTables(this.blockRegistry, this.itemRegistry), this.itemRegistry);
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
    const renderDistance = this.runtimeRenderDistance();
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
    });
    this.saveStorageKey = `voxel-game-edits-v1:${this.seed}`;
    this.loadSavedEdits();

    this.player = new Player();
    this.spawnPlayerSafely(generator);
    this.spawnPosition = this.player.position.clone();
    this.inventory = new Inventory();
    this.survival = new SurvivalSystem(undefined, (event, amount) => this.onSurvivalEvent(event, amount));
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
      (message) => this.showInputError(message),
    );
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
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.onPageHide);
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
    this.overlayEl.classList.add('hidden');
    this.loading.hide();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private update(dt: number): void {
    if (this.disposed) {
      return;
    }

    // Player chunk used for streaming + debug.
    const [pcx, , pcz] = worldToChunk(this.player.position.x, this.player.position.y, this.player.position.z);

    // Stream before physics. Until the local safety ring is visible, hold the
    // player in place so collision queries never treat an ungenerated chunk as
    // empty space and make the player fall through the spawn area.
    this.world.update(dt, pcx, pcz);
    const readyProgress = this.world.getReadyProgress(pcx, pcz);
    const worldReady = readyProgress >= 1;
    const simulationActive = worldReady && this.pointerLocked && !this.craftingOpen;
    if (simulationActive) {
      this.controller.update(dt);
      this.physics.update(this.player, dt);
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
      if (
        this.input.consumeEat() &&
        this.inventory.getItemCount(ItemId.Apple) > 0 &&
        this.survival.eat({ hunger: 4, saturation: 2 })
      ) {
        this.inventory.removeItem(ItemId.Apple, 1);
        this.hotbar.render();
        this.audio.play('eat');
        this.showToast('Ate an apple');
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
    const bobAmount = moving && this.player.onGround && !this.player.inWater && !this.player.inLava ? Math.sin(this.bobTime) * 0.018 : 0;
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
      if (this.pointerLocked) {
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
      this.overlayEl.classList.add('hidden');
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
  }

  private openCrafting(): void {
    if (this.craftingOpen) return;
    this.craftingOpen = true;
    this.input.releasePointerLock();
    this.overlayEl.classList.add('hidden');
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
    }
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
