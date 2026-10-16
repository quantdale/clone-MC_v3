/**
 * Shared persistent-codec seam (234).
 *
 * Converts between in-memory server world units and the shared persisted record shapes
 * (034-040): `ChunkColumn.serialize`/`deserialize` (035), `BlockEntityManager.serializeChunk`/
 * `deserializeChunk` (036), `EntityManager.serializeChunk`/`deserializeChunk` (131),
 * `WorldMetadata` (034), and `PlayerStateRecord` (040). `encode` produces a payload that passes
 * the shared validator for its kind; `decode` applies the 041 data-version migration chain for the
 * record type, then validates, then produces a restore-ready in-memory unit. Foreign (wrong
 * `worldId`/coordinates) and mis-versioned records are rejected with descriptive
 * `PersistentWorldCodecs: <detail>` errors. Pure and headless: no IndexedDB, no DOM, no transport.
 * The `WorldSaveCodec` seam is the single typed boundary the server save lifecycle
 * (`ServerSaveLifecycle`) uses to serialize and deserialize world state.
 */
import { BlockStateRegistry } from '../world/BlockStateRegistry';
import { ChunkColumn, type SerializedChunkColumn } from '../world/ChunkColumn';
import { validateSerializedChunkColumn } from '../storage/ChunkSectionRepository';
import {
  validateBlockEntityChunkRecord,
  validateSerializedBlockEntity,
} from '../storage/BlockEntityRecord';
import {
  validateEntityChunkRecord,
  validateSerializedEntity,
} from '../storage/EntityRecord';
import { validateWorldMetadata, type WorldMetadata } from '../storage/WorldMetadata';
import { validatePlayerStateRecord } from '../storage/PlayerStateRecord';
import { migrateChunkColumn, migrateWorldMetadata } from '../storage/DataMigration';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

/** The five persistent world-unit kinds the codec and lifecycle share. */
export type PersistentUnitKind =
  | 'world-metadata'
  | 'chunk-sections'
  | 'block-entities'
  | 'entities'
  | 'player-state';

/** Singleton kinds that must use `chunkX = chunkZ = 0` (034 world header, 040 player state). */
export const SINGLETON_UNIT_KINDS: ReadonlySet<PersistentUnitKind> = new Set([
  'world-metadata',
  'player-state',
]);

/** One in-memory server world unit to persist. */
export interface ServerWorldUnit {
  readonly kind: PersistentUnitKind;
  readonly worldId: string;
  /** Chunk X; 0 for world-metadata and player-state. */
  readonly chunkX: number;
  /** Chunk Z; 0 for world-metadata and player-state. */
  readonly chunkZ: number;
  /**
   * In-memory server value: `ChunkColumn` (chunk-sections), `SerializedBlockEntity[]`
   * (block-entities), `SerializedEntity[]` (entities), `WorldMetadata`, or `PlayerStateRecord`.
   */
  readonly value: unknown;
}

/** Identity of a persisted record being decoded. */
export interface WorldCodecMeta {
  readonly kind: PersistentUnitKind;
  readonly worldId: string;
  /** Chunk X; 0 for world-metadata and player-state. */
  readonly chunkX: number;
  /** Chunk Z; 0 for world-metadata and player-state. */
  readonly chunkZ: number;
}

/** Unit key shared by codec and lifecycle; matches the 038 keying convention. */
export function unitKey(unit: {
  kind: PersistentUnitKind;
  worldId: string;
  chunkX: number;
  chunkZ: number;
}): string {
  return `${unit.kind}|${unit.worldId}|${unit.chunkX}|${unit.chunkZ}`;
}

/** The single typed persistence seam: in-memory unit <-> shared persisted record. */
export interface WorldSaveCodec {
  /**
   * Serialize an in-memory unit into the shared persisted payload for `kind`.
   * The returned payload MUST pass the shared validator for `kind`.
   */
  encode(unit: ServerWorldUnit): unknown;
  /**
   * Migrate (041), then validate, then produce the in-memory unit ready for restore.
   * Throws `PersistentWorldCodecs: <detail>` on invalid/mis-versioned/foreign input.
   */
  decode(payload: unknown, meta: WorldCodecMeta): ServerWorldUnit;
}

