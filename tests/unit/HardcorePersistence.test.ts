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
  serializeHardcoreState,
} from "../../src/simulation/HardcoreFramework";
import {
  serializeDifficulty,
} from "../../src/simulation/WorldDifficulty";

/**
 * Persistence oracles for live hardcore-mode integration (267): the hardcore
 * flag flows through a NEW raw metadata namespace (`__hardcore__:<worldId>`,
 * 261–266 precedent) and the configured difficulty through a second NEW
 * namespace (`__difficulty__:<worldId>`) into IndexedDB, and both come back
 * validated through `initialHardcore` / `initialDifficulty` on reopen.
 * Absent records boot null (Game boots non-hardcore normal); corrupt
 * payloads degrade to null with a recorded error; the 257 reset path deletes
 * both records; export/import carries them as optional object-or-null
 * fields. Strict shape validation stays owned by the 193
 * `deserializeHardcoreState` and 188 `deserializeDifficulty` readers — the
 * facade stores the exact serialized payloads and re-validates on load.
 */

const SEED = 267;

function hardcorePayload(): unknown {
  return serializeHardcoreState({ hardcore: true });
}

function difficultyPayload(): unknown {
  return serializeDifficulty("easy");
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("HardcorePersistence (267)", () => {
  it("save → reopen restores both values field-for-field", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveHardcore(hardcorePayload());
    p.saveDifficulty(difficultyPayload());
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialHardcore).toEqual({ hardcore: true });
    expect(reopened.initialDifficulty).toBe("easy");
  });

  it("absent records boot null (Game boots non-hardcore normal)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialHardcore).toBeNull();
    expect(p.initialDifficulty).toBeNull();
  });

  it.each([
    ["non-object payload", ["hardcore"]],
    ["wrong version", { version: 2, hardcore: true }],
    ["non-boolean flag", { version: 1, hardcore: "yes" }],
    ["unknown key", { version: 1, hardcore: true, extra: true }],
    ["missing flag", { version: 1 }],
    ["string payload", "hardcore"],
  ])("corrupt hardcore payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveHardcore(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialHardcore).toBeNull();
    expect(result.errors.some((e) => e.includes("load hardcore"))).toBe(true);
  });

  it.each([
    ["non-object payload", { version: 1, level: ["easy"] }],
    ["wrong version", { version: 2, level: "easy" }],
    ["unknown level", { version: 1, level: "godmode" }],
    ["missing level", { version: 1 }],
    ["string payload", "easy"],
  ])("corrupt difficulty payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveDifficulty(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialDifficulty).toBeNull();
    expect(result.errors.some((e) => e.includes("load difficulty"))).toBe(true);
  });

  it("one corrupt record degrades independently (the healthy record survives)", async () => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveHardcore(hardcorePayload());
    writer.saveDifficulty({ version: 1, level: "godmode" });
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialHardcore).toEqual({ hardcore: true });
    expect(reopened.initialDifficulty).toBeNull();
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveHardcore(hardcorePayload());
    p.saveDifficulty(difficultyPayload());
    await settle();
    p.saveHardcore(serializeHardcoreState({ hardcore: false }));
    p.saveDifficulty(serializeDifficulty("hard"));
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialHardcore).toEqual({ hardcore: false });
    expect(reopened.initialDifficulty).toBe("hard");
  });

  it("resetCurrentWorld deletes both records (fresh world boots defaults)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveHardcore(hardcorePayload());
    p.saveDifficulty(difficultyPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialHardcore).toBeNull();
    expect(reopened.initialDifficulty).toBeNull();
  });

  it("saves after a completed reset are inert no-ops", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    p.saveHardcore(hardcorePayload());
    p.saveDifficulty(difficultyPayload());
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialHardcore).toBeNull();
    expect(reopened.initialDifficulty).toBeNull();
  });

  it("repository round-trips both raw payloads and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getHardcoreData("world-267")).toBeNull();
    expect(await repo.getDifficultyData("world-267")).toBeNull();
    await repo.putHardcoreData("world-267", hardcorePayload());
    await repo.putDifficultyData("world-267", difficultyPayload());
    expect(await repo.getHardcoreData("world-267")).toEqual(hardcorePayload());
    expect(await repo.getDifficultyData("world-267")).toEqual(difficultyPayload());
  });

  it("archive without the new fields validates and imports as null (backward compatible)", async () => {
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
    expect(valid.hardcoreData ?? null).toBeNull();
    expect(valid.difficultyData ?? null).toBeNull();
  });

  it("archive rejects non-object hardcore/difficulty data", async () => {
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
    expect(() => validateWorldArchive({ ...base, hardcoreData: "hardcore" })).toThrow(
      /hardcoreData must be an object or null/,
    );
    expect(() => validateWorldArchive({ ...base, hardcoreData: [{ version: 1 }] })).toThrow(
      /hardcoreData must be an object or null/,
    );
    expect(() => validateWorldArchive({ ...base, difficultyData: "easy" })).toThrow(
      /difficultyData must be an object or null/,
    );
    expect(() => validateWorldArchive({ ...base, difficultyData: [["easy"]] })).toThrow(
      /difficultyData must be an object or null/,
    );
  });

  it("export → import carries both values and reports them", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveHardcore(hardcorePayload());
    p.saveDifficulty(difficultyPayload());
    await settle();

    const deps = {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld(worldId);
    expect(exported.hardcoreData).toEqual(hardcorePayload());
    expect(exported.difficultyData).toEqual(difficultyPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.hardcoreDataImported).toBe(true);
    expect(report.difficultyDataImported).toBe(true);
    expect(await target.metadata.getHardcoreData(worldId)).toEqual(hardcorePayload());
    expect(await target.metadata.getDifficultyData(worldId)).toEqual(difficultyPayload());
  });
});
