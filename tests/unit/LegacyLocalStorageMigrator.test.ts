import { describe, it, expect } from 'vitest';
import {
  LegacyLocalStorageMigrator,
  buildSectionContainer,
  editsToSerializedChunkColumn,
  toPlayerStateRecord,
  LEGACY_EDIT_STORAGE_PREFIX,
  LEGACY_STATE_STORAGE_PREFIX,
  type StorageLike,
  type LegacyEditSnapshot,
  type LegacyPlayerSnapshot,
} from '../../src/storage/LegacyLocalStorageMigrator';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { validatePlayerStateRecord, type PlayerStateRecord } from '../../src/storage/PlayerStateRecord';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import {
  WORLD_DB_NAME,
  WORLD_DB_VERSION,
  WORLD_METADATA_STORE,
  WORLD_CHUNK_SECTION_STORE,
  WORLD_BLOCK_ENTITY_STORE,
  WORLD_ENTITY_STORE,
  WORLD_PLAYER_STATE_STORE,
  type WorldMetadata,
} from '../../src/storage/WorldMetadata';
import { PackedIntegerArray } from '../../src/data/PalettedContainer';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { MockDatabase, createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

function makeStorage(entries: Record<string, string>): StorageLike {
  const map = new Map(Object.entries(entries));
  return { getItem: (key: string) => map.get(key) ?? null };
}

function makeEditSnapshot(overrides: Partial<LegacyEditSnapshot> = {}): LegacyEditSnapshot {
  return {
    version: 1,
    seed: 7,
    edits: [
      { chunk: [1, 0, 2], changes: [[0, 1], [100, 2]] },
      { chunk: [1, 1, 2], changes: [[4095, 3]] },
    ],
    ...overrides,
  };
}

function makePlayerSnapshot(overrides: Partial<LegacyPlayerSnapshot> = {}): LegacyPlayerSnapshot {
  return {
    version: 1,
    seed: 7,
    player: { position: [1.5, 64, 2.5], yaw: 45, pitch: -30 },
    inventory: { slots: [] },
    survival: { hunger: 20 },
    ...overrides,
  };
}

function makeMeta(overrides: Partial<WorldMetadata> = {}): WorldMetadata {
  return {
    schemaVersion: 1,
    worldId: 'world-7',
    seed: 7,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('conversion primitives', () => {
  it('buildSectionContainer: palette [0, ...ids], bits >= 4, storage round-trips', () => {
    const container = buildSectionContainer([[0, 1], [100, 2], [4095, 3]]);
    expect(container.version).toBe(1);
    expect(container.capacity).toBe(4096);
    expect(container.bitsPerEntry).toBeGreaterThanOrEqual(4);
    expect(container.palette).toEqual([0, 1, 2, 3]);

    const storage = PackedIntegerArray.deserialize(container.bitsPerEntry, container.capacity, container.storage);
    expect(container.palette[storage.get(0)]).toBe(1);
    expect(container.palette[storage.get(100)]).toBe(2);
    expect(container.palette[storage.get(4095)]).toBe(3);
    expect(container.palette[storage.get(1)]).toBe(0); // untouched cell = air
  });

  it('buildSectionContainer skips invalid cells', () => {
    const container = buildSectionContainer([[4096, 1], [-1, 2], [5, -1], [6, 3] as [number, number]]);
    const storage = PackedIntegerArray.deserialize(container.bitsPerEntry, container.capacity, container.storage);
    expect(container.palette).toEqual([0, 3]); // only id 3 registered
    expect(storage.get(5)).toBe(0);
    expect(storage.get(6)).toBe(1);
  });

  it('editsToSerializedChunkColumn groups sections and round-trips through ChunkColumn.deserialize', () => {
    const col = editsToSerializedChunkColumn(
      [
        { cy: 0, changes: [[0, 1], [100, 2]] },
        { cy: 1, changes: [[4095, 3]] },
      ],
      5,
      -3,
    );
    expect(col.version).toBe(1);
    expect(col.chunkX).toBe(5);
    expect(col.chunkZ).toBe(-3);
    expect(col.minSectionY).toBe(0);
    expect(col.sectionCount).toBe(2);

    const registry = createDefaultBlockStateRegistry();
    const restored = ChunkColumn.deserialize(col, registry);
    // index 0 -> local (x=0, y=0, z=0) of section cy=0 (worldY 0..15)
    expect(restored.getBlockState(0, 0, 0).id).toBe(1);
    // index 100 -> local (x=4, y=6, z=0) -> worldY 6
    expect(restored.getBlockState(4, 6, 0).id).toBe(2);
    // index 4095 -> local (x=15, y=15, z=15) of section cy=1 -> worldY 31
    expect(restored.getBlockState(15, 31, 15).id).toBe(3);
    // untouched cells are air
    expect(restored.getBlockState(0, 16, 0).id).toBe(0);
  });

  it('toPlayerStateRecord produces a valid PlayerStateRecord', () => {
    const record = toPlayerStateRecord(makePlayerSnapshot(), 'world-7');
    expect(validatePlayerStateRecord(record)).toEqual(record);
    expect(record.worldId).toBe('world-7');
    expect(record.position).toEqual([1.5, 64, 2.5]);
  });
});

describe('PlayerStateRepository (in-memory mock)', () => {
  it('round-trips, returns null on absent, deletes and lists', async () => {
    const repo = new PlayerStateRepository({ factory: createIdbFactoryMock() });
    await repo.open();

    const rec: PlayerStateRecord = {
      key: 'w',
      worldId: 'w',
      seed: 7,
      position: [1.5, 64, 2.5],
      yaw: 45,
      pitch: -30,
      inventory: { slots: [] },
      survival: { hunger: 20 },
      experience: { version: 1, level: 0, xp: 0 },
    };
    await repo.putPlayerState(rec);
    expect((await repo.getPlayerState('w'))?.yaw).toBe(45);
    expect(await repo.getPlayerState('missing')).toBeNull();
    expect(await repo.listPlayerStates()).toHaveLength(1);
    await repo.deletePlayerState('w');
    expect(await repo.getPlayerState('w')).toBeNull();
    expect(await repo.listPlayerStates()).toHaveLength(0);
  });

  it('rejects invalid records and writes nothing', async () => {
    const repo = new PlayerStateRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    const rec: PlayerStateRecord = {
      key: 'w',
      worldId: 'w',
      seed: 7,
      position: [1.5, 64] as unknown as [number, number, number], // wrong arity
      yaw: 45,
      pitch: -30,
      inventory: {},
      survival: {},
      experience: { version: 1, level: 0, xp: 0 },
    };
    await expect(repo.putPlayerState(rec)).rejects.toThrow();
    expect(await repo.listPlayerStates()).toHaveLength(0);
  });
});

describe('LegacyLocalStorageMigrator (in-memory storage + mocks)', () => {
  it('imports edits and player state for a seed', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const chunkRepo = new ChunkSectionRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    const playerRepo = new PlayerStateRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    const storage = makeStorage({
      [`${LEGACY_EDIT_STORAGE_PREFIX}7`]: JSON.stringify(makeEditSnapshot()),
      [`${LEGACY_STATE_STORAGE_PREFIX}7`]: JSON.stringify(makePlayerSnapshot()),
    });
    const migrator = new LegacyLocalStorageMigrator({ storage, chunkSections: chunkRepo, playerStates: playerRepo });

    const report = await migrator.migrate(7);
    expect(report.importedColumns).toBe(1);
    expect(report.importedEdits).toBe(3);
    expect(report.playerStateImported).toBe(true);
    expect(report.errors).toEqual([]);

    const column = await chunkRepo.getColumn('world-7', 1, 2);
    expect(column).not.toBeNull();
    expect(column!.minSectionY).toBe(0);
    expect(column!.sectionCount).toBe(2);

    const state = await playerRepo.getPlayerState('world-7');
    expect(state).not.toBeNull();
    expect(state!.seed).toBe(7);
    expect(state!.position).toEqual([1.5, 64, 2.5]);
    expect(state!.inventory).toEqual({ slots: [] });
  });

  it('reports malformed state without partial writes; edits still import', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const chunkRepo = new ChunkSectionRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    const playerRepo = new PlayerStateRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    const storage = makeStorage({
      [`${LEGACY_EDIT_STORAGE_PREFIX}7`]: JSON.stringify(makeEditSnapshot()),
      [`${LEGACY_STATE_STORAGE_PREFIX}7`]: 'not-json{{{',
    });
    const migrator = new LegacyLocalStorageMigrator({ storage, chunkSections: chunkRepo, playerStates: playerRepo });

    const report = await migrator.migrate(7);
    expect(report.importedColumns).toBe(1);
    expect(report.playerStateImported).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('state');
    expect(await playerRepo.getPlayerState('world-7')).toBeNull();
    expect(await chunkRepo.getColumn('world-7', 1, 2)).not.toBeNull();
  });

  it('missing legacy keys produce an empty report without errors', async () => {
    const chunkRepo = new ChunkSectionRepository({ factory: createIdbFactoryMock() });
    const playerRepo = new PlayerStateRepository({ factory: createIdbFactoryMock() });
    const migrator = new LegacyLocalStorageMigrator({ storage: makeStorage({}), chunkSections: chunkRepo, playerStates: playerRepo });

    const report = await migrator.migrate(999);
    expect(report.importedColumns).toBe(0);
    expect(report.importedEdits).toBe(0);
    expect(report.playerStateImported).toBe(false);
    expect(report.errors).toEqual([]);
  });

  it('does not modify legacy storage', async () => {
    const editsRaw = JSON.stringify(makeEditSnapshot());
    const stateRaw = JSON.stringify(makePlayerSnapshot());
    const storage = makeStorage({
      [`${LEGACY_EDIT_STORAGE_PREFIX}7`]: editsRaw,
      [`${LEGACY_STATE_STORAGE_PREFIX}7`]: stateRaw,
    });
    const migrator = new LegacyLocalStorageMigrator({
      storage,
      chunkSections: new ChunkSectionRepository({ factory: createIdbFactoryMock() }),
      playerStates: new PlayerStateRepository({ factory: createIdbFactoryMock() }),
    });
    await migrator.migrate(7);
    expect(storage.getItem(`${LEGACY_EDIT_STORAGE_PREFIX}7`)).toBe(editsRaw);
    expect(storage.getItem(`${LEGACY_STATE_STORAGE_PREFIX}7`)).toBe(stateRaw);
  });
});

describe('v4→v5 migration preserves prior stores', () => {
  it('adds player-state while keeping all four prior stores and their records', async () => {
    const mock: MockIdbFactory = createIdbFactoryMock();
    const v4 = new MockDatabase(4);
    v4.createObjectStore(WORLD_METADATA_STORE, { keyPath: 'worldId' });
    v4.createObjectStore(WORLD_CHUNK_SECTION_STORE, { keyPath: 'key' });
    v4.createObjectStore(WORLD_BLOCK_ENTITY_STORE, { keyPath: 'key' });
    v4.createObjectStore(WORLD_ENTITY_STORE, { keyPath: 'key' });
    mock.databases.set(WORLD_DB_NAME, v4);

    const metaRepo = new WorldMetadataRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 4 });
    await metaRepo.open();
    await metaRepo.putMetadata(makeMeta());

    const chunkRepo = new ChunkSectionRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 4 });
    await chunkRepo.open();
    await chunkRepo.putColumn('world-7', {
      version: 1,
      chunkX: 1,
      chunkZ: 2,
      sectionCount: 1,
      minSectionY: 0,
      sections: { 0: { version: 1, capacity: 4096, bitsPerEntry: 4, palette: [0], storage: [0] } },
    });

    const beRepo = new BlockEntityRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 4 });
    await beRepo.open();
    await beRepo.putChunkEntities('world-7', 1, 2, [
      { schemaVersion: 1, typeKey: 'minecraft:chest', x: 16, y: 64, z: 32, data: {} },
    ]);

    const entRepo = new EntityRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: 4 });
    await entRepo.open();
    await entRepo.putChunkEntities('world-7', 1, 2, [
      { schemaVersion: 1, typeKey: 'minecraft:zombie', x: 16, y: 65, z: 32, data: {} },
    ]);

    // Open the player-state repository at v5: must migrate the SAME database forward.
    const playerRepo = new PlayerStateRepository({ factory: mock, dbName: WORLD_DB_NAME, dbVersion: WORLD_DB_VERSION });
    await playerRepo.open();

    const db = mock.databases.get(WORLD_DB_NAME)!;
    expect(db.version).toBe(WORLD_DB_VERSION);
    expect(db.objectStoreNames.contains(WORLD_METADATA_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_CHUNK_SECTION_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_BLOCK_ENTITY_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_ENTITY_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORLD_PLAYER_STATE_STORE)).toBe(true);

    expect(await metaRepo.getMetadata('world-7')).not.toBeNull();
    expect(await chunkRepo.getColumn('world-7', 1, 2)).not.toBeNull();
    expect(await beRepo.getChunkEntities('world-7', 1, 2)).toHaveLength(1);
    expect(await entRepo.getChunkEntities('world-7', 1, 2)).toHaveLength(1);
  });
});
