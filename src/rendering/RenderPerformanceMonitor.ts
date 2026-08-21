/**
 * Render performance monitor (075). Aggregates per-frame rendering metrics (draw calls, mesh-build
 * millis, frame time, geometry memory, render distance) with an injectable clock for deterministic
 * testing, and evaluates them against a 075 `RenderBudgetConfig`. Per-frame accumulators reset at
 * `beginFrame`; misuse (unbalanced frame/build lifecycle, invalid recorded values) throws.
 *
 * Extended per the deep-engine audit (05 "Observability", 04 "GPU upload discipline") with
 * fixed-size ring-buffered frame times (FPS p50/p95/p99, long-frame counts), renderer.info
 * passthrough, streaming-queue depths/age, worker utilization counters, and per-frame GPU
 * upload bytes — all exportable via `exportJSON()`.
 */
import {
  evaluateRenderBudget,
  type RenderBudgetConfig,
  type RenderBudgetReport,
  type RenderMetrics,
} from './RenderBudget';

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

function assertNonNegativeNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number, got ${value}`);
  }
}

/** Streaming queues whose depth is observable. */
export type QueueKind = 'generate' | 'mesh' | 'upload' | 'unload';

export const QUEUE_KINDS: readonly QueueKind[] = ['generate', 'mesh', 'upload', 'unload'];

/** Structural subset of Three.js `renderer.info` the monitor consumes. */
export interface RendererInfoSample {
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
}

/** FPS / frame-time percentiles computed over the frame-time ring buffer. */
export interface FrameTimeStats {
  samples: number;
  fpsAvg: number;
  p50Millis: number;
  p95Millis: number;
  p99Millis: number;
  /** Frames in the ring exceeding the long-frame threshold. */
  longFrames: number;
}

/** Aggregates render metrics per frame and evaluates them against the budget contract. */
export class RenderPerformanceMonitor {
  private readonly now: () => number;
  private frameOpen = false;
  private frameStart = 0;
  private lastFrameTimeMillis = 0;
  private drawCalls = 0;
  private meshBuildMillis = 0;
  private meshBuildOpen = false;
  private meshBuildStart = 0;
  private geometryMemoryBytes = 0;
  private renderDistanceChunks = 0;

  // ── Ring-buffered observability state (fixed size; never grows) ────────────
  private readonly frameRing: Float64Array;
  private frameRingCount = 0;
  private frameRingIndex = 0;
  private longFrameThresholdMillis: number;
  private triangles = 0;
  private geometryCount = 0;
  private textureCount = 0;
  private readonly queueDepths: Record<QueueKind, number> = { generate: 0, mesh: 0, upload: 0, unload: 0 };
  private oldestJobAgeMillis = 0;
  private workerPoolSize = 0;
  private lastFrameWorkerBusyMillis = 0;
  private workerBusyMillisTotal = 0;
  private workerJobsCompleted = 0;
  private uploadBytesThisFrame = 0;
  private lastUploadBytesPerFrame = 0;

  /**
   * @param now injectable clock (milliseconds)
   * @param ringSize fixed frame-time sample capacity (default 240 ≈ 4 s at 60 FPS)
   * @param longFrameThresholdMillis frames longer than this count as long frames
   */
  constructor(now: () => number, ringSize = 240, longFrameThresholdMillis = 16.7) {
    if (!Number.isInteger(ringSize) || ringSize <= 0) {
      throw new RangeError(`ringSize must be a positive integer, got ${ringSize}`);
    }
    this.now = now;
    this.frameRing = new Float64Array(ringSize);
    this.longFrameThresholdMillis = longFrameThresholdMillis;
  }

  /** Start a frame: records the frame start and resets per-frame accumulators. */
  beginFrame(): void {
    this.frameStart = this.now();
    this.frameOpen = true;
    this.drawCalls = 0;
    this.meshBuildMillis = 0;
    this.triangles = 0;
    this.lastFrameWorkerBusyMillis = 0;
    this.uploadBytesThisFrame = 0;
  }

  /** Complete the current frame: records its duration. Throws when no frame is open. */
  endFrame(): void {
    if (!this.frameOpen) {
      throw new Error('RenderPerformanceMonitor: endFrame without beginFrame');
    }
    this.lastFrameTimeMillis = this.now() - this.frameStart;
    this.frameOpen = false;
    // Push into the fixed-size ring (overwrites the oldest sample when full).
    this.frameRing[this.frameRingIndex] = this.lastFrameTimeMillis;
    this.frameRingIndex = (this.frameRingIndex + 1) % this.frameRing.length;
    if (this.frameRingCount < this.frameRing.length) {
      this.frameRingCount += 1;
    }
    this.lastUploadBytesPerFrame = this.uploadBytesThisFrame;
  }

  /** Start a mesh build. Throws when a build is already open or no frame is open. */
  beginMeshBuild(): void {
    if (!this.frameOpen) {
      throw new Error('RenderPerformanceMonitor: beginMeshBuild outside a frame');
    }
    if (this.meshBuildOpen) {
      throw new Error('RenderPerformanceMonitor: beginMeshBuild while a build is already open');
    }
    this.meshBuildStart = this.now();
    this.meshBuildOpen = true;
  }

  /** Complete the current mesh build, accumulating its duration. Throws when none is open. */
  endMeshBuild(): void {
    if (!this.meshBuildOpen) {
      throw new Error('RenderPerformanceMonitor: endMeshBuild without beginMeshBuild');
    }
    this.meshBuildMillis += this.now() - this.meshBuildStart;
    this.meshBuildOpen = false;
  }

  /** Record draw calls issued this frame. */
  recordDrawCalls(count: number): void {
    assertNonNegativeInteger(count, 'draw call count');
    this.drawCalls += count;
  }

  /**
   * Record a snapshot of Three.js `renderer.info` (draw calls, triangles,
   * geometry/texture counts). Call once per frame after rendering.
   */
  recordRendererInfo(info: RendererInfoSample): void {
    assertNonNegativeInteger(info.render.calls, 'renderer draw call count');
    assertNonNegativeInteger(info.render.triangles, 'triangle count');
    assertNonNegativeInteger(info.memory.geometries, 'geometry count');
    assertNonNegativeInteger(info.memory.textures, 'texture count');
    this.drawCalls = info.render.calls;
    this.triangles = info.render.triangles;
    this.textureCount = info.memory.textures;
    this.geometryCount = info.memory.geometries;
  }

  /** Record GPU buffer-upload bytes accepted this frame (audit 04). */
  recordUploadBytes(bytes: number): void {
    assertNonNegativeNumber(bytes, 'upload bytes');
    this.uploadBytesThisFrame += bytes;
  }

  /** Set the live depth of one streaming queue. */
  setQueueDepth(kind: QueueKind, depth: number): void {
    assertNonNegativeInteger(depth, `${kind} queue depth`);
    this.queueDepths[kind] = depth;
  }

  /** Set the age of the oldest pending job across the queues (milliseconds). */
  setOldestJobAgeMs(ageMs: number): void {
    assertNonNegativeNumber(ageMs, 'oldest job age');
    this.oldestJobAgeMillis = ageMs;
  }

  /** Set the configured worker pool size (0 while auto/uninitialized). */
  setWorkerPoolSize(size: number): void {
    assertNonNegativeInteger(size, 'worker pool size');
    this.workerPoolSize = size;
  }

  /** Accumulate busy time spent in workers during this frame. */
  recordWorkerBusyMs(busyMs: number): void {
    assertNonNegativeNumber(busyMs, 'worker busy ms');
    this.lastFrameWorkerBusyMillis += busyMs;
    this.workerBusyMillisTotal += busyMs;
  }

  /** Count completed worker jobs (any number may complete per frame). */
  recordWorkerJobsCompleted(count: number): void {
    assertNonNegativeInteger(count, 'completed job count');
    this.workerJobsCompleted += count;
  }

  /** Set the long-frame threshold used by `frameTimeStats` (milliseconds). */
  setLongFrameThresholdMs(thresholdMs: number): void {
    assertNonNegativeNumber(thresholdMs, 'long-frame threshold');
    this.longFrameThresholdMillis = thresholdMs;
  }

  /** Set the current geometry memory footprint in bytes. */
  setGeometryMemory(bytes: number): void {
    assertNonNegativeInteger(bytes, 'geometry memory bytes');
    this.geometryMemoryBytes = bytes;
  }

  /** Set the current render distance in chunks. */
  setRenderDistanceChunks(chunks: number): void {
    assertNonNegativeInteger(chunks, 'render distance chunks');
    this.renderDistanceChunks = chunks;
  }

  /** FPS / frame-time percentiles over the ring buffer (linear-scan percentiles). */
  frameTimeStats(): FrameTimeStats {
    const n = this.frameRingCount;
    if (n === 0) {
      return { samples: 0, fpsAvg: 0, p50Millis: 0, p95Millis: 0, p99Millis: 0, longFrames: 0 };
    }
    const sorted = Array.from(this.frameRing.subarray(0, n)).sort((a, b) => a - b);
    const percentile = (p: number): number => sorted[Math.min(n - 1, Math.ceil(p * n) - 1)];
    let longFrames = 0;
    let total = 0;
    for (const t of sorted) {
      total += t;
      if (t > this.longFrameThresholdMillis) {
        longFrames += 1;
      }
    }
    const avgMillis = total / n;
    return {
      samples: n,
      fpsAvg: avgMillis > 0 ? 1000 / avgMillis : 0,
      p50Millis: percentile(0.5),
      p95Millis: percentile(0.95),
      p99Millis: percentile(0.99),
      longFrames,
    };
  }

  /** A snapshot of the current metrics (frame time = last completed frame). */
  sample(): RenderMetrics {
    return {
      drawCalls: this.drawCalls,
      meshBuildMillis: this.meshBuildMillis,
      frameTimeMillis: this.lastFrameTimeMillis,
      geometryMemoryBytes: this.geometryMemoryBytes,
      renderDistanceChunks: this.renderDistanceChunks,
    };
  }

  /** Evaluate the current metrics against a budget contract. */
  evaluate(config: RenderBudgetConfig): RenderBudgetReport {
    return evaluateRenderBudget(config, this.sample());
  }

  /** Full observability dump as JSON (fixed-size data only; safe to call per second). */
  exportJSON(): string {
    const stats = this.frameTimeStats();
    return JSON.stringify({
      frame: {
        lastMillis: round3(this.lastFrameTimeMillis),
        ...stats,
        p50Millis: round3(stats.p50Millis),
        p95Millis: round3(stats.p95Millis),
        p99Millis: round3(stats.p99Millis),
        longFrameThresholdMillis: round3(this.longFrameThresholdMillis),
      },
      render: {
        drawCalls: this.drawCalls,
        triangles: this.triangles,
        geometries: this.geometryCount,
        textures: this.textureCount,
        geometryMemoryBytes: this.geometryMemoryBytes,
        renderDistanceChunks: this.renderDistanceChunks,
        meshBuildMillis: round3(this.meshBuildMillis),
      },
      upload: {
        bytesThisFrame: this.uploadBytesThisFrame,
        bytesLastFrame: this.lastUploadBytesPerFrame,
      },
      queues: {
        depths: { ...this.queueDepths },
        oldestJobAgeMillis: round3(this.oldestJobAgeMillis),
      },
      workers: {
        poolSize: this.workerPoolSize,
        busyMillisLastFrame: round3(this.lastFrameWorkerBusyMillis),
        busyMillisTotal: round3(this.workerBusyMillisTotal),
        jobsCompletedTotal: this.workerJobsCompleted,
      },
    });
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
