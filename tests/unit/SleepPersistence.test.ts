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
  createDefaultSleepState,
  deserializeSleepState,
  serializeSleepState,
} from "../../src/simulation/SleepFramework";

/**
 * Persistence oracles for live sleep/bed integration (274): the sleep state
 * flows through a NEW raw metadata namespace (`__sleep__:<worldId>`,
 * 265–271 precedent) into IndexedDB and comes back validated through
 * `initialSleep` on reopen, with wake-on-boot applied (sleeping forced
 * false). Absent records boot null (Game boots the default awake/no-spawn
 * state); corrupt payloads degrade to null with a recorded error; the 257
 * reset path deletes the record; export/import carries it as an optional
 * object-or-null field. Strict shape validation stays owned by the 198
 * `deserializeSleepState` reader — the facade stores the exact serialized
 * payload and re-validates it on load.
 */

const SEED = 274;

function sleepingPayload(): unknown {
  return serializeSleepState({ sleeping: true, spawnSet: true, spawn: [3, 64, -7] });
}

function awakeSpawnPayload(): unknown {
  return serializeSleepState({ sleeping: false, spawnSet: true, spawn: [3, 64, -7] });
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SleepPersistence (274)", () => {
  it("save → reopen restores the spawn field-for-field (wake-on-boot: sleeping forced false)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveSleep(sleepingPayload());
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    // The persisted sleeping flag never survives a boot (I-5); the spawn
    // point round-trips field-for-field.
    expect(reopened.initialSleep).toEqual({ sleeping: false, spawnSet: true, spawn: [3, 64, -7] });
    expect(serializeSleepState(reopened.initialSleep!)).toEqual(awakeSpawnPayload());
  });

  it("absent records boot null (Game boots the default state)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialSleep).toBeNull();
    expect(createDefaultSleepState()).toEqual({ sleeping: false, spawnSet: false, spawn: [0, 0, 0] });
  });

  it.each([
    ["non-object payload", "asleep"],
    ["array payload", [{ version: 1, sleeping: true, spawnSet: true, spawn: [1, 2, 3] }]],
    ["wrong version", { version: 2, sleeping: true, spawnSet: true, spawn: [1, 2, 3] }],
    ["non-boolean sleeping", { version: 1, sleeping: "yes", spawnSet: true, spawn: [1, 2, 3] }],
    ["non-boolean spawnSet", { version: 1, sleeping: true, spawnSet: 1, spawn: [1, 2, 3] }],
    ["non-finite spawn", { version: 1, sleeping: true, spawnSet: true, spawn: [1, NaN, 3] }],
    ["short spawn", { version: 1, sleeping: true, spawnSet: true, spawn: [1, 2] }],
    ["unknown key", { version: 1, sleeping: true, spawnSet: true, spawn: [1, 2, 3], extra: true }],
    ["missing spawn", { version: 1, sleeping: true, spawnSet: true }],
  ])("corrupt payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveSleep(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialSleep).toBeNull();
    expect(result.errors.some((e) => e.includes("load sleep"))).toBe(true);
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveSleep(serializeSleepState({ sleeping: true, spawnSet: true, spawn: [3, 64, -7] }));
    await settle();
    p.saveSleep(serializeSleepState({ sleeping: true, spawnSet: true, spawn: [9, 70, 12] }));
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialSleep).toEqual({ sleeping: false, spawnSet: true, spawn: [9, 70, 12] });
  });

  it("resetCurrentWorld deletes the record (fresh world boots defaults)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveSleep(awakeSpawnPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialSleep).toBeNull();
  });

  it("a save after resetCurrentWorld is inert (no record re-created)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveSleep(awakeSpawnPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    p.saveSleep(awakeSpawnPayload());
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialSleep).toBeNull();
  });

  it("repository round-trips the raw payload and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getSleepData("world-274")).toBeNull();
    const payload = sleepingPayload();
    await repo.putSleepData("world-274", payload);
    expect(await repo.getSleepData("world-274")).toEqual(payload);
  });

  it("archive without the new field validates and imports as null (backward compatible)", async () => {
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
    expect(valid.sleepData ?? null).toBeNull();
  });

  it("archive rejects non-object sleepData", async () => {
    const base = {
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
    };
    expect(() => validateWorldArchive({ ...base, sleepData: "asleep" })).toThrow(
      /sleepData must be an object or null/,
    );
    expect(() => validateWorldArchive({ ...base, sleepData: [1, 2, 3] })).toThrow(
      /sleepData must be an object or null/,
    );
  });

  it("export → import carries the sleep state and reports it", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveSleep(awakeSpawnPayload());
    await settle();

    const deps = {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld(worldId);
    expect(exported.sleepData).toEqual(awakeSpawnPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.sleepDataImported).toBe(true);
    expect(await target.metadata.getSleepData(worldId)).toEqual(awakeSpawnPayload());
    // The imported payload re-validates under the strict 198 reader.
    expect(deserializeSleepState(awakeSpawnPayload())).toEqual({
      sleeping: false,
      spawnSet: true,
      spawn: [3, 64, -7],
    });
  });
});
