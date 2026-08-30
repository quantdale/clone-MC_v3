import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PIPELINE_RESOURCE_BUDGET,
  ESTIMATED_MAX_LOD_TILE_BYTES,
  MAX_READY_BYTES,
  MAX_READY_RECORDS,
  MAX_UPLOAD_DEFERRED,
  MAX_UPLOAD_BYTES_PER_FRAME,
  MAX_WORKER_BUFFERS,
  PIPELINE_BUDGET_KEYS,
  PIPELINE_RESOURCE_DIMENSIONS,
  evaluatePipelineResourceBudget,
  fromRenderPipelineMetrics,
  validatePipelineResourceBudgetConfig,
  type PipelineResourceBudgetConfig,
  type PipelineResourceSnapshot,
} from '../../src/rendering/PipelineResourceBudget';
import { RenderPerformanceMonitor } from '../../src/rendering/RenderPerformanceMonitor';
import { MeshReadyQueue } from '../../src/rendering/MeshReadyQueue';
import { GpuUploadScheduler } from '../../src/rendering/GpuUploadScheduler';
import {
  LodTileRenderCache,
  createLodTileRenderResource,
  buildLodTileRenderData,
} from '../../src/rendering/LodTileRender';
import { WorkerPool, DEFAULT_MAX_PENDING } from '../../src/engine/WorkerPool';
import { packQuadsToTypedLayerStreams } from '../../src/rendering/WorkerMeshing';
import { MESH_STREAM_NAMES, type MeshStreamName } from '../../src/world/MeshingTypes';
import type { OpaqueFaceQuad } from '../../src/rendering/GreedyMesher';
import { WORKER_PROTOCOL_VERSION } from '../../src/rendering/WorkerJobProtocol';
import type { WorkerRequest } from '../../src/rendering/WorkerJobProtocol';
import { sampleLodTile, type LodSamplingSource } from '../../src/rendering/LodTile';
import { createResourceId } from '../../src/data/ResourceId';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';

const dimensionId = createResourceId('minecraft', 'overworld');

function lodSource(): LodSamplingSource {
  return {
    seed: 7,
    generationVersion: 'v2',
    sampleColumn(worldX: number, worldZ: number) {
      return {
        height: OVERWORLD_DIMENSION_TYPE.minY + ((worldX + worldZ + 256) % 80),
        material: Math.abs(worldX + worldZ) % 32,
        biome: Math.abs(worldX - worldZ) % 4,
      };
    },
  };
}

function tile(lod: 1 | 2 | 3, tileX = 0, tileZ = 0) {
  return sampleLodTile(
    { dimensionId, seed: 7, generationVersion: 'v2', lod, tileX, tileZ },
    OVERWORLD_DIMENSION_TYPE,
    lodSource(),
  );
}

const VALID_CONFIG: PipelineResourceBudgetConfig = {
  maxWorkerBuffers: 72,
  maxReadyRecords: 64,
  maxReadyBytes: 32 * 1024 * 1024,
  maxUploadBytesPerFrame: 4 * 1024 * 1024,
  maxUploadDeferred: 64,
  maxLodTiles: 256,
  maxLodBytes: ESTIMATED_MAX_LOD_TILE_BYTES * 256,
};

function zeroSnapshot(): PipelineResourceSnapshot {
  return {
    workerBuffers: 0,
    readyRecords: 0,
    readyBytes: 0,
    uploadBytesPerFrame: 0,
    uploadDeferred: 0,
    lodTiles: 0,
    lodBytes: 0,
  };
}