/** Structural surface of the 035 chunk-column serializer the codec encodes from. */
export interface ChunkColumnLike {
  readonly chunkX: number;
  readonly chunkZ: number;
  serialize(): SerializedChunkColumn;
}

/** Structural surface of the 036/131 chunk-group serializers the codec encodes from. */
export interface ChunkGroupLike {
  serializeChunk(cx: number, cz: number): unknown[];
}

// ────────────────────────────────────────────────────────────────────────────
// Strict validation (shared by codec and lifecycle)
// ────────────────────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isSafeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

function isKnownKind(v: unknown): v is PersistentUnitKind {
  return (
    v === 'world-metadata' ||
    v === 'chunk-sections' ||
    v === 'block-entities' ||
    v === 'entities' ||
    v === 'player-state'
  );
}

/**
 * Strict unit validation shared by codec and lifecycle. Returns the same (narrowed) object on
 * success; throws `PersistentWorldCodecs: <detail>` on unknown kind, empty `worldId`,
 * non-safe-integer chunk coords, non-zero singleton coords, or a missing `value`.
 */
export function validatePersistentUnit(input: unknown): ServerWorldUnit {
  if (typeof input !== 'object' || input === null) {
    throw new Error('PersistentWorldCodecs: unit must be an object');
  }
  const u = input as Record<string, unknown>;
  if (!isKnownKind(u.kind)) {
    throw new Error(`PersistentWorldCodecs: unknown unit kind '${String(u.kind)}'`);
  }
  const kind = u.kind as PersistentUnitKind;
  if (!isNonEmptyString(u.worldId)) {
    throw new Error('PersistentWorldCodecs: unit worldId must be a non-empty string');
  }
  if (!isSafeInteger(u.chunkX) || !isSafeInteger(u.chunkZ)) {
    throw new Error('PersistentWorldCodecs: unit chunkX and chunkZ must be safe integers');
  }
  if (SINGLETON_UNIT_KINDS.has(kind) && (u.chunkX !== 0 || u.chunkZ !== 0)) {
    throw new Error(`PersistentWorldCodecs: unit kind '${kind}' requires chunkX and chunkZ of 0`);
  }
  if (u.value === undefined) {
    throw new Error('PersistentWorldCodecs: unit value must be present');
  }
  return input as ServerWorldUnit;
}

/**
 * Strict codec-meta validation. Throws `PersistentWorldCodecs: <detail>` on unknown kind, empty
 * `worldId`, non-safe-integer chunk coords, or non-zero singleton coords.
 */
export function validateWorldCodecMeta(input: unknown): WorldCodecMeta {
  if (typeof input !== 'object' || input === null) {
    throw new Error('PersistentWorldCodecs: meta must be an object');
  }
  const m = input as Record<string, unknown>;
  if (!isKnownKind(m.kind)) {
    throw new Error(`PersistentWorldCodecs: unknown meta kind '${String(m.kind)}'`);
  }
  const kind = m.kind as PersistentUnitKind;
  if (!isNonEmptyString(m.worldId)) {
    throw new Error('PersistentWorldCodecs: meta worldId must be a non-empty string');
  }
  if (!isSafeInteger(m.chunkX) || !isSafeInteger(m.chunkZ)) {
    throw new Error('PersistentWorldCodecs: meta chunkX and chunkZ must be safe integers');
  }
  if (SINGLETON_UNIT_KINDS.has(kind) && (m.chunkX !== 0 || m.chunkZ !== 0)) {
    throw new Error(`PersistentWorldCodecs: meta kind '${kind}' requires chunkX and chunkZ of 0`);
  }
  return input as WorldCodecMeta;
}

// ────────────────────────────────────────────────────────────────────────────
// Error wrapping
// ────────────────────────────────────────────────────────────────────────────

