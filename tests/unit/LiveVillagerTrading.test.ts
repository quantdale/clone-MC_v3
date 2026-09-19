import { describe, expect, it } from 'vitest';
import {
  applyTrade,
  canAcceptTrade,
  createOffersForProfession,
  createVillagerTradeState,
  restock as restockTradeState,
  VILLAGER_MAX_LEVEL,
  XP_PER_VILLAGER_LEVEL,
} from '../../src/simulation/VillagerTrading';
import {
  createDefaultTradingStates,
  withUnlockedOffers,
} from '../../src/simulation/VillagerTradingPersistence';

/**
 * Wiring oracles for the live trading integration (278): the exact composition
 * `Game.applyTradeOffer` / `restockTrades` run over the VERIFIED headless
 * VillagerTrading core (151) plus the 278 unlock merge. `Game` itself is
 * DOM-bound and has no node harness, so the routing is covered here at the
 * seam (real 151 + real merge + inventory-atomicity reasoning) and in browser
 * E2E (real DOM, real inventory, real persistence, real toasts).
 */

const TRADE_KEYS = [
  'wheat',
  'emerald',
  'bread',
  'apple',
  'paper',
  'book',
  'coal',
  'iron_ingot',
  'wooden_axe',
];

describe('live villager trading composition (278)', () => {
  it('pins the 151 catalog key set the Game map must cover', () => {
    const seen = new Set<string>();
    for (const profession of ['farmer', 'librarian', 'weaponsmith']) {
      for (const offer of createOffersForProfession(profession, VILLAGER_MAX_LEVEL)) {
        seen.add(offer.inputA.item);
        if (offer.inputB) seen.add(offer.inputB.item);
        seen.add(offer.result.item);
      }
    }
    expect([...seen].sort()).toEqual([...TRADE_KEYS].sort());
  });

  it('applies a wheat-for-emerald trade through the pure core', () => {
    const state = createVillagerTradeState('farmer', 1);
    const offer = state.offers[0]!;
    expect(offer.inputA).toEqual({ item: 'wheat', count: 20 });
    expect(offer.result).toEqual({ item: 'emerald', count: 1 });
    expect(canAcceptTrade(offer, { item: 'wheat', count: 20 }, null)).toBe(true);
    const applied = applyTrade(state, 0, { item: 'wheat', count: 20 }, null);
    expect(applied.result).toEqual({ item: 'emerald', count: 1 });
    expect(applied.consumedA).toEqual({ item: 'wheat', count: 20 });
    expect(applied.state.offers[0]!.usesRemaining).toBe(offer.maxUses - 1);
    expect(applied.state.xp).toBe(offer.xpReward);
  });

  it('refuses insufficient and exhausted offers without mutation', () => {
    const state = createVillagerTradeState('farmer', 1);
    const offer = state.offers[0]!;
    expect(canAcceptTrade(offer, { item: 'wheat', count: 19 }, null)).toBe(false);
    const refused = applyTrade(state, 0, { item: 'wheat', count: 19 }, null);
    expect(refused.result).toBeNull();
    expect(refused.state).toBe(state);
    const exhausted = {
      ...state,
      offers: state.offers.map((o, i) => (i === 0 ? { ...o, usesRemaining: 0 } : o)),
    };
    expect(canAcceptTrade(exhausted.offers[0]!, { item: 'wheat', count: 20 }, null)).toBe(false);
    const refused2 = applyTrade(exhausted, 0, { item: 'wheat', count: 20 }, null);
    expect(refused2.result).toBeNull();
    expect(refused2.state).toBe(exhausted);
  });

  it('merges level-up unlocks exactly once with full uses', () => {
    const before = createVillagerTradeState('farmer', 1);
    const atOne = before.offers.length;
    // Simulate a level-up to 2: the merge must add the level-2 rows once.
    const leveled = { ...before, level: 2, xp: 3 };
    const merged = withUnlockedOffers(leveled, 'farmer', 1);
    const expected = createOffersForProfession('farmer', 2).filter((t) => t.unlockLevel > 1);
    expect(merged.offers.length).toBe(atOne + expected.length);
    for (const added of merged.offers.slice(atOne)) {
      expect(added.unlockLevel).toBe(2);
      expect(added.usesRemaining).toBe(added.maxUses);
    }
    // A repeated merge adds nothing.
    expect(withUnlockedOffers(merged, 'farmer', 1)).toBe(merged);
    expect(withUnlockedOffers(merged, 'farmer', 2)).toBe(merged);
  });

  it('accumulates XP across trades per the 151 carry rule', () => {
    let state = createVillagerTradeState('farmer', 1);
    const offer = state.offers[0]!;
    const trades = Math.floor(XP_PER_VILLAGER_LEVEL / offer.xpReward);
    for (let i = 0; i < trades; i++) {
      const fresh = { ...state, offers: state.offers.map((o) => ({ ...o, usesRemaining: o.maxUses })) };
      const applied = applyTrade(fresh, 0, { item: 'wheat', count: 20 }, null);
      state = withUnlockedOffers(applied.state, 'farmer', fresh.level);
    }
    expect(state.level).toBeGreaterThanOrEqual(2);
    expect(state.level).toBeLessThanOrEqual(VILLAGER_MAX_LEVEL);
  });

  it('restocks to full uses while keeping level/XP', () => {
    let state = createVillagerTradeState('farmer', 1);
    const offer = state.offers[0]!;
    state = applyTrade(state, 0, { item: 'wheat', count: 20 }, null).state;
    expect(state.offers[0]!.usesRemaining).toBe(offer.maxUses - 1);
    const xp = state.xp;
    const restocked = restockTradeState(state);
    expect(restocked.offers[0]!.usesRemaining).toBe(offer.maxUses);
    expect(restocked.level).toBe(state.level);
    expect(restocked.xp).toBe(xp);
  });

  it('boots fresh level-1 states for every profession', () => {
    const states = createDefaultTradingStates();
    for (const key of ['farmer', 'librarian', 'weaponsmith']) {
      expect(states[key]).toEqual(createVillagerTradeState(key, 1));
    }
  });
});
