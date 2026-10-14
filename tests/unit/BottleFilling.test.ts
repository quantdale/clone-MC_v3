import { describe, it, expect } from 'vitest';
import {
  bottleFillDecision,
  createWaterBottleContents,
  fluidRaycast,
  isWaterBottleContents,
} from '../../src/simulation/BottleFilling';
import { potionContentsComponentType, createPotionContents } from '../../src/data/PotionItemData';
import { WATER_BASE } from '../../src/inventory/BrewingRecipes';
import { BlockId } from '../../src/world/BlockRegistry';

/**
 * Glass bottle filling (298): the fluid raycast stops at the first non-air
 * cell (vanilla SOURCE_ONLY with no live flowing water) and the decision
 * mirrors vanilla createFilledResult with the documented no-room refusal.
 */

const BLOCKS = { air: BlockId.Air, water: BlockId.Water };

function world(cells: Record<string, number>) {
  return (x: number, y: number, z: number): number => cells[`${x},${y},${z}`] ?? BlockId.Air;
}

const DOWN = { x: 0, y: -1, z: 0 };
const EYE = { x: 0.5, y: 10.5, z: 0.5 };

describe('fluidRaycast (298)', () => {
  it('hits water as the first non-air cell within reach', () => {
    const hit = fluidRaycast(world({ '0,7,0': BlockId.Water, '0,6,0': BlockId.Stone }), BLOCKS, EYE, DOWN, 5);
    expect(hit).toMatchObject({ x: 0, y: 7, z: 0, blockId: BlockId.Water, water: true });
    expect(hit!.distance).toBeCloseTo(2.5, 5);
  });

  it('a solid block in front of the water blocks the fill', () => {
    const hit = fluidRaycast(world({ '0,8,0': BlockId.Glass, '0,7,0': BlockId.Water }), BLOCKS, EYE, DOWN, 5);
    expect(hit).toMatchObject({ y: 8, blockId: BlockId.Glass, water: false });
  });

  it('water beyond reach is not hit', () => {
    expect(fluidRaycast(world({ '0,4,0': BlockId.Water }), BLOCKS, EYE, DOWN, 5)).toBeNull();
    expect(fluidRaycast(world({ '0,5,0': BlockId.Water }), BLOCKS, EYE, DOWN, 5)).toMatchObject({ water: true });
  });

  it('only air → null; invalid input → null', () => {
    expect(fluidRaycast(world({}), BLOCKS, EYE, DOWN, 5)).toBeNull();
    expect(fluidRaycast(world({ '0,7,0': BlockId.Water }), BLOCKS, EYE, { x: 0, y: 0, z: 0 }, 5)).toBeNull();
    expect(fluidRaycast(world({ '0,7,0': BlockId.Water }), BLOCKS, { x: NaN, y: 0, z: 0 }, DOWN, 5)).toBeNull();
  });

  it('diagonal rays report the first non-air cell they cross', () => {
    const hit = fluidRaycast(world({ '2,10,0': BlockId.Water }), BLOCKS, EYE, { x: 1, y: 0, z: 0 }, 5);
    expect(hit).toMatchObject({ x: 2, y: 10, z: 0, water: true });
  });
});

describe('water bottle contents (298)', () => {
  it('is base water, NORMAL, no effects, and valid under the read guard', () => {
    const c = createWaterBottleContents();
    expect(c).toEqual({ base: WATER_BASE, kind: 'NORMAL', customEffects: [] });
    expect(potionContentsComponentType.validate(c)).toBe(true);
    expect(isWaterBottleContents(c)).toBe(true);
  });

  it('isWaterBottleContents rejects other potions', () => {
    expect(isWaterBottleContents(null)).toBe(false);
    expect(isWaterBottleContents(createPotionContents({ base: 'minecraft:potion/awkward', customEffects: [] }))).toBe(false);
    expect(isWaterBottleContents(createPotionContents({ base: WATER_BASE, kind: 'SPLASH', customEffects: [] }))).toBe(false);
    expect(
      isWaterBottleContents(
        createPotionContents({ base: WATER_BASE, customEffects: [{ typeId: 'minecraft:effect/speed', duration: 1, amplifier: 0 }] }),
      ),
    ).toBe(false);
  });
});

describe('bottleFillDecision (298)', () => {
  const base = {
    canInteract: true,
    deathScreenOpen: false,
    depletesItems: true,
    stackCount: 3,
    isGlassBottle: true,
    hitWater: true,
    canInsertWaterBottle: true,
    hasWaterBottle: false,
  };

  it('survival: consumes one bottle and inserts the water bottle', () => {
    expect(bottleFillDecision(base)).toEqual({ fill: true, consumeBottle: true, replaceSlot: false });
  });

  it('survival last bottle: the slot becomes the water bottle (room not needed)', () => {
    expect(bottleFillDecision({ ...base, stackCount: 1, canInsertWaterBottle: false })).toEqual({
      fill: true,
      consumeBottle: true,
      replaceSlot: true,
    });
  });

  it('survival with no room and bottles left refuses (component-safe divergence)', () => {
    expect(bottleFillDecision({ ...base, canInsertWaterBottle: false })).toEqual({ fill: false, reason: 'NO_ROOM' });
  });

  it('survival does not care about an already-held water bottle', () => {
    expect(bottleFillDecision({ ...base, hasWaterBottle: true }).fill).toBe(true);
  });

  it('creative keeps the bottle and never duplicates a held water bottle', () => {
    const creative = { ...base, depletesItems: false };
    expect(bottleFillDecision(creative)).toEqual({ fill: true, consumeBottle: false, replaceSlot: false });
    expect(bottleFillDecision({ ...creative, stackCount: 1 })).toEqual({ fill: true, consumeBottle: false, replaceSlot: false });
    expect(bottleFillDecision({ ...creative, hasWaterBottle: true })).toEqual({ fill: false, reason: 'ALREADY_HELD' });
    expect(bottleFillDecision({ ...creative, canInsertWaterBottle: false })).toEqual({ fill: false, reason: 'NO_ROOM' });
  });

  it('refusals in vanilla order', () => {
    expect(bottleFillDecision({ ...base, canInteract: false })).toEqual({ fill: false, reason: 'NO_INTERACT' });
    expect(bottleFillDecision({ ...base, deathScreenOpen: true })).toEqual({ fill: false, reason: 'DEATH_SCREEN' });
    expect(bottleFillDecision({ ...base, stackCount: 0 })).toEqual({ fill: false, reason: 'EMPTY_HAND' });
    expect(bottleFillDecision({ ...base, isGlassBottle: false })).toEqual({ fill: false, reason: 'NOT_BOTTLE' });
    expect(bottleFillDecision({ ...base, hitWater: false })).toEqual({ fill: false, reason: 'NO_WATER' });
  });
});
