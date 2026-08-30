/**
 * Pipeline resource-budget dimensions (255 task 28).
 *
 * Defines the seven live pipeline-resource dimensions the high-performance
 * voxel-engine campaign tracks over an extended session (worker buffers,
 * ready records, ready bytes, per-frame upload bytes, upload deferrals,
 * LOD tiles, LOD cache bytes), a `PipelineResourceBudgetConfig` of concrete
 * positive-integer ceilings, a strict validator that rejects anything but a
 * well-formed config (including extra keys), and
 * `evaluatePipelineResourceBudget` which produces a per-dimension + overall
 * verdict (`actual <= budget`; malformed actuals violate, never throw).
 *
 * This mirrors the 239 `MemoryResourceBudget` and 075 `evaluateRenderBudget`
 * conventions exactly and is pure, deterministic, and headless-safe (no DOM,
 * no THREE). Values are sampled from the 075 `RenderPerformanceMonitor`
 * pipeline snapshot via `fromRenderPipelineMetrics`, so the budget evaluator
 * owns no live state and cannot become a second authority.
 *
 * `DEFAULT_PIPELINE_RESOURCE_BUDGET` is derived from the documented runtime
 * caps of the owning components (see the constant documentation below); it is
 * a policy default, not a measured claim.
 */
import {
  DEFAULT_MAX_IN_FLIGHT_PER_WORKER,
  DEFAULT_MAX_PENDING,
  MAX_POOL_SIZE,
} from '../engine/WorkerPool';
import { DEFAULT_MESH_READY_QUEUE_CONFIG } from './MeshReadyQueue';
import {
  LOD_RENDER_INDEX_COUNT,
  LOD_RENDER_VERTEX_COUNT,
} from './LodTileRender';
import type { RenderPipelineMetrics } from './RenderPerformanceMonitor';

/** The seven live pipeline-resource dimensions measured over a session. */
export type PipelineResourceDimension =
  | 'workerBuffers'
  | 'readyRecords'
  | 'readyBytes'
  | 'uploadBytesPerFrame'
  | 'uploadDeferred'
  | 'lodTiles'
  | 'lodBytes';

/** Fixed order in which budget entries are reported (determinism contract). */
export const PIPELINE_RESOURCE_DIMENSIONS: readonly PipelineResourceDimension[] = [
  'workerBuffers',
  'readyRecords',
  'readyBytes',
  'uploadBytesPerFrame',
  'uploadDeferred',
  'lodTiles',
  'lodBytes',
];

/** A snapshot of plain non-negative integer pipeline-resource counts. */
export interface PipelineResourceSnapshot {
  /** Queued + in-flight worker jobs across the pool. */
  workerBuffers: number;
  /** Mesh-ready records held between worker completion and upload. */
  readyRecords: number;
  /** Aggregate bytes held by mesh-ready records. */
  readyBytes: number;
  /** Bytes attached by the upload path during the last completed frame. */
  uploadBytesPerFrame: number;
  /** Records deferred by the upload budget in the last completed frame. */
  uploadDeferred: number;
  /** Presentation-only LOD tiles currently owned. */
  lodTiles: number;
  /** Aggregate bytes owned by LOD tiles. */
  lodBytes: number;
}

/** Positive-integer ceilings for the seven pipeline dimensions. */
export interface PipelineResourceBudgetConfig {
  maxWorkerBuffers: number;
  maxReadyRecords: number;
  maxReadyBytes: number;
  maxUploadBytesPerFrame: number;
  maxUploadDeferred: number;
  maxLodTiles: number;
  maxLodBytes: number;
}

// ── Documented runtime caps the defaults are derived from ────────────────────
/** Materials/biome lattice entries of one LOD tile (fixed 16×16 top grid). */
const LOD_RENDER_GRID_MATERIAL_COUNT = 16 * 16;

/**
 * Worker admission bound: the pool's hard pending-queue cap plus every pool
 * slot's in-flight capacity at the maximum documented pool size.
 */
export const MAX_WORKER_BUFFERS =
  DEFAULT_MAX_PENDING + MAX_POOL_SIZE * DEFAULT_MAX_IN_FLIGHT_PER_WORKER;
/** Mesh-ready queue hard record cap (`MeshReadyQueue` default config). */
export const MAX_READY_RECORDS = DEFAULT_MESH_READY_QUEUE_CONFIG.maxRecords;
/** Mesh-ready queue hard byte cap (`MeshReadyQueue` default config). */
export const MAX_READY_BYTES = DEFAULT_MESH_READY_QUEUE_CONFIG.maxBytes;
/**
 * Per-frame GPU-upload byte ceiling. Upload budgets are caller-configured
 * (the scheduler has no default); this default is a conservative policy
 * ceiling consistent with the task-18 storm discipline of a small number of
 * uploads per frame, far above measured per-record upload work.
 */
export const MAX_UPLOAD_BYTES_PER_FRAME = 4 * 1024 * 1024;
/**
 * Upload deferrals return their record intact to the ready queue, so the
 * ready record cap bounds the deferred population exactly.
 */
export const MAX_UPLOAD_DEFERRED = DEFAULT_MESH_READY_QUEUE_CONFIG.maxRecords;
/**
 * Worst-case documented bytes of one LOD render tile: top grid + skirt
 * vertices (Float32 positions), Uint32 indices, Uint16 materials, and a
 * Uint8 biome lattice.
 */
export const ESTIMATED_MAX_LOD_TILE_BYTES =
  LOD_RENDER_VERTEX_COUNT * 3 * 4 +
  LOD_RENDER_INDEX_COUNT * 4 +
  LOD_RENDER_GRID_MATERIAL_COUNT * 2 +
  LOD_RENDER_GRID_MATERIAL_COUNT;