describe('PipelineResourceBudget config validation', () => {
  it('accepts a well-formed config and returns a frozen copy', () => {
    const validated = validatePipelineResourceBudgetConfig(VALID_CONFIG);
    expect(validated).toEqual(VALID_CONFIG);
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it('rejects non-object configs, missing keys, extra keys, and bad values', () => {
    expect(() =>
      validatePipelineResourceBudgetConfig(null as unknown as PipelineResourceBudgetConfig),
    ).toThrow(TypeError);
    for (const key of PIPELINE_BUDGET_KEYS) {
      const missing = { ...VALID_CONFIG } as Record<string, number>;
      delete missing[key];
      expect(() =>
        validatePipelineResourceBudgetConfig(missing as unknown as PipelineResourceBudgetConfig),
      ).toThrow(new RegExp(`missing key "${key}"`));
      for (const bad of [0, -1, 1.5, Number.NaN, Infinity, '8', null]) {
        expect(() =>
          validatePipelineResourceBudgetConfig({
            ...VALID_CONFIG,
            [key]: bad,
          } as unknown as PipelineResourceBudgetConfig),
        ).toThrow(RangeError);
      }
    }
    const extra = { ...VALID_CONFIG, bogus: 1 } as unknown as PipelineResourceBudgetConfig;
    expect(() => validatePipelineResourceBudgetConfig(extra)).toThrow(/extra keys/);
  });

  it('derives the default budget from the documented runtime caps', () => {
    expect(MAX_WORKER_BUFFERS).toBe(DEFAULT_MAX_PENDING + 4 * 2);
    expect(MAX_READY_RECORDS).toBe(64);
    expect(MAX_READY_BYTES).toBe(32 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES_PER_FRAME).toBeGreaterThan(0);
    expect(MAX_UPLOAD_DEFERRED).toBe(MAX_READY_RECORDS);
    expect(Number.isInteger(ESTIMATED_MAX_LOD_TILE_BYTES)).toBe(true);
    expect(ESTIMATED_MAX_LOD_TILE_BYTES).toBeGreaterThan(0);
    expect(DEFAULT_PIPELINE_RESOURCE_BUDGET).toEqual({
      maxWorkerBuffers: MAX_WORKER_BUFFERS,
      maxReadyRecords: MAX_READY_RECORDS,
      maxReadyBytes: MAX_READY_BYTES,
      maxUploadBytesPerFrame: MAX_UPLOAD_BYTES_PER_FRAME,
      maxUploadDeferred: MAX_UPLOAD_DEFERRED,
      maxLodTiles: 256,
      maxLodBytes: ESTIMATED_MAX_LOD_TILE_BYTES * 256,
    });
  });
});

describe('evaluatePipelineResourceBudget', () => {
  it('reports entries in the fixed dimension order with boundary equality within budget', () => {
    const snapshot: PipelineResourceSnapshot = {
      workerBuffers: 72,
      readyRecords: 64,
      readyBytes: VALID_CONFIG.maxReadyBytes,
      uploadBytesPerFrame: VALID_CONFIG.maxUploadBytesPerFrame,
      uploadDeferred: 64,
      lodTiles: 256,
      lodBytes: VALID_CONFIG.maxLodBytes,
    };
    const report = evaluatePipelineResourceBudget(VALID_CONFIG, snapshot);
    expect(report.withinBudget).toBe(true);
    expect(report.entries.map((entry) => entry.dimension)).toEqual([...PIPELINE_RESOURCE_DIMENSIONS]);
    expect(report.entries.every((entry) => entry.withinBudget)).toBe(true);
    expect(report.entries.every((entry) => entry.actual === entry.budget)).toBe(true);
  });

  it('violates exactly the dimensions over budget', () => {
    const snapshot = { ...zeroSnapshot(), workerBuffers: 73, lodTiles: 257 };
    const report = evaluatePipelineResourceBudget(VALID_CONFIG, snapshot);
    expect(report.withinBudget).toBe(false);
    const violated = report.entries
      .filter((entry) => !entry.withinBudget)
      .map((entry) => entry.dimension);
    expect(violated).toEqual(['workerBuffers', 'lodTiles']);
  });

  it('marks malformed actuals violating without throwing and stays deterministic', () => {
    for (const bad of [-1, 1.5, Number.NaN, Infinity]) {
      const snapshot = { ...zeroSnapshot(), readyBytes: bad } as unknown as PipelineResourceSnapshot;
      const report = evaluatePipelineResourceBudget(VALID_CONFIG, snapshot);
      expect(report.withinBudget).toBe(false);
      const entry = report.entries.find((item) => item.dimension === 'readyBytes')!;
      expect(entry.withinBudget).toBe(false);
      expect(Number.isNaN(entry.actual)).toBe(true);
    }
    const snapshot = { ...zeroSnapshot(), workerBuffers: 10 };
    expect(evaluatePipelineResourceBudget(VALID_CONFIG, snapshot)).toEqual(
      evaluatePipelineResourceBudget(VALID_CONFIG, snapshot),
    );
  });

  it('rejects non-object inputs', () => {
    expect(() =>
      evaluatePipelineResourceBudget(null as unknown as PipelineResourceBudgetConfig, zeroSnapshot()),
    ).toThrow(TypeError);
    expect(() =>
      evaluatePipelineResourceBudget(VALID_CONFIG, null as unknown as PipelineResourceSnapshot),
    ).toThrow(TypeError);
  });
});

describe('fromRenderPipelineMetrics', () => {
  it('maps the 075 pipeline snapshot onto budget dimensions via the monitor', () => {
    const monitor = new RenderPerformanceMonitor(() => 0);
    monitor.recordPipelineMetrics({
      drawingBuffer: { width: 1280, height: 720 },
      worker: { active: true, pending: 4, inFlight: 6, completed: 10, failures: 0, retries: 0, fallbacks: 0 },
      ready: { active: true, count: 3, bytes: 900, oldestAgeMillis: 5, deferredCount: 1, cpuCompletionMillis: null },
      upload: { active: true, queueDepth: 3, bytesThisFrame: 123, bytesLastFrame: 456, plannedMillis: null, actualMillis: null, deferredCount: 2, failedCount: 0 },
      lod: { active: true, entries: 7, bytes: 7000, evictions: 0, disposals: 0 },
      dynamicResolution: { tier: 'medium', scale: 0.9, minScale: 0.5, maxScale: 1, invalidMetricCount: 0, effectiveFrameTimeMillis: null },
      diagnostics: { inactiveStages: [] },
    });
    expect(fromRenderPipelineMetrics(monitor.pipelineMetricsSnapshot())).toEqual({
      workerBuffers: 10,
      readyRecords: 3,
      readyBytes: 900,
      uploadBytesPerFrame: 456,
      uploadDeferred: 2,
      lodTiles: 7,
      lodBytes: 7000,
    });
    expect(monitor.evaluatePipelineBudget().withinBudget).toBe(true);
  });

  it('evaluates an over-budget live snapshot through the monitor', () => {
    const monitor = new RenderPerformanceMonitor(() => 0);
    monitor.recordPipelineMetrics({
      drawingBuffer: { width: 1280, height: 720 },
      worker: {
        active: true,
        pending: DEFAULT_PIPELINE_RESOURCE_BUDGET.maxWorkerBuffers,
        inFlight: 1,
        completed: 0,
        failures: 0,
        retries: 0,
        fallbacks: 0,
      },
      ready: { active: false, count: 0, bytes: 0, oldestAgeMillis: 0, deferredCount: 0, cpuCompletionMillis: null },
      upload: { active: false, queueDepth: 0, bytesThisFrame: 0, bytesLastFrame: 0, plannedMillis: null, actualMillis: null, deferredCount: 0, failedCount: 0 },
      lod: { active: false, entries: 0, bytes: 0, evictions: 0, disposals: 0 },
      dynamicResolution: { tier: 'unknown', scale: 1, minScale: 1, maxScale: 1, invalidMetricCount: 0, effectiveFrameTimeMillis: null },
      diagnostics: { inactiveStages: ['ready', 'lod'] },
    });
    const report = monitor.evaluatePipelineBudget();
    expect(report.withinBudget).toBe(false);
    expect(report.entries.find((entry) => entry.dimension === 'workerBuffers')?.withinBudget).toBe(false);
  });
});

// ── Bounded long-session behavior (255 task 28) ──────────────────────────────

function stormQuad(stream: MeshStreamName = 'opaque') {
  const quad: OpaqueFaceQuad = {
    face: 'up', x: 0, y: 0, z: 0, width: 1, height: 1, blockId: 1,
    vertexLights: [{ sky: 15, block: 0 }, { sky: 15, block: 0 }, { sky: 15, block: 0 }, { sky: 15, block: 0 }],
    vertexAO: [0, 0, 0, 0], tintClass: 0xffffff, renderStream: stream,
  };
  return quad;
}

function stormRecord(requestId: string) {
  const streams = packQuadsToTypedLayerStreams([stormQuad()], {
    topTileById: [0, 0], bottomTileById: [0, 0], sideTileById: [0, 0],
  });
  return {
    requestId,
    target: { sectionX: 0, sectionY: 0, sectionZ: 0 },
    generation: 1,
    versionSnapshot: { sections: [] },
    layers: streams,
    byteLength: MESH_STREAM_NAMES.reduce((total, name) => total + streams[name].byteLength, 0),
    lod: 0 as const,
  };
}

describe('long-session boundedness — ready/upload storm', () => {
  it('keeps every frame within the budget across a saturated 256-record session and converges', () => {
    let now = 0;
    const first = stormRecord('storm-0');
    const recordCap = 64;
    const uploadsPerFrame = 4;
    const queue = new MeshReadyQueue(
      { maxRecords: recordCap, maxBytes: recordCap * first.byteLength },
      () => now,
    );
    const scheduler = new GpuUploadScheduler(queue, {
      maxBytes: uploadsPerFrame * first.byteLength,
      maxMillis: 10,
      maxUploadsPerFrame: uploadsPerFrame,
      estimatedUploadMillis: 0.5,
    }, () => now);

    const budget: PipelineResourceBudgetConfig = {
      ...VALID_CONFIG,
      maxReadyRecords: recordCap,
      maxReadyBytes: recordCap * first.byteLength,
      maxUploadBytesPerFrame: uploadsPerFrame * first.byteLength,
      maxUploadDeferred: recordCap,
    };
    const uploadedIds = new Set<string>();
    const totalRecords = 256;
    let produced = 0;
    let admitted = 0;
    let rejectedAtCap = 0;
    let frames = 0;
    let maxDeferred = 0;

    while (produced < totalRecords || queue.size > 0) {
      now += 16; // one frame of fake time
      for (let i = 0; i < 8 && produced < totalRecords; i++, produced++) {
        const admission = queue.enqueue(stormRecord(`storm-${produced}`));
        if (admission.accepted) admitted += 1;
        else rejectedAtCap += 1;
      }
      const frame = scheduler.runFrame((record) => {
        uploadedIds.add(record.requestId);
        return { uploadedBytes: record.byteLength };
      });
      maxDeferred = Math.max(maxDeferred, frame.deferredCount);
      const report = evaluatePipelineResourceBudget(budget, {
        ...zeroSnapshot(),
        readyRecords: queue.metrics().count,
        readyBytes: queue.byteLength,
        uploadBytesPerFrame: frame.uploadedBytes,
        uploadDeferred: frame.deferredCount,
      });
      expect(report.withinBudget).toBe(true);
      frames += 1;
      expect(frames).toBeLessThan(10_000); // must terminate, not spin
    }

    expect(frames).toBeGreaterThan(32);
    expect(rejectedAtCap).toBeGreaterThan(0); // saturation exercised the hard caps
    expect(admitted + rejectedAtCap).toBe(totalRecords);
    expect(uploadedIds.size).toBe(admitted); // every admitted record uploaded exactly once
    expect(queue.size).toBe(0); // settled convergence: no residual ready work
    expect(maxDeferred).toBeLessThanOrEqual(recordCap);
    const settled = evaluatePipelineResourceBudget(budget, {
      ...zeroSnapshot(),
      readyRecords: queue.size,
      readyBytes: queue.byteLength,
    });
    expect(settled.withinBudget).toBe(true);
    expect(settled.entries.find((entry) => entry.dimension === 'readyRecords')?.actual).toBe(0);
  });
});

describe('long-session boundedness — LOD cache churn', () => {
  it('keeps entries/bytes within budget across 48 distinct tiles and converges to a plateau', () => {
    const cache = new LodTileRenderCache({ maxEntries: 8, maxBytes: Number.MAX_SAFE_INTEGER });
    const budget: PipelineResourceBudgetConfig = {
      ...VALID_CONFIG,
      maxLodTiles: 8,
      maxLodBytes: Number.MAX_SAFE_INTEGER,
    };
    const disposed: string[] = [];
    let admitted = 0;
    for (let i = 0; i < 48; i++) {
      const data = buildLodTileRenderData(tile(1, i, 0));
      const resource = createLodTileRenderResource(data, () => disposed.push(data.key));
      cache.set(resource);
      admitted += 1;
      const stats = cache.stats();
      expect(stats.entries).toBeLessThanOrEqual(8);
      expect(stats.bytes).toBeLessThanOrEqual(budget.maxLodBytes);
      const report = evaluatePipelineResourceBudget(budget, {
        ...zeroSnapshot(),
        lodTiles: stats.entries,
        lodBytes: stats.bytes,
      });
      expect(report.withinBudget).toBe(true);
    }
    expect(admitted).toBe(48);
    expect(cache.stats().evictions).toBe(40); // 48 admitted - 8 resident
    expect(disposed.length).toBe(cache.stats().disposals); // exact-once disposal
    expect(cache.stats().disposals).toBe(40);

    // Settle: repeated reads touch LRU order but must not change occupancy.
    const plateau = cache.stats();
    for (let i = 0; i < 10; i++) {
      cache.get(cache.keys()[0]!);
      const stats = cache.stats();
      expect(stats).toEqual(plateau);
      const report = evaluatePipelineResourceBudget(budget, {
        ...zeroSnapshot(),
        lodTiles: stats.entries,
        lodBytes: stats.bytes,
      });
      expect(report.withinBudget).toBe(true);
    }
    expect(plateau.entries).toBe(8);
  });
});

// Minimal WorkerPool harness (same shape as WorkerPool.test.ts).
class FakeWorkerScope {
  posted: WorkerRequest[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(data: unknown): void {
    this.posted.push(data as WorkerRequest);
  }
  terminate(): void {}
  emit(request: WorkerRequest): void {
    this.onmessage?.({
      data: {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        kind: request.kind,
        ok: true,
        generationToken: request.generationToken,
        payload: {},
      },
    });
  }
}

describe('long-session boundedness — worker buffers', () => {
  it('admits at most the documented pending cap and never exceeds the worker-buffer budget', () => {
    const scopes: FakeWorkerScope[] = [];
    const pool = new WorkerPool({
      spawn: () => {
        const scope = new FakeWorkerScope();
        scopes.push(scope);
        return scope as unknown as Worker;
      },
      size: 2,
      maxInFlightPerWorker: 2,
    });

    const results: string[] = [];
    const failures: string[] = [];
    let admitted = 0;
    let rejected = 0;
    for (let i = 0; i < 200; i++) {
      try {
        pool.submit({
          kind: 'worldgen',
          generationToken: 1,
          payload: { i },
          onResult: () => results.push(`job-${i}`),
          onFailure: (error) => failures.push(error ?? 'failed'),
        });
        admitted += 1;
      } catch {
        rejected += 1; // hard backpressure: queue full
      }
      const stats = pool.stats();
      expect(stats.pending).toBeLessThanOrEqual(DEFAULT_MAX_PENDING);
      const report = evaluatePipelineResourceBudget(DEFAULT_PIPELINE_RESOURCE_BUDGET, {
        ...zeroSnapshot(),
        workerBuffers: stats.pending + stats.inFlight,
      });
      expect(report.withinBudget).toBe(true);
    }
    expect(admitted).toBe(DEFAULT_MAX_PENDING + 4); // 64 pending + 2 workers × 2 in flight
    expect(rejected).toBe(200 - admitted);
    expect(pool.stats().pending).toBe(DEFAULT_MAX_PENDING);
    expect(pool.stats().inFlight).toBe(4);

    // Settle every admitted job exactly once.
    const resolved = new Set<string>();
    let guard = 0;
    while (pool.stats().completed + pool.stats().failed < admitted && guard++ < 10_000) {
      for (const scope of scopes) {
        for (const request of [...scope.posted]) {
          if (!resolved.has(request.jobId)) {
            resolved.add(request.jobId);
            scope.emit(request);
          }
        }
      }
    }
    expect(pool.stats().completed).toBe(admitted);
    expect(results.length).toBe(admitted); // exactly-once delivery
    expect(failures).toEqual([]);
    const settled = pool.stats();
    expect(settled.pending).toBe(0);
    expect(settled.inFlight).toBe(0);
    expect(
      evaluatePipelineResourceBudget(DEFAULT_PIPELINE_RESOURCE_BUDGET, {
        ...zeroSnapshot(),
        workerBuffers: settled.pending + settled.inFlight,
      }).withinBudget,
    ).toBe(true);
    pool.dispose();
  });
});
