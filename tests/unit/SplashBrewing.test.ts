import { describe, it, expect } from 'vitest';
import {
  AWKWARD_BASE,
  BLAZE_POWDER_BURN_TICKS,
  BLAZE_POWDER_ITEM,
  DEFAULT_BREW_TICKS,
  GUNPOWDER_ITEM,
  POTION_BOTTLE_ITEM,
  REDSTONE_ITEM,
  WATER_BASE,
  createDefaultBrewingContext,
} from '../../src/inventory/BrewingRecipes';
import {
  BREWING_STAND_BLOCK_ID,
  BREWING_STAND_TYPE_KEY,
  POTION_CONTENTS_KEY,
  createBrewingState,
  deserializeBrewingState,
  serializeBrewingState,
  tickBrewing,
  type BrewingState,
} from '../../src/world/BrewingStandBlockEntity';
import {
  createPotionContents,
  type PotionContents,
  type PotionEffectData,
  type PotionKind,
} from '../../src/data/PotionItemData';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';
import {
  LiveBlockEntityHost,
  type HostWorldView,
} from '../../src/engine/LiveBlockEntityHost';
import type { SerializedBlockEntity } from '../../src/storage/BlockEntityRecord';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';

/**
 * Splash brewing (297): potion + gunpowder -> the SPLASH variant of the same
 * potion_contents in the real 123 engine with the default context; every other
 * recipe preserves the bottle kind; fuel/time rules unchanged; the kind rides
 * the brewing envelope and the live host persist/hydrate path.
 */

const CTX = createDefaultBrewingContext();
const SPEED: PotionEffectData = { typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 };

function bottle(kind: PotionKind, base: string | undefined, effects: readonly PotionEffectData[]): MenuSlot {
  return {
    item: POTION_BOTTLE_ITEM,
    count: 1,
    maxStack: 64,
    components: { [POTION_CONTENTS_KEY]: createPotionContents({ base, kind, customEffects: effects }) },
  };
}

function slot(item: string | null, count: number): MenuSlot {
  return { item, count, maxStack: 64 };
}

function stand(b: MenuSlot, ingredient: string, fuelCount = 1): BrewingState {
  return { ...createBrewingState(), bottle: b, fuel: slot(BLAZE_POWDER_ITEM, fuelCount), ingredient: slot(ingredient, 1) };
}

function contentsOf(state: BrewingState): PotionContents {
  return state.bottle.components?.[POTION_CONTENTS_KEY] as PotionContents;
}

describe('gunpowder recipe (297)', () => {
  it('matches any NORMAL potion (any base, incl. absent) with a kind-only SPLASH output', () => {
    for (const base of [undefined, WATER_BASE, AWKWARD_BASE, 'minecraft:potion/mundane', 'x:unknown']) {
      expect(CTX.match(base, GUNPOWDER_ITEM, 'NORMAL')).toEqual({ kind: 'SPLASH' });
    }
    expect(CTX.match(AWKWARD_BASE, GUNPOWDER_ITEM)).toEqual({ kind: 'SPLASH' }); // absent kind = NORMAL
  });

  it('never matches an already SPLASH or LINGERING potion', () => {
    expect(CTX.match(AWKWARD_BASE, GUNPOWDER_ITEM, 'SPLASH')).toBeNull();
    expect(CTX.match(AWKWARD_BASE, GUNPOWDER_ITEM, 'LINGERING')).toBeNull();
  });

  it('leaves the starter table unchanged and kind-independent', () => {
    expect(CTX.match(AWKWARD_BASE, REDSTONE_ITEM, 'NORMAL')).toEqual({ customEffects: [SPEED] });
    expect(CTX.match(AWKWARD_BASE, REDSTONE_ITEM, 'SPLASH')).toEqual({ customEffects: [SPEED] });
    expect(CTX.match(AWKWARD_BASE, REDSTONE_ITEM)).toEqual({ customEffects: [SPEED] });
    expect(CTX.match(AWKWARD_BASE, 'minecraft:stick', 'NORMAL')).toBeNull();
    expect(CTX.fuelBurnTicks(GUNPOWDER_ITEM)).toBe(0); // gunpowder is not a fuel
    expect(CTX.fuelBurnTicks(BLAZE_POWDER_ITEM)).toBe(BLAZE_POWDER_BURN_TICKS);
    expect(CTX.brewTicks()).toBe(DEFAULT_BREW_TICKS);
  });

  it('resource id matches the live gunpowder item', () => {
    const def = createDefaultItemRegistry().getByLegacyId(ItemId.Gunpowder)!;
    expect(`${def.resourceId.namespace}:${def.resourceId.path}`).toBe(GUNPOWDER_ITEM);
  });
});

