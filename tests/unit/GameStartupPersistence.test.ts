/**
 * Facade-level startup compatibility + world-scoped reset tests (257).
 * Deterministic old/partial IndexedDB fixtures drive the real `GamePersistence.open()`
 * classification/assessment path over the in-memory IndexedDB mock; reset/export
 * behavior is proven with fault injection (failure-visible, world-scoped).
 */
import { describe, expect, it } from "vitest";
import { GamePersistence } from "../../src/storage/GamePersistence";
import { WorldMetadataRepository, type IdbFactoryLike, type IdbOpenRequestLike } from "../../src/storage/WorldMetadataRepository";
import { ChunkSectionRepository } from "../../src/storage/ChunkSectionRepository";
import { PlayerStateRepository } from "../../src/storage/PlayerStateRepository";
import { ChunkColumn } from "../../src/world/ChunkColumn";
import { createDefaultBlockStateRegistry } from "../../src/world/BlockStateRegistry";
import { BlockId } from "../../src/world/BlockRegistry";
import { OVERWORLD_DIMENSION_TYPE } from "../../src/data/DimensionTypes";
import { createIdbFactoryMock, type MockIdbFactory } from "./IdbFactoryMock";

const SEED = 257;
const WORLD_ID = `world-${SEED}`;
const FOREIGN_ID = "world-other";
const STATE_REGISTRY = createDefaultBlockStateRegistry();

/** Reject-all wrapper around one store operation for fault injection. */
class FaultFactory implements IdbFactoryLike {
  constructor(
    private readonly inner: MockIdbFactory,
    private readonly faults: Array<{ store: string; op: "get" | "getAll" | "delete" }>,
  ) {}
  open(name: string, version?: number): IdbOpenRequestLike {
    const req = this.inner.open(name, version);
    const wrapped: IdbOpenRequestLike = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: req.result,
      error: null,
    };
    queueMicrotask(() => {
      req.onupgradeneeded?.({});
      const db = req.result as unknown as {
        transaction(store: string): {
          objectStore(name: string): Record<string, (a?: unknown) => unknown>;
        };
      };
      const originalTransaction = db.transaction.bind(db);
      (db as unknown as { transaction: typeof originalTransaction }).transaction = ((
        store: string,
      ) => {
        const tx = originalTransaction(store);
        const os = tx.objectStore(store) as unknown as Record<string, (a?: unknown) => unknown>;
        for (const fault of this.faults) {
          if (fault.store !== store) continue;
          const op = os[fault.op];
          if (typeof op === "function") {
            os[fault.op] = () => {
              const fake = {
                onsuccess: null as ((e: unknown) => void) | null,
                onerror: null as ((e: unknown) => void) | null,
                result: undefined,
                error: new Error(`injected ${fault.op} failure on ${store}`),
              };
              queueMicrotask(() => fake.onerror?.({}));
              return fake;
            };
          }
        }
        return tx;
      }) as typeof originalTransaction;
      wrapped.onsuccess?.({});
    });
    return wrapped;
  }
}

function stoneColumn(cx: number, cz: number, surfaceY: number) {
  const column = new ChunkColumn({
    chunkX: cx,
    chunkZ: cz,
    sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
    minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
    registry: STATE_REGISTRY,
  });
  column.setBlockState(8, surfaceY, 8, STATE_REGISTRY.getDefaultState(BlockId.Stone));
  return column.serialize();
}

/** Seed full canonical coverage for `worldId` (5x5 chunks around the anchor). */
async function seedCoverage(factory: IdbFactoryLike, worldId: string, anchorCx = 0, anchorCz = 0): Promise<void> {
  const sections = new ChunkSectionRepository({ factory });
  await sections.open();
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      await sections.putColumn(worldId, stoneColumn(anchorCx + dx, anchorCz + dz, 63));
    }
  }
  sections.close();
}

async function seedMetadata(factory: IdbFactoryLike, worldId: string, generationVersion?: string): Promise<void> {
  const metadata = new WorldMetadataRepository({ factory });
  await metadata.open();
  await metadata.putMetadata({
    schemaVersion: 1,
    worldId,
    seed: SEED,
    dimensionId: "minecraft:overworld",
    minY: -64,
    height: 384,
    createdAt: 1000,
    updatedAt: 2000,
    ...(generationVersion !== undefined ? { generationVersion } : {}),
  });
  metadata.close();
}

async function seedPlayerState(factory: IdbFactoryLike, worldId: string, position: [number, number, number]): Promise<void> {
  const players = new PlayerStateRepository({ factory });
  await players.open();
  await players.putPlayerState({
    key: worldId,
    worldId,
    seed: SEED,
    position,
    yaw: 10,
    pitch: -5,
    inventory: { slots: [] },
    survival: { hunger: 20 },
    experience: { level: 0 },
  });
  players.close();
}

