import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORKER_SATURATION_BUDGET,
  validateWorkerSaturationConfig,
  evaluateWorkerSaturation,
  runMeshSaturation,
  runWorldgenSaturation,
  createMeshDispatch,
  createWorldgenDispatch,
  type WorkerSaturationConfig,
} from '../../src/rendering/WorkerSaturationHarness';
import { MeshWorkerClient } from '../../src/rendering/WorkerMeshing';
import { WorldgenWorkerClient } from '../../src/worldgen/WorkerWorldgen';

function staticClock(): () => number {
  return () => 0;
}

function config(overrides: Partial<WorkerSaturationConfig> = {}): WorkerSaturationConfig {
  return { ...DEFAULT_WORKER_SATURATION_BUDGET, ...overrides };
}

describe('validateWorkerSaturationConfig', () => {
  it('accepts a valid config', () => {
    expect(validateWorkerSaturationConfig(config())).toEqual(config());
  });

  it('rejects invalid values naming the field', () => {
    for (const field of [
      'burstCount',
      'maxPendingJobs',
      'maxMeanJobMillis',
      'maxP95JobMillis',
      'maxTotalMillis',
    ] as const) {
      for (const bad of [0, -1, NaN, Infinity, '5', null, undefined]) {
        expect(() => validateWorkerSaturationConfig({ ...config(), [field]: bad } as never)).toThrow(new RegExp(field));
      }
    }
  });

  it('rejects non-object input', () => {
    expect(() => validateWorkerSaturationConfig(null)).toThrow(/object/i);
  });
});

describe('evaluateWorkerSaturation', () => {
  it('reports every dimension within budget when all actuals are at or below', () => {
    const report = evaluateWorkerSaturation(config(), { meanMillis: 1, p95Millis: 2, totalMillis: 50 });
    expect(report.withinBudget).toBe(true);
    expect(report.entries).toHaveLength(3);
    expect(report.entries.map((e) => e.dimension)).toEqual(['mean', 'p95', 'total']);
    expect(report.entries.every((e) => e.withinBudget)).toBe(true);
  });

  it('flags a single violation and fails the overall verdict, naming budget vs actual', () => {
    const report = evaluateWorkerSaturation(config({ maxMeanJobMillis: 2 }), {
      meanMillis: 10,
      p95Millis: 1,
      totalMillis: 20,
    });
    expect(report.withinBudget).toBe(false);
    const mean = report.entries.find((e) => e.dimension === 'mean')!;
    expect(mean.withinBudget).toBe(false);
    expect(mean.budget).toBe(2);
    expect(mean.actual).toBe(10);
  });

  it('treats malformed actuals (negative or non-finite) as violations', () => {
    for (const bad of [-1, NaN, Infinity] as const) {
      const report = evaluateWorkerSaturation(config(), { meanMillis: bad, p95Millis: 0, totalMillis: 0 });
      expect(report.withinBudget).toBe(false);
      expect(report.entries.find((e) => e.dimension === 'mean')!.withinBudget).toBe(false);
    }
  });

  it('treats boundary equality as within budget', () => {
    const report = evaluateWorkerSaturation(config({ maxTotalMillis: 50 }), {
      meanMillis: 0,
      p95Millis: 0,
      totalMillis: 50,
    });
    expect(report.entries.find((e) => e.dimension === 'total')!.withinBudget).toBe(true);
    expect(report.withinBudget).toBe(true);
  });
});

describe('runMeshSaturation', () => {
  it('resolves every accepted job exactly once and stays within a generous budget', () => {
    const dispatch = createMeshDispatch(new MeshWorkerClient(), 256);
    const report = runMeshSaturation(config({ burstCount: 256, maxPendingJobs: 256 }), dispatch, staticClock());
    expect(report.withinBudget).toBe(true);
    expect(report.results).toHaveLength(256);
    expect(report.results.every((r) => r.ok)).toBe(true);
    expect(report.rejectedCount).toBe(0);
    expect(dispatch.pendingCount()).toBe(0);
  });

  it('rejects submissions beyond the pending cap without enqueueing them', () => {
    const dispatch = createMeshDispatch(new MeshWorkerClient(), 8);
    const report = runMeshSaturation(config({ burstCount: 12, maxPendingJobs: 8 }), dispatch, staticClock());
    expect(report.rejectedCount).toBe(4);
    expect(report.results).toHaveLength(8);
    expect(dispatch.pendingCount()).toBe(0);
  });

  it('is deterministic for identical dispatches and scripted clocks', () => {
    const run = () => {
      const dispatch = createMeshDispatch(new MeshWorkerClient(), 64);
      return runMeshSaturation(config({ burstCount: 32, maxPendingJobs: 64 }), dispatch, staticClock());
    };
    expect(run()).toEqual(run());
  });
});

describe('runWorldgenSaturation', () => {
  it('resolves every accepted job exactly once (identity-matching) within budget', () => {
    const dispatch = createWorldgenDispatch(new WorldgenWorkerClient(), 64);
    const report = runWorldgenSaturation(config({ burstCount: 64, maxPendingJobs: 64 }), dispatch, staticClock());
    expect(report.withinBudget).toBe(true);
    expect(report.results).toHaveLength(64);
    expect(report.results.every((r) => r.ok)).toBe(true);
    expect(dispatch.pendingCount()).toBe(0);
  });

  it('is deterministic for identical dispatches and scripted clocks', () => {
    const run = () => {
      const dispatch = createWorldgenDispatch(new WorldgenWorkerClient(), 64);
      return runWorldgenSaturation(config({ burstCount: 16, maxPendingJobs: 64 }), dispatch, staticClock());
    };
    expect(run()).toEqual(run());
  });
});

