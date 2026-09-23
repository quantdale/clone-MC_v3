import { describe, expect, it } from 'vitest';
import {
  RAID_STORE_VERSION,
  deserializeRaidPayload,
  serializeRaidPayload,
  validatePersistedRaid,
} from '../../src/simulation/RaidPersistence';
import {
  RAID_RECORD_VERSION,
  deserializeRaid,
  serializeRaid,
  spawnWave,
  startRaid,
  tickRaid,
  type SerializedRaid,
} from '../../src/simulation/RaidStateMachine';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { GamePersistence } from '../../src/storage/GamePersistence';
import { WorldArchiver } from '../../src/storage/WorldArchiver';
import { validateWorldArchive } from '../../src/storage/WorldArchive';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { createIdbFactoryMock } from './IdbFactoryMock';

/**
 * Persistence codec oracles for live raid persistence (283): the runtime
 * boundary never throws (corrupt/stale/absent ⇒ null) and the archive
 * boundary throws before any write (fail-closed migration). Every
 * `deserializeRaid` rejection class is pinned at both boundaries, and a
 * valid state round-trips field-for-field through serialize → store → load.
 */

const base = (): SerializedRaid => serializeRaidPayload(startRaid(1, 64, -3, 1));

function activeMidRaid() {
  let state = startRaid(10, 70, -20, 2);
  const first = spawnWave(state);
  state = first.state;
  state = tickRaid(state).state;
  return state;
}

