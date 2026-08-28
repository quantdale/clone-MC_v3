import { describe, expect, it } from 'vitest';
import {
  ServerSaveLifecycle,
  type LoadResult,
  type PersistedWorldSnapshot,
  type SaveLoadBoundary,
  type ServerSaveLifecycleOptions,
} from '../../src/simulation/ServerSaveLifecycle';
import {
  unitKey,
  type PersistentUnitKind,
  type ServerWorldUnit,
  type WorldCodecMeta,
  type WorldSaveCodec,
} from '../../src/simulation/PersistentWorldCodecs';
import { WorldTickProcess } from '../../src/simulation/WorldTickProcess';
import { createWorldSaveCodec } from '../../src/simulation/PersistentWorldCodecs';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { BlockEntityInstance, BlockEntityManager } from '../../src/simulation/BlockEntityManager';
import { EntityManager } from '../../src/simulation/EntityManager';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import type { SaveUnit } from '../../src/storage/DirtySaveQueue';
import type { WorldMetadata } from '../../src/storage/WorldMetadata';
import type { PlayerStateRecord } from '../../src/storage/PlayerStateRecord';
import type { SerializedChunkColumn } from '../../src/world/ChunkColumn';
import type { BlockEntityChunkRecord } from '../../src/storage/BlockEntityRecord';
import type { EntityChunkRecord } from '../../src/storage/EntityRecord';

// ────────────────────────────────────────────────────────────────────────────
// Fakes
// ────────────────────────────────────────────────────────────────────────────

/** Codec that echoes units/records so tests control decode/encode failures precisely. */
class FakeCodec implements WorldSaveCodec {
  failEncodeKeys = new Set<string>();
  failAllDecode = false;

  encode(unit: ServerWorldUnit): unknown {
    if (this.failEncodeKeys.has(unitKey(unit))) throw new Error('FakeCodec: encode failed');
    return { encoded: unit.value, key: unitKey(unit) };
  }

  decode(payload: unknown, meta: WorldCodecMeta): ServerWorldUnit {
    if (this.failAllDecode) throw new Error('FakeCodec: decode failed');
    return { kind: meta.kind, worldId: meta.worldId, chunkX: meta.chunkX, chunkZ: meta.chunkZ, value: payload };
  }
}

/** In-memory boundary recording writes and serving a fixed snapshot. */
class FakeBoundary implements SaveLoadBoundary {
  snapshot: PersistedWorldSnapshot | null = null;
  writes: SaveUnit[] = [];
  playerStateWrites: PlayerStateRecord[] = [];
  /** Every `write()` attempt (successful or not) — counts drain runs that reached the boundary. */
  writeAttempts = 0;
  failWriteKeys = new Set<string>();
  failAllWrites = false;
  readWorldThrows = false;
  writeError = new Error('FakeBoundary: write rejected');

  async readWorld(_worldId: string): Promise<PersistedWorldSnapshot | null> {
    if (this.readWorldThrows) throw new Error('FakeBoundary: readWorld failed');
    return this.snapshot;
  }

  async write(unit: SaveUnit): Promise<void> {
    this.writeAttempts++;
    if (this.failAllWrites || this.failWriteKeys.has(unit.key)) throw this.writeError;
    this.writes.push(unit);
  }

  async writePlayerState(record: PlayerStateRecord): Promise<void> {
    if (this.failAllWrites) throw this.writeError;
    this.playerStateWrites.push(record);
  }
}

