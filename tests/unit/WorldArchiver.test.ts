import { describe, it, expect } from 'vitest';
import { WorldArchiver, type WorldArchiverDeps, type WorldImportReport } from '../../src/storage/WorldArchiver';
import { validateWorldArchive, type WorldArchive } from '../../src/storage/WorldArchive';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { createIdbFactoryMock, type MockIdbFactory } from './IdbFactoryMock';

const WORLD = 'world-7';

function makeDeps(factory?: MockIdbFactory): WorldArchiverDeps {
  const mock = factory ?? createIdbFactoryMock();
  return {
    metadata: new WorldMetadataRepository({ factory: mock }),
    chunkSections: new ChunkSectionRepository({ factory: mock }),
    blockEntities: new BlockEntityRepository({ factory: mock }),
    entities: new EntityRepository({ factory: mock }),
    playerStates: new PlayerStateRepository({ factory: mock }),
  };
}

function makeColumn(chunkX: number, chunkZ: number) {
  return {
    version: 1,
    chunkX,
    chunkZ,
    sectionCount: 1,
    minSectionY: 0,
    sections: { 0: { version: 1, capacity: 4096, bitsPerEntry: 4, palette: [0, chunkX + 1], storage: [0] } },
  };
}

async function populateWorld(deps: WorldArchiverDeps, worldId: string): Promise<void> {
  await deps.metadata.open();
  await deps.chunkSections.open();
  await deps.blockEntities.open();
  await deps.entities.open();
  await deps.playerStates.open();

  await deps.metadata.putMetadata({
    schemaVersion: 1,
    worldId,
    seed: 7,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1,
    updatedAt: 1,
  });
  await deps.chunkSections.putColumn(worldId, makeColumn(1, 2));
  await deps.chunkSections.putColumn(worldId, makeColumn(3, 4));
  await deps.blockEntities.putChunkEntities(worldId, 1, 2, [
    { schemaVersion: 1, typeKey: 'minecraft:chest', x: 16, y: 64, z: 32, data: { items: [] } },
  ]);
  await deps.entities.putChunkEntities(worldId, 1, 2, [
    { schemaVersion: 1, typeKey: 'minecraft:zombie', x: 16, y: 65, z: 32, data: { health: 20 } },
  ]);
  await deps.playerStates.putPlayerState({
    key: worldId,
    worldId,
    seed: 7,
    position: [1.5, 64, 2.5],
    yaw: 45,
    pitch: -30,
    inventory: { slots: [] },
    survival: { hunger: 20 },
    experience: { version: 1, level: 0, xp: 0 },
  });
}

function stripExportedAt(archive: WorldArchive): WorldArchive {
  return {
    ...archive,
    exportedAt: 0,
    // putMetadata stamps updatedAt = Date.now() on import, so normalize it too.
    metadata: archive.metadata ? { ...archive.metadata, updatedAt: 0 } : null,
  };
}

describe('WorldArchiver', () => {
  it('exportWorld contains every record of the world', async () => {
    const deps = makeDeps();
    await populateWorld(deps, WORLD);
    const archiver = new WorldArchiver(deps);

    const archive = await archiver.exportWorld(WORLD);
    expect(archive.format).toBe('voxel-world');
    expect(archive.version).toBe(1);
    expect(archive.worldId).toBe(WORLD);
    expect(Number.isFinite(archive.exportedAt)).toBe(true);
    expect(archive.metadata?.seed).toBe(7);
    expect(archive.columns).toHaveLength(2);
    expect(archive.blockEntityChunks).toHaveLength(1);
    expect(archive.entityChunks).toHaveLength(1);
    expect(archive.playerState?.position).toEqual([1.5, 64, 2.5]);
    expect(validateWorldArchive(archive)).toEqual(archive);
  });

  it('importWorld restores every record and reports counts', async () => {
    const source = makeDeps();
    await populateWorld(source, WORLD);
    const exported = await new WorldArchiver(source).exportWorld(WORLD);

    const target = makeDeps();
    const report: WorldImportReport = await new WorldArchiver(target).importWorld(exported);

    expect(report).toEqual({
      worldId: WORLD,
      columns: 2,
      blockEntityChunks: 1,
      entityChunks: 1,
      metadataImported: true,
      playerStateImported: true,
    });
    expect(await target.metadata.getMetadata(WORLD)).not.toBeNull();
    expect(await target.chunkSections.listColumns(WORLD)).toHaveLength(2);
    expect(await target.blockEntities.listChunks(WORLD)).toHaveLength(1);
    expect(await target.entities.listChunks(WORLD)).toHaveLength(1);
    expect(await target.playerStates.getPlayerState(WORLD)).not.toBeNull();
  });

  it('export → import → export is stable apart from exportedAt', async () => {
    const source = makeDeps();
    await populateWorld(source, WORLD);
    const first = await new WorldArchiver(source).exportWorld(WORLD);

    const target = makeDeps();
    await new WorldArchiver(target).importWorld(first);
    const second = await new WorldArchiver(target).exportWorld(WORLD);

    expect(stripExportedAt(second)).toEqual(stripExportedAt(first));
  });

  it('rejects malformed archives atomically (nothing written)', async () => {
    const source = makeDeps();
    await populateWorld(source, WORLD);
    const exported = await new WorldArchiver(source).exportWorld(WORLD);

    const target = makeDeps();
    const archiver = new WorldArchiver(target);
    // Open the target repositories so the post-rejection emptiness assertions can query them.
    await target.metadata.open();
    await target.chunkSections.open();
    await target.blockEntities.open();
    await target.entities.open();
    await target.playerStates.open();

    // Bad format
    await expect(archiver.importWorld({ ...exported, format: 'nope' } as unknown as WorldArchive)).rejects.toThrow();
    // Bad column record
    await expect(
      archiver.importWorld({ ...exported, columns: [{ ...exported.columns[0]!, version: 'x' }] } as unknown as WorldArchive),
    ).rejects.toThrow();
    // Bad playerState
    await expect(
      archiver.importWorld({ ...exported, playerState: { ...exported.playerState!, position: [1, 2] } } as unknown as WorldArchive),
    ).rejects.toThrow();

    expect(await target.metadata.listMetadata()).toHaveLength(0);
    expect(await target.chunkSections.listColumns(WORLD)).toHaveLength(0);
    expect(await target.blockEntities.listChunks(WORLD)).toHaveLength(0);
    expect(await target.entities.listChunks(WORLD)).toHaveLength(0);
    expect(await target.playerStates.listPlayerStates()).toHaveLength(0);
  });

  it('normalizes playerState.worldId to the archive worldId', async () => {
    const source = makeDeps();
    await populateWorld(source, WORLD);
    const exported = await new WorldArchiver(source).exportWorld(WORLD);
    const tampered: WorldArchive = {
      ...exported,
      playerState: { ...exported.playerState!, key: 'other', worldId: 'other' },
    };

    const target = makeDeps();
    await new WorldArchiver(target).importWorld(tampered);

    expect(await target.playerStates.getPlayerState(WORLD)).not.toBeNull();
    expect(await target.playerStates.getPlayerState('other')).toBeNull();
  });
});
