import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveRecoveryMatrix } from '../../src/storage/SaveRecoveryMatrix';
import { DirtySaveQueue } from '../../src/storage/DirtySaveQueue';
import { RepositorySaveSink } from '../../src/storage/RepositorySaveSink';
import { AutosaveCoordinator, type EventTargetLike } from '../../src/storage/AutosaveCoordinator';
import { ServerSaveLifecycle } from '../../src/simulation/ServerSaveLifecycle';
import type { PersistentUnitKind, WorldSaveCodec } from '../../src/simulation/PersistentWorldCodecs';
import { makeSaveRecoveryFixture, makeCoordinator } from './saveRecoveryFixture';

function makeMatrix(): SaveRecoveryMatrix {
  return new SaveRecoveryMatrix({
    makeRepositories: () => makeSaveRecoveryFixture(),
    makeCoordinator,
  });
}

/** Assert an axis runner produced exactly one result per expected scenario id and all pass. */
async function expectAxis(axis: 'runAbruptClose', ids: string[]): Promise<void> {
  const results = await makeMatrix()[axis]();
  const byId = new Map(results.map((r) => [r.scenarioId, r]));
  for (const id of ids) {
    const r = byId.get(id);
    expect(r, `missing scenario ${id}`).toBeDefined();
    expect(r!.outcome).toBe('pass');
    expect(r!.detail.length).toBeGreaterThan(0);
  }
}

