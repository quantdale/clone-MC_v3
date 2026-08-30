import { describe, it, expect } from "vitest";
import { RenderPerformanceMonitor } from "../../src/rendering/RenderPerformanceMonitor";

/** Deterministic clock driven by a script of times. */ describe("RenderPerformanceMonitor ring-buffer stats", () => {
  it("computes percentiles over synthetic frames with linear-scan correctness", () => {
    let t = 0;
    const monitor = new RenderPerformanceMonitor(() => t, 16, 55);
    // Frames of exactly 10..100 ms in steps of 10.
    for (let ms = 10; ms <= 100; ms += 10) {
      monitor.beginFrame();
      t += ms;
      monitor.endFrame();
    }
    const stats = monitor.frameTimeStats();
    expect(stats.samples).toBe(10);
    // p50 of [10..100] -> index ceil(0.5*10)-1 = 4 -> 50.
    expect(stats.p50Millis).toBe(50);
    // p95/p99 clamp to the maximum sample.
    expect(stats.p95Millis).toBe(100);
    expect(stats.p99Millis).toBe(100);
    expect(stats.fpsAvg).toBeCloseTo(1000 / 55, 9); // mean is 55ms
  });

  it("counts long frames strictly above the configurable threshold", () => {
    let t = 0;
    const monitor = new RenderPerformanceMonitor(() => t, 8, 20);
    for (const ms of [10, 20, 21, 30]) {
      monitor.beginFrame();
      t += ms;
      monitor.endFrame();
    }
    // Threshold is exclusive: 20ms does not count, 21 and 30 do.
    expect(monitor.frameTimeStats().longFrames).toBe(2);
    monitor.setLongFrameThresholdMs(100);
    expect(monitor.frameTimeStats().longFrames).toBe(0);
    monitor.setLongFrameThresholdMs(5);
    expect(monitor.frameTimeStats().longFrames).toBe(4);
  });

  it("the ring never grows beyond its fixed size and overwrites the oldest samples", () => {
    let t = 0;
    const monitor = new RenderPerformanceMonitor(() => t, 4, 100);
    const durations = [10, 20, 30, 40, 50]; // one more than capacity
    for (const ms of durations) {
      monitor.beginFrame();
      t += ms;
      monitor.endFrame();
    }
    const stats = monitor.frameTimeStats();
    expect(stats.samples).toBe(4); // capped
    // Oldest (10ms) was evicted: remaining set {20,30,40,50}; p50 index
    // ceil(0.5*4)-1 = 1 -> 30.
    expect(stats.p50Millis).toBe(30);
    // After many more frames the sample count stays fixed.
    for (let i = 0; i < 50; i++) {
      monitor.beginFrame();
      t += 12;
      monitor.endFrame();
    }
    expect(monitor.frameTimeStats().samples).toBe(4);
  });
});

describe("RenderPerformanceMonitor exportJSON feeders", () => {
  it("recordRendererInfo / recordUploadBytes / setQueueDepth surface in exportJSON", () => {
    const t = 0;
    const monitor = new RenderPerformanceMonitor(() => t, 8, 16.7);
    monitor.beginFrame();
    monitor.recordRendererInfo({
      render: { calls: 7, triangles: 1234 },
      memory: { geometries: 3, textures: 2 },
    });
    monitor.recordUploadBytes(512);
    monitor.recordUploadBytes(256); // accumulates within the frame
    monitor.setQueueDepth("mesh", 4);
    monitor.setQueueDepth("generate", 2);
    monitor.setOldestJobAgeMs(33.5);
    monitor.setGeometryMemory(640 * 1024);
    monitor.setRenderDistanceChunks(6);
    monitor.endFrame();

    const dump = JSON.parse(monitor.exportJSON()) as {
      render: Record<string, number>;
      upload: { bytesThisFrame: number; bytesLastFrame: number };
      queues: { depths: Record<string, number>; oldestJobAgeMillis: number };
    };
    expect(dump.render.drawCalls).toBe(7);
    expect(dump.render.triangles).toBe(1234);
    expect(dump.render.geometries).toBe(3);
    expect(dump.render.textures).toBe(2);
    expect(dump.render.geometryMemoryBytes).toBe(640 * 1024);
    expect(dump.render.renderDistanceChunks).toBe(6);
    expect(dump.upload.bytesThisFrame).toBe(768);
    // Next frame opens: last frame's bytes remain observable until it ends.
    monitor.beginFrame();
    const next = JSON.parse(monitor.exportJSON()) as typeof dump;
    expect(next.upload.bytesThisFrame).toBe(0);
    expect(next.upload.bytesLastFrame).toBe(768);
    monitor.endFrame();
    expect(next.queues.depths.mesh).toBe(4);
    expect(next.queues.depths.generate).toBe(2);
    expect(next.queues.oldestJobAgeMillis).toBeCloseTo(33.5, 3);
  });

  it('exports validated pipeline metrics with physical buffer and inactive-stage diagnostics', () => {
    const monitor = new RenderPerformanceMonitor(() => 0);
    monitor.recordPipelineMetrics({
      drawingBuffer: { width: 1920, height: 1080 },
      worker: { active: true, pending: 3, inFlight: 2, completed: 11, failures: 1, retries: 4, fallbacks: 2 },
      ready: { active: false, count: 0, bytes: 0, oldestAgeMillis: 0, deferredCount: 0, cpuCompletionMillis: null },
      upload: { active: false, queueDepth: 0, bytesThisFrame: 0, bytesLastFrame: 0, plannedMillis: null, actualMillis: null, deferredCount: 0, failedCount: 0 },
      lod: { active: false, entries: 0, bytes: 0, evictions: 0, disposals: 0 },
      dynamicResolution: {
        tier: 'medium',
        scale: 0.8,
        minScale: 0.625,
        maxScale: 1,
        invalidMetricCount: 2,
        effectiveFrameTimeMillis: 21.25,
      },
      diagnostics: { inactiveStages: ['ready', 'upload', 'lod'] },
    });

    const snapshot = monitor.pipelineMetricsSnapshot();
    snapshot.worker.pending = 99;
    expect(monitor.pipelineMetricsSnapshot().worker.pending).toBe(3);

    const dump = JSON.parse(monitor.exportJSON()) as {
      pipeline: {
        drawingBuffer: { width: number; height: number };
        worker: { pending: number; inFlight: number; failures: number };
        dynamicResolution: { scale: number; invalidMetricCount: number };
        diagnostics: { inactiveStages: string[] };
      };
    };
    expect(dump.pipeline.drawingBuffer).toEqual({ width: 1920, height: 1080 });
    expect(dump.pipeline.worker).toMatchObject({ pending: 3, inFlight: 2, failures: 1 });
    expect(dump.pipeline.dynamicResolution).toMatchObject({ scale: 0.8, invalidMetricCount: 2 });
    expect(dump.pipeline.diagnostics.inactiveStages).toEqual(['ready', 'upload', 'lod']);

    const current = monitor.pipelineMetricsSnapshot();
    expect(() => monitor.recordPipelineMetrics({
      ...current,
      dynamicResolution: {
        ...current.dynamicResolution,
        scale: 2,
      },
    })).toThrow(/within its bounds/);
  });
});
