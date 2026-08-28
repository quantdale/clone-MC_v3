import { describe, expect, it } from 'vitest';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';
import {
  createOffersForProfession,
  createVillagerTradeState,
  canAcceptTrade,
  applyTrade,
  restock,
  buildTradeMenu,
  VILLAGER_MAX_LEVEL,
  XP_PER_VILLAGER_LEVEL,
  type TradeItem,
} from '../../src/simulation/VillagerTrading';

const item = (key: string, count: number): TradeItem => ({ item: key, count });

describe('createOffersForProfession', () => {
  it('returns only level-1 offers at level 1, each with full uses', () => {
    const offers = createOffersForProfession('farmer', 1);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.unlockLevel).toBe(1);
      expect(o.usesRemaining).toBe(o.maxUses);
    }
  });

  it('unlocks strictly more offers at a higher level', () => {
    const atOne = createOffersForProfession('farmer', 1);
    const atThree = createOffersForProfession('farmer', 3);
    expect(atThree.length).toBeGreaterThan(atOne.length);
    for (const o of atThree) {
      expect(o.unlockLevel).toBeLessThanOrEqual(3);
    }
  });

  it('returns an empty array for an unknown profession without throwing', () => {
    expect(createOffersForProfession('not_a_profession', 5)).toEqual([]);
  });

  it('returns fresh objects each call (no shared mutable state)', () => {
    const a = createOffersForProfession('farmer', 3);
    const b = createOffersForProfession('farmer', 3);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0]).toEqual(b[0]);
  });

  it('covers every default profession', () => {
    for (const key of ['farmer', 'librarian', 'weaponsmith']) {
      expect(createOffersForProfession(key, VILLAGER_MAX_LEVEL).length).toBeGreaterThan(0);
    }
  });
});

describe('canAcceptTrade', () => {
  const base = createOffersForProfession('farmer', 1)[0]!; // wheat×20 -> emerald×1

  it('accepts a sufficient offering', () => {
    expect(canAcceptTrade(base, item(base.inputA.item, base.inputA.count), null)).toBe(true);
  });

  it('accepts an over-sufficient offering', () => {
    expect(canAcceptTrade(base, item(base.inputA.item, base.inputA.count + 5), null)).toBe(true);
  });

  it('rejects an insufficient count', () => {
    expect(canAcceptTrade(base, item(base.inputA.item, base.inputA.count - 1), null)).toBe(false);
  });

  it('rejects a wrong item', () => {
    expect(canAcceptTrade(base, item('paper', base.inputA.count), null)).toBe(false);
  });

  it('rejects a null offering', () => {
    expect(canAcceptTrade(base, null, null)).toBe(false);
  });

  it('rejects an exhausted offer', () => {
    const exhausted = { ...base, usesRemaining: 0 };
    expect(canAcceptTrade(exhausted, item(base.inputA.item, base.inputA.count), null)).toBe(false);
  });

  it('rejects a missing required second input', () => {
    const twoInput = createOffersForProfession('librarian', 3).find((o) => o.inputB !== null)!;
    expect(canAcceptTrade(twoInput, item(twoInput.inputA.item, twoInput.inputA.count), null)).toBe(false);
  });

  it('accepts a satisfied required second input', () => {
    const twoInput = createOffersForProfession('librarian', 3).find((o) => o.inputB !== null)!;
    expect(
      canAcceptTrade(
        twoInput,
        item(twoInput.inputA.item, twoInput.inputA.count),
        item(twoInput.inputB!.item, twoInput.inputB!.count),
      ),
    ).toBe(true);
  });
});