describe('splash conversion in the stand (297)', () => {
  it('speed potion + gunpowder -> SPLASH speed with base and effects preserved after 400 ticks', () => {
    const start = stand(bottle('NORMAL', AWKWARD_BASE, [SPEED]), GUNPOWDER_ITEM);
    const mid = tickBrewing(start, CTX, DEFAULT_BREW_TICKS - 1);
    expect(contentsOf(mid).kind).toBe('NORMAL');
    expect(mid.brewTime).toBe(DEFAULT_BREW_TICKS - 1);
    const done = tickBrewing(mid, CTX, 1);
    expect(contentsOf(done)).toEqual({ base: AWKWARD_BASE, kind: 'SPLASH', customEffects: [SPEED] });
    expect(done.ingredient).toEqual(slot(null, 0)); // exactly one gunpowder consumed
    expect(done.fuel).toEqual(slot(null, 0)); // one blaze powder lit
    expect(done.fuelBurnTime).toBe(BLAZE_POWDER_BURN_TICKS - DEFAULT_BREW_TICKS);
    expect(done.brewTime).toBe(0);
  });

  it('preserves multiple effects, durations and amplifiers exactly', () => {
    const effects: PotionEffectData[] = [
      { typeId: 'minecraft:effect/strength', duration: 180, amplifier: 1 },
      { typeId: 'minecraft:effect/speed', duration: 90, amplifier: 0 },
    ];
    const done = tickBrewing(stand(bottle('NORMAL', 'x:custom', effects), GUNPOWDER_ITEM), CTX, DEFAULT_BREW_TICKS);
    expect(contentsOf(done)).toEqual({ base: 'x:custom', kind: 'SPLASH', customEffects: effects });
  });

  it('a SPLASH awkward bottle + redstone stays SPLASH (kind preserved by other recipes)', () => {
    const awkward = [{ typeId: 'minecraft:effect/speed', duration: 0, amplifier: 0 }];
    const done = tickBrewing(stand(bottle('SPLASH', AWKWARD_BASE, awkward), REDSTONE_ITEM), CTX, DEFAULT_BREW_TICKS);
    expect(contentsOf(done)).toEqual({ base: AWKWARD_BASE, kind: 'SPLASH', customEffects: [SPEED] });
  });

  it('a NORMAL awkward bottle + redstone stays NORMAL', () => {
    const awkward = [{ typeId: 'minecraft:effect/speed', duration: 0, amplifier: 0 }];
    const done = tickBrewing(stand(bottle('NORMAL', AWKWARD_BASE, awkward), REDSTONE_ITEM), CTX, DEFAULT_BREW_TICKS);
    expect(contentsOf(done).kind).toBe('NORMAL');
  });

  it('awkward -> gunpowder -> redstone yields SPLASH speed (either order ends splash)', () => {
    const awkward = [{ typeId: 'minecraft:effect/speed', duration: 0, amplifier: 0 }];
    let s = tickBrewing(stand(bottle('NORMAL', AWKWARD_BASE, awkward), GUNPOWDER_ITEM, 2), CTX, DEFAULT_BREW_TICKS);
    expect(contentsOf(s).kind).toBe('SPLASH');
    s = { ...s, ingredient: slot(REDSTONE_ITEM, 1) };
    s = tickBrewing(s, CTX, DEFAULT_BREW_TICKS);
    expect(contentsOf(s)).toEqual({ base: AWKWARD_BASE, kind: 'SPLASH', customEffects: [SPEED] });
    expect(s.fuel).toEqual(slot(BLAZE_POWDER_ITEM, 1)); // one powder covered both brews (1200 ticks)
  });

  it('SPLASH bottle + gunpowder: no brew, no fuel lit, nothing consumed', () => {
    const start = stand(bottle('SPLASH', AWKWARD_BASE, [SPEED]), GUNPOWDER_ITEM);
    const after = tickBrewing(start, CTX, DEFAULT_BREW_TICKS);
    expect(after).toEqual(start);
  });

  it('LINGERING bottle + gunpowder: no brew', () => {
    const start = stand(bottle('LINGERING', AWKWARD_BASE, [SPEED]), GUNPOWDER_ITEM);
    expect(tickBrewing(start, CTX, 10)).toEqual(start);
  });

  it('no fuel -> no progress (existing fuel rule)', () => {
    const start: BrewingState = { ...stand(bottle('NORMAL', AWKWARD_BASE, [SPEED]), GUNPOWDER_ITEM), fuel: slot(null, 0) };
    expect(tickBrewing(start, CTX, DEFAULT_BREW_TICKS)).toEqual(start);
  });
});

