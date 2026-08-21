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

  /** Bounded per-frame work budgets for chunk streaming. Count caps are hard safety
   *  limits; the time budgets below are the primary scheduling signal (audit 04). */
  budgets: {
    /** Max chunks generated per frame. */
    generatePerFrame: 2,
    /** Max chunks meshed per frame. */
    meshPerFrame: 3,
    /** Max chunks unloaded per frame. */
    unloadPerFrame: 4,
    /** Main-thread chunk-task time budget per frame (milliseconds). */
    mainThreadChunkMs: 3,
    /** Main-thread GPU upload time budget per frame (milliseconds). */
    uploadMsPerFrame: 1.5,
    /** Light-propagation drain time budget per frame (milliseconds). */
    lightDrainMs: 2,
    /** Maximum simulation ticks run in one frame to catch up accumulated debt. */
    maxCatchUpTicks: 5,
    /** Worker pool size hint; 0 = derive automatically from hardwareConcurrency. */
    workerPoolSize: 0,
    /** Hard cap on GPU buffer-upload bytes accepted per frame. */
    uploadBytesPerFrameCap: 4 * 1024 * 1024,
    /** Queue age above which a warning/telemetry event fires (milliseconds). */
    queueAgeWarnMs: 500,
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

  /** Player experience (117): XP orbs + leveling. */
  xp: {
    /** Blocks within which an XP orb is pulled toward the player. */
    orbAttractionRadius: 8,
    /** Blocks within which an XP orb is collected into the experience total. */
    orbCollectRadius: 1.0,
    /** Orb pull speed (blocks/second). */
    orbAttractionSpeed: 8,
    /** Ticks before an uncollected orb despawns (5 min at 20 TPS). */
    orbDespawnTicks: 6000,
    /** Upward velocity seeded on spawn (blocks/second) for future physics. */
    orbSpawnUpVelocity: 0.2,
    /** XP granted by a single orb spawned on a productive block break. */
    orbValue: 3,
  },
} as const;

/** Quality-tier preset: renderer/streaming knobs a tier switch may adjust. */
export interface QualityTierPreset {
  /** Renderer pixel-ratio cap. */
  maxPixelRatio: number;
  /** Whether shadow maps are enabled. */
  shadows: boolean;
  /** Shadow map resolution (square, in pixels). */
  shadowMapSize: number;
  /** Shadow camera distance in blocks. */
  shadowDistance: number;
  /** Chunk load radius around the player. */
  renderDistance: number;
  /** Chunk simulation radius around the player. */
  simulationDistance: number;
  /** Volumetric-style cloud layer enabled. */
  clouds: boolean;
  /** Post-processing / fancy effects enabled. */
  effects: boolean;
}

/** Named quality tiers, ordered low → high. */
export type QualityTier = 'low' | 'medium' | 'high';

/**
 * Quality-tier presets. `medium` mirrors the top-level defaults so switching
 * tiers is a no-op until a different tier is selected.
 */
export const QUALITY_TIERS: Record<QualityTier, QualityTierPreset> = {
  low: {
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowDistance: 48,
    renderDistance: 3,
    simulationDistance: 3,
    clouds: false,
    effects: false,
  },
  medium: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 96,
    renderDistance: 6,
    simulationDistance: 6,
    clouds: true,
    effects: false,
  },
  high: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 128,
    renderDistance: 8,
    simulationDistance: 8,
    clouds: true,
    effects: true,
  },
};

// Freeze the config at runtime so accidental mutations are caught immediately.
Object.freeze(CONFIG);
Object.freeze(CONFIG.player);
Object.freeze(CONFIG.budgets);
Object.freeze(CONFIG.fog);
Object.freeze(CONFIG.rendering);
Object.freeze(CONFIG.headless);
Object.freeze(CONFIG.dayNight);
Object.freeze(CONFIG.xp);
Object.freeze(QUALITY_TIERS);
for (const preset of Object.values(QUALITY_TIERS)) {
  Object.freeze(preset);
}

export type GameConfig = typeof CONFIG;