async function seedForeignWorld(factory: IdbFactoryLike): Promise<void> {
  await seedMetadata(factory, FOREIGN_ID, "wc-matrix-1");
  await seedCoverage(factory, FOREIGN_ID, 50, 50);
  await seedPlayerState(factory, FOREIGN_ID, [800, 64, 800]);
}

function makeFacade(factory: IdbFactoryLike): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null });
}

describe("GamePersistence startup assessment (257)", () => {
  it("fresh world (no records) → current baseline and current mode", async () => {
    const factory = createIdbFactoryMock();
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.generationBaseline).toBe("current");
    expect(result.startupAssessment.mode).toBe("current");
    expect(result.startupAssessment.reason).toBeNull();
    await p.dispose();
  });

  it("missing generationVersion + full canonical coverage → preserved", async () => {
    const factory = createIdbFactoryMock();
    await seedCoverage(factory, WORLD_ID);
    await seedMetadata(factory, WORLD_ID); // no generationVersion → legacy-unknown
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.generationBaseline).toBe("legacy-unknown");
    expect(result.startupAssessment.mode).toBe("preserved");
    expect(result.startupAssessment.reason).toBeNull();
    // Old header must NOT be rewritten to the current generator.
    const metaRepo = new WorldMetadataRepository({ factory });
    await metaRepo.open();
    const stored = await metaRepo.getMetadata(WORLD_ID);
    expect(stored?.generationVersion).toBeUndefined();
    await p.dispose();
  });

  it("missing generationVersion + partial coverage → recovery-required", async () => {
    const factory = createIdbFactoryMock();
    const sections = new ChunkSectionRepository({ factory });
    await sections.open();
    await sections.putColumn(WORLD_ID, stoneColumn(0, 0, 63));
    sections.close();
    await seedMetadata(factory, WORLD_ID);
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.generationBaseline).toBe("legacy-unknown");
    expect(result.startupAssessment.mode).toBe("recovery-required");
    expect(result.startupAssessment.reason).toBe("missing-canonical-coverage");
    expect(result.startupAssessment.diagnostics.missingCoverageColumns.length).toBeGreaterThan(0);
    await p.dispose();
  });

  it("future generationVersion + full coverage → unsupported but preserved (records intact)", async () => {
    const factory = createIdbFactoryMock();
    await seedCoverage(factory, WORLD_ID);
    await seedMetadata(factory, WORLD_ID, "future-worldgen-v99");
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.generationBaseline).toBe("unsupported");
    expect(result.startupAssessment.mode).toBe("preserved");
    const metaRepo = new WorldMetadataRepository({ factory });
    await metaRepo.open();
    const stored = await metaRepo.getMetadata(WORLD_ID);
    expect(stored?.generationVersion).toBe("future-worldgen-v99");
    await p.dispose();
  });

  it("future generationVersion + persisted player over absent coverage → recovery-required", async () => {
    const factory = createIdbFactoryMock();
    await seedMetadata(factory, WORLD_ID, "future-worldgen-v99");
    await seedPlayerState(factory, WORLD_ID, [8.5, 64, 8.5]);
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.generationBaseline).toBe("unsupported");
    expect(result.startupAssessment.mode).toBe("recovery-required");
    expect(result.startupAssessment.reason).toBe("missing-canonical-coverage");
    expect(result.startupAssessment.diagnostics.playerStatePresent).toBe(true);
    await p.dispose();
  });

  it("legacy-unknown coverage anchors at the persisted player chunk", async () => {
    const factory = createIdbFactoryMock();
    await seedCoverage(factory, WORLD_ID, 3, -3);
    await seedMetadata(factory, WORLD_ID);
    await seedPlayerState(factory, WORLD_ID, [3 * 16 + 0.5, 64, -3 * 16 + 0.5]);
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.startupAssessment.mode).toBe("preserved");
    expect(result.startupAssessment.diagnostics.coverageAnchor).toEqual({ chunkX: 3, chunkZ: -3 });
    await p.dispose();
  });

  it("metadata read failure → conservative storage-read-uncertain, never current", async () => {
    const inner = createIdbFactoryMock();
    await seedCoverage(inner, WORLD_ID);
    await seedMetadata(inner, WORLD_ID);
    const factory = new FaultFactory(inner, [{ store: "world-metadata", op: "get" }]);
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.startupAssessment.mode).toBe("recovery-required");
    expect(result.startupAssessment.reason).toBe("storage-read-uncertain");
    await p.dispose();
  });

  it("column enumeration failure → conservative storage-read-uncertain", async () => {
    const inner = createIdbFactoryMock();
    await seedCoverage(inner, WORLD_ID);
    await seedMetadata(inner, WORLD_ID);
    const factory = new FaultFactory(inner, [{ store: "chunk-sections", op: "getAll" }]);
    const p = makeFacade(factory);
    const result = await p.open();
    expect(result.startupAssessment.mode).toBe("recovery-required");
    expect(result.startupAssessment.reason).toBe("storage-read-uncertain");
    await p.dispose();
  });
});