describe('splash brewing persistence (297)', () => {
  it('the SPLASH kind survives the brewing envelope round-trip', () => {
    const done = tickBrewing(stand(bottle('NORMAL', AWKWARD_BASE, [SPEED]), GUNPOWDER_ITEM), CTX, DEFAULT_BREW_TICKS);
    const json = JSON.parse(JSON.stringify(serializeBrewingState(done)));
    const restored = deserializeBrewingState(json);
    expect(restored).toEqual(done);
    expect(contentsOf(restored).kind).toBe('SPLASH');
  });

  it('a mid-brew gunpowder state round-trips and finishes identically', () => {
    const mid = tickBrewing(stand(bottle('NORMAL', AWKWARD_BASE, [SPEED]), GUNPOWDER_ITEM), CTX, 150);
    const restored = deserializeBrewingState(JSON.parse(JSON.stringify(serializeBrewingState(mid))));
    expect(tickBrewing(restored, CTX, 250)).toEqual(tickBrewing(mid, CTX, 250));
  });

  it('live host: the brewed SPLASH bottle is persisted and rehydrates in a fresh host', () => {
    const X = 5;
    const Y = 64;
    const Z = -7;
    const blocks = new Map<string, number>([[`${X},${Y},${Z}`, BREWING_STAND_BLOCK_ID]]);
    const world: HostWorldView = {
      getBlock: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 0,
      isChunkSimulating: (cx, cz) => cx === 0 && cz === -1,
    };
    const saved = new Map<string, SerializedBlockEntity[]>();
    const persistence = {
      saveBlockEntities: (cx: number, cz: number, entities: SerializedBlockEntity[]) => {
        saved.set(`${cx},${cz}`, entities);
      },
    };
    const deps = {
      world,
      persistence,
      furnaceContext: { fuelBurnTicks: () => 0, cookTicks: () => 0, resultOf: () => null, experienceOf: () => 0 },
      brewingContext: CTX,
      onQuarantined: () => undefined,
    };
    const host = new LiveBlockEntityHost(deps);
    host.placeBrewing(X, Y, Z);
    host.applyBrewingMenuSlots(X, Y, Z, {
      bottle: bottle('NORMAL', AWKWARD_BASE, [SPEED]),
      fuel: slot(BLAZE_POWDER_ITEM, 1),
      ingredient: slot(GUNPOWDER_ITEM, 1),
    });
    for (let i = 0; i < DEFAULT_BREW_TICKS; i++) host.tickBrewingStands();
    const live = host.getBrewingState(X, Y, Z)!;
    expect(contentsOf(live).kind).toBe('SPLASH');

    const records = saved.get('0,-1')!;
    expect(records).toHaveLength(1);
    expect(records[0]!.typeKey).toBe(BREWING_STAND_TYPE_KEY);
    const persisted = deserializeBrewingState(JSON.parse(JSON.stringify(records[0]!.data)));
    expect(contentsOf(persisted)).toEqual({ base: AWKWARD_BASE, kind: 'SPLASH', customEffects: [SPEED] });

    const fresh = new LiveBlockEntityHost({ ...deps, persistence: null });
    expect(fresh.hydrate(JSON.parse(JSON.stringify(records)))).toEqual({ hydrated: 1, quarantined: 0 });
    expect(fresh.getBrewingState(X, Y, Z)).toEqual(live);
  });
});