/** Build a `PersistentWorldCodecs: <detail>` error from a cause. */
function prefixedError(detail: string, cause: unknown): Error {
  return new Error(
    `PersistentWorldCodecs: ${detail}: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}

/** Run `fn`, converting any throw into a `PersistentWorldCodecs: <detail>` error. */
function wrapValidation<T>(detail: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw prefixedError(detail, err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Production adapter
// ────────────────────────────────────────────────────────────────────────────

/** Production adapter dependencies. */
export interface WorldSaveCodecDeps {
  /** Registry required to deserialize chunk columns (035 `ChunkColumn.deserialize`). */
  readonly registry: BlockStateRegistry;
  /** 041 chunk-column migration application; defaults to the shared identity chain. */
  readonly migrateColumn?: (record: SerializedChunkColumn) => SerializedChunkColumn;
  /** 041 world-metadata migration application; defaults to the shared identity chain. */
  readonly migrateMetadata?: (record: WorldMetadata) => WorldMetadata;
}

/**
 * The production codec adapter wiring the existing per-system serializers/deserializers
 * (035 `ChunkColumn.serialize`/`deserialize`, 036 `BlockEntityManager.serializeChunk`, 131
 * `EntityManager.serializeChunk`) and the shared records/validators (034 `WorldMetadata`,
 * 040 `PlayerStateRecord`). Records are encoded at the chain's current version; decode applies
 * the injected 041 migration (defaults: `migrateChunkColumn`/`migrateWorldMetadata`) before
 * validation. Pure: no timestamps, randomness, or runtime state.
 */
export function createWorldSaveCodec(deps: WorldSaveCodecDeps): WorldSaveCodec {
  const migrateColumn = deps.migrateColumn ?? migrateChunkColumn;
  const migrateMetadata = deps.migrateMetadata ?? migrateWorldMetadata;

  const encode = (unit: ServerWorldUnit): unknown => {
    const valid = validatePersistentUnit(unit);
    switch (valid.kind) {
      case 'world-metadata': {
        const record = wrapValidation('invalid world-metadata value', () =>
          validateWorldMetadata(valid.value),
        );
        if (record.worldId !== valid.worldId) {
          throw new Error(
            `PersistentWorldCodecs: encode world-metadata worldId '${record.worldId}' does not match unit worldId '${valid.worldId}'`,
          );
        }
        return record;
      }
      case 'player-state': {
        const record = wrapValidation('invalid player-state value', () =>
          validatePlayerStateRecord(valid.value),
        );
        if (record.worldId !== valid.worldId) {
          throw new Error(
            `PersistentWorldCodecs: encode player-state worldId '${record.worldId}' does not match unit worldId '${valid.worldId}'`,
          );
        }
        return record;
      }
      case 'chunk-sections': {
        const column = valid.value as ChunkColumnLike;
        if (
          typeof column !== 'object' ||
          column === null ||
          typeof column.serialize !== 'function'
        ) {
          throw new Error(
            'PersistentWorldCodecs: encode chunk-sections unit value must provide serialize()',
          );
        }
        const record = wrapValidation('invalid chunk-sections value', () =>
          validateSerializedChunkColumn(column.serialize()),
        );
        if (record.chunkX !== valid.chunkX || record.chunkZ !== valid.chunkZ) {
          throw new Error(
            `PersistentWorldCodecs: encode chunk-sections chunk (${record.chunkX},${record.chunkZ}) does not match unit (${valid.chunkX},${valid.chunkZ})`,
          );
        }
        return record;
      }
      case 'block-entities': {
        const group = valid.value as ChunkGroupLike;
        if (typeof group !== 'object' || group === null || typeof group.serializeChunk !== 'function') {
          throw new Error(
            'PersistentWorldCodecs: encode block-entities unit value must provide serializeChunk()',
          );
        }
        const entities = wrapValidation('invalid block-entities value', () =>
          (group.serializeChunk(valid.chunkX, valid.chunkZ) as unknown[]).map((e) =>
            validateSerializedBlockEntity(e),
          ),
        );
        const envelope = wrapValidation('invalid block-entities envelope', () =>
          validateBlockEntityChunkRecord({
            key: `${valid.worldId}|${valid.chunkX}|${valid.chunkZ}`,
            worldId: valid.worldId,
            chunkX: valid.chunkX,
            chunkZ: valid.chunkZ,
            entities,
          }),
        );
        return envelope;
      }
      case 'entities': {
        const group = valid.value as ChunkGroupLike;
        if (typeof group !== 'object' || group === null || typeof group.serializeChunk !== 'function') {
          throw new Error(
            'PersistentWorldCodecs: encode entities unit value must provide serializeChunk()',
          );
        }
        const entities = wrapValidation('invalid entities value', () =>
          (group.serializeChunk(valid.chunkX, valid.chunkZ) as unknown[]).map((e) =>
            validateSerializedEntity(e),
          ),
        );
        const envelope = wrapValidation('invalid entities envelope', () =>
          validateEntityChunkRecord({
            key: `${valid.worldId}|${valid.chunkX}|${valid.chunkZ}`,
            worldId: valid.worldId,
            chunkX: valid.chunkX,
            chunkZ: valid.chunkZ,
            entities,
          }),
        );
        return envelope;
      }
    }
  };

  const decode = (payload: unknown, meta: WorldCodecMeta): ServerWorldUnit => {
    const validMeta = validateWorldCodecMeta(meta);
    switch (validMeta.kind) {
      case 'world-metadata': {
        const migrated = wrapValidation('world-metadata migration failed', () =>
          migrateMetadata(payload as WorldMetadata),
        );
        const record = wrapValidation('invalid world-metadata payload', () =>
          validateWorldMetadata(migrated),
        );
        if (record.worldId !== validMeta.worldId) {
          throw new Error(
            `PersistentWorldCodecs: decode world-metadata worldId '${record.worldId}' does not match requested worldId '${validMeta.worldId}'`,
          );
        }
        return { kind: 'world-metadata', worldId: validMeta.worldId, chunkX: 0, chunkZ: 0, value: record };
      }
      case 'player-state': {
        const record = wrapValidation('invalid player-state payload', () =>
          validatePlayerStateRecord(payload),
        );
        if (record.worldId !== validMeta.worldId) {
          throw new Error(
            `PersistentWorldCodecs: decode player-state worldId '${record.worldId}' does not match requested worldId '${validMeta.worldId}'`,
          );
        }
        return { kind: 'player-state', worldId: validMeta.worldId, chunkX: 0, chunkZ: 0, value: record };
      }
      case 'chunk-sections': {
        const migrated = wrapValidation('chunk-sections migration failed', () =>
          migrateColumn(payload as SerializedChunkColumn),
        );
        const record = wrapValidation('invalid chunk-sections payload', () =>
          validateSerializedChunkColumn(migrated),
        );
        if (record.chunkX !== validMeta.chunkX || record.chunkZ !== validMeta.chunkZ) {
          throw new Error(
            `PersistentWorldCodecs: decode chunk-sections chunk (${record.chunkX},${record.chunkZ}) does not match requested (${validMeta.chunkX},${validMeta.chunkZ})`,
          );
        }
        const column = wrapValidation('chunk-sections deserialize failed', () =>
          ChunkColumn.deserialize(record, deps.registry),
        );
        return {
          kind: 'chunk-sections',
          worldId: validMeta.worldId,
          chunkX: validMeta.chunkX,
          chunkZ: validMeta.chunkZ,
          value: column,
        };
      }
      case 'block-entities': {
        const record = wrapValidation('invalid block-entities payload', () =>
          validateBlockEntityChunkRecord(payload),
        );
        if (
          record.worldId !== validMeta.worldId ||
          record.chunkX !== validMeta.chunkX ||
          record.chunkZ !== validMeta.chunkZ
        ) {
          throw new Error(
            `PersistentWorldCodecs: decode block-entities record (${record.worldId},${record.chunkX},${record.chunkZ}) does not match requested (${validMeta.worldId},${validMeta.chunkX},${validMeta.chunkZ})`,
          );
        }
        return {
          kind: 'block-entities',
          worldId: validMeta.worldId,
          chunkX: validMeta.chunkX,
          chunkZ: validMeta.chunkZ,
          value: record.entities,
        };
      }
      case 'entities': {
        const record = wrapValidation('invalid entities payload', () =>
          validateEntityChunkRecord(payload),
        );
        if (
          record.worldId !== validMeta.worldId ||
          record.chunkX !== validMeta.chunkX ||
          record.chunkZ !== validMeta.chunkZ
        ) {
          throw new Error(
            `PersistentWorldCodecs: decode entities record (${record.worldId},${record.chunkX},${record.chunkZ}) does not match requested (${validMeta.worldId},${validMeta.chunkX},${validMeta.chunkZ})`,
          );
        }
        return {
          kind: 'entities',
          worldId: validMeta.worldId,
          chunkX: validMeta.chunkX,
          chunkZ: validMeta.chunkZ,
          value: record.entities,
        };
      }
    }
  };

  return { encode, decode };
}
