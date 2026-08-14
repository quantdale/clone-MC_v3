/**
 * Central configuration for the voxel game. All tunables live here so they can
 * be adjusted without touching gameplay code.
 */

export const CONFIG = {
  /** World seed used for deterministic generation. Overridable via URL `?seed=`. */
  seed: 1337,

  /** Chunk dimensions in blocks (X × Y × Z). */
  chunk: {
    width: 16,
    height: 64,
    depth: 16,
  },

  /** Number of chunks to load around the player in each horizontal direction. */
  renderDistance: 6,

  /** Number of chunks simulated/ticked around the player in each horizontal direction.
   *  Independent of `renderDistance`; defaults equal so behavior is unchanged until a
   *  later change sets them apart. Chunks beyond this radius are rendered but idle. */
  simulationDistance: 6,

  /** Sea level (world Y) — water fills depressions below this. */
  seaLevel: 32,

  /** World Y of the lowest solid layer (bedrock). */
  bedrockY: 0,

  /** Player interaction reach in blocks. */
  reach: 5,

  /** Maximum number of voxel cells traversed by one interaction ray. */
  maxRaySteps: 512,

  /** Input cooldown between break/place actions, in seconds. */
  actionCooldown: 0.25,

  /** Pointer look sensitivity (radians per pixel). */
  mouseSensitivity: 0.0022,

  /** Maximum camera pitch (radians up/down from horizon). */
  maxPitch: Math.PI / 2 - 0.01,

  /** Player physics. */
  player: {
    height: 1.8,
    radius: 0.3,
    eyeHeight: 1.62,
    walkSpeed: 4.32,
    sprintSpeed: 6.0,
    jumpVelocity: 8.0,
    gravity: 26.0,
    /** Horizontal acceleration per second. */
    acceleration: 50.0,
    /** Horizontal damping (friction) applied per second. */
    damping: 12.0,
    /** Maximum downward speed in blocks per second. */
    terminalVelocity: 54.0,
    /** Maximum distance integrated in one collision sub-step. */
    maxSubstepDisplacement: 0.25,
    /** Maximum vertical rise the controller can automatically step over. */
    stepHeight: 1.0,
    /** Reduced gravity while the player's body is submerged. */
    waterGravity: 8.0,
    /** Downward speed cap while swimming. */
    waterTerminalVelocity: 10.0,
    /** Horizontal movement multiplier while swimming. */
    waterSpeedMultiplier: 0.6,
    /** Upward impulse from the swim/jump control while submerged. */
    swimUpVelocity: 5.5,
  },

  /** Maximum delta time per frame (seconds) to prevent physics explosions. */
  maxDeltaTime: 0.1,

  /** Bounded per-frame work budgets for chunk streaming. */
  budgets: {
    /** Max chunks generated per frame. */
    generatePerFrame: 2,
    /** Max chunks meshed per frame. */
    meshPerFrame: 3,
    /** Max chunks unloaded per frame. */
    unloadPerFrame: 4,
  },

  /** Chunks queued immediately around the spawn point before normal streaming. */
  preloadRadius: 3,

  /** Maximum chunks kept in the generation/mesh queues (bounded). */
  maxQueueSize: 512,

  /** Renderer pixel-ratio cap. */
  maxPixelRatio: 2,

  /** Optional high-quality rendering features. Headless browsers disable shadows automatically. */
  rendering: {
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 96,
    clouds: true,
  },

  /** Conservative quality defaults for automated/headless browser sessions. */
  headless: {
    renderDistance: 2,
    simulationDistance: 2,
    maxPixelRatio: 1,
    clouds: false,
  },

  /** Fog tuning. */
  fog: {
    near: 0.72,
    far: 1.0,
    color: 0x87ceeb,
  },

  /** Smooth, deterministic day-night cycle. */
  dayNight: {
    enabled: true,
    /** Seconds for a full day. */
    dayLength: 600,
  },
} as const;

// Freeze the config at runtime so accidental mutations are caught immediately.
Object.freeze(CONFIG);
Object.freeze(CONFIG.player);
Object.freeze(CONFIG.budgets);
Object.freeze(CONFIG.fog);
Object.freeze(CONFIG.rendering);
Object.freeze(CONFIG.headless);
Object.freeze(CONFIG.dayNight);

export type GameConfig = typeof CONFIG;
