/**
 * Repository-backed {@link SaveSink} for the dirty-save queue (038). It maps each {@link SaveUnit}
 * to the correct 034-037 repository by `kind` and writes its `payload` (plus the unit's world/coords
 * where the repository needs them). The sink is constructed with the repositories it should use; a
 * kind whose repository is absent (or an unknown kind) makes `write` reject so the queue re-queues
 * the unit rather than dropping it.
 */
import type { SaveSink, SaveUnit } from './DirtySaveQueue';
import { WorldMetadataRepository } from './WorldMetadataRepository';
import type { WorldMetadata } from './WorldMetadata';
import { ChunkSectionRepository } from './ChunkSectionRepository';
import type { SerializedChunkColumn } from '../world/ChunkColumn';
import { BlockEntityRepository } from './BlockEntityRepository';
import type { SerializedBlockEntity } from './BlockEntityRecord';
import { EntityRepository } from './EntityRepository';
import type { SerializedEntity } from './EntityRecord';
import { ChunkEditRepository } from './ChunkEditRepository';
import { PlayerStateRepository } from './PlayerStateRepository';
import type { PlayerStateRecord } from './PlayerStateRecord';

/** The repositories a {@link RepositorySaveSink} may route to. Each is optional. */
export interface RepositorySaveSinkDeps {
  metadata?: WorldMetadataRepository;
  chunkSections?: ChunkSectionRepository;
  blockEntities?: BlockEntityRepository;
  entities?: EntityRepository;
  chunkEdits?: ChunkEditRepository;
  playerStates?: PlayerStateRepository;
}

/** Routes drained {@link SaveUnit}s to the matching 034-040 repository. */
export class RepositorySaveSink implements SaveSink {
  private readonly metadata?: WorldMetadataRepository;
  private readonly chunkSections?: ChunkSectionRepository;
  private readonly blockEntities?: BlockEntityRepository;
  private readonly entities?: EntityRepository;
  private readonly chunkEdits?: ChunkEditRepository;
  private readonly playerStates?: PlayerStateRepository;

  constructor(deps: RepositorySaveSinkDeps) {
    this.metadata = deps.metadata;
    this.chunkSections = deps.chunkSections;
    this.blockEntities = deps.blockEntities;
    this.entities = deps.entities;
    this.chunkEdits = deps.chunkEdits;
    this.playerStates = deps.playerStates;
  }

  /** Persist one unit through its kind's repository. Rejects if the kind/repository is unavailable. */
  async write(unit: SaveUnit): Promise<void> {
    switch (unit.kind) {
      case 'world-metadata': {
        if (!this.metadata) throw new Error('RepositorySaveSink: no metadata repository for world-metadata unit');
        await this.metadata.putMetadata(unit.payload as WorldMetadata);
        return;
      }
      case 'chunk-sections': {
        if (!this.chunkSections) throw new Error('RepositorySaveSink: no chunk-sections repository for chunk-sections unit');
        await this.chunkSections.putColumn(unit.worldId, unit.payload as SerializedChunkColumn);
        return;
      }
      case 'block-entities': {
        if (!this.blockEntities) throw new Error('RepositorySaveSink: no block-entities repository for block-entities unit');
        await this.blockEntities.putChunkEntities(
          unit.worldId,
          unit.chunkX,
          unit.chunkZ,
          unit.payload as SerializedBlockEntity[],
        );
        return;
      }
      case 'entities': {
        if (!this.entities) throw new Error('RepositorySaveSink: no entities repository for entities unit');
        await this.entities.putChunkEntities(
          unit.worldId,
          unit.chunkX,
          unit.chunkZ,
          unit.payload as SerializedEntity[],
        );
        return;
      }
      case 'chunk-edits': {
        if (!this.chunkEdits) throw new Error('RepositorySaveSink: no chunk-edits repository for chunk-edits unit');
        await this.chunkEdits.putChunkEdits(
          unit.worldId,
          unit.chunkX,
          unit.chunkY ?? 0,
          unit.chunkZ,
          unit.payload as Array<[number, number]>,
        );
        return;
      }
      case 'player-state': {
        if (!this.playerStates) throw new Error('RepositorySaveSink: no player-state repository for player-state unit');
        await this.playerStates.putPlayerState(unit.payload as PlayerStateRecord);
        return;
      }
      default: {
        const kind = (unit as { kind: string }).kind;
        throw new Error(`RepositorySaveSink: unknown save unit kind '${kind}'`);
      }
    }
  }
}
