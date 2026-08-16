import { describe, expect, it } from 'vitest';
import { SaveRecoveryMatrix } from '../../src/storage/SaveRecoveryMatrix';
import { DataMigrationChain, DataMigrationError } from '../../src/storage/DataMigration';
import { validateWorldArchive } from '../../src/storage/WorldArchive';
import { makeSaveRecoveryFixture, makeCoordinator } from './saveRecoveryFixture';

function makeMatrix(): SaveRecoveryMatrix {
  return new SaveRecoveryMatrix({
    makeRepositories: () => makeSaveRecoveryFixture(),
    makeCoordinator,
  });
}

describe('migration-recovery', () => {
  it('schema-upgrade: v1..4 databases reopen at v5 with all stores and prior data preserved', async () => {
    const results = await makeMatrix().runMigration();
    const r = results.find((x) => x.scenarioId === 'migration.schema-upgrade')!;
    expect(r.outcome).toBe('pass');
    expect(r.detail).toContain('v1..4');
  });

  it('schema-upgrade is exercised directly: opening a v2 database creates the missing stores', async () => {
    const fixture = makeSaveRecoveryFixture();
    const migrated = await fixture.upgradeFromSchema(2, 'mig');
    const meta = await migrated.deps.metadata.getMetadata('mig');
    expect(meta).not.toBeNull();
    // A write to the chunk-sections store (created by the upgrade) succeeds.
    await migrated.deps.chunkSections.putColumn('mig', { version: 1, chunkX: 0, chunkZ: 0, sectionCount: 1, minSectionY: 0, sections: {} });
    expect((await migrated.deps.chunkSections.listColumns('mig')).length).toBe(1);
  });

  it('idempotent: reopening a v5 database loses no data', async () => {
    const results = await makeMatrix().runMigration();
    const r = results.find((x) => x.scenarioId === 'migration.idempotent')!;
    expect(r.outcome).toBe('pass');
  });

  it('chain-refused-register: GAP and DUPLICATE register calls throw the matching kind', async () => {
    const results = await makeMatrix().runMigration();
    const r = results.find((x) => x.scenarioId === 'migration.chain-refused-register')!;
    expect(r.outcome).toBe('pass');
  });

  it('chain-refused-migrate: DOWNGRADE and UNKNOWN_VERSION throw and never mutate input', async () => {
    const chain = new DataMigrationChain<{ schemaVersion: number }>(1);
    chain.register({ fromVersion: 1, toVersion: 2, migrate: (r) => ({ ...r, schemaVersion: 2 }) });
    const expectKind = (fn: () => unknown, kind: string) => {
      try {
        fn();
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(DataMigrationError);
        expect((e as DataMigrationError).kind).toBe(kind);
      }
    };
    expectKind(() => chain.migrate({ schemaVersion: 3 }, (r) => r.schemaVersion), 'DOWNGRADE');
    expectKind(() => chain.migrate({ schemaVersion: 0 }, (r) => r.schemaVersion), 'UNKNOWN_VERSION');
    const input = { schemaVersion: 1 };
    const out = chain.migrate(input, (r) => r.schemaVersion);
    expect(out.record.schemaVersion).toBe(2);
    expect(input.schemaVersion).toBe(1);
  });

  it('unsupported-archive-version: a version-2 archive is refused by validateWorldArchive', async () => {
    const results = await makeMatrix().runMigration();
    const r = results.find((x) => x.scenarioId === 'migration.unsupported-archive-version')!;
    expect(r.outcome).toBe('pass');
    expect(() =>
      validateWorldArchive({ format: 'voxel-world', version: 2, exportedAt: 0, worldId: 'w', metadata: null, playerState: null, columns: [], blockEntityChunks: [], entityChunks: [] }),
    ).toThrow(/unsupported version/);
  });

  it('all five migration scenarios are present and pass', async () => {
    const results = await makeMatrix().runMigration();
    const ids = results.map((x) => x.scenarioId);
    expect(ids).toEqual([
      'migration.schema-upgrade',
      'migration.idempotent',
      'migration.chain-refused-register',
      'migration.chain-refused-migrate',
      'migration.unsupported-archive-version',
    ]);
    for (const r of results) expect(r.outcome).toBe('pass');
  });
});
