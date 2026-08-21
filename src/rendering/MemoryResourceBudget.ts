/**
 * Long-session memory-resource budget contract (239, memory-resource-budgets).
 *
 * Defines the seven live-resource dimensions the engine tracks over an extended
 * session (loaded chunks, pending streaming jobs, mesh geometries, edit-overlay
 * chunks, block entities, active entities, item entities), a `MemoryResourceConfig`
 * of concrete positive-integer ceilings, a strict validator that rejects anything
 * but a well-formed config (including extra keys), and `evaluateResourceBudget`
 * which produces a per-dimension + overall verdict (`actual <= budget`; malformed
 * actuals violate). It mirrors 075's `evaluateRenderBudget` and is pure,
 * deterministic, and headless-safe (no DOM, no THREE).
 *
 * `DEFAULT_MEMORY_RESOURCE_BUDGET` is derived from the documented runtime caps below
 * via `deriveMemoryResourceBudget(6)` (desktop render distance R=6). The e2e
 * long-session suite derives its own budget from the headless R=2 ring.
 *
 * Also hosts the `MemoryResourceLedger`, the resource ownership ledger from the
 * deep-engine audit: aggregate counts + estimated bytes per `ResourceCategory`
 * with source tags, bounded internal storage, and convergence snapshots for
 * leak detection.
 */

/** The seven live-resource dimensions measured over a session. */
export type MemoryResourceDimension =
  | 'loadedChunks'
  | 'pendingJobs'
  | 'meshGeometries'
  | 'editOverlayChunks'
  | 'blockEntities'
  | 'activeEntities'
  | 'itemEntities';

/** A snapshot of plain non-negative live-resource counts. */
export interface LiveResourceSnapshot {
  loadedChunks: number;
  pendingJobs: number;
  meshGeometries: number;
  editOverlayChunks: number;
  blockEntities: number;
  activeEntities: number;
  itemEntities: number;
}

/** Positive-integer ceilings for the seven dimensions. */
export interface MemoryResourceConfig {
  maxLoadedChunks: number;
  maxPendingJobs: number;
  maxMeshGeometries: number;
  maxEditOverlayChunks: number;
  maxBlockEntities: number;
  maxActiveEntities: number;
  maxItemEntities: number;
}