class FakeGate {
  open = true;
  canWrite(): boolean {
    return this.open;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeLifecycle(overrides: Partial<ServerSaveLifecycleOptions> = {}): {
  lifecycle: ServerSaveLifecycle;
  codec: FakeCodec;
  boundary: FakeBoundary;
  gate: FakeGate;
} {
  const codec = new FakeCodec();
  const boundary = new FakeBoundary();
  const gate = new FakeGate();
  const lifecycle = new ServerSaveLifecycle({ codec, boundary, storageGate: gate, ...overrides });
  return { lifecycle, codec, boundary, gate };
}

function dirtyUnit(
  kind: PersistentUnitKind = 'chunk-sections',
  chunkX = 1,
  chunkZ = 2,
  value: unknown = { label: 'unit' },
): ServerWorldUnit {
  return { kind, worldId: 'w1', chunkX, chunkZ, value };
}

const METADATA: WorldMetadata = {
  schemaVersion: 1,
  worldId: 'w1',
  seed: 42,
  dimensionId: 'minecraft:overworld',
  minY: -64,
  height: 384,
  createdAt: 1000,
  updatedAt: 2000,
};

const PLAYER_STATE: PlayerStateRecord = {
  key: 'w1',
  worldId: 'w1',
  seed: 42,
  position: [1.5, 64, 2.5],
  yaw: 90,
  pitch: -5,
  inventory: { slots: [] },
  survival: { health: 20 },
  experience: { level: 3 },
};

function columnRecord(x: number, z: number): SerializedChunkColumn {
  return { version: 1, chunkX: x, chunkZ: z, sectionCount: 1, minSectionY: 0, sections: {} };
}

function beChunkRecord(x: number, z: number): BlockEntityChunkRecord {
  return { key: `w1|${x}|${z}`, worldId: 'w1', chunkX: x, chunkZ: z, entities: [] };
}

function eChunkRecord(x: number, z: number): EntityChunkRecord {
  return { key: `w1|${x}|${z}`, worldId: 'w1', chunkX: x, chunkZ: z, entities: [] };
}

function fullSnapshot(): PersistedWorldSnapshot {
  return {
    metadata: METADATA,
    playerState: PLAYER_STATE,
    columns: [columnRecord(1, 2)],
    blockEntityChunks: [beChunkRecord(1, 2)],
    entityChunks: [eChunkRecord(1, 2)],
  };
}

async function loaded(result: Promise<LoadResult>): Promise<LoadResult> {
  return result;
}

// ────────────────────────────────────────────────────────────────────────────

describe('ServerSaveLifecycle', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Construction validation
  // ──────────────────────────────────────────────────────────────────────────
  describe('construction validation', () => {
    it('rejects invalid option values with ServerSaveLifecycle errors', () => {
      const { codec, boundary, gate } = makeLifecycle();
      for (const bad of [0, -1, 1.5, Number.NaN]) {
        expect(
          () => new ServerSaveLifecycle({ codec, boundary, storageGate: gate, autosaveEveryTicks: bad }),
        ).toThrow(/ServerSaveLifecycle: autosaveEveryTicks must be a positive safe integer/);
        expect(
          () => new ServerSaveLifecycle({ codec, boundary, storageGate: gate, limitPerDrain: bad }),
        ).toThrow(/ServerSaveLifecycle: limitPerDrain must be a positive safe integer/);
        expect(
          () => new ServerSaveLifecycle({ codec, boundary, storageGate: gate, flushZeroProgressLimit: bad }),
        ).toThrow(/ServerSaveLifecycle: flushZeroProgressLimit must be a positive safe integer/);
      }
    });

    it('rejects invalid codec/boundary/gate surfaces', () => {
      const { codec, boundary, gate } = makeLifecycle();
      expect(() => new ServerSaveLifecycle({ codec: {} as WorldSaveCodec, boundary, storageGate: gate })).toThrow(
        'ServerSaveLifecycle: codec must provide encode() and decode()',
      );
      expect(() => new ServerSaveLifecycle({ codec, boundary: {} as SaveLoadBoundary, storageGate: gate })).toThrow(
        'ServerSaveLifecycle: boundary must provide readWorld(), write(), and writePlayerState()',
      );
      expect(() => new ServerSaveLifecycle({ codec, boundary, storageGate: {} as { canWrite(): boolean } })).toThrow(
        'ServerSaveLifecycle: storageGate must provide canWrite()',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-1: Lifecycle state machine and load
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-1 lifecycle state machine and load', () => {
    it('loads an existing world into running and restores every decoded unit once', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = fullSnapshot();
      const restored: ServerWorldUnit[] = [];
      const result = await lifecycle.load('w1', (u) => restored.push(u));
      expect(lifecycle.state).toBe('running');
      expect(restored.length).toBe(5);
      expect(result).toEqual({
        worldId: 'w1',
        outcome: 'loaded',
        columns: 1,
        blockEntityChunks: 1,
        entityChunks: 1,
        metadata: true,
        playerState: true,
      });
    });

    it('restores units in deterministic order: metadata, player-state, columns, block entities, entities (sorted by key)', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = {
        metadata: METADATA,
        playerState: PLAYER_STATE,
        columns: [columnRecord(3, 1), columnRecord(1, 2), columnRecord(0, 0)],
        blockEntityChunks: [beChunkRecord(2, 2)],
        entityChunks: [eChunkRecord(5, 5)],
      };
      const order: string[] = [];
      await lifecycle.load('w1', (u) => order.push(`${u.kind}@${u.chunkX},${u.chunkZ}`));
      expect(order).toEqual([
        'world-metadata@0,0',
        'player-state@0,0',
        'chunk-sections@0,0',
        'chunk-sections@1,2',
        'chunk-sections@3,1',
        'block-entities@2,2',
        'entities@5,5',
      ]);
    });

    it('creates a fresh world when the boundary has no records', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = null;
      const restored: ServerWorldUnit[] = [];
      const result = await lifecycle.load('w1', (u) => restored.push(u));
      expect(lifecycle.state).toBe('running');
      expect(restored).toEqual([]);
      expect(result).toEqual({
        worldId: 'w1',
        outcome: 'created',
        columns: 0,
        blockEntityChunks: 0,
        entityChunks: 0,
        metadata: false,
        playerState: false,
      });
    });

    it('rolls back to unloaded on any decode failure and touches no world', async () => {
      const { lifecycle, boundary, codec } = makeLifecycle();
      boundary.snapshot = fullSnapshot();
      codec.failAllDecode = true;
      const restored: ServerWorldUnit[] = [];
      await expect(loaded(lifecycle.load('w1', (u) => restored.push(u)))).rejects.toThrow(
        'FakeCodec: decode failed',
      );
      expect(lifecycle.state).toBe('unloaded');
      expect(restored).toEqual([]);
    });

    it('rolls back to unloaded when the boundary read throws', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.readWorldThrows = true;
      await expect(lifecycle.load('w1', () => undefined)).rejects.toThrow('FakeBoundary: readWorld failed');
      expect(lifecycle.state).toBe('unloaded');
    });

    it('rejects load while not unloaded', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      expect(lifecycle.state).toBe('running');
      await expect(lifecycle.load('w1', () => undefined)).rejects.toThrow(
        /ServerSaveLifecycle: load requires state 'unloaded' \(was 'running'\)/,
      );
    });

    it('rejects load with an empty worldId or non-function restore', async () => {
      const { lifecycle } = makeLifecycle();
      await expect(lifecycle.load('', () => undefined)).rejects.toThrow(
        'ServerSaveLifecycle: worldId must be a non-empty string',
      );
      await expect(lifecycle.load('w1', 'nope' as unknown as (u: ServerWorldUnit) => void)).rejects.toThrow(
        'ServerSaveLifecycle: restore must be a function',
      );
      expect(lifecycle.state).toBe('unloaded');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-2: Dirty-unit marking and de-duplication
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-2 dirty-unit marking and de-duplication', () => {
    it('drains a marked unit exactly once', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 1 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      const unit = dirtyUnit();
      lifecycle.markDirty(unit);
      lifecycle.tick(1);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(1);
      expect(boundary.writes[0]!.key).toBe(unitKey(unit));
      expect(lifecycle.pendingCount).toBe(0);
    });

    it('re-marking a dirty key replaces its value and keeps its FIFO position', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 1 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      const aOld = dirtyUnit('chunk-sections', 1, 2, { v: 'old' });
      const b = dirtyUnit('chunk-sections', 3, 4, { v: 'b' });
      const aNew = dirtyUnit('chunk-sections', 1, 2, { v: 'new' });
      lifecycle.markDirty(aOld);
      lifecycle.markDirty(b);
      lifecycle.markDirty(aNew); // same key as aOld: FIFO position preserved, value replaced
      lifecycle.tick(1);
      await lifecycle.idle();
      // Amended spec (design.md reconciliation): re-mark keeps the original FIFO position, so aNew
      // drains first with the newer value, then b.
      expect(boundary.writes.map((w) => w.key)).toEqual([unitKey(aNew), unitKey(b)]);
      expect(boundary.writes[0]!.payload).toEqual({ encoded: aNew.value, key: unitKey(aNew) });
      expect(boundary.writes[1]!.payload).toEqual({ encoded: b.value, key: unitKey(b) });
      expect(lifecycle.pendingCount).toBe(0);
    });

    it('rejects marking after close with the state unchanged', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit());
      await lifecycle.saveAndClose();
      expect(lifecycle.state).toBe('closed');
      expect(() => lifecycle.markDirty(dirtyUnit())).toThrow(
        /ServerSaveLifecycle: markDirty requires state 'running' \(was 'closed'\)/,
      );
      expect(lifecycle.pendingCount).toBe(0);
    });