describe("GamePersistence world-scoped reset + backup (257)", () => {
  it("reset deletes ONLY the selected world's records across every store", async () => {
    const factory = createIdbFactoryMock();
    await seedCoverage(factory, WORLD_ID);
    await seedMetadata(factory, WORLD_ID);
    await seedPlayerState(factory, WORLD_ID, [8.5, 64, 8.5]);
    await seedForeignWorld(factory);
    const p = makeFacade(factory);
    await p.open();
    const reset = await p.resetCurrentWorld();
    expect(reset.ok).toBe(true);

    const metadataRepo = new WorldMetadataRepository({ factory });
    await metadataRepo.open();
    expect(await metadataRepo.getMetadata(WORLD_ID)).toBeNull();
    expect(await metadataRepo.getMetadata(FOREIGN_ID)).not.toBeNull();
    metadataRepo.close();

    const sections = new ChunkSectionRepository({ factory });
    await sections.open();
    expect(await sections.listColumns(WORLD_ID)).toEqual([]);
    expect((await sections.listColumns(FOREIGN_ID)).length).toBe(25);
    sections.close();

    const players = new PlayerStateRepository({ factory });
    await players.open();
    expect(await players.getPlayerState(WORLD_ID)).toBeNull();
    expect(await players.getPlayerState(FOREIGN_ID)).not.toBeNull();
    players.close();

    // The facade is inert after reset: saves cannot resurrect records.
    expect(p.isResetCompleted).toBe(true);
    p.savePlayerState({
      version: 1,
      seed: SEED,
      player: { position: [0, 64, 0], yaw: 0, pitch: 0 },
      inventory: { slots: [] },
      survival: { hunger: 20 },
      experience: { level: 0 },
    });
    await p.flush();
    const playersAgain = new PlayerStateRepository({ factory });
    await playersAgain.open();
    expect(await playersAgain.getPlayerState(WORLD_ID)).toBeNull();
    playersAgain.close();
    await p.dispose();
  });

  it("reset failure is reported, never claimed as success", async () => {
    const inner = createIdbFactoryMock();
    await seedCoverage(inner, WORLD_ID);
    await seedMetadata(inner, WORLD_ID);
    await seedPlayerState(inner, WORLD_ID, [8.5, 64, 8.5]);
    const factory = new FaultFactory(inner, [{ store: "player-state", op: "delete" }]);
    const p = makeFacade(factory);
    await p.open();
    const reset = await p.resetCurrentWorld();
    expect(reset.ok).toBe(false);
    if (!reset.ok) {
      expect(reset.error).toContain("reset failed");
    }
    expect(p.isResetCompleted).toBe(false);
    await p.dispose();
  });

  it("exportWorldBackup returns a validated archive JSON and never mutates the world", async () => {
    const factory = createIdbFactoryMock();
    await seedCoverage(factory, WORLD_ID);
    await seedMetadata(factory, WORLD_ID);
    await seedPlayerState(factory, WORLD_ID, [8.5, 64, 8.5]);
    const p = makeFacade(factory);
    await p.open();
    const backup = await p.exportWorldBackup();
    expect(backup.ok).toBe(true);
    if (backup.ok) {
      const archive = JSON.parse(backup.json) as { worldId: string; columns: unknown[] };
      expect(archive.worldId).toBe(WORLD_ID);
      expect(archive.columns.length).toBe(25);
    }
    // Export is read-only: records still present afterwards.
    const players = new PlayerStateRepository({ factory });
    await players.open();
    expect(await players.getPlayerState(WORLD_ID)).not.toBeNull();
    players.close();
    await p.dispose();
  });

  it("exportWorldBackup failure is reported explicitly", async () => {
    const inner = createIdbFactoryMock();
    await seedCoverage(inner, WORLD_ID);
    const factory = new FaultFactory(inner, [{ store: "world-metadata", op: "get" }]);
    const p = makeFacade(factory);
    await p.open();
    const backup = await p.exportWorldBackup();
    expect(backup.ok).toBe(false);
    if (!backup.ok) {
      expect(backup.error).toContain("backup failed");
    }
    await p.dispose();
  });
});
