import { describe, expect, it } from "vitest";
import { GamePersistence } from "../../src/storage/GamePersistence";
import { createIdbFactoryMock } from "./IdbFactoryMock";
import type { SerializedBlockEntity } from "../../src/storage/BlockEntityRecord";
import { BLOCK_ENTITY_RECORD_VERSION } from "../../src/storage/BlockEntityRecord";
import {
  POTION_CONTENTS_KEY,
  serializeBrewingState,
  createBrewingState,
} from "../../src/world/BrewingStandBlockEntity";
import { createPotionContents } from "../../src/data/PotionItemData";
import {
  AWKWARD_BASE,
  BLAZE_POWDER_ITEM,
  POTION_BOTTLE_ITEM,
  REDSTONE_ITEM,
} from "../../src/inventory/BrewingRecipes";
import { BREWING_STAND_TYPE_KEY } from "../../src/world/BrewingStandBlockEntity";

/**
 * Persistence oracles for the live brewing wiring (260): brewing records flow
 * through the UNCHANGED facade (same 036 envelope, same chunk dirty units as
 * the 251 furnace path) into IndexedDB and come back through
 * `initialBlockEntities` / `loadBlockEntities` on reopen — bottle contents and
 * timers intact. No stored-format change is introduced or needed.
 */

const SEED = 11;

function brewingRecord(x: number, y: number, z: number): SerializedBlockEntity {
  const state = {
    ...createBrewingState(),
    bottle: {
      item: POTION_BOTTLE_ITEM,
      count: 1,
      maxStack: 64,
      components: {
        [POTION_CONTENTS_KEY]: createPotionContents({
          base: AWKWARD_BASE,
          customEffects: [{ typeId: "minecraft:effect/speed", duration: 480, amplifier: 1 }],
        }),
      },
    },
    fuel: { item: BLAZE_POWDER_ITEM, count: 2, maxStack: 64 },
    ingredient: { item: REDSTONE_ITEM, count: 3, maxStack: 64 },
    brewTime: 100,
    brewTimeTotal: 400,
    fuelBurnTime: 600,
    fuelBurnTimeTotal: 1200,
  };
  return {
    schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
    typeKey: BREWING_STAND_TYPE_KEY,
    x,
    y,
    z,
    data: serializeBrewingState(state),
  };
}

describe("GamePersistence brewing records (260)", () => {
  it("save → flush → reopen restores brewing rows with contents and timers", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();

    p.saveBlockEntities(2, -3, [brewingRecord(40, 64, -48), brewingRecord(41, 64, -47)]);
    await p.flush();

    const reopened = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    const result = await reopened.open();
    expect(result.initialBlockEntities).toHaveLength(2);
    const restored = result.initialBlockEntities.find((r) => r.x === 40)!;
    expect(restored.typeKey).toBe(BREWING_STAND_TYPE_KEY);
    const data = restored.data! as {
      bottle: { components: Record<string, { customEffects: Array<{ typeId: string }> }> };
      brewTime: number;
      fuelBurnTime: number;
    };
    expect(data.bottle.components[POTION_CONTENTS_KEY]!.customEffects).toEqual([
      { typeId: "minecraft:effect/speed", duration: 480, amplifier: 1 },
    ]);
    expect(data.brewTime).toBe(100);
    expect(data.fuelBurnTime).toBe(600);

    const chunk = await reopened.loadBlockEntities(2, -3);
    expect(chunk).toHaveLength(2);
  });

  it("an empty snapshot overwrites stale rows (stand broken, no resurrection)", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();

    p.saveBlockEntities(0, 0, [brewingRecord(5, 64, 7)]);
    await p.flush();

    // The stand was broken: the host persists the now-empty snapshot.
    p.saveBlockEntities(0, 0, []);
    await p.flush();

    const reopened = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    const result = await reopened.open();
    expect(result.initialBlockEntities).toHaveLength(0);
    expect(await reopened.loadBlockEntities(0, 0)).toHaveLength(0);
  });

  it("furnace and brewing rows coexist in one chunk snapshot", async () => {
    const factory = createIdbFactoryMock();
    const p = new GamePersistence({ seed: SEED, factory, legacyStorage: null, flushTarget: null });
    await p.open();

    const furnaceRow: SerializedBlockEntity = {
      schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
      typeKey: "furnace",
      x: 1,
      y: 64,
      z: 1,
      data: { bottle: undefined },
    };
    p.saveBlockEntities(0, 0, [brewingRecord(5, 64, 7), furnaceRow]);
    await p.flush();

    const reopened = new GamePersistence({ seed: SEED, factory, legacyStorage: null });
    const result = await reopened.open();
    expect(result.initialBlockEntities.map((r) => r.typeKey).sort()).toEqual([
      "brewing_stand",
      "furnace",
    ]);
  });
});
