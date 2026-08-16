import { describe, expect, it } from 'vitest';
import {
  createWorldSaveCodec,
  unitKey,
  validatePersistentUnit,
  validateWorldCodecMeta,
  type ChunkColumnLike,
  type ChunkGroupLike,
  type PersistentUnitKind,
  type ServerWorldUnit,
  type WorldSaveCodec,
  type WorldCodecMeta,
  type WorldSaveCodecDeps,
} from '../../src/simulation/PersistentWorldCodecs';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { validateSerializedChunkColumn } from '../../src/storage/ChunkSectionRepository';
import {
  validateBlockEntityChunkRecord,
  validateSerializedBlockEntity,
} from '../../src/storage/BlockEntityRecord';
import {
  validateEntityChunkRecord,
  validateSerializedEntity,
} from '../../src/storage/EntityRecord';
import { validateWorldMetadata, type WorldMetadata } from '../../src/storage/WorldMetadata';
import {
  validatePlayerStateRecord,
  type PlayerStateRecord,
} from '../../src/storage/PlayerStateRecord';
import type { SerializedChunkColumn } from '../../src/world/ChunkColumn';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const registry = createDefaultBlockStateRegistry();

function codec(overrides: Partial<WorldSaveCodecDeps> = {}): WorldSaveCodec {
  return createWorldSaveCodec({ registry, ...overrides });
}

function meta(kind: PersistentUnitKind, worldId = 'w1', chunkX = 0, chunkZ = 0): WorldCodecMeta {
  return { kind, worldId, chunkX, chunkZ };
}

function fakeColumn(chunkX = 1, chunkZ = 2): ChunkColumnLike {
  return {
    chunkX,
    chunkZ,
    serialize(): SerializedChunkColumn {
      return { version: 1, chunkX, chunkZ, sectionCount: 1, minSectionY: 0, sections: {} };
    },
  };
}

function fakeEntityGroup(chunkX = 1, chunkZ = 2): ChunkGroupLike {
  return {
    serializeChunk(cx: number, cz: number): unknown[] {
      if (cx !== chunkX || cz !== chunkZ) return [];
      return [
        {
          schemaVersion: 1,
          typeKey: 'minecraft:zombie',
          x: cx * 16 + 1,
          y: 64,
          z: cz * 16 + 2,
          data: { id: 7 },
        },
      ];
    },
  };
}

function fakeBlockEntityGroup(chunkX = 1, chunkZ = 2): ChunkGroupLike {
  return {
    serializeChunk(cx: number, cz: number): unknown[] {
      if (cx !== chunkX || cz !== chunkZ) return [];
      return [
        {
          schemaVersion: 1,
          typeKey: 'minecraft:chest',
          x: cx * 16 + 3,
          y: 63,
          z: cz * 16 + 4,
          data: { label: 'stash' },
        },
      ];
    },
  };
}

