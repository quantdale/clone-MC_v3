import { MeshReadyQueue, type MeshReadyRecord } from './MeshReadyQueue';

/** Per-frame limits for the work performed by the upload executor. */
export interface GpuUploadBudget {
  readonly maxBytes: number;
  readonly maxMillis: number;
  readonly maxUploadsPerFrame?: number;
}

/** Scheduler configuration, including the initial estimate before EMA history exists. */
export interface GpuUploadSchedulerConfig extends GpuUploadBudget {
  readonly estimatedUploadMillis: number;
}

/** Optional executor-reported physical upload size for observability. */
export interface GpuUploadExecutorResult {
  readonly uploadedBytes?: number;
}

/** The only resource-creation seam owned by the caller of the scheduler. */
export type GpuUploadExecutor = (
  record: MeshReadyRecord,
) => void | GpuUploadExecutorResult;

/** Per-frame accounting returned after one bounded scheduler pass. */
export interface GpuUploadFrameResult {
  readonly uploadedCount: number;
  readonly uploadedBytes: number;
  readonly plannedMillis: number;
  readonly actualMillis: number;
  readonly elapsedMillis: number;
  readonly deferredCount: number;
  readonly failedCount: number;
  readonly budgetExhausted: boolean;
  readonly queueDepth: number;
}

/** Cumulative scheduler accounting for the performance monitor/debug overlay. */
export interface GpuUploadSchedulerMetrics extends GpuUploadFrameResult {
  readonly estimatedUploadMillis: number;
  readonly totalUploadedCount: number;
  readonly totalUploadedBytes: number;
  readonly totalDeferredCount: number;
  readonly totalFailedCount: number;
}

const DEFAULT_MAX_UPLOADS_PER_FRAME = 64;
const EPSILON_MILLIS = 0.000001;

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`GpuUploadScheduler: ${name} must be a positive finite number`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`GpuUploadScheduler: ${name} must be a positive integer`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`GpuUploadScheduler: ${name} must be a non-negative finite number`);
  }
}

function validateConfig(config: GpuUploadSchedulerConfig): GpuUploadSchedulerConfig {
  assertPositiveFinite(config.maxBytes, 'maxBytes');
  assertPositiveFinite(config.maxMillis, 'maxMillis');
  assertPositiveFinite(config.estimatedUploadMillis, 'estimatedUploadMillis');
  const maxUploadsPerFrame = config.maxUploadsPerFrame ?? DEFAULT_MAX_UPLOADS_PER_FRAME;
  assertPositiveInteger(maxUploadsPerFrame, 'maxUploadsPerFrame');
  return Object.freeze({ ...config, maxUploadsPerFrame });
}

function clockNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Consumes validated mesh-ready records without creating Three.js resources itself.
 *
 * The scheduler reserves the configured byte/time estimate before calling the executor.
 * A record that does not fit remains at the queue head through dequeue→defer, preserving
 * FIFO order and the queue's original age. Executor failures are likewise requeued intact.
 * The executor is expected to be atomic: it must not publish a partial scene replacement.
 */
export class GpuUploadScheduler {
  private readonly queue: MeshReadyQueue;
  private readonly config: GpuUploadSchedulerConfig;
  private readonly now: () => number;
  private estimatedMillis: number;
  private lastFrame: GpuUploadFrameResult;
  private totalUploadedCount = 0;
  private totalUploadedBytes = 0;
  private totalDeferredCount = 0;
  private totalFailedCount = 0;

  constructor(
    queue: MeshReadyQueue,
    config: GpuUploadSchedulerConfig,
    now: () => number = clockNow,
  ) {
    this.queue = queue;
    this.config = validateConfig(config);
    this.now = now;
    this.estimatedMillis = config.estimatedUploadMillis;
    this.lastFrame = {
      uploadedCount: 0,
      uploadedBytes: 0,
      plannedMillis: 0,
      actualMillis: 0,
      elapsedMillis: 0,
      deferredCount: 0,
      failedCount: 0,
      budgetExhausted: false,
      queueDepth: queue.size,
    };
  }

  /** Run one bounded upload pass; call once per render frame. */
  runFrame(executor: GpuUploadExecutor): GpuUploadFrameResult {
    const frameStart = this.now();
    let uploadedCount = 0;
    let uploadedBytes = 0;
    let plannedMillis = 0;
    let actualMillis = 0;
    let deferredCount = 0;
    let failedCount = 0;
    let budgetExhausted = false;

    while (uploadedCount < (this.config.maxUploadsPerFrame ?? DEFAULT_MAX_UPLOADS_PER_FRAME)) {
      const next = this.queue.peek();
      if (!next) break;
      const estimate = this.estimatedMillis;
      const elapsedMillis = Math.max(0, this.now() - frameStart);
      const byteFits = uploadedBytes + next.byteLength <= this.config.maxBytes;
      const timeFits = plannedMillis + estimate <= this.config.maxMillis + EPSILON_MILLIS &&
        elapsedMillis + estimate <= this.config.maxMillis + EPSILON_MILLIS;
      if (!byteFits || !timeFits) {
        this.deferHead();
        deferredCount += 1;
        budgetExhausted = true;
        break;
      }

      const record = this.queue.dequeue();
      if (!record) break;
      plannedMillis += estimate;
      const uploadStart = this.now();
      try {
        const result = executor(record);
        const duration = Math.max(0, this.now() - uploadStart);
        const physicalBytes = result?.uploadedBytes ?? record.byteLength;
        assertNonNegativeFinite(physicalBytes, 'executor uploadedBytes');
        actualMillis += duration;
        uploadedCount += 1;
        uploadedBytes += record.byteLength;
        this.totalUploadedCount += 1;
        this.totalUploadedBytes += physicalBytes;
        this.updateEstimate(duration);
      } catch (error) {
        this.queue.defer(record);
        plannedMillis -= estimate;
        failedCount += 1;
        this.totalFailedCount += 1;
        // A failed executor cannot establish a complete replacement. Stop this
        // frame so the intact record remains the next deterministic candidate.
        void error;
        break;
      }
    }

    this.totalDeferredCount += deferredCount;
    const result: GpuUploadFrameResult = Object.freeze({
      uploadedCount,
      uploadedBytes,
      plannedMillis,
      actualMillis,
      elapsedMillis: Math.max(0, this.now() - frameStart),
      deferredCount,
      failedCount,
      budgetExhausted,
      queueDepth: this.queue.size,
    });
    this.lastFrame = result;
    return result;
  }

  metrics(): GpuUploadSchedulerMetrics {
    return {
      ...this.lastFrame,
      estimatedUploadMillis: this.estimatedMillis,
      totalUploadedCount: this.totalUploadedCount,
      totalUploadedBytes: this.totalUploadedBytes,
      totalDeferredCount: this.totalDeferredCount,
      totalFailedCount: this.totalFailedCount,
    };
  }

  get estimatedUploadMillis(): number {
    return this.estimatedMillis;
  }

  private deferHead(): void {
    const record = this.queue.dequeue();
    if (record) this.queue.defer(record);
  }

  private updateEstimate(duration: number): void {
    if (duration <= 0) return;
    this.estimatedMillis = this.estimatedMillis === 0
      ? duration
      : this.estimatedMillis * 0.75 + duration * 0.25;
  }
}