/** Fake event target that can dispatch a pagehide/visibilitychange flush (039 seam). */
class FakeTarget implements EventTargetLike {
  private readonly listeners = new Map<string, Array<() => void>>();
  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => l !== listener));
  }
  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('abrupt-close-recovery', () => {
  it('drain-then-kill persists acknowledged writes and leaves the rest absent', async () => {
    const results = await makeMatrix().runAbruptClose();
    const r = results.find((x) => x.scenarioId === 'abrupt-close.drain-then-kill')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('acknowledged=4');
    expect(r.detail).toContain('persisted=4');
    expect(r.detail).toContain('absent=1');
  });

  it('no-partial-on-kill leaves a never-drained unit absent, never partial', async () => {
    const results = await makeMatrix().runAbruptClose();
    const r = results.find((x) => x.scenarioId === 'abrupt-close.no-partial-on-kill')!;
    expect(r.outcome).toBe('pass');
  });

  it('pagehide flush drains all units before unload', async () => {
    const results = await makeMatrix().runAbruptClose();
    const r = results.find((x) => x.scenarioId === 'abrupt-close.pagehide-flush')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('written=5');
    expect(r.detail).toContain('persisted=5');
  });

  it('a real pagehide event triggers the coordinator flush path', async () => {
    const fixture = makeSaveRecoveryFixture();
    await fixture.openAll();
    const queue = new DirtySaveQueue();
    const sink = new RepositorySaveSink(fixture.deps);
    const target = new FakeTarget();
    const coord = new AutosaveCoordinator({ queue, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: target });
    coord.start();
    for (let i = 0; i < 5; i++) {
      coord.markDirty({
        key: `world-metadata|g${i}|0|0`,
        kind: 'world-metadata',
        worldId: `g${i}`,
        chunkX: 0,
        chunkZ: 0,
        payload: { schemaVersion: 1, worldId: `g${i}`, seed: 0, dimensionId: 'minecraft:overworld', minY: -64, height: 384, createdAt: 1, updatedAt: 1 },
      });
    }
    target.dispatch('pagehide');
    await vi.advanceTimersByTimeAsync(0);
    expect(coord.size).toBe(0);
    coord.stop();
  });

  it('stuck flush terminates with the failing unit still pending', async () => {
    const results = await makeMatrix().runAbruptClose();
    const r = results.find((x) => x.scenarioId === 'abrupt-close.stuck-flush')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('written=3');
    expect(r.detail).toContain('pending=1');
  });

  it('coordinator lifecycle is clean: idempotent start, stop leaves zero, markDirty re-arms', async () => {
    const results = await makeMatrix().runAbruptClose();
    const r = results.find((x) => x.scenarioId === 'abrupt-close.lifecycle-clean')!;
    expect(r.outcome).toBe('pass');
  });

  it('234 reconciliation: a server-owned save survives abrupt termination', async () => {
    const results = await makeMatrix().runAbruptClose();
    const r = results.find((x) => x.scenarioId === 'abrupt-close.server-save-lifecycle')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('restored=2');
  });

  it('234 reconciliation: ServerSaveLifecycle saveAndClose drains all and reload restores them', async () => {
    const fixture = makeSaveRecoveryFixture();
    await fixture.openAll();
    // Identity codec + a real boundary over the in-memory repositories (234's production seam shape).
    const codec: WorldSaveCodec = {
      encode: (u: { value: unknown }) => u.value,
      decode: (payload: unknown, meta: { kind: PersistentUnitKind; worldId: string; chunkX: number; chunkZ: number }) => ({
        kind: meta.kind,
        worldId: meta.worldId,
        chunkX: meta.chunkX,
        chunkZ: meta.chunkZ,
        value: payload,
      }),
    };
    const boundary = {
      async readWorld(worldId: string) {
        const metadata = await fixture.deps.metadata.getMetadata(worldId);
        const playerState = await fixture.deps.playerStates.getPlayerState(worldId);
        const columns = await fixture.deps.chunkSections.listColumns(worldId);
        const blockEntityChunks = await fixture.deps.blockEntities.listChunks(worldId);
        const entityChunks = await fixture.deps.entities.listChunks(worldId);
        if (metadata === null && playerState === null && columns.length === 0 && blockEntityChunks.length === 0 && entityChunks.length === 0) return null;
        return { metadata, playerState, columns, blockEntityChunks, entityChunks };
      },
      async write(unit: { kind: string; worldId: string; chunkX: number; chunkZ: number; payload: unknown }) {
        if (unit.kind === 'world-metadata') {
          await fixture.deps.metadata.putMetadata(unit.payload as never);
        } else if (unit.kind === 'chunk-sections') {
          await fixture.deps.chunkSections.putColumn(unit.worldId, unit.payload as never);
        }
      },
      async writePlayerState(record: { worldId: string }) {
        await fixture.deps.playerStates.putPlayerState(record as never);
      },
    };
    const gate = { canWrite: () => true };
    const lifecycle = new ServerSaveLifecycle({ codec, boundary, storageGate: gate, autosaveEveryTicks: 1, limitPerDrain: 2 });
    expect(lifecycle.state).toBe('unloaded');
    const created = await lifecycle.load('world-srv', () => undefined);
    expect(created.outcome).toBe('created');
    expect(lifecycle.state).toBe('running');
    lifecycle.markDirty({ kind: 'world-metadata', worldId: 'world-srv', chunkX: 0, chunkZ: 0, value: { schemaVersion: 1, worldId: 'world-srv', seed: 0, dimensionId: 'minecraft:overworld', minY: -64, height: 384, createdAt: 1, updatedAt: 1 } });
    lifecycle.markDirty({ kind: 'chunk-sections', worldId: 'world-srv', chunkX: 1, chunkZ: 2, value: { version: 1, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: {} } });
    lifecycle.markDirty({ kind: 'chunk-sections', worldId: 'world-srv', chunkX: 3, chunkZ: 4, value: { version: 1, chunkX: 3, chunkZ: 4, sectionCount: 1, minSectionY: 0, sections: {} } });
    lifecycle.markDirty({ kind: 'chunk-sections', worldId: 'world-srv', chunkX: 5, chunkZ: 6, value: { version: 1, chunkX: 5, chunkZ: 6, sectionCount: 1, minSectionY: 0, sections: {} } });
    const saved = await lifecycle.saveAndClose();
    expect(saved).toBe(4);
    expect(lifecycle.state).toBe('closed');

    // Reload from the same underlying database: every record restored.
    const reopened = fixture.reopen();
    await reopened.openAll();
    const boundary2 = {
      ...boundary,
      readWorld: async (worldId: string) => {
        const metadata = await reopened.deps.metadata.getMetadata(worldId);
        const columns = await reopened.deps.chunkSections.listColumns(worldId);
        return { metadata, playerState: null, columns, blockEntityChunks: [], entityChunks: [] };
      },
    };
    let restored = 0;
    const l2 = new ServerSaveLifecycle({ codec, boundary: boundary2, storageGate: gate, autosaveEveryTicks: 1, limitPerDrain: 2 });
    const loaded = await l2.load('world-srv', () => restored++);
    expect(loaded.outcome).toBe('loaded');
    expect(loaded.columns).toBe(3);
    expect(loaded.metadata).toBe(true);
    expect(restored).toBe(4);
  });

  it('all five abrupt-close scenarios are present and pass', async () => {
    await expectAxis('runAbruptClose', [
      'abrupt-close.drain-then-kill',
      'abrupt-close.no-partial-on-kill',
      'abrupt-close.pagehide-flush',
      'abrupt-close.stuck-flush',
      'abrupt-close.lifecycle-clean',
      'abrupt-close.server-save-lifecycle',
    ]);
  });
});
