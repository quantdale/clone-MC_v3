import { describe, expect, it } from 'vitest';
import { SaveRecoveryMatrix, createGatedSaveSink, withStorageFailure } from '../../src/storage/SaveRecoveryMatrix';
import { StorageHealthMonitor, classifyStorageError, type StorageProbe } from '../../src/storage/StorageHealth';
import { DirtySaveQueue } from '../../src/storage/DirtySaveQueue';
import { RepositorySaveSink } from '../../src/storage/RepositorySaveSink';
import { makeSaveRecoveryFixture, makeCoordinator } from './saveRecoveryFixture';

function makeMatrix(): SaveRecoveryMatrix {
  return new SaveRecoveryMatrix({
    makeRepositories: () => makeSaveRecoveryFixture(),
    makeCoordinator,
  });
}

/** A probe that fails the first `failCount` calls, then succeeds. */
function makeFailThenSucceedProbe(failCount: number): StorageProbe {
  let remaining = failCount;
  return {
    async probe(): Promise<void> {
      if (remaining > 0) {
        remaining--;
        const e = new Error('quota') as Error & { name: string; code?: number };
        e.name = 'QuotaExceededError';
        e.code = 22;
        throw e;
      }
    },
  };
}

describe('quota-recovery', () => {
  it('failure-classification: injected quota and private-mode failures classify correctly', async () => {
    const results = await makeMatrix().runQuota();
    const r = results.find((x) => x.scenarioId === 'quota.failure-classification')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('quota->quota');
    expect(r.detail).toContain('private-mode->private-mode');
  });

  it('status-transitions: fail -> fail -> success yields degraded -> failed -> ok with gating', async () => {
    const results = await makeMatrix().runQuota();
    const r = results.find((x) => x.scenarioId === 'quota.status-transitions')!;
    expect(r.outcome).toBe('pass');
  });

  it('write-gate: while failed, a drain performs no repository writes and units stay pending', async () => {
    const fixture = makeSaveRecoveryFixture();
    await fixture.openAll();
    const monitor = new StorageHealthMonitor({ probe: makeFailThenSucceedProbe(2) });
    await monitor.check();
    await monitor.check(); // failed
    expect(monitor.canWrite()).toBe(false);
    const realSink = new RepositorySaveSink(fixture.deps);
    let repoWrites = 0;
    const recording = { write: async (u: { key: string; kind: 'chunk-sections'; worldId: string; chunkX: number; chunkZ: number; payload: unknown }) => { repoWrites++; return realSink.write(u); } };
    const gate = createGatedSaveSink(recording, monitor);
    const queue = new DirtySaveQueue();
    queue.markDirty({ key: 'a', kind: 'chunk-sections', worldId: 'w', chunkX: 1, chunkZ: 2, payload: { version: 1, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: {} } });
    expect(await queue.drain(gate, 10)).toBe(0);
    expect(queue.size).toBe(1);
    expect(repoWrites).toBe(0);
  });

  it('pause-resume: units persist after a successful probe restores ok', async () => {
    const results = await makeMatrix().runQuota();
    const r = results.find((x) => x.scenarioId === 'quota.pause-resume')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('pre=0');
    expect(r.detail).toContain('post=3');
  });

  it('listeners-reset: fires on change only, unsubscribe stops delivery, reset restores ok', async () => {
    const results = await makeMatrix().runQuota();
    const r = results.find((x) => x.scenarioId === 'quota.listeners-reset')!;
    expect(r.outcome).toBe('pass');
  });

  it('withStorageFailure produces errors classifyStorageError recognizes', async () => {
    const fixture = makeSaveRecoveryFixture();
    await fixture.openAll();
    const wrapped = withStorageFailure(fixture.deps, 'private-mode');
    let kind: string | null = null;
    try {
      await wrapped.metadata.putMetadata({ schemaVersion: 1, worldId: 'p', seed: 0, dimensionId: 'd', minY: -64, height: 384, createdAt: 0, updatedAt: 0 });
    } catch (e) {
      kind = classifyStorageError(e);
    }
    expect(kind).toBe('private-mode');
  });

  it('all five quota scenarios are present and pass', async () => {
    const results = await makeMatrix().runQuota();
    const ids = results.map((x) => x.scenarioId);
    expect(ids).toEqual([
      'quota.failure-classification',
      'quota.status-transitions',
      'quota.write-gate',
      'quota.pause-resume',
      'quota.listeners-reset',
    ]);
    for (const r of results) expect(r.outcome).toBe('pass');
  });
});