describe('RaidPersistence (283)', () => {
  it('RAID_STORE_VERSION mirrors RAID_RECORD_VERSION', () => {
    expect(RAID_STORE_VERSION).toBe(1);
    expect(RAID_STORE_VERSION).toBe(RAID_RECORD_VERSION);
  });

  describe('serializeRaidPayload', () => {
    it('is a pure pass-through over serializeRaid', () => {
      const state = startRaid(0, 64, 0, 1);
      expect(serializeRaidPayload(state)).toEqual(serializeRaid(state));
      expect(serializeRaidPayload(state).schemaVersion).toBe(RAID_STORE_VERSION);
    });

    it('never throws for a well-formed mid-raid state', () => {
      const state = activeMidRaid();
      expect(() => serializeRaidPayload(state)).not.toThrow();
      expect(serializeRaidPayload(state)).toMatchObject({
        status: state.status,
        centerX: state.centerX,
        waveIndex: state.waveIndex,
        totalWaves: state.totalWaves,
        raidersRemaining: state.raidersRemaining,
        badOmenLevel: state.badOmenLevel,
        ticks: state.ticks,
      });
    });
  });

  describe('deserializeRaidPayload (runtime, never throws)', () => {
    it('round-trips a fresh ACTIVE raid field-for-field', () => {
      const state = startRaid(1, 64, -3, 1);
      const loaded = deserializeRaidPayload(serializeRaidPayload(state));
      expect(loaded).toEqual(state);
    });

    it('round-trips a mid-raid state after spawn + tick', () => {
      const state = activeMidRaid();
      const loaded = deserializeRaidPayload(serializeRaidPayload(state));
      expect(loaded).toEqual(state);
    });

    it('round-trips a terminal VICTORY state', () => {
      let state = startRaid(0, 64, 0, 1);
      for (let guard = 0; guard < 64; guard++) {
        if (state.status !== 'ACTIVE') break;
        const next = tickRaid(state);
        state = next.state;
        if (state.status === 'ACTIVE' && state.raidersRemaining > 0) {
          state = { ...state, raidersRemaining: 0 };
        }
      }
      expect(state.status).toBe('VICTORY');
      expect(deserializeRaidPayload(serializeRaidPayload(state))).toEqual(state);
    });

    it('returns null for an absent record (null / undefined)', () => {
      expect(deserializeRaidPayload(null)).toBeNull();
      expect(deserializeRaidPayload(undefined)).toBeNull();
    });

    it.each([
      ['non-object string', 'thundering'],
      ['non-object number', 42],
      ['array payload', [base()]],
      ['empty object', {}],
      ['boolean', true],
    ])('returns null for %s (non-object payload)', (_label, payload) => {
      expect(deserializeRaidPayload(payload)).toBeNull();
    });

    it.each([
      ['stale schemaVersion 2', { ...base(), schemaVersion: 2 }],
      ['missing schemaVersion', omit(base(), 'schemaVersion')],
      ['schemaVersion 0', { ...base(), schemaVersion: 0 }],
    ])('returns null for %s (stale/missing version)', (_label, payload) => {
      expect(deserializeRaidPayload(payload)).toBeNull();
    });

    it.each([
      ['unknown status', { ...base(), status: 'PAUSED' }],
      ['non-finite centerX', { ...base(), centerX: Number.POSITIVE_INFINITY }],
      ['NaN centerY', { ...base(), centerY: Number.NaN }],
      ['non-finite centerZ', { ...base(), centerZ: Number.NEGATIVE_INFINITY }],
      ['fractional ticks', { ...base(), ticks: 1.5 }],
      ['negative ticks', { ...base(), ticks: -1 }],
      ['fractional waveIndex', { ...base(), waveIndex: 0.5 }],
      ['negative waveIndex', { ...base(), waveIndex: -1 }],
      ['fractional totalWaves', { ...base(), totalWaves: 3.2 }],
      ['negative totalWaves', { ...base(), totalWaves: -1 }],
      ['fractional raidersRemaining', { ...base(), raidersRemaining: 2.5 }],
      ['negative raidersRemaining', { ...base(), raidersRemaining: -1 }],
      ['fractional badOmenLevel', { ...base(), badOmenLevel: 1.1 }],
      ['negative badOmenLevel', { ...base(), badOmenLevel: -1 }],
      ['waveIndex exceeds totalWaves', { ...base(), waveIndex: 4, totalWaves: 3 }],
    ])('returns null for %s', (_label, payload) => {
      expect(deserializeRaidPayload(payload)).toBeNull();
    });

    it('never throws for any rejection class', () => {
      const payloads: unknown[] = [
        null,
        undefined,
        'x',
        1,
        [],
        {},
        { ...base(), schemaVersion: 99 },
        { ...base(), status: 'NOPE' },
        { ...base(), centerX: Number.NaN },
        { ...base(), ticks: -5 },
        { ...base(), waveIndex: 9, totalWaves: 1 },
      ];
      for (const payload of payloads) {
        expect(() => deserializeRaidPayload(payload)).not.toThrow();
      }
    });
  });

  describe('validatePersistedRaid (archive, throws pre-write)', () => {
    it('accepts a valid payload and returns a normalized envelope', () => {
      const state = activeMidRaid();
      const payload = serializeRaidPayload(state);
      const validated = validatePersistedRaid(payload);
      expect(validated).toEqual(payload);
      expect(validated.schemaVersion).toBe(RAID_STORE_VERSION);
      expect(deserializeRaid(validated)).toEqual(state);
    });

    it('rejects null and non-object payloads', () => {
      expect(() => validatePersistedRaid(null)).toThrow(/malformed raid payload/);
      expect(() => validatePersistedRaid(undefined)).toThrow(/malformed raid payload/);
      expect(() => validatePersistedRaid('payload')).toThrow(/malformed raid payload/);
      expect(() => validatePersistedRaid(7)).toThrow(/malformed raid payload/);
      expect(() => validatePersistedRaid([base()])).toThrow(/malformed raid payload/);
    });

    it.each([
      ['stale schemaVersion 2', { ...base(), schemaVersion: 2 }],
      ['missing schemaVersion', omit(base(), 'schemaVersion')],
      ['schemaVersion null', { ...base(), schemaVersion: null }],
    ])('rejects %s with a named version error', (_label, payload) => {
      expect(() => validatePersistedRaid(payload)).toThrow(/unsupported schemaVersion/);
    });

    it.each([
      ['unknown status', { ...base(), status: 'PAUSED' }],
      ['non-finite center', { ...base(), centerX: Number.NaN }],
      ['negative counters', { ...base(), raidersRemaining: -3 }],
      ['waveIndex exceeds totalWaves', { ...base(), waveIndex: 5, totalWaves: 2 }],
    ])('rejects %s via deserializeRaid', (_label, payload) => {
      expect(() => validatePersistedRaid(payload)).toThrow(/RaidStateMachine:/);
    });

    it('rejects every runtime rejection class at the archive boundary too', () => {
      const bad: unknown[] = [
        {},
        { ...base(), schemaVersion: 2 },
        { ...base(), status: 'NOPE' },
        { ...base(), centerY: Number.POSITIVE_INFINITY },
        { ...base(), ticks: 1.5 },
        { ...base(), waveIndex: 4, totalWaves: 3 },
      ];
      for (const payload of bad) {
        expect(() => validatePersistedRaid(payload)).toThrow();
      }
    });
  });

  it('wrong schemaVersion is rejected at BOTH boundaries', () => {
    const stale = { ...base(), schemaVersion: 2 };
    expect(deserializeRaidPayload(stale)).toBeNull();
    expect(() => validatePersistedRaid(stale)).toThrow(/unsupported schemaVersion/);
  });

  it('valid schemaVersion 1 is accepted at BOTH boundaries', () => {
    const ok = base();
    expect(ok.schemaVersion).toBe(1);
    expect(deserializeRaidPayload(ok)).not.toBeNull();
    expect(() => validatePersistedRaid(ok)).not.toThrow();
  });
});

