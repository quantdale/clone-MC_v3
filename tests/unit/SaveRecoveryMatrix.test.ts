import { describe, it, expect } from 'vitest';
import {
  SaveRecoveryMatrix,
  createFaultySaveSink,
  withStorageFailure,
  createGatedSaveSink,
  type RecoveryAxis,
  type SaveRecoveryFixture,
} from '../../src/storage/SaveRecoveryMatrix';
import { DirtySaveQueue } from '../../src/storage/DirtySaveQueue';
import { RepositorySaveSink } from '../../src/storage/RepositorySaveSink';
import { StorageHealthMonitor, classifyStorageError } from '../../src/storage/StorageHealth';
import { makeSaveRecoveryFixture, makeCoordinator } from './saveRecoveryFixture';

const AXES: RecoveryAxis[] = ['abrupt-close', 'partial-write', 'migration', 'quota', 'import-export'];

function makeMatrix(): SaveRecoveryMatrix {
  return new SaveRecoveryMatrix({
    makeRepositories: () => makeSaveRecoveryFixture(),
    makeCoordinator,
  });
}

describe('SaveRecoveryMatrix', () => {
  it('runAll covers every axis with at least one scenario and only known axes', async () => {
    const report = await makeMatrix().runAll();
    const present = new Set(report.results.map((r) => r.axis));
    for (const axis of AXES) {
      expect(present.has(axis), `missing axis ${axis}`).toBe(true);
    }
    for (const r of report.results) {
      expect(AXES).toContain(r.axis);
    }
    expect(report.results.length).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic: two identical runAll runs produce identical per-result output', async () => {
    const a = await makeMatrix().runAll();
    const b = await makeMatrix().runAll();
    expect(a.results.length).toBe(b.results.length);
    for (let i = 0; i < a.results.length; i++) {
      expect(b.results[i]!.scenarioId).toBe(a.results[i]!.scenarioId);
      expect(b.results[i]!.axis).toBe(a.results[i]!.axis);
      expect(b.results[i]!.outcome).toBe(a.results[i]!.outcome);
      expect(b.results[i]!.detail).toBe(a.results[i]!.detail);
    }
    expect(a.deterministic).toBe(true);
    expect(b.deterministic).toBe(true);
  });

  it('allPass is true when every scenario passes and false when any fails', async () => {
    const healthy = await makeMatrix().runAll();
    expect(healthy.allPass).toBe(true);

    // Force every abrupt-close scenario (which opens repositories) to fail by throwing in openAll.
    const brokenFixture = (): SaveRecoveryFixture => {
      const fixture = makeSaveRecoveryFixture();
      return {
        ...fixture,
        async openAll(): Promise<void> {
          throw new Error('forced fixture failure');
        },
      };
    };
    const broken = new SaveRecoveryMatrix({
      makeRepositories: brokenFixture,
      makeCoordinator,
    });
    const report = await broken.runAll();
    expect(report.allPass).toBe(false);
    const failed = report.results.filter((r) => r.outcome === 'fail');
    expect(failed.length).toBeGreaterThan(0);
    // Every failed scenario is reported with a non-empty detail (no swallowing, no throw).
    for (const r of failed) {
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });

  it('failure-injection seams drive scenario assertions', async () => {
    // createFaultySaveSink: failNextWrites + failKeys drive a re-queue/retry and a persistent failure.
    const fixture = makeSaveRecoveryFixture();
    await fixture.openAll();
    const queue = new DirtySaveQueue();
    const realSink = new RepositorySaveSink(fixture.deps);
    const faulty = createFaultySaveSink({ sink: realSink, failNextWrites: 1, failKeys: ['always'] });
    expect(faulty.remainingFailures()).toBe(1);
    queue.markDirty({ key: 'a', kind: 'chunk-sections', worldId: 'w', chunkX: 1, chunkZ: 2, payload: { version: 1, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: {} } });
    queue.markDirty({ key: 'always', kind: 'chunk-sections', worldId: 'w', chunkX: 3, chunkZ: 4, payload: { version: 1, chunkX: 3, chunkZ: 4, sectionCount: 1, minSectionY: 0, sections: {} } });
    const d1 = await queue.drain(faulty, 10);
    expect(d1).toBe(0); // 'a' fails once (consumes failNextWrites), 'always' fails persistently
    expect(faulty.remainingFailures()).toBe(0);
    expect(queue.size).toBe(2);
    const d2 = await queue.drain(faulty, 10);
    expect(d2).toBe(1); // 'a' now passes, 'always' still fails
    expect(queue.size).toBe(1);

    // withStorageFailure: injected rejections classify by kind.
    const wrapped = withStorageFailure(fixture.deps, 'quota');
    let kind: string | null = null;
    try {
      await wrapped.metadata.putMetadata({ schemaVersion: 1, worldId: 'q', seed: 0, dimensionId: 'd', minY: -64, height: 384, createdAt: 0, updatedAt: 0 });
    } catch (e) {
      kind = classifyStorageError(e);
    }
    expect(kind).toBe('quota');

    // createGatedSaveSink: while canWrite() is false, a drain writes nothing and units stay pending;
    // after recovery, the gated drain persists them.
    let canWrite = false;
    const gate = createGatedSaveSink(realSink, { canWrite: () => canWrite });
    const q2 = new DirtySaveQueue();
    q2.markDirty({ key: 'z', kind: 'chunk-sections', worldId: 'w', chunkX: 7, chunkZ: 8, payload: { version: 1, chunkX: 7, chunkZ: 8, sectionCount: 1, minSectionY: 0, sections: {} } });
    expect(await q2.drain(gate, 10)).toBe(0); // gated: rejected, re-queued
    expect(q2.size).toBe(1);
    canWrite = true;
    expect(await q2.drain(gate, 10)).toBe(1);
    expect(q2.size).toBe(0);
    const monitor = new StorageHealthMonitor({ probe: { probe: () => Promise.resolve() } });
    expect(monitor.canWrite()).toBe(true);
  });
});