function worldMetadata(worldId = 'w1'): WorldMetadata {
  return {
    schemaVersion: 1,
    worldId,
    seed: 42,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

function playerState(worldId = 'w1'): PlayerStateRecord {
  return {
    key: worldId,
    worldId,
    seed: 42,
    position: [1.5, 64, 2.5],
    yaw: 90,
    pitch: -5,
    inventory: { slots: [] },
    survival: { health: 20 },
    experience: { level: 3 },
  };
}

function columnUnit(chunkX = 1, chunkZ = 2): ServerWorldUnit {
  return { kind: 'chunk-sections', worldId: 'w1', chunkX, chunkZ, value: fakeColumn(chunkX, chunkZ) };
}

function entitiesUnit(chunkX = 1, chunkZ = 2): ServerWorldUnit {
  return { kind: 'entities', worldId: 'w1', chunkX, chunkZ, value: fakeEntityGroup(chunkX, chunkZ) };
}

function blockEntitiesUnit(chunkX = 1, chunkZ = 2): ServerWorldUnit {
  return {
    kind: 'block-entities',
    worldId: 'w1',
    chunkX,
    chunkZ,
    value: fakeBlockEntityGroup(chunkX, chunkZ),
  };
}

function metadataUnit(): ServerWorldUnit {
  return { kind: 'world-metadata', worldId: 'w1', chunkX: 0, chunkZ: 0, value: worldMetadata() };
}

function playerStateUnit(): ServerWorldUnit {
  return { kind: 'player-state', worldId: 'w1', chunkX: 0, chunkZ: 0, value: playerState() };
}

function metaFrom(unit: ServerWorldUnit): WorldCodecMeta {
  return { kind: unit.kind, worldId: unit.worldId, chunkX: unit.chunkX, chunkZ: unit.chunkZ };
}

// ────────────────────────────────────────────────────────────────────────────

describe('PersistentWorldCodecs', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // REQ-1: Encode produces validator-passing shared payloads
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-1 encode produces validator-passing shared payloads', () => {
    it('encodes a chunk-sections unit to a payload passing the chunk validator with matching coords', () => {
      const c = codec();
      const payload = c.encode(columnUnit(1, 2)) as SerializedChunkColumn;
      expect(() => validateSerializedChunkColumn(payload)).not.toThrow();
      expect(validateSerializedChunkColumn(payload)).toEqual(payload);
      expect(payload.chunkX).toBe(1);
      expect(payload.chunkZ).toBe(2);
    });

    it('encodes an entities unit to an envelope passing the entity chunk validator', () => {
      const c = codec();
      const payload = c.encode(entitiesUnit(3, 4));
      const envelope = validateEntityChunkRecord(payload);
      expect(envelope.worldId).toBe('w1');
      expect(envelope.chunkX).toBe(3);
      expect(envelope.chunkZ).toBe(4);
      expect(envelope.entities.length).toBe(1);
      expect(() => validateSerializedEntity(envelope.entities[0])).not.toThrow();
    });

    it('encodes a block-entities unit to an envelope passing the block-entity chunk validator', () => {
      const c = codec();
      const payload = c.encode(blockEntitiesUnit(1, 2));
      const envelope = validateBlockEntityChunkRecord(payload);
      expect(envelope.worldId).toBe('w1');
      expect(envelope.entities.length).toBe(1);
      expect(() => validateSerializedBlockEntity(envelope.entities[0])).not.toThrow();
    });

    it('encodes a world-metadata unit to a payload passing the metadata validator', () => {
      const c = codec();
      const payload = c.encode(metadataUnit());
      expect(() => validateWorldMetadata(payload)).not.toThrow();
      expect(validateWorldMetadata(payload)).toEqual(payload);
    });

    it('encodes a player-state unit to a payload passing the player-state validator', () => {
      const c = codec();
      const payload = c.encode(playerStateUnit());
      expect(() => validatePlayerStateRecord(payload)).not.toThrow();
      expect(validatePlayerStateRecord(payload)).toEqual(payload);
    });

    it('rejects a chunk-sections unit whose value lacks serialize()', () => {
      const c = codec();
      const unit: ServerWorldUnit = { kind: 'chunk-sections', worldId: 'w1', chunkX: 1, chunkZ: 2, value: {} };
      expect(() => c.encode(unit)).toThrow(/PersistentWorldCodecs: encode chunk-sections unit value must provide serialize\(\)/);
    });

    it('rejects a column whose coordinates disagree with the unit', () => {
      const c = codec();
      expect(() => c.encode(columnUnit(1, 2))).not.toThrow();
      const mismatched: ServerWorldUnit = {
        kind: 'chunk-sections',
        worldId: 'w1',
        chunkX: 5,
        chunkZ: 6,
        value: fakeColumn(1, 2),
      };
      expect(() => c.encode(mismatched)).toThrow(/PersistentWorldCodecs: encode chunk-sections chunk \(1,2\) does not match unit \(5,6\)/);
    });

    it('rejects an entities unit whose value lacks serializeChunk()', () => {
      const c = codec();
      const unit: ServerWorldUnit = { kind: 'entities', worldId: 'w1', chunkX: 1, chunkZ: 2, value: {} };
      expect(() => c.encode(unit)).toThrow(/PersistentWorldCodecs: encode entities unit value must provide serializeChunk\(\)/);
    });

    it('wraps validator failures from a group serializer with the codec prefix', () => {
      const c = codec();
      const bad: ChunkGroupLike = {
        serializeChunk(): unknown[] {
          return [{ schemaVersion: 0, typeKey: '', x: 1, y: 2, z: 3, data: null }];
        },
      };
      const unit: ServerWorldUnit = { kind: 'block-entities', worldId: 'w1', chunkX: 1, chunkZ: 2, value: bad };
      expect(() => c.encode(unit)).toThrow(/PersistentWorldCodecs: invalid block-entities value: /);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-2: Decode migrates then validates
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-2 decode migrates then validates', () => {
    it('decodes a current-version chunk-sections payload unchanged into a restore-ready column', () => {
      const c = codec();
      const encoded = c.encode(columnUnit(1, 2));
      const decoded = c.decode(encoded, meta('chunk-sections', 'w1', 1, 2));
      expect(decoded.kind).toBe('chunk-sections');
      expect(decoded.worldId).toBe('w1');
      expect(decoded.chunkX).toBe(1);
      expect(decoded.chunkZ).toBe(2);
      // The decoded value is a deserialized ChunkColumn equivalent to the payload.
      const column = decoded.value as { serialize(): SerializedChunkColumn };
      expect(column.serialize()).toEqual(encoded);
    });

    it('applies an injected migration step before validation', () => {
      let migrationCalls = 0;
      const c = codec({
        migrateColumn: (record) => {
          migrationCalls++;
          return { ...record, minSectionY: -4, migrated: true };
        },
      });
      const encoded = c.encode(columnUnit(1, 2));
      const decoded = c.decode(encoded, meta('chunk-sections', 'w1', 1, 2));
      expect(migrationCalls).toBe(1);
      // The decoded column reflects the migrated record (minSectionY -4 survives validation).
      const column = decoded.value as { serialize(): SerializedChunkColumn };
      expect(column.serialize()).toEqual({ ...(encoded as object), minSectionY: -4 });
    });

    it('applies the injected metadata migration before validation', () => {
      let migrationCalls = 0;
      const c = codec({
        migrateMetadata: (record) => {
          migrationCalls++;
          return { ...record, updatedAt: 9999 };
        },
      });
      const decoded = c.decode(worldMetadata(), meta('world-metadata'));
      expect(migrationCalls).toBe(1);
      expect((decoded.value as WorldMetadata).updatedAt).toBe(9999);
    });

    it('rejects a record newer than the chain (DOWNGRADE) with the codec prefix', () => {
      const c = codec();
      const payload = { version: 2, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: {} };
      expect(() => c.decode(payload, meta('chunk-sections', 'w1', 1, 2))).toThrow(
        /PersistentWorldCodecs: chunk-sections migration failed: DataMigrationChain: cannot downgrade record version 2/,
      );
    });

    it('rejects a record below the chain base version (UNKNOWN_VERSION) with the codec prefix', () => {
      const c = codec();
      const payload = { version: 0, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: {} };
      expect(() => c.decode(payload, meta('chunk-sections', 'w1', 1, 2))).toThrow(
        /PersistentWorldCodecs: chunk-sections migration failed: DataMigrationChain: version 0 is below base version 1/,
      );
    });

    it('rejects a throwing migration with the codec prefix and returns no unit', () => {
      const c = codec({
        migrateMetadata: () => {
          throw new Error('boom');
        },
      });
      expect(() => c.decode(worldMetadata(), meta('world-metadata'))).toThrow(
        /PersistentWorldCodecs: world-metadata migration failed: boom/,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-3: Round-trip fidelity
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-3 round-trip fidelity', () => {
    it('round-trips a block-entities unit with an equivalent value', () => {
      const c = codec();
      const unit = blockEntitiesUnit(1, 2);
      const payload = c.encode(unit) as { entities: unknown[] };
      const decoded = c.decode(payload, metaFrom(unit));
      expect(decoded.kind).toBe('block-entities');
      expect(decoded.worldId).toBe('w1');
      expect(decoded.chunkX).toBe(1);
      expect(decoded.chunkZ).toBe(2);
      // The restore-ready value is the validated entity group (the envelope's content).
      expect(decoded.value).toEqual(payload.entities);
    });

    it('round-trips an entities unit with an equivalent value', () => {
      const c = codec();
      const unit = entitiesUnit(3, 4);
      const payload = c.encode(unit) as { entities: unknown[] };
      const decoded = c.decode(payload, metaFrom(unit));
      expect(decoded.kind).toBe('entities');
      expect(decoded.worldId).toBe('w1');
      expect(decoded.chunkX).toBe(3);
      expect(decoded.chunkZ).toBe(4);
      expect(decoded.value).toEqual(payload.entities);
    });

    it('round-trips a world-metadata unit with an equivalent value', () => {
      const c = codec();
      const unit = metadataUnit();
      const decoded = c.decode(c.encode(unit), metaFrom(unit));
      expect(decoded.value).toEqual(unit.value);
    });

    it('round-trips a player-state unit with an equivalent value', () => {
      const c = codec();
      const unit = playerStateUnit();
      const decoded = c.decode(c.encode(unit), metaFrom(unit));
      expect(decoded.value).toEqual(unit.value);
    });

    it('round-trips a chunk-sections unit to an equivalent column', () => {
      const c = codec();
      const unit = columnUnit(1, 2);
      const payload = c.encode(unit);
      const decoded = c.decode(payload, metaFrom(unit));
      expect(decoded.worldId).toBe('w1');
      const column = decoded.value as { serialize(): SerializedChunkColumn };
      expect(column.serialize()).toEqual(payload);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-4: Foreign and ambiguous data rejected
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-4 foreign and ambiguous data rejected', () => {
    it('rejects a world-metadata payload whose worldId differs from the requested meta', () => {
      const c = codec();
      expect(() => c.decode(worldMetadata('w1'), meta('world-metadata', 'w2'))).toThrow(
        /PersistentWorldCodecs: decode world-metadata worldId 'w1' does not match requested worldId 'w2'/,
      );
    });

    it('rejects a player-state payload whose worldId differs from the requested meta', () => {
      const c = codec();
      expect(() => c.decode(playerState('w1'), meta('player-state', 'w2'))).toThrow(
        /PersistentWorldCodecs: decode player-state worldId 'w1' does not match requested worldId 'w2'/,
      );
    });

    it('rejects a block-entities envelope whose worldId differs from the requested meta', () => {
      const c = codec();
      const envelope = {
        key: 'w1|1|2',
        worldId: 'w1',
        chunkX: 1,
        chunkZ: 2,
        entities: [],
      };
      expect(() => c.decode(envelope, meta('block-entities', 'w2', 1, 2))).toThrow(
        /PersistentWorldCodecs: decode block-entities record \(w1,1,2\) does not match requested \(w2,1,2\)/,
      );
    });

    it('rejects an entities envelope whose coordinates differ from the requested meta', () => {
      const c = codec();
      const envelope = {
        key: 'w1|1|2',
        worldId: 'w1',
        chunkX: 1,
        chunkZ: 2,
        entities: [],
      };
      expect(() => c.decode(envelope, meta('entities', 'w1', 7, 8))).toThrow(
        /PersistentWorldCodecs: decode entities record \(w1,1,2\) does not match requested \(w1,7,8\)/,
      );
    });

    it('rejects a chunk-sections payload whose coordinates differ from the requested meta', () => {
      const c = codec();
      const payload = { version: 1, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: {} };
      expect(() => c.decode(payload, meta('chunk-sections', 'w1', 5, 6))).toThrow(
        /PersistentWorldCodecs: decode chunk-sections chunk \(1,2\) does not match requested \(5,6\)/,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-5: Codec determinism
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-5 codec determinism', () => {
    it('produces deep-equal payloads across repeated encodes of the same unit', () => {
      const c = codec();
      const units = [columnUnit(1, 2), entitiesUnit(3, 4), metadataUnit(), playerStateUnit(), blockEntitiesUnit(5, 6)];
      for (const unit of units) {
        const first = c.encode(unit);
        const second = c.encode(unit);
        expect(second).toEqual(first);
      }
    });

    it('does not inject timestamps or randomness into encoded payloads', () => {
      const c = codec();
      const unit = playerStateUnit();
      const payload = c.encode(unit) as PlayerStateRecord;
      expect(payload).toEqual(playerState());
      const metaPayload = c.encode(metadataUnit()) as WorldMetadata;
      expect(metaPayload).toEqual(worldMetadata());
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REQ-6: Invalid input and unknown kind rejected
  // ──────────────────────────────────────────────────────────────────────────
  describe('REQ-6 invalid input and unknown kind rejected', () => {
    it('rejects an unknown kind on encode', () => {
      const c = codec();
      const unit = { kind: 'unknown-kind', worldId: 'w1', chunkX: 0, chunkZ: 0, value: {} };
      expect(() => c.encode(unit as unknown as ServerWorldUnit)).toThrow(
        /PersistentWorldCodecs: unknown unit kind 'unknown-kind'/,
      );
    });

    it('rejects an unknown kind on decode meta', () => {
      const c = codec();
      expect(() =>
        c.decode({}, { kind: 'unknown-kind', worldId: 'w1', chunkX: 0, chunkZ: 0 } as unknown as WorldCodecMeta),
      ).toThrow(
        /PersistentWorldCodecs: unknown meta kind 'unknown-kind'/,
      );
    });

    it('rejects a malformed chunk-sections payload (missing sections) without a partial unit', () => {
      const c = codec();
      expect(() =>
        c.decode({ version: 1, chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0 }, meta('chunk-sections', 'w1', 1, 2)),
      ).toThrow(
        /PersistentWorldCodecs: invalid chunk-sections payload: SerializedChunkColumn: sections must be a non-null object/,
      );
    });

    it('rejects a malformed entities payload (entities not an array)', () => {
      const c = codec();
      expect(() =>
        c.decode({ worldId: 'w1', chunkX: 1, chunkZ: 2, entities: 'nope' }, meta('entities', 'w1', 1, 2)),
      ).toThrow(/PersistentWorldCodecs: invalid entities payload: EntityChunkRecord: entities must be an array/);
    });

    it('rejects a malformed player-state payload (missing inventory)', () => {
      const c = codec();
      const bad = { ...playerState(), inventory: undefined };
      expect(() => c.decode(bad, meta('player-state', 'w1'))).toThrow(
        /PersistentWorldCodecs: invalid player-state payload: PlayerStateRecord: inventory must be present/,
      );
    });

    it('validatePersistentUnit rejects missing value, empty worldId, and non-integer coords', () => {
      expect(() => validatePersistentUnit({ kind: 'entities', worldId: 'w1', chunkX: 1, chunkZ: 2 })).toThrow(
        /PersistentWorldCodecs: unit value must be present/,
      );
      expect(() =>
        validatePersistentUnit({ kind: 'entities', worldId: '', chunkX: 1, chunkZ: 2, value: [] }),
      ).toThrow(/PersistentWorldCodecs: unit worldId must be a non-empty string/);
      expect(() =>
        validatePersistentUnit({ kind: 'entities', worldId: 'w1', chunkX: 1.5, chunkZ: 2, value: [] }),
      ).toThrow(/PersistentWorldCodecs: unit chunkX and chunkZ must be safe integers/);
      expect(() => validatePersistentUnit(null)).toThrow(/PersistentWorldCodecs: unit must be an object/);
    });

    it('rejects non-zero singleton coordinates for world-metadata and player-state', () => {
      expect(() =>
        validatePersistentUnit({ kind: 'world-metadata', worldId: 'w1', chunkX: 1, chunkZ: 0, value: {} }),
      ).toThrow(/PersistentWorldCodecs: unit kind 'world-metadata' requires chunkX and chunkZ of 0/);
      expect(() =>
        validatePersistentUnit({ kind: 'player-state', worldId: 'w1', chunkX: 0, chunkZ: -1, value: {} }),
      ).toThrow(/PersistentWorldCodecs: unit kind 'player-state' requires chunkX and chunkZ of 0/);
      expect(() => validateWorldCodecMeta(meta('player-state', 'w1', 1, 0))).toThrow(
        /PersistentWorldCodecs: meta kind 'player-state' requires chunkX and chunkZ of 0/,
      );
    });

    it('unitKey matches the 038 keying convention', () => {
      expect(unitKey({ kind: 'chunk-sections', worldId: 'w1', chunkX: 1, chunkZ: 2 })).toBe(
        'chunk-sections|w1|1|2',
      );
      expect(unitKey({ kind: 'player-state', worldId: 'w1', chunkX: 0, chunkZ: 0 })).toBe(
        'player-state|w1|0|0',
      );
    });
  });
});