describe('WorldMetadataRepository raid namespace (283 T4)', () => {
  async function openRepo(): Promise<WorldMetadataRepository> {
    const repo = new WorldMetadataRepository({ factory: createIdbFactoryMock() });
    await repo.open();
    return repo;
  }

  it('absent record returns null', async () => {
    const repo = await openRepo();
    expect(await repo.getRaidData('world-283')).toBeNull();
  });

  it('put/get round-trips the raw payload', async () => {
    const repo = await openRepo();
    const payload = serializeRaidPayload(activeMidRaid());
    await repo.putRaidData('world-283', payload);
    const loaded = await repo.getRaidData('world-283');
    expect(loaded).toEqual(payload);
    expect(deserializeRaidPayload(loaded)).toEqual(activeMidRaid());
  });

  it('overwrite replaces the single record (last write wins, no duplicate key)', async () => {
    const repo = await openRepo();
    const first = serializeRaidPayload(startRaid(0, 64, 0, 1));
    const second = serializeRaidPayload(startRaid(5, 70, 5, 3));
    await repo.putRaidData('world-283', first);
    await repo.putRaidData('world-283', second);
    expect(await repo.getRaidData('world-283')).toEqual(second);

    // listMetadata is getAll over the same store: exactly one __raid__ key may
    // exist for this world (single-record duplicate rule).
    const all = await repo.listMetadata();
    const raidKeys = all.filter((row) => String((row as { worldId?: unknown }).worldId ?? '').startsWith('__raid__:world-283'));
    expect(raidKeys.length).toBe(1);
    expect(await repo.getRaidData('world-283')).toEqual(second);
  });

  it('deleteRaw removes the single raid record', async () => {
    const repo = await openRepo();
    await repo.putRaidData('world-283', base());
    await repo.deleteRaw('__raid__:world-283');
    expect(await repo.getRaidData('world-283')).toBeNull();
  });

  it('different worlds keep independent single records', async () => {
    const repo = await openRepo();
    const a = serializeRaidPayload(startRaid(1, 64, 1, 1));
    const b = serializeRaidPayload(startRaid(2, 64, 2, 2));
    await repo.putRaidData('world-a', a);
    await repo.putRaidData('world-b', b);
    expect(await repo.getRaidData('world-a')).toEqual(a);
    expect(await repo.getRaidData('world-b')).toEqual(b);
    await repo.deleteRaw('__raid__:world-a');
    expect(await repo.getRaidData('world-a')).toBeNull();
    expect(await repo.getRaidData('world-b')).toEqual(b);
  });
});

describe('GamePersistence raid (283 T5)', () => {
  const SEED = 283;

  function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
    return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('hydrate valid payload restores the envelope field-for-field', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    const payload = serializeRaidPayload(activeMidRaid());
    p.saveRaid(payload);
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRaid).toEqual(payload);
    expect(deserializeRaidPayload(reopened.initialRaid)).toEqual(activeMidRaid());
  });

  it('absent record boots null with no error', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    const result = await p.open();
    expect(p.initialRaid).toBeNull();
    expect(result.errors.some((e) => e.includes('load raid'))).toBe(false);
  });

  it.each([
    ['non-object payload', 'corrupt'],
    ['stale schemaVersion', { ...base(), schemaVersion: 2 }],
    ['unknown status', { ...base(), status: 'PAUSED' }],
    ['non-finite center', { ...base(), centerX: Number.NaN }],
    ['waveIndex exceeds totalWaves', { ...base(), waveIndex: 9, totalWaves: 1 }],
  ])('corrupt payload (%s) degrades to null with a recorded error', async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveRaid(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialRaid).toBeNull();
    expect(result.errors.some((e) => e.includes('load raid'))).toBe(true);
  });

  it('null save clears the record (cleared raid cannot resurrect)', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveRaid(serializeRaidPayload(startRaid(0, 64, 0, 1)));
    await settle();

    p.saveRaid(null);
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRaid).toBeNull();
  });

  it('save overwrites (last write wins) and is idempotent for the same payload', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    const first = serializeRaidPayload(startRaid(0, 64, 0, 1));
    const second = serializeRaidPayload(startRaid(9, 70, 9, 2));
    p.saveRaid(first);
    await settle();
    p.saveRaid(second);
    await settle();
    p.saveRaid(second);
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRaid).toEqual(second);
  });

  it('resetCurrentWorld deletes the record (fresh world boots null)', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveRaid(serializeRaidPayload(startRaid(1, 64, 1, 1)));
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRaid).toBeNull();
  });

  it('a save after resetCurrentWorld is inert (no record re-created)', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveRaid(serializeRaidPayload(startRaid(1, 64, 1, 1)));
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    p.saveRaid(serializeRaidPayload(startRaid(2, 64, 2, 2)));
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRaid).toBeNull();
  });

  it('saveRaid after dispose is a guarded no-op', async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.dispose();
    expect(() => p.saveRaid(serializeRaidPayload(startRaid(0, 64, 0, 1)))).not.toThrow();
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRaid).toBeNull();
  });
});