describe('applyTrade', () => {
  it('returns the result, decrements uses, and awards villager XP', () => {
    const state = createVillagerTradeState('farmer');
    const offer = state.offers[0]!;
    const result = applyTrade(state, 0, item(offer.inputA.item, offer.inputA.count), null);

    expect(result.result).toEqual(offer.result);
    expect(result.consumedA).toEqual(offer.inputA);
    expect(result.state.offers[0]!.usesRemaining).toBe(offer.maxUses - 1);
    expect(result.state.xp).toBe(offer.xpReward);
    // Original state untouched (purity).
    expect(state.offers[0]!.usesRemaining).toBe(offer.maxUses);
    expect(state.xp).toBe(0);
  });

  it('rejects an ineligible trade without changing state', () => {
    const state = createVillagerTradeState('farmer');
    const offer = state.offers[0]!;
    const result = applyTrade(state, 0, item(offer.inputA.item, offer.inputA.count - 1), null);

    expect(result.result).toBeNull();
    expect(result.state).toBe(state);
  });

  it('rejects an out-of-range offer index without throwing', () => {
    const state = createVillagerTradeState('farmer');
    const result = applyTrade(state, 99, item('wheat', 64), null);

    expect(result.result).toBeNull();
    expect(result.state).toBe(state);
  });

  it('rejects once the offer is exhausted', () => {
    let state = createVillagerTradeState('farmer');
    const offer = state.offers[0]!;
    const offering = item(offer.inputA.item, offer.inputA.count);

    for (let i = 0; i < offer.maxUses; i++) {
      const r = applyTrade(state, 0, offering, null);
      expect(r.result).not.toBeNull();
      state = r.state;
    }

    expect(state.offers[0]!.usesRemaining).toBe(0);
    expect(applyTrade(state, 0, offering, null).result).toBeNull();
  });
});

describe('villager level progression', () => {
  it('raises the level once accumulated XP crosses the threshold', () => {
    let state = createVillagerTradeState('farmer');
    const offer = state.offers[0]!;
    const offering = item(offer.inputA.item, offer.inputA.count);
    const tradesNeeded = Math.ceil(XP_PER_VILLAGER_LEVEL / offer.xpReward);

    for (let i = 0; i < tradesNeeded; i++) {
      state = applyTrade(state, 0, offering, null).state;
    }

    expect(state.level).toBe(2);
  });

  it('never raises the level above VILLAGER_MAX_LEVEL', () => {
    let state: ReturnType<typeof createVillagerTradeState> = {
      ...createVillagerTradeState('farmer'),
      level: VILLAGER_MAX_LEVEL,
    };
    const offer = state.offers[0]!;
    const offering = item(offer.inputA.item, offer.inputA.count);

    for (let i = 0; i < 20; i++) {
      state = applyTrade(state, 0, offering, null).state;
    }

    expect(state.level).toBe(VILLAGER_MAX_LEVEL);
  });
});

describe('restock', () => {
  it('resets every offer to full uses, leaving level and xp unchanged', () => {
    let state = createVillagerTradeState('farmer', 3);
    const offer = state.offers[0]!;
    state = applyTrade(state, 0, item(offer.inputA.item, offer.inputA.count), null).state;
    expect(state.offers[0]!.usesRemaining).toBe(offer.maxUses - 1);

    const restocked = restock(state);

    for (const o of restocked.offers) {
      expect(o.usesRemaining).toBe(o.maxUses);
    }
    expect(restocked.level).toBe(state.level);
    expect(restocked.xp).toBe(state.xp);
  });
});

describe('buildTradeMenu', () => {
  const playerSlots: MenuSlot[] = [
    { item: null, count: 0, maxStack: 64 },
    { item: 'wheat', count: 20, maxStack: 64 },
    { item: null, count: 0, maxStack: 64 },
    { item: null, count: 0, maxStack: 64 },
  ];

  it('projects a single-input offer into 3 trade slots plus the player region', () => {
    const state = createVillagerTradeState('farmer');
    const offer = state.offers[0]!;

    const menu = buildTradeMenu(state, 0, playerSlots);

    expect(menu.slots.length).toBe(3 + playerSlots.length);
    expect(menu.playerSlotStart).toBe(3);
    expect(menu.slots[0]).toMatchObject({ item: offer.inputA.item, count: offer.inputA.count });
    expect(menu.slots[1]).toMatchObject({ item: null, count: 0 });
    expect(menu.slots[2]).toMatchObject({ item: offer.result.item, count: offer.result.count });
    expect(menu.cursor).toEqual({ item: null, count: 0 });
  });

  it('projects a two-input offer with a populated second slot', () => {
    const state = createVillagerTradeState('librarian', 3);
    const index = state.offers.findIndex((o) => o.inputB !== null);
    const offer = state.offers[index]!;

    const menu = buildTradeMenu(state, index, playerSlots);

    expect(menu.slots[1]).toMatchObject({ item: offer.inputB!.item, count: offer.inputB!.count });
  });

  it('yields three empty trade slots for an out-of-range offer index', () => {
    const state = createVillagerTradeState('farmer');
    const menu = buildTradeMenu(state, 99, playerSlots);

    expect(menu.slots.length).toBe(3 + playerSlots.length);
    expect(menu.slots.slice(0, 3).every((s) => s.item === null && s.count === 0)).toBe(true);
  });
});
