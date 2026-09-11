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
import { ItemEntityManager } from "../../src/simulation/ItemEntityManager";
import { XpOrbManager } from "../../src/simulation/XpOrbManager";
import { ITEM_ENTITY_TYPE_KEY } from "../../src/world/ItemEntity";
import { XP_ORB_TYPE_KEY } from "../../src/world/XpOrb";
import { createDefaultItemRegistry } from "../../src/inventory/ItemRegistry";
import { createResourceId } from "../../src/data/ResourceId";

/**
 * Persistence oracles for item/XP entity hardening (264): live
 * `serializeAll()` snapshots flow through NEW raw metadata namespaces
 * (`__itementities__:<worldId>`, `__xporbs__:<worldId>`, advancement-data
 * precedent from 263) into IndexedDB and come back envelope-validated through
 * `initialItemEntities` / `initialXpOrbs` on reopen. Absent records boot null
 * (Game boots empty managers); corrupt payloads degrade to null with a
 * recorded error; the 257 reset path deletes both records; export/import
 * carries them as optional array-or-null fields. Full semantic validation
 * (duplicate ids, registry, bounds) stays owned by the hardened
 * `deserializeAll` readers at Game hydrate time — the facade stores
 * envelope-valid payloads even when they are semantically hostile, and the
 * readers still throw.
 */

const SEED = 264;

const registry = createDefaultItemRegistry();
const STONE = registry.getByResourceId(createResourceId("minecraft", "stone")).id;
const DIRT = registry.getByResourceId(createResourceId("minecraft", "dirt")).id;

function itemPayload(): unknown[] {
  const m = new ItemEntityManager({ itemRegistry: registry });
  m.spawnItemEntity({ item: STONE, count: 3 }, 10.25, 20.75, 30.1, { vx: 0.05, vy: 0.05, vz: -0.02 });
  m.spawnItemEntity({ item: DIRT, count: 64 }, -5.5, 70, 8.25);
  m.tickItemEntities(0.5);
  return m.serializeAll();
}

function orbPayload(): unknown[] {
  const m = new XpOrbManager();
  m.spawnXpOrb(7, 1.25, 2.5, 3.75);
  m.spawnXpOrb(3, 4, 5, 6);
  return m.serializeAll();
}

function hostileDuplicateItemPayload(): unknown[] {
  const base = itemPayload()[0] as Record<string, unknown>;
  const data = base.data as Record<string, unknown>;
  const dup = { ...base, data: { ...data, id: 99 } };
  return [dup, { ...dup }];
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ItemXpPersistence (264)", () => {
  it("save → reopen restores validated snapshots field-for-field", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    const items = itemPayload();
    const orbs = orbPayload();
    p.saveItemEntities(items);
    p.saveXpOrbs(orbs);
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialItemEntities).toEqual(items);
    expect(reopened.initialXpOrbs).toEqual(orbs);
    // The reopened snapshots re-validate under the hardened readers.
    const im = new ItemEntityManager({ itemRegistry: registry });
    expect(im.deserializeAll(reopened.initialItemEntities!)).toBe(2);
    expect(im.getItemEntities().map((e) => [e.id, e.item, e.count])).toEqual([
      [0, STONE, 3],
      [1, DIRT, 64],
    ]);
    const om = new XpOrbManager();
    expect(om.deserializeAll(reopened.initialXpOrbs!)).toBe(2);
    expect(om.getXpOrbs().map((o) => [o.id, o.value])).toEqual([
      [0, 7],
      [1, 3],
    ]);
  });

  it("absent records boot null (Game boots empty managers)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialItemEntities).toBeNull();
    expect(p.initialXpOrbs).toBeNull();
  });

  it.each([
    ["non-array itementities", "items", { version: 1 }],
    [
      "envelope-invalid itementities entry",
      "items",
      [{ schemaVersion: 0, typeKey: ITEM_ENTITY_TYPE_KEY, x: 0, y: 0, z: 0, data: {} }],
    ],
    ["non-array xporbs", "orbs", { version: 1 }],
    [
      "envelope-invalid xporbs entry",
      "orbs",
      [{ schemaVersion: 1, typeKey: XP_ORB_TYPE_KEY, x: 0, y: 0, z: 0 }],
    ],
  ])("corrupt payload (%s) degrades to null with a recorded error", async (_label, which, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    if (which === "items") writer.saveItemEntities(payload);
    else writer.saveXpOrbs(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    if (which === "items") {
      expect(reopened.initialItemEntities).toBeNull();
      expect(result.errors.some((e) => e.includes("load itementities"))).toBe(true);
    } else {
      expect(reopened.initialXpOrbs).toBeNull();
      expect(result.errors.some((e) => e.includes("load xporbs"))).toBe(true);
    }
  });

  it("a semantically hostile batch passes the envelope layer but still throws at the hardened reader", async () => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveItemEntities(hostileDuplicateItemPayload());
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    // Envelope-valid: the facade stores it; semantic validation is the reader's job.
    expect(reopened.initialItemEntities).toHaveLength(2);
    expect(() =>
      new ItemEntityManager({ itemRegistry: registry }).deserializeAll(reopened.initialItemEntities!),
    ).toThrow(/duplicate item-entity id 99 at index 1/);
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveItemEntities(itemPayload());
    await settle();
    p.saveItemEntities([]);
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialItemEntities).toEqual([]);
  });

  it("resetCurrentWorld deletes both records (fresh world boots empty)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveItemEntities(itemPayload());
    p.saveXpOrbs(orbPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialItemEntities).toBeNull();
    expect(reopened.initialXpOrbs).toBeNull();
  });

  it("repository round-trips the raw payloads and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getItemEntityData("world-264")).toBeNull();
    expect(await repo.getXpOrbData("world-264")).toBeNull();
    const items = itemPayload();
    const orbs = orbPayload();
    await repo.putItemEntityData("world-264", items);
    await repo.putXpOrbData("world-264", orbs);
    expect(await repo.getItemEntityData("world-264")).toEqual(items);
    expect(await repo.getXpOrbData("world-264")).toEqual(orbs);
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
    expect(valid.itemEntityData ?? null).toBeNull();
    expect(valid.xpOrbData ?? null).toBeNull();
  });

  it("archive rejects non-array and envelope-invalid new fields", async () => {
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
    expect(() => validateWorldArchive({ ...base, itemEntityData: { version: 1 } })).toThrow(
      /itemEntityData must be an array or null/,
    );
    expect(() =>
      validateWorldArchive({
        ...base,
        xpOrbData: [{ schemaVersion: 1, typeKey: XP_ORB_TYPE_KEY, x: 0, y: 0, z: 0 }],
      }),
    ).toThrow();
  });

  it("export → import carries both snapshots and reports them", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveItemEntities(itemPayload());
    p.saveXpOrbs(orbPayload());
    await settle();

    const deps = {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld(worldId);
    expect(exported.itemEntityData).toEqual(itemPayload());
    expect(exported.xpOrbData).toEqual(orbPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.itemEntityDataImported).toBe(true);
    expect(report.xpOrbDataImported).toBe(true);
    expect(await target.metadata.getItemEntityData(worldId)).toEqual(itemPayload());
    expect(await target.metadata.getXpOrbData(worldId)).toEqual(orbPayload());
  });
});
