/**
 * Shared in-memory `SaveRecoveryFixture` factory for the 240 save-recovery matrix. Each call to
 * `makeSaveRecoveryFixture()` builds a fresh set of five repositories over a fresh
 * `IdbFactoryMock`, and returns the fixture surface the harness needs: `reopen()` (fresh repos over
 * the SAME underlying database), `upgradeFromSchema()` (seed an older-schema database and reopen at
 * the current schema), and `putRawMetadata()` (write an unvalidated metadata record directly into
 * the store for corrupt-record scenarios). Also exports a `makeCoordinator` helper matching the
 * matrix's `limitPerTick = 2` contract.
 */
import { WORLD_DB_NAME, WORLD_METADATA_STORE, WORLD_CHUNK_SECTION_STORE, WORLD_BLOCK_ENTITY_STORE, WORLD_ENTITY_STORE, WORLD_PLAYER_STATE_STORE, WORLD_CHUNK_EDIT_STORE } from '../../src/storage/WorldMetadata';
import type { WorldArchiverDeps } from '../../src/storage/WorldArchiver';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import type { SaveRecoveryFixture } from '../../src/storage/SaveRecoveryMatrix';
import type { DirtySaveQueue, SaveSink } from '../../src/storage/DirtySaveQueue';
import { AutosaveCoordinator } from '../../src/storage/AutosaveCoordinator';
import { createIdbFactoryMock, MockDatabase, type MockIdbFactory } from './IdbFactoryMock';

/** Build five repositories over a shared mock factory. */
function buildDeps(factory: MockIdbFactory): WorldArchiverDeps {
  return {
    metadata: new WorldMetadataRepository({ factory }),
    chunkSections: new ChunkSectionRepository({ factory }),
    blockEntities: new BlockEntityRepository({ factory }),
    entities: new EntityRepository({ factory }),
    playerStates: new PlayerStateRepository({ factory }),
  };
}

async function openAll(deps: WorldArchiverDeps): Promise<void> {
  await deps.metadata.open();
  await deps.chunkSections.open();
  await deps.blockEntities.open();
  await deps.entities.open();
  await deps.playerStates.open();
}

/** Object stores present at each older schema version (the 034-040 store ladder). */
const STORE_LADDER: Record<number, Array<[string, string]>> = {
  1: [[WORLD_METADATA_STORE, 'worldId']],
  2: [
    [WORLD_METADATA_STORE, 'worldId'],
    [WORLD_CHUNK_SECTION_STORE, 'key'],
  ],
  3: [
    [WORLD_METADATA_STORE, 'worldId'],
    [WORLD_CHUNK_SECTION_STORE, 'key'],
    [WORLD_BLOCK_ENTITY_STORE, 'key'],
  ],
  4: [
    [WORLD_METADATA_STORE, 'worldId'],
    [WORLD_CHUNK_SECTION_STORE, 'key'],
    [WORLD_BLOCK_ENTITY_STORE, 'key'],
    [WORLD_ENTITY_STORE, 'key'],
  ],
  5: [
    [WORLD_METADATA_STORE, 'worldId'],
    [WORLD_CHUNK_SECTION_STORE, 'key'],
    [WORLD_BLOCK_ENTITY_STORE, 'key'],
    [WORLD_ENTITY_STORE, 'key'],
    [WORLD_PLAYER_STATE_STORE, 'key'],
  ],
  6: [
    [WORLD_METADATA_STORE, 'worldId'],
    [WORLD_CHUNK_SECTION_STORE, 'key'],
    [WORLD_BLOCK_ENTITY_STORE, 'key'],
    [WORLD_ENTITY_STORE, 'key'],
    [WORLD_PLAYER_STATE_STORE, 'key'],
    [WORLD_CHUNK_EDIT_STORE, 'key'],
  ],
};

/** Create a fixture over a shared factory. */
function createFixture(factory: MockIdbFactory): SaveRecoveryFixture {
  const deps = buildDeps(factory);
  return {
    deps,
    async openAll(): Promise<void> {
      await openAll(deps);
    },
    reopen(): SaveRecoveryFixture {
      return createFixture(factory);
    },
    async upgradeFromSchema(olderVersion: number, worldId: string): Promise<SaveRecoveryFixture> {
      seedSchema(factory, olderVersion, worldId);
      const migrated = createFixture(factory);
      await migrated.openAll(); // opening at the current schema migrates the older database forward
      return migrated;
    },
    async putRawMetadata(record: unknown): Promise<void> {
      await deps.metadata.open(); // ensure the database and metadata store exist
      const db = factory.databases.get(WORLD_DB_NAME);
      if (!db) throw new Error('saveRecoveryFixture: world database missing after open');
      const store = db.transaction(WORLD_METADATA_STORE, 'readwrite').objectStore(WORLD_METADATA_STORE);
      store.put(record);
    },
  };
}

/** Seed the mock factory with a database at `version` holding the store ladder and one metadata record. */
function seedSchema(factory: MockIdbFactory, version: number, worldId: string): void {
  const db = new MockDatabase(version);
  for (const [storeName, keyPath] of STORE_LADDER[version] ?? []) {
    db.createObjectStore(storeName, { keyPath });
  }
  factory.databases.set(WORLD_DB_NAME, db);
  const metadataStore = db.transaction(WORLD_METADATA_STORE, 'readwrite').objectStore(WORLD_METADATA_STORE);
  metadataStore.put({
    schemaVersion: 1,
    worldId,
    seed: 0,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1,
    updatedAt: 1,
  });
}

/** Build a fresh in-memory save-recovery fixture. */
export function makeSaveRecoveryFixture(): SaveRecoveryFixture {
  return createFixture(createIdbFactoryMock());
}

/** Build a coordinator matching the matrix's `limitPerTick = 2` contract. */
export function makeCoordinator(queue: DirtySaveQueue, sink: SaveSink): AutosaveCoordinator {
  return new AutosaveCoordinator({ queue, sink, limitPerTick: 2, intervalMs: 1000, flushTarget: null });
}