/** One dimension of a memory-resource budget evaluation. */
export interface MemoryResourceEntry {
  dimension: MemoryResourceDimension;
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The full evaluation verdict: per dimension plus overall. */
export interface MemoryResourceReport {
  withinBudget: boolean;
  entries: readonly MemoryResourceEntry[];
}

// ── Documented runtime caps the defaults are derived from ────────────────────
/** `CONFIG.maxQueueSize` (src/config). */
export const MAX_QUEUE_SIZE = 512;
/** `World.EDIT_OVERLAY_MAX_CHUNKS` (src/world/World.ts). */
export const EDIT_OVERLAY_MAX_CHUNKS = 10_000;
/** `SPAWN_CAP` (passive mob cap, src/simulation/PassiveMobBaseline.ts). */
export const PASSIVE_SPAWN_CAP = 12;
/** Fixed allowance above the spawn cap for the active-entity ceiling. */
export const ACTIVE_ENTITY_ALLOWANCE = 256;
/** Documented block-entity cap (one block entity per loaded-cell upper bound). */
export const BLOCK_ENTITY_CAP = 4_096;
/** Documented concurrent item-entity + xp-orb cap. */
export const ITEM_ENTITY_CAP = 1_024;
/** Fixed allowance for constant-shape geometries (world-life, mobs, environment). */
export const GEOMETRY_FIXED_ALLOWANCE = 40;
/** `CONFIG.preloadRadius` — boot preload radius that sets the residency ceiling. */
export const PRELOAD_RADIUS = 3;

/** Fixed evaluation order (normative — must not change). */
export const DIMENSIONS: readonly MemoryResourceDimension[] = [
  'loadedChunks',
  'pendingJobs',
  'meshGeometries',
  'editOverlayChunks',
  'blockEntities',
  'activeEntities',
  'itemEntities',
];

/** Budget field per dimension. */
const DIMENSION_TO_BUDGET: Record<MemoryResourceDimension, keyof MemoryResourceConfig> = {
  loadedChunks: 'maxLoadedChunks',
  pendingJobs: 'maxPendingJobs',
  meshGeometries: 'maxMeshGeometries',
  editOverlayChunks: 'maxEditOverlayChunks',
  blockEntities: 'maxBlockEntities',
  activeEntities: 'maxActiveEntities',
  itemEntities: 'maxItemEntities',
};

const CONFIG_FIELDS: readonly (keyof MemoryResourceConfig)[] = [
  'maxLoadedChunks',
  'maxPendingJobs',
  'maxMeshGeometries',
  'maxEditOverlayChunks',
  'maxBlockEntities',
  'maxActiveEntities',
  'maxItemEntities',
];

/** Number of loaded chunks in the interest ring `(2R+1)^2 × layerCount`. */
export function computeRingCardinality(renderDistance: number, layerCount = 1): number {
  if (!Number.isInteger(renderDistance) || renderDistance < 0) {
    throw new Error('computeRingCardinality: renderDistance must be a non-negative integer');
  }
  if (!Number.isInteger(layerCount) || layerCount < 1) {
    throw new Error('computeRingCardinality: layerCount must be a positive integer');
  }
  return (2 * renderDistance + 1) * (2 * renderDistance + 1) * layerCount;
}

/** Optional overrides when deriving a budget (defaults come from the caps above). */
export interface DeriveMemoryResourceBudgetOptions {
  layerCount?: number;
  /** Boot preload radius (`CONFIG.preloadRadius`). Preloaded chunks are retained
   *  up to the unload limit (`renderDistance + 1`), so the residency ceiling is
   *  driven by the larger of the streaming and preload radii. */
  preloadRadius?: number;
  maxQueueSize?: number;
  editOverlayMaxChunks?: number;
  maxBlockEntities?: number;
  maxItemEntities?: number;
  spawnCap?: number;
  activeEntityAllowance?: number;
}

/**
 * Derive a `MemoryResourceConfig` from the documented runtime caps for a given
 * render distance. `maxLoadedChunks` follows the engine's actual residency
 * ceiling: the larger of the streaming ring `(2·R+1)²` and the boot-preload ring
 * `(2·preloadRadius+1)²` (preloaded chunks are kept up to the unload limit
 * `R+1`, and preloadRadius ≤ R+1 always holds, so preloaded chunks are never
 * immediately evicted). `maxPendingJobs = maxQueueSize + maxLoadedChunks` (the
 * generation/mesh queues are bounded by `CONFIG.maxQueueSize`, the retry mesh
 * queue is loaded-chunk-bounded); `maxMeshGeometries = 2·maxLoadedChunks +
 * allowance` (opaque + transparent mesh per chunk plus constant-shape geometry).
 */
export function deriveMemoryResourceBudget(
  renderDistance: number,
  opts: DeriveMemoryResourceBudgetOptions = {},
): MemoryResourceConfig {
  const effectiveRadius = Math.max(renderDistance, opts.preloadRadius ?? PRELOAD_RADIUS);
  const maxLoadedChunks = computeRingCardinality(effectiveRadius, opts.layerCount ?? 1);
  return {
    maxLoadedChunks,
    maxPendingJobs: (opts.maxQueueSize ?? MAX_QUEUE_SIZE) + maxLoadedChunks,
    maxMeshGeometries: 2 * maxLoadedChunks + GEOMETRY_FIXED_ALLOWANCE,
    maxEditOverlayChunks: opts.editOverlayMaxChunks ?? EDIT_OVERLAY_MAX_CHUNKS,
    maxBlockEntities: opts.maxBlockEntities ?? BLOCK_ENTITY_CAP,
    maxActiveEntities: (opts.spawnCap ?? PASSIVE_SPAWN_CAP) + (opts.activeEntityAllowance ?? ACTIVE_ENTITY_ALLOWANCE),
    maxItemEntities: opts.maxItemEntities ?? ITEM_ENTITY_CAP,
  };
}

/** Desktop render-distance default budget (R=6, layerCount=1). */
export const DEFAULT_MEMORY_RESOURCE_BUDGET: MemoryResourceConfig = deriveMemoryResourceBudget(6);

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validate an unknown value as `MemoryResourceConfig`. Returns the same value
 * (narrowed) on success; throws a descriptive error naming the offending field
 * for a non-object, a non-positive-integer field, or an extra unknown key.
 */
export function validateMemoryResourceConfig(input: unknown): MemoryResourceConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('MemoryResourceConfig: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const field of CONFIG_FIELDS) {
    if (!isPositiveInteger(r[field])) {
      throw new Error(`MemoryResourceConfig: ${field} must be a positive integer, got ${String(r[field])}`);
    }
  }
  for (const key of Object.keys(r)) {
    if (!CONFIG_FIELDS.includes(key as keyof MemoryResourceConfig)) {
      throw new Error(`MemoryResourceConfig: unknown key "${key}" is not allowed`);
    }
  }
  return r as unknown as MemoryResourceConfig;
}

