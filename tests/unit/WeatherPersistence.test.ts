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
  createDefaultWeatherState,
  deserializeWeatherState,
  serializeWeatherState,
} from "../../src/simulation/WeatherFramework";

/**
 * Persistence oracles for live weather integration (275): the weather state
 * flows through a NEW raw metadata namespace (`__weather__:<worldId>`,
 * 265–274 precedent) into IndexedDB and comes back validated through
 * `initialWeather` on reopen. Absent records boot null (Game boots the
 * default clear state); corrupt payloads degrade to null with a recorded
 * error; the 257 reset path deletes the record; export/import carries it as
 * an optional object-or-null field. Unlike sleep there is NO wake-on-boot
 * mutation: the persisted weather kind/timers round-trip field-for-field
 * (I-5). Strict shape validation stays owned by the 196
 * `deserializeWeatherState` reader — the facade stores the exact serialized
 * payload and re-validates it on load.
 */

const SEED = 275;

function thunderPayload(): unknown {
  return serializeWeatherState({ weather: "thunder", rainTime: 4321, thunderTime: 56 });
}

function rainPayload(): unknown {
  return serializeWeatherState({ weather: "rain", rainTime: 1234, thunderTime: 0 });
}

function openPersistence(factory: ReturnType<typeof createIdbFactoryMock>): GamePersistence {
  return new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("WeatherPersistence (275)", () => {
  it("save → reopen restores the state field-for-field (timers preserved, no boot mutation)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveWeather(thunderPayload());
    await settle();
    await p.flush();

    const reopened = openPersistence(factory);
    await reopened.open();
    // The persisted kind/timers survive a boot exactly (I-5); no wake-like reset.
    expect(reopened.initialWeather).toEqual({ weather: "thunder", rainTime: 4321, thunderTime: 56 });
    expect(serializeWeatherState(reopened.initialWeather!)).toEqual(thunderPayload());
  });

  it("absent records boot null (Game boots the default clear state)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    expect(p.initialWeather).toBeNull();
    expect(createDefaultWeatherState()).toEqual({ weather: "clear", rainTime: 0, thunderTime: 0 });
  });

  it.each([
    ["non-object payload", "thundering"],
    ["array payload", [{ version: 1, weather: "rain", rainTime: 1, thunderTime: 0 }]],
    ["wrong version", { version: 2, weather: "rain", rainTime: 1, thunderTime: 0 }],
    ["unknown weather", { version: 1, weather: "sunny", rainTime: 1, thunderTime: 0 }],
    ["non-integer rainTime", { version: 1, weather: "rain", rainTime: 1.5, thunderTime: 0 }],
    ["negative rainTime", { version: 1, weather: "rain", rainTime: -1, thunderTime: 0 }],
    ["non-integer thunderTime", { version: 1, weather: "thunder", rainTime: 1, thunderTime: 0.2 }],
    ["negative thunderTime", { version: 1, weather: "thunder", rainTime: 1, thunderTime: -1 }],
    ["unknown key", { version: 1, weather: "rain", rainTime: 1, thunderTime: 0, extra: true }],
    ["missing thunderTime", { version: 1, weather: "rain", rainTime: 1 }],
  ])("corrupt payload (%s) degrades to null with a recorded error", async (_label, payload) => {
    const factory = createIdbFactoryMock();
    const writer = openPersistence(factory);
    await writer.open();
    writer.saveWeather(payload);
    await settle();

    const reopened = openPersistence(factory);
    const result = await reopened.open();
    expect(reopened.initialWeather).toBeNull();
    expect(result.errors.some((e) => e.includes("load weather"))).toBe(true);
  });

  it("a later save overwrites an earlier one (last write wins)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();

    p.saveWeather(rainPayload());
    await settle();
    p.saveWeather(thunderPayload());
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialWeather).toEqual({ weather: "thunder", rainTime: 4321, thunderTime: 56 });
  });

  it("resetCurrentWorld deletes the record (fresh world boots defaults)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveWeather(thunderPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialWeather).toBeNull();
  });

  it("a save after resetCurrentWorld is inert (no record re-created)", async () => {
    const factory = createIdbFactoryMock();
    const p = openPersistence(factory);
    await p.open();
    p.saveWeather(thunderPayload());
    await settle();

    const reset = await p.resetCurrentWorld();
    expect(reset).toEqual({ ok: true });

    p.saveWeather(thunderPayload());
    await settle();

    const reopened = openPersistence(factory);
    await reopened.open();
    expect(reopened.initialWeather).toBeNull();
  });

  it("repository round-trips the raw payload and reports null when absent", async () => {
    const factory = createIdbFactoryMock();
    const repo = new WorldMetadataRepository({ factory });
    await repo.open();
    expect(await repo.getWeatherData("world-275")).toBeNull();
    const payload = thunderPayload();
    await repo.putWeatherData("world-275", payload);
    expect(await repo.getWeatherData("world-275")).toEqual(payload);
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
    expect(valid.weatherData ?? null).toBeNull();
  });

  it("archive rejects non-object weatherData", async () => {
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
    expect(() => validateWorldArchive({ ...base, weatherData: "thunder" })).toThrow(
      /weatherData must be an object or null/,
    );
    expect(() => validateWorldArchive({ ...base, weatherData: [1, 2, 3] })).toThrow(
      /weatherData must be an object or null/,
    );
  });

  it("export → import carries the weather state and reports it", async () => {
    const factory = createIdbFactoryMock();
    const worldId = `world-${SEED}`;
    const p = openPersistence(factory);
    await p.open();
    p.saveWeather(thunderPayload());
    await settle();

    const deps = {
      metadata: new WorldMetadataRepository({ factory }),
      chunkSections: new ChunkSectionRepository({ factory }),
      blockEntities: new BlockEntityRepository({ factory }),
      entities: new EntityRepository({ factory }),
      playerStates: new PlayerStateRepository({ factory }),
    };
    const exported = await new WorldArchiver(deps).exportWorld(worldId);
    expect(exported.weatherData).toEqual(thunderPayload());

    const targetFactory = createIdbFactoryMock();
    const target = {
      metadata: new WorldMetadataRepository({ factory: targetFactory }),
      chunkSections: new ChunkSectionRepository({ factory: targetFactory }),
      blockEntities: new BlockEntityRepository({ factory: targetFactory }),
      entities: new EntityRepository({ factory: targetFactory }),
      playerStates: new PlayerStateRepository({ factory: targetFactory }),
    };
    const report = await new WorldArchiver(target).importWorld(exported);
    expect(report.weatherDataImported).toBe(true);
    expect(await target.metadata.getWeatherData(worldId)).toEqual(thunderPayload());
    // The imported payload re-validates under the strict 196 reader.
    expect(deserializeWeatherState(thunderPayload())).toEqual({
      weather: "thunder",
      rainTime: 4321,
      thunderTime: 56,
    });
  });
});
