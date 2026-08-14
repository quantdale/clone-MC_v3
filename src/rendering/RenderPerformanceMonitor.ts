/**
 * Render performance monitor (075). Aggregates per-frame rendering metrics (draw calls, mesh-build
 * millis, frame time, geometry memory, render distance) with an injectable clock for deterministic
 * testing, and evaluates them against a 075 `RenderBudgetConfig`. Per-frame accumulators reset at
 * `beginFrame`; misuse (unbalanced frame/build lifecycle, invalid recorded values) throws.
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

  constructor(now: () => number) {
    this.now = now;
  }

  /** Start a frame: records the frame start and resets per-frame accumulators. */
  beginFrame(): void {
    this.frameStart = this.now();
    this.frameOpen = true;
    this.drawCalls = 0;
    this.meshBuildMillis = 0;
  }

  /** Complete the current frame: records its duration. Throws when no frame is open. */
  endFrame(): void {
    if (!this.frameOpen) {
      throw new Error('RenderPerformanceMonitor: endFrame without beginFrame');
    }
    this.lastFrameTimeMillis = this.now() - this.frameStart;
    this.frameOpen = false;
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
}
