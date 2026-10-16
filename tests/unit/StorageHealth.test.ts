import { describe, it, expect } from 'vitest';
import {
  StorageHealthMonitor,
  classifyStorageError,
  createWorldStorageProbe,
  WORLD_PROBE_WORLD_ID,
  type StorageProbe,
} from '../../src/storage/StorageHealth';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { ChunkEditRepository } from '../../src/storage/ChunkEditRepository';
import { createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

function err(name: string, code?: number): Error {
  const e = new Error(name) as Error & { name: string; code?: number };
  e.name = name;
  if (code !== undefined) e.code = code;
  return e;
}

class ControllableProbe implements StorageProbe {
  private pendingError: unknown = null;
  failNext(e: unknown): void {
    this.pendingError = e;
  }
  async probe(): Promise<void> {
    if (this.pendingError !== null) {
      const e = this.pendingError;
      this.pendingError = null;
      throw e;
    }
  }
}

describe('classifyStorageError', () => {
  it('maps known names and codes to kinds', () => {
    expect(classifyStorageError(err('QuotaExceededError'))).toBe('quota');
    expect(classifyStorageError(err('', 22))).toBe('quota');
    expect(classifyStorageError(err('SecurityError'))).toBe('private-mode');
    expect(classifyStorageError(err('', 18))).toBe('private-mode');
    expect(classifyStorageError(err('UnknownError'))).toBe('unavailable');
    expect(classifyStorageError(err('InvalidStateError'))).toBe('unavailable');
  });

  it('falls back to unknown', () => {
    expect(classifyStorageError(err('SomethingElse'))).toBe('unknown');
    expect(classifyStorageError('not an error object')).toBe('unknown');
    expect(classifyStorageError(null)).toBe('unknown');
  });
});

describe('StorageHealthMonitor', () => {
  it('tracks ok -> degraded -> failed and recovers to ok', async () => {
    const probe = new ControllableProbe();
    const monitor = new StorageHealthMonitor({ probe });

    expect(await monitor.check()).toBe('ok');
    expect(monitor.canWrite()).toBe(true);

    probe.failNext(err('QuotaExceededError'));
    expect(await monitor.check()).toBe('degraded');
    expect(monitor.lastFailure?.kind).toBe('quota');
    expect(monitor.canWrite()).toBe(true); // one failure: warning only

    probe.failNext(err('QuotaExceededError'));
    expect(await monitor.check()).toBe('failed');
    expect(monitor.canWrite()).toBe(false);

    // Recovery: a successful probe restores ok.
    expect(await monitor.check()).toBe('ok');
    expect(monitor.lastFailure).toBeNull();
    expect(monitor.canWrite()).toBe(true);
  });

  it('fires listeners only on status changes and supports unsubscribe + reset', async () => {
    const probe = new ControllableProbe();
    const monitor = new StorageHealthMonitor({ probe });
    const seen: string[] = [];
    const unsubscribe = monitor.onStatusChange((s) => seen.push(s));

    // ok -> ok: no change, no fire.
    await monitor.check();
    expect(seen).toEqual([]);

    probe.failNext(err('SecurityError'));
    await monitor.check(); // ok -> degraded
    expect(seen).toEqual(['degraded']);
    expect(monitor.lastFailure?.kind).toBe('private-mode');

    probe.failNext(err('SecurityError'));
    await monitor.check(); // degraded -> failed
    expect(seen).toEqual(['degraded', 'failed']);

    probe.failNext(err('SecurityError'));
    await monitor.check(); // failed -> failed: no change, no fire
    expect(seen).toEqual(['degraded', 'failed']);

    await monitor.check(); // failed -> ok: fire
    expect(seen).toEqual(['degraded', 'failed', 'ok']);

    unsubscribe();
    probe.failNext(err('SecurityError'));
    await monitor.check(); // ok -> degraded, but unsubscribed
    expect(seen).toEqual(['degraded', 'failed', 'ok']);

    monitor.reset();
    expect(monitor.status).toBe('ok');
    expect(monitor.lastFailure).toBeNull();
    expect(monitor.canWrite()).toBe(true);
  });

  it('check() never throws on probe failure', async () => {
    const probe = new ControllableProbe();
    probe.failNext(new Error('boom'));
    const monitor = new StorageHealthMonitor({ probe });
    await expect(monitor.check()).resolves.toBe('degraded');
  });
});

describe('createWorldStorageProbe', () => {
  it('succeeds on healthy repositories and leaves no probe record', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const deps = {
      metadata: new WorldMetadataRepository({ factory: mock }),
      chunkSections: new ChunkSectionRepository({ factory: mock }),
      blockEntities: new BlockEntityRepository({ factory: mock }),
      entities: new EntityRepository({ factory: mock }),
      playerStates: new PlayerStateRepository({ factory: mock }),
    };
    const probe = createWorldStorageProbe(deps);

    await expect(probe.probe()).resolves.toBeUndefined();
    const ids = (await deps.metadata.listMetadata()).map((m) => m.worldId);
    expect(ids).not.toContain(WORLD_PROBE_WORLD_ID);
  });

  it('rejects and classifies when a write fails (quota)', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const healthyMetadata = new WorldMetadataRepository({ factory: mock });
    // Override putMetadata to simulate quota exhaustion on the probe write.
    const failingMetadata = Object.create(healthyMetadata) as WorldMetadataRepository;
    failingMetadata.putMetadata = async () => {
      throw err('QuotaExceededError');
    };

    const deps = {
      metadata: failingMetadata,
      chunkSections: new ChunkSectionRepository({ factory: mock }),
      blockEntities: new BlockEntityRepository({ factory: mock }),
      entities: new EntityRepository({ factory: mock }),
      playerStates: new PlayerStateRepository({ factory: mock }),
    };
    const probe = createWorldStorageProbe(deps);

    const monitor = new StorageHealthMonitor({ probe });
    expect(await monitor.check()).toBe('degraded');
    expect(monitor.lastFailure?.kind).toBe('quota');
  });

  it('round-trips the chunk-edits store when the optional repository is provided', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const chunkEdits = new ChunkEditRepository({ factory: mock });
    const deps = {
      metadata: new WorldMetadataRepository({ factory: mock }),
      chunkSections: new ChunkSectionRepository({ factory: mock }),
      blockEntities: new BlockEntityRepository({ factory: mock }),
      entities: new EntityRepository({ factory: mock }),
      playerStates: new PlayerStateRepository({ factory: mock }),
      chunkEdits,
    };
    const probe = createWorldStorageProbe(deps);

    await expect(probe.probe()).resolves.toBeUndefined();
    // The probe record is deleted in all paths.
    expect(await chunkEdits.getChunkEdits(WORLD_PROBE_WORLD_ID, 0, 0, 0)).toBeNull();
  });
});
