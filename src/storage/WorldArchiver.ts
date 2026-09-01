/**
 * World archive export/import (042, revised 257). `WorldArchiver` reads one world's records from ALL
 * world-owned repositories (including chunk-edits and Wither data) into a validated
 * {@link WorldArchive}, and restores a validated archive back into the stores. Export is
 * read-only; import validates the entire archive before the first write and normalizes
 * `playerState.worldId` to the archive's `worldId`.
 */
import { validateWorldArchive, type WorldArchive } from './WorldArchive';
import { WorldMetadataRepository } from './WorldMetadataRepository';
import { ChunkSectionRepository } from './ChunkSectionRepository';
import { BlockEntityRepository } from './BlockEntityRepository';
import { EntityRepository } from './EntityRepository';
import { PlayerStateRepository } from './PlayerStateRepository';
import { ChunkEditRepository } from './ChunkEditRepository';

/** The repositories the archiver reads/writes (now seven including chunk-edits and metadata raw Wither). */
export interface WorldArchiverDeps {
  metadata: WorldMetadataRepository;
  chunkSections: ChunkSectionRepository;
  blockEntities: BlockEntityRepository;
  entities: EntityRepository;
  playerStates: PlayerStateRepository;
  chunkEdits?: ChunkEditRepository;
  // Wither data lives in the metadata store's raw namespace; accessed via metadata.getWitherData/putWitherData
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
  /** Chunk-edit groups restored. */
  chunkEdits: number;
  /** Whether metadata was written. */
  metadataImported: boolean;
  /** Whether player state was written. */
  playerStateImported: boolean;
  /** Whether wither data was written. */
  witherDataImported: boolean;
}

/** Exports and imports whole-world archives over the five repositories. */
export class WorldArchiver {
  private readonly metadata: WorldMetadataRepository;
  private readonly chunkSections: ChunkSectionRepository;
  private readonly blockEntities: BlockEntityRepository;
  private readonly entities: EntityRepository;
  private readonly playerStates: PlayerStateRepository;
  private readonly chunkEdits: ChunkEditRepository | null;

  constructor(deps: WorldArchiverDeps) {
    this.metadata = deps.metadata;
    this.chunkSections = deps.chunkSections;
    this.blockEntities = deps.blockEntities;
    this.entities = deps.entities;
    this.playerStates = deps.playerStates;
    this.chunkEdits = deps.chunkEdits ?? null;
  }

  private async openAll(): Promise<void> {
    await this.metadata.open();
    await this.chunkSections.open();
    await this.blockEntities.open();
    await this.entities.open();
    await this.playerStates.open();
    if (this.chunkEdits) await this.chunkEdits.open();
  }

  /** Read one world's records from ALL world-owned stores into a validated archive. Never writes. */
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
    let chunkEdits: { chunkX: number; chunkY: number; chunkZ: number; changes: Array<[number, number]> }[] = [];
    if (this.chunkEdits) {
      const records = await this.chunkEdits.listChunkEdits(worldId);
      chunkEdits = records.map((r) => ({ chunkX: r.chunkX, chunkY: r.chunkY, chunkZ: r.chunkZ, changes: r.changes }));
    }
    let witherData: unknown[] | null = null;
    try {
      const raw = await this.metadata.getWitherData(worldId);
      witherData = raw;
    } catch {
      witherData = null;
    }

    return {
      format: 'voxel-world',
      version: 2,
      exportedAt: Date.now(),
      worldId,
      metadata,
      playerState,
      columns,
      blockEntityChunks,
      entityChunks,
      chunkEdits,
      witherData,
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
    if (this.chunkEdits) {
      for (const edit of valid.chunkEdits) {
        await this.chunkEdits.putChunkEdits(valid.worldId, edit.chunkX, edit.chunkY, edit.chunkZ, edit.changes);
      }
    }
    if (valid.witherData !== null && valid.witherData !== undefined) {
      await this.metadata.putWitherData(valid.worldId, valid.witherData);
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
      chunkEdits: valid.chunkEdits.length,
      metadataImported: valid.metadata !== null,
      playerStateImported: valid.playerState !== null,
      witherDataImported: valid.witherData !== null,
    };
  }
}
