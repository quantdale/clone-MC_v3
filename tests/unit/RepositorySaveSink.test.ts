import { describe, it, expect } from 'vitest';
import { DirtySaveQueue, type SaveUnit } from '../../src/storage/DirtySaveQueue';
import { RepositorySaveSink } from '../../src/storage/RepositorySaveSink';
import { ChunkEditRepository } from '../../src/storage/ChunkEditRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

function chunkEditsUnit(overrides: Partial<SaveUnit> = {}): SaveUnit {
  return {
    key: 'chunk-edits|a|1|0|2',
    kind: 'chunk-edits',
    worldId: 'a',
    chunkX: 1,
    chunkY: 0,
    chunkZ: 2,
    payload: [[0, 1], [16383, 9]],
    ...overrides,
  };
}

describe('RepositorySaveSink (chunk-edits / player-state routing)', () => {
  it('routes a chunk-edits unit with chunkY to the repository', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkEditRepository({ factory: mock });
    await repo.open();

    const sink = new RepositorySaveSink({ chunkEdits: repo });
    await sink.write(chunkEditsUnit());

    expect(await repo.getChunkEdits('a', 1, 0, 2)).toEqual([[0, 1], [16383, 9]]);
  });

  it('defaults a missing chunkY to 0 when routing a chunk-edits unit', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new ChunkEditRepository({ factory: mock });
    await repo.open();

    const sink = new RepositorySaveSink({ chunkEdits: repo });
    const { chunkY: _chunkY, ...unitWithoutY } = chunkEditsUnit({ key: 'chunk-edits|a|1|-2', chunkZ: -2 });
    void _chunkY;
    await sink.write(unitWithoutY);

    expect(await repo.getChunkEdits('a', 1, 0, -2)).toEqual([[0, 1], [16383, 9]]);
  });

  it('routes a player-state unit to the repository', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const repo = new PlayerStateRepository({ factory: mock });
    await repo.open();

    const record = {
      key: 'a',
      worldId: 'a',
      seed: 7,
      position: [1, 64, 2] as [number, number, number],
      yaw: 90,
      pitch: -10,
      inventory: { items: [] },
      survival: { health: 20 },
      experience: { level: 3 },
    };
    const sink = new RepositorySaveSink({ playerStates: repo });
    await sink.write({ key: 'player|a', kind: 'player-state', worldId: 'a', chunkX: 0, chunkZ: 0, payload: record });

    expect(await repo.getPlayerState('a')).not.toBeNull();
  });

  it('rejects when the chunk-edits or player-state repository is absent', async () => {
    const sink = new RepositorySaveSink({});
    await expect(sink.write(chunkEditsUnit())).rejects.toThrow(/no chunk-edits repository/);
    await expect(
      sink.write({ key: 'player|a', kind: 'player-state', worldId: 'a', chunkX: 0, chunkZ: 0, payload: {} }),
    ).rejects.toThrow(/no player-state repository/);
  });

  it('re-queues a chunk-edits unit whose repository is missing', async () => {
    const q = new DirtySaveQueue();
    q.markDirty(chunkEditsUnit());
    const written = await q.drain(new RepositorySaveSink({}), 10);
    expect(written).toBe(0);
    expect(q.size).toBe(1);
  });
});
