import { describe, it, expect } from 'vitest';
import {
  DataMigrationChain,
  DataMigrationError,
  migrateChunkColumn,
  migrateWorldMetadata,
  WORLD_METADATA_MIGRATIONS,
  CHUNK_COLUMN_MIGRATIONS,
  type DataMigration,
  type MigrationResult,
} from '../../src/storage/DataMigration';

/** A record shape whose version evolves: v1 { oldName }, v2 { newName }, v3 { newName, extra }. */
interface TestRecord {
  version: number;
  oldName?: string;
  newName?: string;
  extra?: number;
}

const getVersion = (r: TestRecord): number => r.version;

function makeV1(): TestRecord {
  return { version: 1, oldName: 'hello' };
}

function makeChain(): DataMigrationChain<TestRecord> {
  const chain = new DataMigrationChain<TestRecord>(1);
  chain.register({
    fromVersion: 1,
    toVersion: 2,
    migrate: (r) => ({ version: 2, newName: r.oldName as string }),
  } satisfies DataMigration<TestRecord>);
  chain.register({
    fromVersion: 2,
    toVersion: 3,
    migrate: (r) => ({ version: 3, newName: r.newName, extra: 42 }),
  } satisfies DataMigration<TestRecord>);
  return chain;
}

describe('DataMigrationChain', () => {
  it('applies contiguous steps in order and reports applied steps', () => {
    const chain = makeChain();
    const result: MigrationResult<TestRecord> = chain.migrate(makeV1(), getVersion);

    expect(result.appliedSteps).toEqual([2, 3]);
    expect(result.record.version).toBe(3);
    expect(result.record.newName).toBe('hello');
    expect(result.record.extra).toBe(42);
    expect(result.record.oldName).toBeUndefined();
  });

  it('is identity when the record is already current', () => {
    const chain = makeChain();
    const current = { version: 3, newName: 'x', extra: 1 };
    const result = chain.migrate(current, getVersion);

    expect(result.appliedSteps).toEqual([]);
    expect(result.record).toBe(current);
    expect(chain.needsMigration(current, getVersion)).toBe(false);
  });

  it('rejects registration gaps', () => {
    const chain = makeChain(); // 1->2, 2->3 registered
    expect(() =>
      chain.register({ fromVersion: 4, toVersion: 5, migrate: (r) => r }),
    ).toThrowError(DataMigrationError);
    try {
      chain.register({ fromVersion: 4, toVersion: 5, migrate: (r) => r });
    } catch (e) {
      expect((e as DataMigrationError).kind).toBe('GAP');
    }
  });

  it('rejects duplicate registrations', () => {
    const chain = new DataMigrationChain<TestRecord>(1);
    const step = { fromVersion: 1, toVersion: 2, migrate: (r: TestRecord) => r };
    chain.register(step);
    expect(() => chain.register(step)).toThrowError(DataMigrationError);
    try {
      chain.register(step);
    } catch (e) {
      expect((e as DataMigrationError).kind).toBe('DUPLICATE');
    }
  });

  it('rejects non-contiguous steps (toVersion !== fromVersion + 1)', () => {
    const chain = new DataMigrationChain<TestRecord>(1);
    expect(() =>
      chain.register({ fromVersion: 1, toVersion: 3, migrate: (r) => r }),
    ).toThrowError(DataMigrationError);
  });

  it('rejects a record newer than the chain (downgrade)', () => {
    const chain = makeChain(); // currentVersion 3
    const newer = { version: 5, newName: 'future' };
    try {
      chain.migrate(newer, getVersion);
      expect.unreachable('expected DOWNGRADE');
    } catch (e) {
      expect((e as DataMigrationError).kind).toBe('DOWNGRADE');
    }
  });

  it('rejects a record version below the base (unknown version)', () => {
    const chain = makeChain();
    const below = { version: 0 };
    try {
      chain.migrate(below, getVersion);
      expect.unreachable('expected UNKNOWN_VERSION');
    } catch (e) {
      expect((e as DataMigrationError).kind).toBe('UNKNOWN_VERSION');
    }
  });

  it('never mutates the input when a step throws', () => {
    const chain = new DataMigrationChain<TestRecord>(1);
    chain.register({
      fromVersion: 1,
      toVersion: 2,
      migrate: () => {
        throw new Error('boom');
      },
    });
    const input = makeV1();
    expect(() => chain.migrate(input, getVersion)).toThrow('boom');
    expect(input).toEqual(makeV1()); // untouched
  });
});

describe('typed chains for persisted families', () => {
  it('migrateWorldMetadata returns current records unchanged', () => {
    const meta = {
      schemaVersion: 1,
      worldId: 'w',
      seed: 7,
      dimensionId: 'minecraft:overworld',
      minY: -64,
      height: 384,
      createdAt: 1,
      updatedAt: 1,
    };
    expect(WORLD_METADATA_MIGRATIONS.currentVersion).toBe(1);
    expect(WORLD_METADATA_MIGRATIONS.needsMigration(meta, (r) => r.schemaVersion)).toBe(false);
    expect(migrateWorldMetadata(meta)).toBe(meta);
  });

  it('migrateChunkColumn returns current records unchanged', () => {
    const column = {
      version: 1,
      chunkX: 1,
      chunkZ: 2,
      sectionCount: 1,
      minSectionY: 0,
      sections: { 0: { version: 1, capacity: 4096, bitsPerEntry: 4, palette: [0], storage: [0] } },
    };
    expect(CHUNK_COLUMN_MIGRATIONS.currentVersion).toBe(1);
    expect(CHUNK_COLUMN_MIGRATIONS.needsMigration(column, (r) => r.version)).toBe(false);
    expect(migrateChunkColumn(column)).toBe(column);
  });
});
