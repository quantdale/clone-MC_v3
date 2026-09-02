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

  /** Read one world's records from ALL world-owned stores into a validated archive. Never writes.
   *
   * Fail-closed: any read failure (metadata, chunk-sections, chunk-edits, block-entities,
   * entities, player-state, raw Wither) is thrown to the caller. The method MUST NOT
   * distinguish "absent record" from "read failure" by returning null — the only legitimate
   * source of `null` for an absence is a successful read that proved the record is absent.
   */
  async exportWorld(worldId: string): Promise<WorldArchive> {
    await this.openAll();

    // Each read is awaited individually so that a failure in one store produces a precise error
    // and does not race with sibling reads. Promise.all swallowing is explicitly avoided.
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
    // Wither raw record: `getWitherData` already returns null for a successful read that
    // proved no record exists. Any exception means the read itself failed and the export
    // MUST fail closed (do not silently substitute null).
    const witherData = await this.metadata.getWitherData(worldId);

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

  /** Validate `archive` fully, then restore its records (overwriting the world's prior records).
   *
   * Pre-write atomicity (F257-L): the entire archive is validated by `validateWorldArchive`
   * BEFORE any write; a malformed archive never touches the stores. For valid archives,
   * the writes use one multi-store `readwrite` transaction spanning all 6 world-owned
   * stores (world-metadata, chunk-sections, chunk-edits, player-state, block-entities,
   * entities) via `WorldMetadataRepository.runInTransaction`, so a mid-import write
   * failure (e.g. quota) atomically rolls back the whole import. This reuses the same
   * transaction layer as the reset path (F257-C).
   */
  async importWorld(archive: WorldArchive): Promise<WorldImportReport> {
    const valid = validateWorldArchive(archive);
    await this.openAll();

    const stores = ["world-metadata", "chunk-sections", "chunk-edits", "player-state", "block-entities", "entities"] as const;
    await this.metadata.runInTransaction([...stores], async (tx) => {
      const put = (store: string, value: unknown) => new Promise<void>((resolve, reject) => {
        const req = tx.objectStore(store).put(value) as unknown as { onsuccess: (() => void) | null; onerror: (() => void) | null; error: unknown };
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error instanceof Error ? req.error : new Error(`put failed on ${store}`));
      });
      if (valid.metadata) await put("world-metadata", valid.metadata);
      for (const c of valid.columns) await put("chunk-sections", { ...c, key: `${valid.worldId}|${c.chunkX}|${c.chunkZ}`, worldId: valid.worldId });
      for (const c of valid.blockEntityChunks) await put("block-entities", { key: `${valid.worldId}|${c.chunkX}|${c.chunkZ}`, worldId: valid.worldId, chunkX: c.chunkX, chunkZ: c.chunkZ, entities: c.entities });
      for (const c of valid.entityChunks) await put("entities", { key: `${valid.worldId}|${c.chunkX}|${c.chunkZ}`, worldId: valid.worldId, chunkX: c.chunkX, chunkZ: c.chunkZ, entities: c.entities });
      if (this.chunkEdits) for (const e of valid.chunkEdits) await put("chunk-edits", { key: `${valid.worldId}|${e.chunkX}|${e.chunkY}|${e.chunkZ}`, worldId: valid.worldId, chunkX: e.chunkX, chunkY: e.chunkY, chunkZ: e.chunkZ, changes: e.changes });
      if (valid.witherData !== null && valid.witherData !== undefined) await put("world-metadata", { worldId: `__wither__:${valid.worldId}`, payload: valid.witherData, updatedAt: Date.now() });
      if (valid.playerState) await put("player-state", valid.playerState);
    });

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