describe('WorkerDispatch backpressure', () => {
  it('throws a descriptive error when submission would exceed the cap and enqueues nothing', () => {
    const client = new MeshWorkerClient();
    const dispatch = createMeshDispatch(client, 8);
    for (let i = 0; i < 8; i++) {
      dispatch.submit({ sectionX: 0, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [], skyLight: new Array(4096).fill(0), blockLight: new Array(4096).fill(0) });
    }
    expect(client.pendingCount).toBe(8);
    expect(() => dispatch.submit({ sectionX: 0, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [], skyLight: new Array(4096).fill(0), blockLight: new Array(4096).fill(0) })).toThrow(/maxPendingJobs/);
    expect(client.pendingCount).toBe(8);
  });

  it('releases a slot once a job resolves, allowing a later submission', () => {
    const client = new MeshWorkerClient();
    const dispatch = createMeshDispatch(client, 8);
    const jobIds: string[] = [];
    const payload = () => ({ sectionX: 0, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [], skyLight: new Array(4096).fill(0), blockLight: new Array(4096).fill(0) });
    for (let i = 0; i < 8; i++) jobIds.push(dispatch.submit(payload()));
    expect(client.pendingCount).toBe(8);

    dispatch.awaitResult(jobIds[0]!);
    expect(client.pendingCount).toBe(7);

    dispatch.submit(payload());
    expect(client.pendingCount).toBe(8);
  });
});

describe('exactly-once and stale rejection under saturation', () => {
  it('rejects a duplicate late result and invokes the callback once', () => {
    const client = new MeshWorkerClient();
    let calls = 0;
    const jobId = client.requestSection(
      { sectionX: 0, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [], skyLight: new Array(4096).fill(0), blockLight: new Array(4096).fill(0) },
      () => calls++,
    );
    const result = { sectionX: 0, sectionY: 0, sectionZ: 0, quads: [] };

    expect(client.handleMessage(MeshWorkerClient.resultMessage(jobId, result))).not.toBeNull();
    expect(client.handleMessage(MeshWorkerClient.resultMessage(jobId, result))).toBeNull(); // duplicate
    expect(calls).toBe(1);
  });

  it('rejects a cancelled job\'s late result without affecting pending count', () => {
    const dispatch = createMeshDispatch(new MeshWorkerClient(), 16);
    const jobId = dispatch.submit({ sectionX: 0, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [], skyLight: new Array(4096).fill(0), blockLight: new Array(4096).fill(0) });
    expect(dispatch.cancel(jobId)).toBe(true);
    expect(dispatch.awaitResult(jobId)).toBeNull();
    expect(dispatch.pendingCount()).toBe(0);
  });

  it('rejects an unknown jobId between valid results without corruption', () => {
    const client = new MeshWorkerClient();
    let calls = 0;
    const a = client.requestSection({ sectionX: 0, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [], skyLight: new Array(4096).fill(0), blockLight: new Array(4096).fill(0) }, () => calls++);
    const b = client.requestSection({ sectionX: 1, sectionY: 0, sectionZ: 0, cells: new Array(4096).fill(null), opaqueIds: [], skyLight: new Array(4096).fill(0), blockLight: new Array(4096).fill(0) }, () => calls++);

    const resultA = { sectionX: 0, sectionY: 0, sectionZ: 0, quads: [] };
    const resultB = { sectionX: 1, sectionY: 0, sectionZ: 0, quads: [] };

    expect(client.handleMessage(MeshWorkerClient.resultMessage('ghost', resultA))).toBeNull();
    expect(client.handleMessage(MeshWorkerClient.resultMessage(a, resultA))).not.toBeNull();
    expect(client.handleMessage(MeshWorkerClient.resultMessage(b, resultB))).not.toBeNull();
    expect(calls).toBe(2);
  });

  it('rejects an identity-mismatched worldgen result (consumes the job, invokes no callback)', () => {
    const client = new WorldgenWorkerClient();
    let calls = 0;
    const jobId = client.submit({ columnX: 1, columnZ: 2, seed: 42, stage: 'TERRAIN' }, () => calls++);

    // A result echoing a different columnX than the request -> rejected, no callback.
    const mismatched = WorldgenWorkerClient.resultMessage(jobId, { columnX: 99, columnZ: 2, seed: 42, stage: 'TERRAIN', generationVersion: 1 });
    expect(client.handleMessage(mismatched)).toBeNull();
    expect(calls).toBe(0);

    // The mismatch consumed the job (086 resolves it exactly once); a later matching result is stale.
    const matched = WorldgenWorkerClient.resultMessage(jobId, { columnX: 1, columnZ: 2, seed: 42, stage: 'TERRAIN', generationVersion: 1 });
    expect(client.handleMessage(matched)).toBeNull();
    expect(calls).toBe(0);
  });

  it('keeps a valid worldgen job unaffected when a sibling job is identity-mismatched', () => {
    const client = new WorldgenWorkerClient();
    let calls = 0;
    const bad = client.submit({ columnX: 1, columnZ: 2, seed: 42, stage: 'TERRAIN' }, () => calls++);
    const good = client.submit({ columnX: 5, columnZ: 6, seed: 42, stage: 'TERRAIN' }, () => calls++);

    expect(client.handleMessage(WorldgenWorkerClient.resultMessage(bad, { columnX: 99, columnZ: 2, seed: 42, stage: 'TERRAIN', generationVersion: 1 }))).toBeNull();
    expect(calls).toBe(0);

    const goodResult = WorldgenWorkerClient.resultMessage(good, { columnX: 5, columnZ: 6, seed: 42, stage: 'TERRAIN', generationVersion: 1 });
    expect(client.handleMessage(goodResult)).not.toBeNull();
    expect(calls).toBe(1);
    expect(client.handleMessage(goodResult)).toBeNull(); // duplicate after resolve
  });
});
