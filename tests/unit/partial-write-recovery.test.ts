import { describe, expect, it } from 'vitest';
import { SaveRecoveryMatrix, createFaultySaveSink } from '../../src/storage/SaveRecoveryMatrix';
import { DirtySaveQueue } from '../../src/storage/DirtySaveQueue';
import { RepositorySaveSink } from '../../src/storage/RepositorySaveSink';
import { validateWorldMetadata } from '../../src/storage/WorldMetadata';
import { makeSaveRecoveryFixture, makeCoordinator } from './saveRecoveryFixture';

function makeMatrix(): SaveRecoveryMatrix {
  return new SaveRecoveryMatrix({
    makeRepositories: () => makeSaveRecoveryFixture(),
    makeCoordinator,
  });
}

describe('partial-write-recovery', () => {
  it('requeue-retry: a failed write stays pending and persists on the next drain', async () => {
    const fixture = makeSaveRecoveryFixture();
    await fixture.openAll();
    const queue = new DirtySaveQueue();
    const faulty = createFaultySaveSink({ sink: new RepositorySaveSink(fixture.deps), failNextWrites: 1 });
    const col = (cx: number, cz: number) => ({ key: `c|${cx}|${cz}`, kind: 'chunk-sections' as const, worldId: 'w', chunkX: cx, chunkZ: cz, payload: { version: 1, chunkX: cx, chunkZ: cz, sectionCount: 1, minSectionY: 0, sections: {} } });
    queue.markDirty(col(1, 2));
    queue.markDirty(col(3, 4));
    expect(await queue.drain(faulty, 10)).toBe(1); // first fails, second passes
    expect(queue.size).toBe(1);
    expect(await queue.drain(faulty, 10)).toBe(1); // retry persists it
    expect(queue.size).toBe(0);
    expect((await fixture.deps.chunkSections.listColumns('w')).length).toBe(2);
  });

  it('invalid-payload-rejected: a corrupt column write is rejected and leaves the store clean', async () => {
    const results = await makeMatrix().runPartialWrite();
    const r = results.find((x) => x.scenarioId === 'partial-write.invalid-payload-rejected')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('store clean');
  });

  it('corrupt-read-rejected: a seeded corrupt stored record is rejected by the validating read path', async () => {
    const results = await makeMatrix().runPartialWrite();
    const r = results.find((x) => x.scenarioId === 'partial-write.corrupt-read-rejected')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('validateWorldMetadata');
  });

  it('corrupt metadata fails the shared validator directly', () => {
    expect(() =>
      validateWorldMetadata({ schemaVersion: 'x', worldId: 'c', seed: 0, dimensionId: 'd', minY: -64, height: 384, createdAt: 0, updatedAt: 0 }),
    ).toThrow();
  });

  it('atomic-per-unit: a rejected column write leaves no partial record and the unit pending', async () => {
    const results = await makeMatrix().runPartialWrite();
    const r = results.find((x) => x.scenarioId === 'partial-write.atomic-per-unit')!;
    expect(r.outcome).toBe('pass');
  });

  it('all four partial-write scenarios are present and pass', async () => {
    const results = await makeMatrix().runPartialWrite();
    const ids = results.map((x) => x.scenarioId);
    expect(ids).toEqual([
      'partial-write.requeue-retry',
      'partial-write.invalid-payload-rejected',
      'partial-write.corrupt-read-rejected',
      'partial-write.atomic-per-unit',
    ]);
    for (const r of results) expect(r.outcome).toBe('pass');
  });
});