/** Whether an actual count is acceptable (non-negative finite number) and within budget. */
function withinBudget(budget: number, actual: unknown): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return actual <= budget;
}

/**
 * Evaluate a live-resource snapshot against the budget contract. Malformed
 * actuals (negative, NaN, Infinity, missing, non-numeric) violate their
 * dimension; the overall verdict is within only when every dimension is.
 * Never throws for a malformed snapshot; throws only on an invalid config.
 */
export function evaluateResourceBudget(
  config: MemoryResourceConfig,
  snapshot: LiveResourceSnapshot,
): MemoryResourceReport {
  const cfg = validateMemoryResourceConfig(config);
  const raw = snapshot as unknown as Record<string, unknown>;
  const entries: MemoryResourceEntry[] = DIMENSIONS.map((dimension) => {
    const budget = cfg[DIMENSION_TO_BUDGET[dimension]];
    const actual = raw[dimension];
    return {
      dimension,
      budget,
      actual: typeof actual === 'number' ? actual : Number.NaN,
      withinBudget: withinBudget(budget, actual),
    };
  });
  return { withinBudget: entries.every((entry) => entry.withinBudget), entries };
}

// ── Resource ownership ledger ────────────────────────────────────────────────

/** Live-resource categories the engine owns memory for (audit 04/05). */
export type ResourceCategory =
  | 'cpuVoxelStorage'
  | 'editOverlays'
  | 'workerBuffers'
  | 'geometries'
  | 'textures'
  | 'materials'
  | 'entities'
  | 'particles'
  | 'audio';

/** Fixed category order (normative for reports). */
export const RESOURCE_CATEGORIES: readonly ResourceCategory[] = [
  'cpuVoxelStorage',
  'editOverlays',
  'workerBuffers',
  'geometries',
  'textures',
  'materials',
  'entities',
  'particles',
  'audio',
];

/** Aggregate usage of one category: live item count + estimated bytes. */
export interface CategoryUsage {
  count: number;
  estimatedBytes: number;
}

/** Aggregate usage across all categories. */
export type CategoryUsageMap = Readonly<Record<ResourceCategory, CategoryUsage>>;

/** One convergence comparison between a baseline and a current snapshot. */
export interface ConvergenceEntry {
  category: ResourceCategory;
  baselineCount: number;
  baselineBytes: number;
  currentCount: number;
  currentBytes: number;
  /** Current exceeds baseline beyond the tolerance fraction. */
  leaked: boolean;
}

/** Convergence verdict: per-category deltas plus overall leak flag. */
export interface ConvergenceReport {
  leaked: boolean;
  entries: readonly ConvergenceEntry[];
}