/**
 * Presentation-only LOD caches are opt-in and caller-configured; 256 tiles is
 * the conservative default ceiling for the far horizon (≈3.3 MiB at the
 * documented worst-case tile size).
 */
export const MAX_LOD_TILES = 256;
/** Default LOD byte ceiling: the tile cap at the documented worst-case size. */
export const MAX_LOD_BYTES = MAX_LOD_TILES * ESTIMATED_MAX_LOD_TILE_BYTES;

/** Map a 075 monitor pipeline snapshot onto the budget dimensions. */
export function fromRenderPipelineMetrics(
  metrics: RenderPipelineMetrics,
): PipelineResourceSnapshot {
  return {
    workerBuffers: metrics.worker.pending + metrics.worker.inFlight,
    readyRecords: metrics.ready.count,
    readyBytes: metrics.ready.bytes,
    // The last completed frame is the stable per-frame upload observable;
    // `bytesThisFrame` is a mid-frame accumulator during recording.
    uploadBytesPerFrame: metrics.upload.bytesLastFrame,
    uploadDeferred: metrics.upload.deferredCount,
    lodTiles: metrics.lod.entries,
    lodBytes: metrics.lod.bytes,
  };
}

/** Default budget derived from the documented runtime caps above. */
export const DEFAULT_PIPELINE_RESOURCE_BUDGET: PipelineResourceBudgetConfig =
  Object.freeze({
    maxWorkerBuffers: MAX_WORKER_BUFFERS,
    maxReadyRecords: MAX_READY_RECORDS,
    maxReadyBytes: MAX_READY_BYTES,
    maxUploadBytesPerFrame: MAX_UPLOAD_BYTES_PER_FRAME,
    maxUploadDeferred: MAX_UPLOAD_DEFERRED,
    maxLodTiles: MAX_LOD_TILES,
    maxLodBytes: MAX_LOD_BYTES,
  });

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validate a budget config strictly: exactly the seven documented keys, each a
 * positive integer. Mirrors the 239 `validateMemoryResourceConfig` contract.
 */
export function validatePipelineResourceBudgetConfig(
  config: PipelineResourceBudgetConfig,
): PipelineResourceBudgetConfig {
  if (typeof config !== 'object' || config === null) {
    throw new TypeError('PipelineResourceBudget: config must be an object');
  }
  const seen = new Set(Object.keys(config));
  for (const key of PIPELINE_BUDGET_KEYS) {
    if (!seen.has(key)) {
      throw new TypeError(`PipelineResourceBudget: missing key "${key}"`);
    }
    if (!isPositiveInteger(config[key])) {
      throw new RangeError(`PipelineResourceBudget: ${key} must be a positive integer`);
    }
  }
  if (seen.size !== PIPELINE_BUDGET_KEYS.length) {
    const extra = [...seen]
      .filter((key) => !PIPELINE_BUDGET_KEYS.includes(key as keyof PipelineResourceBudgetConfig))
      .join(', ');
    throw new TypeError(`PipelineResourceBudget: unknown extra keys: ${extra}`);
  }
  return Object.freeze({ ...config });
}

function isWellFormedActual(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Evaluate a pipeline resource snapshot against a budget.
 *
 * Deterministic: identical `(config, snapshot)` inputs produce identical
 * reports; entries are reported in the fixed `PIPELINE_RESOURCE_DIMENSIONS`
 * order; boundary equality (`actual === budget`) is within budget; a malformed
 * actual (non-integer, negative, non-finite) marks its dimension violating and
 * never throws.
 */
export function evaluatePipelineResourceBudget(
  config: PipelineResourceBudgetConfig,
  snapshot: PipelineResourceSnapshot,
): PipelineResourceReport {
  if (typeof config !== 'object' || config === null) {
    throw new TypeError('PipelineResourceBudget: config must be an object');
  }
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new TypeError('PipelineResourceBudget: snapshot must be an object');
  }
  const entries: PipelineResourceEntry[] = PIPELINE_RESOURCE_DIMENSIONS.map(
    (dimension) => {
      const budget = config[BUDGET_KEY_BY_DIMENSION[dimension]];
      const actual = snapshot[dimension];
      const wellFormed = isWellFormedActual(actual);
      return {
        dimension,
        budget,
        actual: wellFormed ? actual : Number.NaN,
        withinBudget: wellFormed && actual <= budget,
      };
    },
  );
  return {
    withinBudget: entries.every((entry) => entry.withinBudget),
    entries,
  };
}

export interface PipelineResourceEntry {
  dimension: PipelineResourceDimension;
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The full evaluation verdict: per dimension plus overall. */
export interface PipelineResourceReport {
  withinBudget: boolean;
  entries: readonly PipelineResourceEntry[];
}

/** The `max*` budget-config key owning each dimension (fixed pairing). */
export const PIPELINE_BUDGET_KEYS: readonly (keyof PipelineResourceBudgetConfig)[] = [
  'maxWorkerBuffers',
  'maxReadyRecords',
  'maxReadyBytes',
  'maxUploadBytesPerFrame',
  'maxUploadDeferred',
  'maxLodTiles',
  'maxLodBytes',
];

const BUDGET_KEY_BY_DIMENSION: Readonly<
  Record<PipelineResourceDimension, keyof PipelineResourceBudgetConfig>
> = {
  workerBuffers: 'maxWorkerBuffers',
  readyRecords: 'maxReadyRecords',
  readyBytes: 'maxReadyBytes',
  uploadBytesPerFrame: 'maxUploadBytesPerFrame',
  uploadDeferred: 'maxUploadDeferred',
  lodTiles: 'maxLodTiles',
  lodBytes: 'maxLodBytes',
};
