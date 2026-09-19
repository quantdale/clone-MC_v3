import { describe, expect, it } from 'vitest';
import {
  createDefaultTradingStates,
  deserializeTrades,
  serializeTrades,
  TRADING_PROFESSIONS,
  TRADING_STORE_VERSION,
} from '../../src/simulation/VillagerTradingPersistence';
import { applyTrade, createVillagerTradeState } from '../../src/simulation/VillagerTrading';
import { GamePersistence } from '../../src/storage/GamePersistence';
import { WorldMetadataRepository } from '../../src/storage/WorldMetadataRepository';
import { ChunkSectionRepository } from '../../src/storage/ChunkSectionRepository';
import { BlockEntityRepository } from '../../src/storage/BlockEntityRepository';
import { EntityRepository } from '../../src/storage/EntityRepository';
import { PlayerStateRepository } from '../../src/storage/PlayerStateRepository';
import { WorldArchiver } from '../../src/storage/WorldArchiver';
import { validateWorldArchive } from '../../src/storage/WorldArchive';
import { createIdbFactoryMock } from './IdbFactoryMock';

const SEED = 278;

function persistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('VillagerTradingPersistence codec (278)', () => {
  it('round-trips fresh states field-for-field', () => {
    const states = createDefaultTradingStates();
    const payload = serializeTrades(states);
    expect(payload.farmer?.version).toBe(TRADING_STORE_VERSION);
    const back = deserializeTrades(JSON.parse(JSON.stringify(payload)));
    expect(back).toEqual(states);
  });

  it('round-trips a traded state (uses decremented, XP gained)', () => {
    const states = createDefaultTradingStates();
    const farmer = states.farmer!;
    const offer = farmer.offers[0]!;
    const applied = applyTrade(
      farmer,
      0,
      { item: offer.inputA.item, count: offer.inputA.count },
      null,
    );
    expect(applied.result).not.toBeNull();
    const traded = { ...states, farmer: applied.state };
    const back = deserializeTrades(JSON.parse(JSON.stringify(serializeTrades(traded))));
    expect(back).toEqual(traded);
  });

  it('covers exactly the three default professions', () => {
    expect([...TRADING_PROFESSIONS]).toEqual(['farmer', 'librarian', 'weaponsmith']);
    const states = createDefaultTradingStates();
    expect(Object.keys(states).sort()).toEqual(['farmer', 'librarian', 'weaponsmith']);
    for (const key of TRADING_PROFESSIONS) {
      expect(states[key]!.level).toBe(1);
      expect(states[key]!.xp).toBe(0);
      expect(states[key]!.offers.length).toBeGreaterThan(0);
    }
  });

  it('degrades a null/non-object/array/empty root to null', () => {
    expect(deserializeTrades(null)).toBeNull();
    expect(deserializeTrades(undefined)).toBeNull();
    expect(deserializeTrades(42)).toBeNull();
    expect(deserializeTrades('x')).toBeNull();
    expect(deserializeTrades([])).toBeNull();
    expect(deserializeTrades({})).toBeNull();
  });

  it('degrades unknown-only keys to null and drops unknown keys otherwise', () => {
    expect(deserializeTrades({ not_a_profession: { version: 1 } })).toBeNull();
    const fresh = createDefaultTradingStates();
    const payload = {
      ...JSON.parse(JSON.stringify(serializeTrades(fresh))),
      intruder: { version: 1, level: 1, xp: 0, offers: [] },
    };
    const back = deserializeTrades(payload)!;
    expect(back.intruder).toBeUndefined();
    expect(back.farmer).toEqual(fresh.farmer);
  });

  it('degrades a corrupt profession to fresh while keeping valid siblings', () => {
    const fresh = createDefaultTradingStates();
    const payload = JSON.parse(JSON.stringify(serializeTrades(fresh)));
    payload.librarian = { version: 999, level: 1, xp: 0, offers: [] };
    payload.farmer.usesRemaining = -1;
    const back = deserializeTrades(payload)!;
    expect(back.librarian).toEqual(createVillagerTradeState('librarian', 1));
    expect(back.weaponsmith).toEqual(fresh.weaponsmith);
  });

  it('rejects every invalid offer row class per profession', () => {
    const fresh = createDefaultTradingStates();
    const base = JSON.parse(JSON.stringify(serializeTrades(fresh)));
    const cases: Array<(p: typeof base) => void> = [
      (p) => {
        p.farmer.offers[0].count = 0;
        p.farmer.offers[0].inputA.count = 0;
      },
      (p) => {
        p.farmer.offers[0].usesRemaining = p.farmer.offers[0].maxUses + 1;
      },
      (p) => {
        p.farmer.offers[0].usesRemaining = -1;
      },
      (p) => {
        p.farmer.offers[0].unlockLevel = 0;
      },
      (p) => {
        p.farmer.offers[0].inputA.item = '';
      },
      (p) => {
        p.farmer.level = 0;
      },
      (p) => {
        p.farmer.level = 6;
      },
      (p) => {
        p.farmer.xp = -1;
      },
      (p) => {
        p.farmer.version = 2;
      },
    ];
    for (const mutate of cases) {
      const payload = JSON.parse(JSON.stringify(base));
      mutate(payload);
      const back = deserializeTrades(payload)!;
      expect(back.farmer).toEqual(createVillagerTradeState('farmer', 1));
      expect(back.librarian).toEqual(fresh.librarian);
    }
  });

  it('serializes only known professions (extra live keys never persist)', () => {
    const states = {
      ...createDefaultTradingStates(),
      intruder: createVillagerTradeState('farmer', 1),
    };
    const payload = serializeTrades(states);
    expect(payload.intruder).toBeUndefined();
    expect(Object.keys(payload).sort()).toEqual(['farmer', 'librarian', 'weaponsmith']);
  });

  it('saves and reloads the raw record through GamePersistence', async () => {
    const factory = createIdbFactoryMock();
    const writer = persistence(factory);
    await writer.open();
    const states = createDefaultTradingStates();
    states.farmer = {
      ...states.farmer!,
      xp: 2,
      offers: states.farmer!.offers.map((offer, index) =>
        index === 0 ? { ...offer, usesRemaining: offer.maxUses - 1 } : offer,
      ),
    };
    writer.saveTrading(serializeTrades(states));
    await settle();

    const reopened = persistence(factory);
    await reopened.open();
    expect(reopened.initialTrading).toEqual(states);
    const rawRepo = new WorldMetadataRepository({ factory });
    await rawRepo.open();
    expect(await rawRepo.getTradingData('world-278')).toEqual(serializeTrades(states));
  });

  it('loads corrupt payloads without throwing and keeps valid siblings', async () => {
    const factory = createIdbFactoryMock();
    const writer = persistence(factory);
    await writer.open();
    const payload = JSON.parse(JSON.stringify(serializeTrades(createDefaultTradingStates()))) as {
      farmer: { offers: Array<{ usesRemaining: number }> };
    };
    payload.farmer.offers[0]!.usesRemaining = -1;
    const rawRepo = new WorldMetadataRepository({ factory });
    await rawRepo.open();
    await rawRepo.putTradingData('world-278', payload);
    const reopened = persistence(factory);
    const result = await reopened.open();
    expect(reopened.initialTrading?.farmer).toEqual(createVillagerTradeState('farmer', 1));
    expect(reopened.initialTrading?.librarian).toEqual(createVillagerTradeState('librarian', 1));
    expect(result.errors.some((entry) => entry.includes('load trading'))).toBe(false);
  });

  it('reset deletes the record and later saves stay inert', async () => {
    const factory = createIdbFactoryMock();
    const p = persistence(factory);
    await p.open();
    p.saveTrading(serializeTrades(createDefaultTradingStates()));
    await settle();
    expect(await p.resetCurrentWorld()).toEqual({ ok: true });
    p.saveTrading(serializeTrades(createDefaultTradingStates()));
    await settle();
    const reopened = persistence(factory);
    await reopened.open();
    expect(reopened.initialTrading).toBeNull();
  });

  it('repository and archive carry trading data, with absent data staying fresh', async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getTradingData('world-278')).toBeNull();
    const payload = serializeTrades(createDefaultTradingStates());
    await repo.putTradingData('world-278', payload);
    expect(await repo.getTradingData('world-278')).toEqual(payload);

    const deps = {
      metadata: repo,
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld('world-278');
    expect(exported.tradingData).toEqual(payload);
    expect(validateWorldArchive(exported).tradingData).toEqual(payload);

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.tradingDataImported).toBe(true);
    expect(await target.metadata.getTradingData('world-278')).toEqual(payload);

    const absent = validateWorldArchive({
      format: 'voxel-world',
      version: 1,
      exportedAt: 1,
      worldId: 'fresh',
      metadata: null,
      playerState: null,
      columns: [],
      blockEntityChunks: [],
      entityChunks: [],
    });
    expect(absent.tradingData ?? null).toBeNull();
  });

  it('rejects malformed trading archive data before writing', () => {
    const base = {
      format: 'voxel-world',
      version: 2,
      exportedAt: 1,
      worldId: 'world-278',
      metadata: null,
      playerState: null,
      columns: [],
      blockEntityChunks: [],
      entityChunks: [],
      chunkEdits: [],
      witherData: null,
    };
    expect(() => validateWorldArchive({ ...base, tradingData: { farmer: { version: 999 } } })).toThrow(
      /tradingData\.farmer is invalid/,
    );
    expect(() => validateWorldArchive({ ...base, tradingData: { intruder: {} } })).toThrow(
      /tradingData must contain a known profession/,
    );
  });
});