function zeroUsage(): Record<ResourceCategory, CategoryUsage> {
  const map = {} as Record<ResourceCategory, CategoryUsage>;
  for (const category of RESOURCE_CATEGORIES) {
    map[category] = { count: 0, estimatedBytes: 0 };
  }
  return map;
}

/**
 * Resource ownership ledger. Tracks aggregate counts and estimated bytes per
 * `ResourceCategory`, tagged with the registering subsystem's source tag.
 *
 * Storage is bounded by design: only per-category aggregate counters are kept
 * (never per-item lists), so the ledger itself cannot grow with session length.
 * Releases that exceed the registered amount are clamped and counted as
 * underflows instead of throwing, so a bad release path cannot crash the frame.
 */
export class MemoryResourceLedger {
  private readonly usage = zeroUsage();
  private underflows = 0;

  /**
   * Register live resources. `count` is the number of items; `estimatedBytes`
   * the estimated total footprint added.
   */
  register(category: ResourceCategory, sourceTag: string, count = 1, estimatedBytes = 0): void {
    if (!Number.isFinite(count) || count < 0 || !Number.isFinite(estimatedBytes) || estimatedBytes < 0) {
      throw new RangeError(`MemoryResourceLedger.register(${category}): invalid count/bytes from "${sourceTag}"`);
    }
    const entry = this.usage[category];
    entry.count += count;
    entry.estimatedBytes += estimatedBytes;
  }

  /** Release previously registered resources; over-release is clamped and counted. */
  release(category: ResourceCategory, sourceTag: string, count = 1, estimatedBytes = 0): void {
    if (!Number.isFinite(count) || count < 0 || !Number.isFinite(estimatedBytes) || estimatedBytes < 0) {
      throw new RangeError(`MemoryResourceLedger.release(${category}): invalid count/bytes from "${sourceTag}"`);
    }
    const entry = this.usage[category];
    if (count > entry.count || estimatedBytes > entry.estimatedBytes) {
      this.underflows += 1;
    }
    entry.count = Math.max(0, entry.count - count);
    entry.estimatedBytes = Math.max(0, entry.estimatedBytes - estimatedBytes);
  }

  /** Current aggregate usage per category. */
  snapshot(): CategoryUsageMap {
    const out = {} as Record<ResourceCategory, CategoryUsage>;
    for (const category of RESOURCE_CATEGORIES) {
      const entry = this.usage[category];
      out[category] = { count: entry.count, estimatedBytes: entry.estimatedBytes };
    }
    return out;
  }

  /** Number of releases that exceeded the registered amount (accounting drift). */
  get underflowCount(): number {
    return this.underflows;
  }

  /** Total estimated bytes currently held across all categories. */
  get totalEstimatedBytes(): number {
    let total = 0;
    for (const category of RESOURCE_CATEGORIES) {
      total += this.usage[category].estimatedBytes;
    }
    return total;
  }

  /**
   * Compare a baseline snapshot against the current one for leak detection.
   * A category is flagged when its current bytes exceed the baseline plus
   * `toleranceFraction` (relative to the baseline, absolute floors apply so
   * near-zero baselines do not flag on noise).
   */
  convergence(
    baseline: CategoryUsageMap,
    toleranceFraction = 0.15,
    absoluteByteTolerance = 1024 * 1024,
  ): ConvergenceReport {
    const current = this.snapshot();
    const entries: ConvergenceEntry[] = RESOURCE_CATEGORIES.map((category) => {
      const base = baseline[category];
      const now = current[category];
      const allowed = Math.max(base.estimatedBytes * toleranceFraction, absoluteByteTolerance);
      const leaked = now.estimatedBytes > base.estimatedBytes + allowed;
      return {
        category,
        baselineCount: base.count,
        baselineBytes: base.estimatedBytes,
        currentCount: now.count,
        currentBytes: now.estimatedBytes,
        leaked,
      };
    });
    return { leaked: entries.some((entry) => entry.leaked), entries };
  }
}
