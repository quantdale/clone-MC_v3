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
import { coreProgressionAdvancements } from "../../src/simulation/CoreProgressionAdvancements";
import {
  applyTriggerToProgresses,
  createDefaultAdvancementProgresses,
  serializeAdvancementSave,
} from "../../src/simulation/AdvancementSave";

const CATALOG = coreProgressionAdvancements();

/**
 * Persistence oracles for the advancement panel UI (263): the batch-envelope
 * payload flows through a NEW raw metadata namespace
 * (`__advancements__:<worldId>`, recipe-book-data precedent from 262) into
 * IndexedDB and comes back validated through `initialAdvancements` on reopen.
 * Absent records boot null (Game falls back to defaults); corrupt payloads
 * degrade to null with a recorded error; the 257 reset path deletes the
 * record; export/import carries it as optional `advancementData`.
 */

const SEED = 263;

function completedPayload(): unknown {
  let store = createDefaultAdvancementProgresses(CATALOG);
  store = applyTriggerToProgresses(
    store,
    CATALOG,
    { type: "obtain_item", itemKey: "wooden_pickaxe" },
    42,
  ).progresses;
  store = applyTriggerToProgresses(
    store,
    CATALOG,
    { type: "dimension_enter", dimensionKey: "minecraft:the_nether" },
    5000,
  ).progresses;
  return serializeAdvancementSave(store);
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AdvancementPersistence (263)", () => {
  it("save → reopen restores validated advancement progress", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveAdvancements(completedPayload());
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialAdvancements).not.toBeNull();
    const rows = reopened.initialAdvancements!;
    expect(rows.map((r) => r.advancementKey)).toEqual(CATALOG.map((d) => d.key));
    expect(rows[0]).toEqual({
      advancementKey: "minecraft:stone_age",
      achieved: true,
      achievedTick: 42,
      criteriaAchieved: [true],
    });
    expect(rows[4]).toEqual({
      advancementKey: "minecraft:enter_the_nether",
      achieved: true,
      achievedTick: 5000,
      criteriaAchieved: [true],
    });
    expect(rows[1]!.achieved).toBe(false);
  });

  it("absent record boots null (Game falls back to default progress)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialAdvancements).toBeNull();
  });

  it.each([
    ["bad version", { version: 999, advancements: [] }],
    ["non-array advancements", { version: 1, advancements: {} }],
    [
      "duplicate key",
      {
        version: 1,
        advancements: [
          {
            version: 1,
            advancementKey: "minecraft:stone_age",
            achieved: false,
            achievedTick: null,
            criteriaAchieved: [false],
          },
          {
            version: 1,
            advancementKey: "minecraft:stone_age",
            achieved: false,
            achievedTick: null,
            criteriaAchieved: [false],
          },
        ],
      },
    ],
    [
      "unknown key",
      {
        version: 1,
        advancements: [
          {
            version: 1,
            advancementKey: "minecraft:not_real",
            achieved: false,
            achievedTick: null,
            criteriaAchieved: [false],
          },
        ],
      },
    ],
    [
      "length drift",
      {
        version: 1,
        advancements: [
          {
            version: 1,
            advancementKey: "minecraft:stone_age",
            achieved: false,
            achievedTick: null,
            criteriaAchieved: [false, false],
          },
        ],
      },
    ],
    [
      "achieved mismatch",
      {
        version: 1,
        advancements: [
          {
            version: 1,
            advancementKey: "minecraft:stone_age",
            achieved: true,
            achievedTick: 7,
            criteriaAchieved: [false],
          },
        ],
      },
    ],
    [
      "tick mismatch",
      {
        version: 1,
        advancements: [
          {
            version: 1,
            advancementKey: "minecraft:stone_age",
            achieved: false,
            achievedTick: 7,
            criteriaAchieved: [false],
          },
        ],
      },
    ],
  ])("corrupt payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveAdvancements(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialAdvancements).toBeNull();
    expect(result.errors.some((e) => e.includes("load advancements"))).toBe(true);
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveAdvancements(completedPayload());
    await settle();
    p.saveAdvancements(serializeAdvancementSave(createDefaultAdvancementProgresses(CATALOG)));
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialAdvancements).not.toBeNull();
    expect(reopened.initialAdvancements!.every((r) => !r.achieved)).toBe(true);
  });

  it("resetCurrentWorld deletes the advancement record (fresh world boots defaults)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveAdvancements(completedPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialAdvancements).toBeNull();
  });

  it("repository round-trips the raw payload and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getAdvancementData("world-263")).toBeNull();
    const payload = completedPayload();
    await repo.putAdvancementData("world-263", payload);
    expect(await repo.getAdvancementData("world-263")).toEqual(payload);
  });

  it("archive without advancementData validates and imports as null (backward compatible)", async () => {
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
    expect(valid.advancementData ?? null).toBeNull();
  });

  it("archive rejects a non-object advancementData", async () => {
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
        advancementData: ["minecraft:stone_age"],
      }),
    ).toThrow(/advancementData must be an object or null/);
  });

  it("export → import carries advancementData and reports it", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveAdvancements(completedPayload());
    await settle();

    const deps = {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld(worldId);
    expect(exported.advancementData).toEqual(completedPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.advancementDataImported).toBe(true);
    expect(await target.metadata.getAdvancementData(worldId)).toEqual(completedPayload());
  });
});