describe('WorldArchive/WorldArchiver raid passthrough (283 T6)', () => {
  const legacyBase = {
    format: 'voxel-world',
    version: 2,
    exportedAt: 1,
    worldId: 'w',
    metadata: null,
    playerState: null,
    columns: [],
    blockEntityChunks: [],
    entityChunks: [],
    chunkEdits: [],
    witherData: null,
  };

  function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
    return new GamePersistence({ seed: 283, factory, legacyStorage: null, flushTarget: null });
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function archiverDeps(factory: ReturnType<typeof createIdbFactoryMock>) {
    return {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
  }

  it('archive without raidData validates and imports as null (backward compatible)', () => {
    const valid = validateWorldArchive(legacyBase);
    expect(valid.raidData ?? null).toBeNull();
  });

  it('archive rejects non-object raidData', () => {
    expect(() => validateWorldArchive({ ...legacyBase, raidData: 'corrupt' })).toThrow(
      /raidData must be an object or null/,
    );
    expect(() => validateWorldArchive({ ...legacyBase, raidData: [1, 2, 3] })).toThrow(
      /raidData must be an object or null/,
    );
  });

  it('archive rejects malformed/stale raidData before any write (fail-closed)', () => {
    expect(() =>
      validateWorldArchive({ ...legacyBase, raidData: { ...base(), status: 'PAUSED' } }),
    ).toThrow(/WorldArchive:/);
    expect(() =>
      validateWorldArchive({ ...legacyBase, raidData: { ...base(), schemaVersion: 99 } }),
    ).toThrow(/unsupported schemaVersion/);
    expect(() =>
      validateWorldArchive({ ...legacyBase, raidData: { ...base(), waveIndex: 99, totalWaves: 1 } }),
    ).toThrow(/WorldArchive:/);
  });

  it('export without raid is null; import reports raidDataImported false', async () => {
    const sourceFactory = createIdbFactoryMock();
    const source = openPersistence(sourceFactory);
    await source.open();

    const exported = await new WorldArchiver(archiverDeps(sourceFactory)).exportWorld('world-283');
    expect(exported.raidData ?? null).toBeNull();

    const targetFactory = createIdbFactoryMock();
    const report = await new WorldArchiver(archiverDeps(targetFactory)).importWorld(exported);
    expect(report.raidDataImported).toBe(false);
    const targetRepo = new WorldMetadataRepository({ factory: targetFactory });
    await targetRepo.open();
    expect(await targetRepo.getRaidData('world-283')).toBeNull();
  });

  it('export with active raid → import restores payload and reports raidDataImported', async () => {
    const payload = serializeRaidPayload(activeMidRaid());
    const sourceFactory = createIdbFactoryMock();
    const source = openPersistence(sourceFactory);
    await source.open();
    source.saveRaid(payload);
    await settle();

    const exported = await new WorldArchiver(archiverDeps(sourceFactory)).exportWorld('world-283');
    expect(exported.raidData).toEqual(payload);

    const targetFactory = createIdbFactoryMock();
    const report = await new WorldArchiver(archiverDeps(targetFactory)).importWorld(exported);
    expect(report.raidDataImported).toBe(true);
    const targetRepo = new WorldMetadataRepository({ factory: targetFactory });
    await targetRepo.open();
    expect(await targetRepo.getRaidData('world-283')).toEqual(payload);
    expect(deserializeRaidPayload(await targetRepo.getRaidData('world-283'))).toEqual(activeMidRaid());
  });

  it('malformed raidData fixture refuses import with zero writes', async () => {
    const targetFactory = createIdbFactoryMock();
    const bad = { ...legacyBase, raidData: { ...base(), status: 'NOPE' } };
    await expect(new WorldArchiver(archiverDeps(targetFactory)).importWorld(bad as never)).rejects.toThrow(
      /WorldArchive:/,
    );
    const targetRepo = new WorldMetadataRepository({ factory: targetFactory });
    await targetRepo.open();
    expect(await targetRepo.getRaidData('w')).toBeNull();
  });
});

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}
