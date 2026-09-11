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
  createDefaultGameRules,
  deserializeGameRules,
  serializeGameRules,
  setGameRule,
} from "../../src/simulation/GameRuleFramework";

/**
 * Persistence oracles for the gamerule settings UI (261): the gamerule payload
 * flows through a NEW raw metadata namespace (`__gamerules__:<worldId>`,
 * wither-data precedent from 252) into IndexedDB and comes back validated
 * through `initialGameRules` on reopen. Absent records boot defaults; corrupt
 * payloads degrade to defaults with a recorded error; the 257 reset path
 * deletes the record; export/import carries it as optional `gameruleData`.
 */

const SEED = 261;

function editedPayload(): unknown {
  let store = createDefaultGameRules();
  store = setGameRule(store, "mobGriefing", false);
  store = setGameRule(store, "randomTickSpeed", 7);
  return serializeGameRules(store);
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("GameRulesPersistence (261)", () => {
  it("save → reopen restores the validated gamerule store", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveGameRules(editedPayload());
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialGameRules).not.toBeNull();
    expect(reopened.initialGameRules!.mobGriefing).toBe(false);
    expect(reopened.initialGameRules!.randomTickSpeed).toBe(7);
    expect(reopened.initialGameRules!.doFireTick).toBe(true);
  });

  it("absent record boots null (Game falls back to defaults)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialGameRules).toBeNull();
  });

  it.each([
    ["bad version", { version: 999, rules: { ...createDefaultGameRules() } }],
    ["missing key", { version: 1, rules: { ...createDefaultGameRules(), mobGriefing: undefined } }],
    ["wrong kind", { version: 1, rules: { ...createDefaultGameRules(), randomTickSpeed: "fast" } }],
    ["unknown key", { version: 1, rules: { ...createDefaultGameRules(), notARule: true } }],
  ])("corrupt payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveGameRules(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialGameRules).toBeNull();
    expect(result.errors.some((e) => e.includes("load gamerules"))).toBe(true);
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveGameRules(editedPayload());
    await settle();
    p.saveGameRules(serializeGameRules(createDefaultGameRules()));
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialGameRules).not.toBeNull();
    expect(deserializeGameRules(serializeGameRules(reopened.initialGameRules!))).toEqual(
      createDefaultGameRules(),
    );
  });

  it("resetCurrentWorld deletes the gamerule record (fresh world boots defaults)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveGameRules(editedPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialGameRules).toBeNull();
  });

  it("repository round-trips the raw payload and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getGameRuleData("world-261")).toBeNull();
    const payload = editedPayload();
    await repo.putGameRuleData("world-261", payload);
    expect(await repo.getGameRuleData("world-261")).toEqual(payload);
  });

  it("archive without gameruleData validates and imports as null (backward compatible)", async () => {
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
    expect(valid.gameruleData ?? null).toBeNull();
  });

  it("archive rejects a non-object gameruleData", async () => {
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
        gameruleData: [1, 2, 3],
      }),
    ).toThrow(/gameruleData must be an object or null/);
  });

  it("export → import carries gameruleData and reports it", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveGameRules(editedPayload());
    await settle();

    // Archiver over the same mock database through a fresh facade-free
    // composition mirroring WorldArchiver.test.ts makeDeps.
    const deps = {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld(worldId);
    expect(exported.gameruleData).toEqual(editedPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.gameruleDataImported).toBe(true);
    expect(await target.metadata.getGameRuleData(worldId)).toEqual(editedPayload());
  });
});
