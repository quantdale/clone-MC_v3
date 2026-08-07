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
import { BlockRegistry, createDefaultRegistry } from '../world/BlockRegistry';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { ChunkMesher } from '../world/ChunkMesher';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { PlayerPhysics } from '../player/PlayerPhysics';
import { PlayerInteraction } from '../player/PlayerInteraction';
import { Inventory } from '../inventory/Inventory';
import { Hotbar } from '../inventory/Hotbar';
import { Crosshair } from '../ui/Crosshair';
import { HUD } from '../ui/HUD';
import { LoadingIndicator } from '../ui/LoadingIndicator';
import { DebugOverlay } from '../ui/DebugOverlay';
import { worldToChunk } from '../world/WorldCoordinates';

/**
 * Wires the entire game together: renderer, world, player, interaction, UI, and
 * the main loop. Owns the app lifecycle and disposes all resources on stop.
 */
export class Game {
  private readonly registry: BlockRegistry;
  private readonly atlas: TextureAtlas;
  private readonly materials: Materials;
  private readonly renderer: Renderer;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly resources: ResourceManager;
  private readonly lighting: Lighting;
  private readonly environment: Environment;

  private readonly world: World;
  private readonly player: Player;
  private readonly controller: PlayerController;
  private readonly physics: PlayerPhysics;
  private readonly interaction: PlayerInteraction;
  private readonly inventory: Inventory;
  private readonly hotbar: Hotbar;

  private readonly crosshair: Crosshair;
  private readonly hud: HUD;
  private readonly loading: LoadingIndicator;
  private readonly debugOverlay: DebugOverlay;

  private readonly overlayEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly errorMessageEl: HTMLElement;

  // The interaction target outline is scene-owned; track it for cleanup.
  private readonly targetOutline: THREE.LineSegments | null;

  private lastSelection = -1;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private started = false;
  private disposed = false;
  private loadingShown = false;

  /** The seed resolved from the URL ?seed= override, or the configured default. */
  readonly seed: number;

  constructor(canvas: HTMLCanvasElement, seed?: number) {
    this.seed = seed ?? this.resolveSeed();

    this.registry = createDefaultRegistry();
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
    this.environment = new Environment(this.renderer.scene, CONFIG.renderDistance);

    const mesher = new ChunkMesher({ registry: this.registry, atlas: this.atlas });
    const generator = new TerrainGenerator(this.registry, this.seed);
    this.world = new World({
      registry: this.registry,
      seed: this.seed,
      scene: this.renderer.scene,
      mesher,
      generator,
      materials: { opaque: this.materials.opaque, transparent: this.materials.transparent },
      renderDistance: CONFIG.renderDistance,
    });

    this.player = new Player();
    this.spawnPlayerSafely(generator);

    // Preload the spawn area synchronously so the player never stands on
    // un-generated (air-filled) terrain at boot.
    const [spawnChunkX, , spawnChunkZ] = worldToChunk(
      this.player.position.x,
      this.player.position.y,
      this.player.position.z,
    );
    this.world.preloadChunks(spawnChunkX, spawnChunkZ, 3);

    this.input = new InputManager(
      canvas,
      (locked) => this.onLockChange(locked),
      (message) => this.showError(message),
    );
    this.controller = new PlayerController(this.player, this.input);
    this.physics = new PlayerPhysics(this.world, this.registry);
    this.inventory = new Inventory();
    this.interaction = new PlayerInteraction({
      world: this.world,
      registry: this.registry,
      selector: this.inventory,
      player: this.player,
      camera: this.renderer.camera,
      input: this.input,
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
    this.overlayEl = this.requireElement('overlay');
    this.errorEl = this.requireElement('error');
    this.errorMessageEl = this.requireElement('error-message');

    const hotbarEl = document.getElementById('hotbar');
    if (!hotbarEl) {
      throw new Error('Hotbar element missing');
    }
    this.hotbar = new Hotbar(hotbarEl, this.inventory, this.atlas, this.registry);

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
  }

  /** Start the game loop and show the initial UI. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.loading.show();
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
    this.input.dispose();
    window.removeEventListener('resize', this.onResize);
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
  }

  /** Whether the renderer was successfully created (false → show error state). */
  get rendererOk(): boolean {
    return this.renderer.rendererCreated;
  }

  /** Show the unrecoverable initialization error state. */
  showError(message: string): void {
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

    // Physics + movement + interaction.
    this.controller.update(dt);
    this.physics.update(this.player, dt);
    this.interaction.update(dt);

    // World streaming.
    this.world.update(dt, pcx, pcz);

    // Camera follows the player's eye.
    const eye = this.player.eyePosition;
    this.renderer.camera.position.copy(eye);
    this.renderer.camera.rotation.set(0, 0, 0);
    this.renderer.camera.rotateY(this.player.yaw);
    this.renderer.camera.rotateX(this.player.pitch);

    // Lighting / environment.
    this.lighting.update(dt);
    this.environment.update(this.renderer.camera);

    // Hide the loading indicator once the spawn area is ready.
    if (this.loadingShown && this.world.isReady(pcx, pcz)) {
      this.loading.hide();
      this.loadingShown = false;
      this.crosshair.show();
      this.hud.show();
      this.hotbar.show();
    }

    // Hotbar selection (number keys + wheel).
    this.updateHotbar();

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
    // synchronous preload then makes the area solid before the first frame.
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
      const id = this.inventory.getSelectedBlockId();
      this.hud.setSelectedName(this.registry.get(id).name);
    }
  }

  private updateFPS(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
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
    if (locked) {
      this.overlayEl.classList.add('hidden');
      // The HUD/crosshair only appear once the world is ready (see update()).
    } else {
      this.showOverlay();
    }
  }

  /** Invoked when the WebGL context is lost. */
  private onContextLost(): void {
    if (this.renderer.rendererCreated) {
      return;
    }
    this.showError('The graphics context was lost. Please reload the page to continue.');
  }

  /** Invoked when the WebGL context is restored after a loss. */
  private onContextRestored(): void {
    // Clear the context-loss error and return to the pause overlay so the
    // player can click the canvas to re-lock the pointer and resume.
    this.errorEl.classList.add('hidden');
    this.showOverlay();
  }

  private showOverlay(): void {
    this.overlayEl.classList.remove('hidden');
  }

  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

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

  private requireElement(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Required UI element missing: #${id}`);
    }
    return el;
  }
}