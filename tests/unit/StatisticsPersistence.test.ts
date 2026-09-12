import { describe, expect, it } from "vitest";
import { GamePersistence } from "../../src/storage/GamePersistence";
import { WorldMetadataRepository } from "../../src/storage/WorldMetadataRepository";
import { ChunkSectionRepository } from "../../src/storage/ChunkSectionRepository";
import { BlockEntityRepository } from "../../src/storage/BlockEntityRepository";
import { EntityRepository } from "../../src/storage/EntityRepository";
import { PlayerStateRepository } from "../../src/storage/PlayerStateRepository";
import { WorldArchiver } from "../../src/storage/WorldArchiver";
import { validateWorldArchive } from "../../src/storage/WorldArchive";
import { createIdbFactoryMock } from "./IdbFactoryMock";
import {
  applyStatisticEvent,
  createStatisticStore,
  serializeStatisticStore,
} from "../../src/simulation/StatisticsFramework";

/**
 * Persistence oracles for the statistics panel UI (271): the statistic
 * store flows through a NEW raw metadata namespace (`__statistics__:<worldId>`,
 * difficulty-data precedent from 267) into IndexedDB and comes back validated
 * through `initialStatistics` on reopen. Absent records boot null (Game falls
 * back to zeros); corrupt payloads degrade to null with a recorded error; the
 * 257 reset path deletes the record; export/import carries it as optional
 * `statisticsData`.
 */

const SEED = 271;

function editedPayload(): unknown {
  let store = createStatisticStore();
  store = applyStatisticEvent(store, { type: "walk", distance: 12.7 });
  store = applyStatisticEvent(store, { type: "break_block", blockKey: "stone" });
  store = applyStatisticEvent(store, { type: "play_tick" });
  return serializeStatisticStore(store);
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("StatisticsPersistence (271)", () => {
  it("save → reopen restores the validated statistic store", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveStatistics(editedPayload());
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialStatistics).not.toBeNull();
    expect(reopened.initialStatistics!).toEqual({
      walk_distance: 12,
      mob_kills: 0,
      blocks_broken: 1,
      deaths: 0,
      time_played: 1,
      damage_taken: 0,
      jumps: 0,
    });
  });

  it("absent record boots null (Game falls back to zeros)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialStatistics).toBeNull();
  });

  it.each([
    ["bad version", { version: 999, statistics: { ...createStatisticStore() } }],
    ["missing key", { version: 1, statistics: { ...createStatisticStore(), jumps: undefined } }],
    ["negative value", { version: 1, statistics: { ...createStatisticStore(), deaths: -1 } }],
    ["non-integer value", { version: 1, statistics: { ...createStatisticStore(), jumps: 1.5 } }],
    ["unknown key", { version: 1, statistics: { ...createStatisticStore(), flying_pigs: 3 } }],
  ])("corrupt payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveStatistics(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialStatistics).toBeNull();
    expect(result.errors.some((e) => e.includes("load statistics"))).toBe(true);
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveStatistics(editedPayload());
    await settle();
    p.saveStatistics(serializeStatisticStore(createStatisticStore()));
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialStatistics).not.toBeNull();
    expect(reopened.initialStatistics).toEqual(createStatisticStore());
  });

  it("resetCurrentWorld deletes the statistics record (fresh world boots zeros)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveStatistics(editedPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialStatistics).toBeNull();
  });

  it("saveStatistics after dispose is a no-op (no ghost writes)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    await p.dispose();
    expect(() => p.saveStatistics(editedPayload())).not.toThrow();
    await settle();
    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialStatistics).toBeNull();
  });

  it("repository round-trips the raw payload and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getStatisticData("world-271")).toBeNull();
    const payload = editedPayload();
    await repo.putStatisticData("world-271", payload);
    expect(await repo.getStatisticData("world-271")).toEqual(payload);
  });

  it("archive without statisticsData validates and imports as null (backward compatible)", async () => {
    const legacy = {
      format: "voxel-world",
      version: 1,
      exportedAt: 1,
      worldId: "w",
      metadata: null,
      playerState: null,
      columns: [],
      blockEntityChunks: [],
      entityChunks: [],
    };
    const valid = validateWorldArchive(legacy);
    expect(valid.statisticsData ?? null).toBeNull();
  });

  it("archive rejects a non-object statisticsData", async () => {
    expect(() =>
      validateWorldArchive({
        format: "voxel-world",
        version: 2,
        exportedAt: 1,
        worldId: "w",
        metadata: null,
        playerState: null,
        columns: [],
        blockEntityChunks: [],
        entityChunks: [],
        chunkEdits: [],
        witherData: null,
        statisticsData: [1, 2, 3],
      }),
    ).toThrow(/statisticsData must be an object or null/);
  });

  it("export → import carries statisticsData and reports it", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveStatistics(editedPayload());
    await settle();

    const deps = {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld(worldId);
    expect(exported.statisticsData).toEqual(editedPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.statisticsDataImported).toBe(true);
    expect(await target.metadata.getStatisticData(worldId)).toEqual(editedPayload());
  });
});
