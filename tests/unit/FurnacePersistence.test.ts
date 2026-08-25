import { describe, expect, it } from "vitest";
import { GamePersistence } from "../../src/storage/GamePersistence";
import { createIdbFactoryMock } from "./IdbFactoryMock";
import type { IdbFactoryLike } from "../../src/storage/WorldMetadataRepository";
import type { SerializedBlockEntity } from "../../src/storage/BlockEntityRecord";
import { serializeFurnaceState, createFurnaceState } from "../../src/world/FurnaceBlockEntity";

/**
 * Persistence oracles for the live furnace wiring (251): block-entity records
 * flow through the facade's full-snapshot dirty units into IndexedDB and come
 * back through `initialBlockEntities` / `loadBlockEntities` on reopen.
 */

const SEED = 11;

function furnaceRecord(x: number, y: number, z: number): SerializedBlockEntity {
  const state = {
    ...createFurnaceState(),
    input: { item: "minecraft:sand", count: 3, maxStack: 64 },
    fuel: { item: "minecraft:coal", count: 1, maxStack: 64 },
    burnTime: 4,
    burnTimeTotal: 1600,
    smeltTime: 120,
    smeltTimeTotal: 200,
    xp: 0.35,
  };
  return {
    schemaVersion: 1,
    typeKey: "furnace",
    x,
    y,
    z,
    data: serializeFurnaceState(state),
  };
}

describe("GamePersistence block entities (251)", () => {
  it("save → flush → reopen restores every record through initialBlockEntities", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();

    p.saveBlockEntities(2, -3, [furnaceRecord(40, 64, -48), furnaceRecord(41, 64, -47)]);
    await p.flush();

    const reopened = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    const result = await reopened.open();
    expect(result.initialBlockEntities).toHaveLength(2);
    expect(result.initialBlockEntities.map((r) => `${r.x},${r.y},${r.z}`).sort()).toEqual([
      "40,64,-48",
      "41,64,-47",
    ]);

    // Per-chunk lookup agrees with the bulk load.
    const chunk = await reopened.loadBlockEntities(2, -3);
    expect(chunk).toHaveLength(2);
  });

  it("an empty snapshot overwrites stale rows (last furnace removed)", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();

    p.saveBlockEntities(0, 0, [furnaceRecord(5, 64, 7)]);
    await p.flush();

    // The furnace was broken: the host persists the now-empty snapshot.
    p.saveBlockEntities(0, 0, []);
    await p.flush();

    const reopened = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    const result = await reopened.open();
    expect(result.initialBlockEntities).toHaveLength(0);
    expect(await reopened.loadBlockEntities(0, 0)).toHaveLength(0);
  });

  it("re-marking a chunk before the write drains keeps only the newest snapshot", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();

    // Two marks race ahead of any drain: dedup by key keeps one pending unit,
    // and its payload must be the newer snapshot (edit-while-write-in-flight).
    p.saveBlockEntities(1, 1, [furnaceRecord(20, 64, 20)]);
    p.saveBlockEntities(1, 1, [furnaceRecord(21, 64, 21)]);
    await p.flush();

    const reopened = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    await reopened.open();
    const chunk = await reopened.loadBlockEntities(1, 1);
    expect(chunk).toHaveLength(1);
    expect(chunk![0]!.x).toBe(21);
  });

  it("loadBlockEntities returns null (never throws) for chunks never written", async () => {
    const factory: IdbFactoryLike = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();
    expect(await p.loadBlockEntities(9, 9)).toBeNull();
  });

  it("listAllBlockEntities aggregates every chunk's records across the world", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();
    expect(await p.listAllBlockEntities()).toEqual([]);

    p.saveBlockEntities(2, -3, [furnaceRecord(40, 64, -48), furnaceRecord(41, 64, -47)]);
    p.saveBlockEntities(0, 0, [furnaceRecord(5, 64, 7)]);
    await p.flush();

    const all = await p.listAllBlockEntities();
    expect(all.map((r) => `${r.x},${r.y},${r.z}`).sort()).toEqual(["40,64,-48", "41,64,-47", "5,64,7"]);

    // After removal the empty snapshot drops the chunk from the listing.
    p.saveBlockEntities(0, 0, []);
    await p.flush();
    expect((await p.listAllBlockEntities()).map((r) => `${r.x},${r.y},${r.z}`).sort()).toEqual([
      "40,64,-48",
      "41,64,-47",
    ]);
  });

  it("saveBlockEntities after dispose is a no-op (no ghost writes)", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();
    await p.dispose();
    expect(() => p.saveBlockEntities(0, 0, [furnaceRecord(1, 1, 1)])).not.toThrow();
  });
});