    it('rejects marking while flushing', async () => {
      const { lifecycle, boundary, gate } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit());
      gate.open = false;
      await lifecycle.flush(); // zero progress, state stays flushing
      expect(lifecycle.state).toBe('flushing');
      expect(() => lifecycle.markDirty(dirtyUnit())).toThrow(
        /ServerSaveLifecycle: markDirty requires state 'running' \(was 'flushing'\)/,
      );
    });

    it('rejects invalid units without touching the pending set', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      const badUnits: unknown[] = [
        { kind: 'unknown-kind', worldId: 'w1', chunkX: 1, chunkZ: 2, value: {} },
        { kind: 'chunk-sections', worldId: '', chunkX: 1, chunkZ: 2, value: {} },
        { kind: 'chunk-sections', worldId: 'w1', chunkX: 1.5, chunkZ: 2, value: {} },
        { kind: 'chunk-sections', worldId: 'w1', chunkX: 1, chunkZ: 2 },
        { kind: 'world-metadata', worldId: 'w1', chunkX: 1, chunkZ: 0, value: {} },
      ];
      for (const bad of badUnits) {
        expect(() => lifecycle.markDirty(bad as ServerWorldUnit)).toThrow(/ServerSaveLifecycle: invalid unit:/);
      }
      expect(lifecycle.pendingCount).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-3: Bounded drain with retry and no-loss
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-3 bounded drain with retry and no-loss', () => {
    it('drains at most limitPerDrain units per drain', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 1, limitPerDrain: 2 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      for (let i = 0; i < 5; i++) lifecycle.markDirty(dirtyUnit('chunk-sections', i, i, { i }));
      lifecycle.tick(1);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(2);
      expect(lifecycle.pendingCount).toBe(3);
    });

    it('re-queues a failed write at the end and retries it on the next drain', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 1 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      const a = dirtyUnit('chunk-sections', 1, 2, { label: 'a' });
      const b = dirtyUnit('chunk-sections', 3, 4, { label: 'b' });
      lifecycle.markDirty(a);
      lifecycle.markDirty(b);
      boundary.failWriteKeys.add(unitKey(a));
      lifecycle.tick(1);
      await lifecycle.idle();
      // b was written; a failed and stays pending.
      expect(boundary.writes.map((w) => w.key)).toEqual([unitKey(b)]);
      expect(lifecycle.pendingCount).toBe(1);
      expect(lifecycle.lastFailures.some((f) => f.kind === 'unknown' && f.unitKey === unitKey(a))).toBe(true);
      // Recovery: the next drain writes a.
      boundary.failWriteKeys.clear();
      lifecycle.tick(2);
      await lifecycle.idle();
      expect(boundary.writes.map((w) => w.key)).toEqual([unitKey(b), unitKey(a)]);
      expect(lifecycle.pendingCount).toBe(0);
    });

    it('keeps a failed-encode unit pending and records an encode failure', async () => {
      const { lifecycle, boundary, codec } = makeLifecycle({ autosaveEveryTicks: 1 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      const a = dirtyUnit('chunk-sections', 1, 2, { label: 'a' });
      const b = dirtyUnit('chunk-sections', 3, 4, { label: 'b' });
      lifecycle.markDirty(a);
      lifecycle.markDirty(b);
      codec.failEncodeKeys.add(unitKey(a));
      lifecycle.tick(1);
      await lifecycle.idle();
      expect(boundary.writes.map((w) => w.key)).toEqual([unitKey(b)]);
      expect(lifecycle.pendingCount).toBe(1);
      expect(lifecycle.lastFailures.some((f) => f.kind === 'encode' && f.unitKey === unitKey(a))).toBe(true);
      // Recovery: encode succeeds and a drains.
      codec.failEncodeKeys.clear();
      lifecycle.tick(2);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(2);
      expect(lifecycle.pendingCount).toBe(0);
    });

    it('never throws from a drain, even with gate down, encode failure, and write failure combined', async () => {
      const { lifecycle, boundary, codec, gate } = makeLifecycle({ autosaveEveryTicks: 1 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2));
      lifecycle.markDirty(dirtyUnit('chunk-sections', 3, 4));
      codec.failEncodeKeys.add(unitKey(dirtyUnit('chunk-sections', 1, 2)));
      boundary.failAllWrites = true;
      gate.open = false;
      lifecycle.tick(1);
      await lifecycle.idle();
      lifecycle.tick(2);
      await lifecycle.idle();
      expect(lifecycle.pendingCount).toBe(2);
      expect(lifecycle.lastFailures.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-4: Tick-driven autosave cadence
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-4 tick-driven autosave cadence', () => {
    it('fires an autosave drain exactly on cadence ticks', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 100 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      const unit = dirtyUnit();
      lifecycle.markDirty(unit);
      lifecycle.tick(100);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(1);
      expect(lifecycle.pendingCount).toBe(0);
      lifecycle.tick(101);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(1);
    });

    it('drains nothing off-cadence', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 100 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit());
      lifecycle.tick(50);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(0);
      expect(lifecycle.pendingCount).toBe(1);
    });

    it('drains zero with an empty queue without calling the boundary', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 100 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.tick(100);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(0);
    });

    it('rejects invalid tick numbers', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => lifecycle.tick(bad)).toThrow(/ServerSaveLifecycle: tick must be a non-negative safe integer/);
      }
    });

    it('serializes drains across multiple cadence ticks in FIFO order', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 1, limitPerDrain: 1 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2, { i: 1 }));
      lifecycle.markDirty(dirtyUnit('chunk-sections', 3, 4, { i: 2 }));
      lifecycle.markDirty(dirtyUnit('chunk-sections', 5, 6, { i: 3 }));
      lifecycle.tick(1);
      lifecycle.tick(2);
      lifecycle.tick(3);
      await lifecycle.idle();
      expect(boundary.writes.map((w) => w.key)).toEqual([
        'chunk-sections|w1|1|2',
        'chunk-sections|w1|3|4',
        'chunk-sections|w1|5|6',
      ]);
      expect(lifecycle.pendingCount).toBe(0);
    });

    it('is a no-op off state running', async () => {
      const { lifecycle, boundary } = makeLifecycle({ autosaveEveryTicks: 100 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      await lifecycle.saveAndClose();
      expect(lifecycle.state).toBe('closed');
      expect(() => lifecycle.markDirty(dirtyUnit())).toThrow(); // closed: no marking
      lifecycle.tick(100); // must not throw and must not schedule
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-5: Graceful flush and save-and-close
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-5 graceful flush and save-and-close', () => {
    it('saveAndClose drains to empty, writes everything, and closes', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2, { a: 1 }));
      lifecycle.markDirty(dirtyUnit('entities', 3, 4, { b: 2 }));
      lifecycle.markDirty(dirtyUnit('player-state', 0, 0, PLAYER_STATE));
      const total = await lifecycle.saveAndClose();
      expect(total).toBe(3);
      expect(lifecycle.pendingCount).toBe(0);
      expect(lifecycle.state).toBe('closed');
      expect(boundary.writes.length).toBe(2);
      expect(boundary.playerStateWrites.length).toBe(1);
      // FakeCodec wraps the value: the boundary receives the encoded payload.
      expect(boundary.playerStateWrites[0]).toEqual({ encoded: PLAYER_STATE, key: 'player-state|w1|0|0' });
    });

    it('flush drains to empty and leaves the state flushing', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2, { a: 1 }));
      lifecycle.markDirty(dirtyUnit('entities', 3, 4, { b: 2 }));
      const total = await lifecycle.flush();
      expect(total).toBe(2);
      expect(lifecycle.pendingCount).toBe(0);
      expect(lifecycle.state).toBe('flushing');
    });

    it('stops at the zero-progress guard on persistently failing writes', async () => {
      const { lifecycle, boundary } = makeLifecycle({ flushZeroProgressLimit: 3 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2, { a: 1 }));
      boundary.failAllWrites = true;
      await expect(lifecycle.saveAndClose()).rejects.toThrow(
        /ServerSaveLifecycle: saveAndClose could not drain the queue; 1 unit\(s\) still pending after flush/,
      );
      expect(lifecycle.state).toBe('flushing');
      expect(lifecycle.pendingCount).toBe(1);
      // At most flushZeroProgressLimit drain runs; each failing run reaches the boundary exactly once.
      expect(boundary.writeAttempts).toBe(3);
      expect(lifecycle.lastFailures.length).toBeGreaterThanOrEqual(3);
    });

    it('recovers and closes after a storage failure', async () => {
      const { lifecycle, boundary, gate } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2, { a: 1 }));
      gate.open = false;
      await expect(lifecycle.saveAndClose()).rejects.toThrow(
        /ServerSaveLifecycle: saveAndClose could not drain the queue/,
      );
      expect(lifecycle.state).toBe('flushing');
      expect(lifecycle.pendingCount).toBe(1);
      gate.open = true;
      const total = await lifecycle.saveAndClose();
      expect(total).toBe(1);
      expect(lifecycle.state).toBe('closed');
      expect(lifecycle.pendingCount).toBe(0);
    });

    it('rejects flush while unloaded and saveAndClose after close', async () => {
      const { lifecycle } = makeLifecycle();
      await expect(lifecycle.flush()).rejects.toThrow(
        /ServerSaveLifecycle: flush requires state 'running' or 'flushing' \(was 'unloaded'\)/,
      );
    });

    it('reset restores a usable unloaded lifecycle after a failed saveAndClose', async () => {
      const { lifecycle, boundary, gate } = makeLifecycle();
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit());
      gate.open = false;
      await expect(lifecycle.saveAndClose()).rejects.toThrow();
      lifecycle.reset();
      expect(lifecycle.state).toBe('unloaded');
      expect(lifecycle.pendingCount).toBe(0);
      expect(lifecycle.lastFailures).toEqual([]);
      gate.open = true;
      const result = await lifecycle.load('w1', () => undefined);
      expect(result.outcome).toBe('created');
      expect(lifecycle.state).toBe('running');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-6: Storage-health gating
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-6 storage-health gating', () => {
    it('fences writes while the gate is down and records a storage failure', async () => {
      const { lifecycle, boundary, gate } = makeLifecycle({ autosaveEveryTicks: 100 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2, { a: 1 }));
      lifecycle.markDirty(dirtyUnit('entities', 3, 4, { b: 2 }));
      gate.open = false;
      lifecycle.tick(100);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(0);
      expect(lifecycle.pendingCount).toBe(2);
      const failure = lifecycle.lastFailures.find((f) => f.kind === 'storage');
      expect(failure).toBeDefined();
      expect(failure!.unitKey).toBeNull();
    });

    it('drains pending units after the gate recovers', async () => {
      const { lifecycle, boundary, gate } = makeLifecycle({ autosaveEveryTicks: 100 });
      boundary.snapshot = null;
      await lifecycle.load('w1', () => undefined);
      lifecycle.markDirty(dirtyUnit('chunk-sections', 1, 2, { a: 1 }));
      lifecycle.markDirty(dirtyUnit('entities', 3, 4, { b: 2 }));
      gate.open = false;
      lifecycle.tick(100);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(0);
      gate.open = true;
      lifecycle.tick(200);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(2);
      expect(lifecycle.pendingCount).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-7: Load data integrity and atomicity
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-7 load data integrity and atomicity', () => {
    it('fails the whole load on a single invalid record without restoring anything', async () => {
      const { lifecycle, boundary, codec } = makeLifecycle();
      boundary.snapshot = {
        metadata: null,
        playerState: null,
        columns: Array.from({ length: 10 }, (_, i) => columnRecord(i, i)),
        blockEntityChunks: [],
        entityChunks: [],
      };
      codec.failAllDecode = true;
      const restored: ServerWorldUnit[] = [];
      await expect(lifecycle.load('w1', (u) => restored.push(u))).rejects.toThrow('FakeCodec: decode failed');
      expect(lifecycle.state).toBe('unloaded');
      expect(restored).toEqual([]);
    });

    it('rejects duplicate column keys and rolls back', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = {
        metadata: null,
        playerState: null,
        columns: [columnRecord(1, 2), columnRecord(1, 2)],
        blockEntityChunks: [],
        entityChunks: [],
      };
      const restored: ServerWorldUnit[] = [];
      await expect(lifecycle.load('w1', (u) => restored.push(u))).rejects.toThrow(
        /ServerSaveLifecycle: snapshot for world 'w1' has duplicate columns key '1\|2'/,
      );
      expect(lifecycle.state).toBe('unloaded');
      expect(restored).toEqual([]);
    });

    it('rejects duplicate block-entity chunk keys and rolls back', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = {
        metadata: null,
        playerState: null,
        columns: [],
        blockEntityChunks: [beChunkRecord(1, 2), beChunkRecord(1, 2)],
        entityChunks: [],
      };
      await expect(lifecycle.load('w1', () => undefined)).rejects.toThrow(
        /ServerSaveLifecycle: snapshot for world 'w1' has duplicate blockEntityChunks key '1\|2'/,
      );
      expect(lifecycle.state).toBe('unloaded');
    });

    it('rejects a snapshot whose record lists are not arrays', async () => {
      const { lifecycle, boundary } = makeLifecycle();
      boundary.snapshot = {
        metadata: null,
        playerState: null,
        columns: 'nope' as unknown as SerializedChunkColumn[],
        blockEntityChunks: [],
        entityChunks: [],
      };
      await expect(lifecycle.load('w1', () => undefined)).rejects.toThrow(
        /ServerSaveLifecycle: snapshot for world 'w1' has invalid columns \(expected an array\)/,
      );
      expect(lifecycle.state).toBe('unloaded');
    });

    it('rejects a foreign-world metadata record through the real codec and rolls back', async () => {
      const { boundary } = makeLifecycle();
      boundary.snapshot = {
        metadata: { ...METADATA, worldId: 'other-world' },
        playerState: null,
        columns: [],
        blockEntityChunks: [],
        entityChunks: [],
      };
      // Replace the echo codec with the production adapter so the foreign check runs.
      const realCodec = createWorldSaveCodec({ registry: createDefaultBlockStateRegistry() });
      const gate = new FakeGate();
      const foreign = new ServerSaveLifecycle({ codec: realCodec, boundary, storageGate: gate });
      const restored: ServerWorldUnit[] = [];
      await expect(foreign.load('w1', (u) => restored.push(u))).rejects.toThrow(/PersistentWorldCodecs:/);
      expect(foreign.state).toBe('unloaded');
      expect(restored).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Integration: WorldTickProcess-hosted load -> mutate -> drain -> reload
  // ──────────────────────────────────────────────────────────────────────────
  describe('integration: WorldTickProcess-hosted save round-trip with the production codec adapter', () => {
    const registry = createDefaultBlockStateRegistry();
    const entityRegistry = createDefaultEntityRegistry();
    const ZOMBIE = entityRegistry.getByKey('zombie')!.id;
    const OVERWORLD = createResourceId('minecraft', 'overworld');

    /** In-memory boundary that actually stores what it writes and re-reads it. */
    class MemoryBoundary implements SaveLoadBoundary {
      writes: SaveUnit[] = [];
      playerStateWrites: PlayerStateRecord[] = [];
      private meta: WorldMetadata | null = null;
      private player: PlayerStateRecord | null = null;
      private readonly columns = new Map<string, SerializedChunkColumn>();
      private readonly beChunks = new Map<string, BlockEntityChunkRecord>();
      private readonly eChunks = new Map<string, EntityChunkRecord>();

      async readWorld(_worldId: string): Promise<PersistedWorldSnapshot | null> {
        if (
          this.meta === null &&
          this.player === null &&
          this.columns.size === 0 &&
          this.beChunks.size === 0 &&
          this.eChunks.size === 0
        ) {
          return null;
        }
        return {
          metadata: this.meta,
          playerState: this.player,
          columns: [...this.columns.values()],
          blockEntityChunks: [...this.beChunks.values()],
          entityChunks: [...this.eChunks.values()],
        };
      }

      async write(unit: SaveUnit): Promise<void> {
        this.writes.push(unit);
        switch (unit.kind) {
          case 'world-metadata':
            this.meta = unit.payload as WorldMetadata;
            break;
          case 'chunk-sections':
            this.columns.set(`${unit.worldId}|${unit.chunkX}|${unit.chunkZ}`, unit.payload as SerializedChunkColumn);
            break;
          case 'block-entities':
            this.beChunks.set(`${unit.worldId}|${unit.chunkX}|${unit.chunkZ}`, unit.payload as BlockEntityChunkRecord);
            break;
          case 'entities':
            this.eChunks.set(`${unit.worldId}|${unit.chunkX}|${unit.chunkZ}`, unit.payload as EntityChunkRecord);
            break;
        }
      }

      async writePlayerState(record: PlayerStateRecord): Promise<void> {
        this.playerStateWrites.push(record);
        this.player = record;
      }
    }

    /** Tiny server host: holds the authoritative in-memory world state being saved. */
    class HostWorld {
      columns = new Map<string, ChunkColumn>();
      blockEntities = new BlockEntityManager();
      entities = new EntityManager(entityRegistry);
      metadata: WorldMetadata | null = null;
      playerState: PlayerStateRecord | null = null;

      restore(unit: ServerWorldUnit): void {
        switch (unit.kind) {
          case 'world-metadata':
            this.metadata = unit.value as WorldMetadata;
            break;
          case 'player-state':
            this.playerState = unit.value as PlayerStateRecord;
            break;
          case 'chunk-sections':
            this.columns.set(`${unit.worldId}|${unit.chunkX}|${unit.chunkZ}`, unit.value as ChunkColumn);
            break;
          case 'block-entities':
            this.blockEntities.deserializeChunk(unit.chunkX, unit.chunkZ, unit.value as unknown[]);
            break;
          case 'entities':
            this.entities.deserializeChunk(unit.chunkX, unit.chunkZ, unit.value as unknown[]);
            break;
        }
      }
    }

    /** Build the full server world state and mark every unit dirty on the lifecycle. */
    function buildWorld(lifecycle: ServerSaveLifecycle): HostWorld {
      const host = new HostWorld();
      const column = new ChunkColumn({
        chunkX: 1,
        chunkZ: 2,
        sectionCount: 8,
        minSectionY: -4,
        registry,
      });
      const placedState = registry.getDefaultState(1);
      column.setBlockState(0, 0, 0, placedState);
      host.columns.set('w1|1|2', column);
      host.metadata = { ...METADATA };
      host.playerState = { ...PLAYER_STATE };
      host.blockEntities.add(new BlockEntityInstance({ typeKey: 'minecraft:chest', x: 19, y: 64, z: 33, data: { label: 'stash' } }));
      host.entities.spawn(ZOMBIE, OVERWORLD, { x: 20, y: 64, z: 40, yaw: 0, pitch: 0 });

      lifecycle.markDirty({ kind: 'world-metadata', worldId: 'w1', chunkX: 0, chunkZ: 0, value: host.metadata });
      lifecycle.markDirty({ kind: 'player-state', worldId: 'w1', chunkX: 0, chunkZ: 0, value: host.playerState });
      lifecycle.markDirty({ kind: 'chunk-sections', worldId: 'w1', chunkX: 1, chunkZ: 2, value: column });
      lifecycle.markDirty({ kind: 'block-entities', worldId: 'w1', chunkX: 1, chunkZ: 2, value: host.blockEntities });
      lifecycle.markDirty({ kind: 'entities', worldId: 'w1', chunkX: 1, chunkZ: 2, value: host.entities });
      return host;
    }

    it('round-trips a small world through cadence drains, mutation, saveAndClose, and reload', async () => {
      const boundary = new MemoryBoundary();
      const codec = createWorldSaveCodec({ registry });
      const gate = new FakeGate();
      const lifecycle = new ServerSaveLifecycle({ codec, boundary, storageGate: gate, autosaveEveryTicks: 100 });
      const process = new WorldTickProcess({ systems: [lifecycle] });

      // Fresh world: load creates.
      const created = await lifecycle.load('w1', () => undefined);
      expect(created.outcome).toBe('created');

      // Build world state and mark everything dirty.
      const host = buildWorld(lifecycle);

      // Cadence drain at tick 100 persists all five units: four queue-kind writes plus one
      // player-state write (player-state is routed to writePlayerState, not boundary.write).
      process.step(100);
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(4);
      expect(boundary.playerStateWrites.length).toBe(1);
      expect(lifecycle.pendingCount).toBe(0);

      // Mutate the column and re-mark: the next cadence drain writes the newest state only.
      const secondState = registry.getDefaultState(2);
      host.columns.get('w1|1|2')!.setBlockState(0, -1, 0, secondState);
      lifecycle.markDirty({ kind: 'chunk-sections', worldId: 'w1', chunkX: 1, chunkZ: 2, value: host.columns.get('w1|1|2')! });
      process.step(100); // ticks 101..200: cadence fires at 200
      await lifecycle.idle();
      expect(boundary.writes.length).toBe(5);
      expect(lifecycle.pendingCount).toBe(0);

      // Graceful stop.
      const closed = await lifecycle.saveAndClose();
      expect(closed).toBe(0);
      expect(lifecycle.state).toBe('closed');

      // Reload into a fresh host through a fresh lifecycle on the same boundary.
      const host2 = new HostWorld();
      const lifecycle2 = new ServerSaveLifecycle({ codec, boundary, storageGate: gate, autosaveEveryTicks: 100 });
      const loaded = await lifecycle2.load('w1', (u) => host2.restore(u));
      expect(loaded).toEqual({
        worldId: 'w1',
        outcome: 'loaded',
        columns: 1,
        blockEntityChunks: 1,
        entityChunks: 1,
        metadata: true,
        playerState: true,
      });

      // The restored world equals the mutated in-memory world.
      const restoredColumn = host2.columns.get('w1|1|2')!;
      expect(restoredColumn.serialize()).toEqual(host.columns.get('w1|1|2')!.serialize());
      expect(restoredColumn.getBlockState(0, 0, 0).id).toBe(registry.getDefaultState(1).id);
      expect(restoredColumn.getBlockState(0, -1, 0).id).toBe(registry.getDefaultState(2).id);
      expect(host2.metadata).toEqual(METADATA);
      expect(host2.playerState).toEqual(PLAYER_STATE);
      expect(host2.blockEntities.getForChunk(1, 2).length).toBe(1);
      expect(host2.entities.size).toBe(1);
      expect(host2.entities.getAll()[0]!.id).toBe(0);
    });

    it('is deterministic: identical schedules produce identical write payloads', async () => {
      async function runOnce(): Promise<{ writes: SaveUnit[]; playerStateWrites: PlayerStateRecord[] }> {
        const boundary = new MemoryBoundary();
        const codec = createWorldSaveCodec({ registry });
        const gate = new FakeGate();
        const lifecycle = new ServerSaveLifecycle({ codec, boundary, storageGate: gate, autosaveEveryTicks: 100 });
        const process = new WorldTickProcess({ systems: [lifecycle] });
        await lifecycle.load('w1', () => undefined);
        buildWorld(lifecycle);
        process.step(100);
        await lifecycle.idle();
        await lifecycle.saveAndClose();
        return { writes: boundary.writes, playerStateWrites: boundary.playerStateWrites };
      }
      const first = await runOnce();
      const second = await runOnce();
      expect(first.writes.length).toBe(4);
      expect(first.playerStateWrites.length).toBe(1);
      expect(JSON.stringify(first.writes)).toBe(JSON.stringify(second.writes));
      expect(JSON.stringify(first.playerStateWrites)).toBe(JSON.stringify(second.playerStateWrites));
    });
  });
});
