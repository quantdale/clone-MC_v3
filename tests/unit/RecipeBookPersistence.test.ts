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
  createDefaultRecipeBook,
  deserializeRecipeBook,
  serializeRecipeBook,
  unlockRecipes,
} from "../../src/inventory/RecipeBook";

/**
 * Persistence oracles for the recipe book UI (262): the known-set payload
 * flows through a NEW raw metadata namespace (`__recipebook__:<worldId>`,
 * gamerule-data precedent from 261) into IndexedDB and comes back validated
 * through `initialRecipeBook` on reopen. Absent records boot the empty book;
 * corrupt payloads degrade to the empty book with a recorded error; the 257
 * reset path deletes the record; export/import carries it as optional
 * `recipeBookData`.
 */

const SEED = 262;

function editedPayload(): unknown {
  const book = unlockRecipes(unlockRecipes(createDefaultRecipeBook(), ["planks"]), ["sticks"]);
  return serializeRecipeBook(book);
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("RecipeBookPersistence (262)", () => {
  it("save → reopen restores the validated recipe book", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveRecipeBook(editedPayload());
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRecipeBook).not.toBeNull();
    expect(reopened.initialRecipeBook!.known).toEqual(["planks", "sticks"]);
    expect(deserializeRecipeBook(serializeRecipeBook(reopened.initialRecipeBook!))).toEqual(
      reopened.initialRecipeBook,
    );
  });

  it("absent record boots null (Game falls back to the empty book)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialRecipeBook).toBeNull();
  });

  it.each([
    ["bad version", { version: 999, known: ["sticks"] }],
    ["non-array known", { version: 1, known: "sticks" }],
    ["empty key", { version: 1, known: [""] }],
    ["duplicate key", { version: 1, known: ["sticks", "sticks"] }],
    ["unknown extra key", { version: 1, known: [], extra: 1 }],
  ])("corrupt payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveRecipeBook(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialRecipeBook).toBeNull();
    expect(result.errors.some((e) => e.includes("load recipebook"))).toBe(true);
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveRecipeBook(editedPayload());
    await settle();
    p.saveRecipeBook(serializeRecipeBook(createDefaultRecipeBook()));
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRecipeBook).not.toBeNull();
    expect(reopened.initialRecipeBook!.known).toEqual([]);
  });

  it("resetCurrentWorld deletes the recipe-book record (fresh world boots empty)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveRecipeBook(editedPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialRecipeBook).toBeNull();
  });

  it("repository round-trips the raw payload and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getRecipeBookData("world-262")).toBeNull();
    const payload = editedPayload();
    await repo.putRecipeBookData("world-262", payload);
    expect(await repo.getRecipeBookData("world-262")).toEqual(payload);
  });

  it("archive without recipeBookData validates and imports as null (backward compatible)", async () => {
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
    expect(valid.recipeBookData ?? null).toBeNull();
  });

  it("archive rejects a non-object recipeBookData", async () => {
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
        recipeBookData: ["sticks"],
      }),
    ).toThrow(/recipeBookData must be an object or null/);
  });

  it("export → import carries recipeBookData and reports it", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveRecipeBook(editedPayload());
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
    expect(exported.recipeBookData).toEqual(editedPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.recipeBookDataImported).toBe(true);
    expect(await target.metadata.getRecipeBookData(worldId)).toEqual(editedPayload());
  });
});
