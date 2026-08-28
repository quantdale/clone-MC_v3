/**
 * World archive export/import (042). `WorldArchiver` reads one world's records from all five
 * repositories (034-040) into a validated {@link WorldArchive}, and restores a validated archive back
 * into the stores. Export is read-only; import validates the entire archive before the first write and
 * normalizes `playerState.worldId` to the archive's `worldId`.
 */
import { validateWorldArchive, type WorldArchive } from './WorldArchive';
import { WorldMetadataRepository } from './WorldMetadataRepository';
import { ChunkSectionRepository } from './ChunkSectionRepository';
import { BlockEntityRepository } from './BlockEntityRepository';
import { EntityRepository } from './EntityRepository';
import { PlayerStateRepository } from './PlayerStateRepository';

/** The five repositories the archiver reads/writes. */
export interface WorldArchiverDeps {
  metadata: WorldMetadataRepository;
  chunkSections: ChunkSectionRepository;
  blockEntities: BlockEntityRepository;
  entities: EntityRepository;
  playerStates: PlayerStateRepository;
}

/** Audit trail for one import. */
export interface WorldImportReport {
  worldId: string;
  /** Chunk columns restored. */
  columns: number;
  /** Block-entity chunk groups restored. */
  blockEntityChunks: number;
  /** Entity chunk groups restored. */
  entityChunks: number;
  /** Whether metadata was written. */
  metadataImported: boolean;
  /** Whether player state was written. */
  playerStateImported: boolean;
}

/** Exports and imports whole-world archives over the five repositories. */
export class WorldArchiver {
  private readonly metadata: WorldMetadataRepository;
  private readonly chunkSections: ChunkSectionRepository;
  private readonly blockEntities: BlockEntityRepository;
  private readonly entities: EntityRepository;
  private readonly playerStates: PlayerStateRepository;

  constructor(deps: WorldArchiverDeps) {
    this.metadata = deps.metadata;
    this.chunkSections = deps.chunkSections;
    this.blockEntities = deps.blockEntities;
    this.entities = deps.entities;
    this.playerStates = deps.playerStates;
  }

  private async openAll(): Promise<void> {
    await this.metadata.open();
    await this.chunkSections.open();
    await this.blockEntities.open();
    await this.entities.open();
    await this.playerStates.open();
  }

  /** Read one world's records from all five stores into a validated archive. Never writes. */
  async exportWorld(worldId: string): Promise<WorldArchive> {
    await this.openAll();

    const metadata = await this.metadata.getMetadata(worldId);
    const playerState = await this.playerStates.getPlayerState(worldId);
    const columns = await this.chunkSections.listColumns(worldId);
    const blockEntityChunks = (await this.blockEntities.listChunks(worldId)).map(({ chunkX, chunkZ, entities }) => ({
      chunkX,
      chunkZ,
      entities,
    }));
    const entityChunks = (await this.entities.listChunks(worldId)).map(({ chunkX, chunkZ, entities }) => ({
      chunkX,
      chunkZ,
      entities,
    }));

    return {
      format: 'voxel-world',
      version: 1,
      exportedAt: Date.now(),
      worldId,
      metadata,
      playerState,
      columns,
      blockEntityChunks,
      entityChunks,
    };
  }

  /** Validate `archive` fully, then restore its records (overwriting the world's prior records). */
  async importWorld(archive: WorldArchive): Promise<WorldImportReport> {
    const valid = validateWorldArchive(archive);
    await this.openAll();

    if (valid.metadata) {
      await this.metadata.putMetadata(valid.metadata);
    }
    for (const column of valid.columns) {
      await this.chunkSections.putColumn(valid.worldId, column);
    }
    for (const chunk of valid.blockEntityChunks) {
      await this.blockEntities.putChunkEntities(valid.worldId, chunk.chunkX, chunk.chunkZ, chunk.entities);
    }
    for (const chunk of valid.entityChunks) {
      await this.entities.putChunkEntities(valid.worldId, chunk.chunkX, chunk.chunkZ, chunk.entities);
    }
    if (valid.playerState) {
      // Normalize to the archive's worldId so a mismatched record cannot leak into another key.
      await this.playerStates.putPlayerState({
        ...valid.playerState,
        key: valid.worldId,
        worldId: valid.worldId,
      });
    }

    return {
      worldId: valid.worldId,
      columns: valid.columns.length,
      blockEntityChunks: valid.blockEntityChunks.length,
      entityChunks: valid.entityChunks.length,
      metadataImported: valid.metadata !== null,
      playerStateImported: valid.playerState !== null,
    };
  }
}
