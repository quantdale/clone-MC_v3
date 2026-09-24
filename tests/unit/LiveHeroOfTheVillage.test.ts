import { describe, expect, it } from 'vitest';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import { createResourceId } from '../../src/data/ResourceId';
import { createDefaultStatusEffectRegistry } from '../../src/data/StatusEffect';
import { StatusEffectManager } from '../../src/data/StatusEffectManager';
import {
  applyHeroTradeDiscount,
  heroAmplifierFromBadOmen,
  heroDurationSeconds,
  shouldGrantHeroOfTheVillage,
} from '../../src/simulation/HeroOfTheVillage';
import {
  recordRaiderDeath,
  startRaid,
  tickRaid,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';
import { forceRaidDefeat } from '../../src/simulation/RaiderCombatBehavior';
import {
  createVillagerTradeState,
  type TradeOffer,
  type VillagerTradeState,
} from '../../src/simulation/VillagerTrading';

const heroId = createResourceId('minecraft', 'effect/hero_of_the_village');

/**
 * Seam oracle mirroring Game's 290 composition: raid status assignment +
 * exactly-once HOTV grant into StatusEffectManager + emerald trade projection.
 */
class HeroRaidOwner {
  raidState: RaidState | null = null;
  readonly playerEffects = new StatusEffectManager(
    createDefaultStatusEffectRegistry(),
    createDefaultAttributeRegistry(),
  );
  trades: Record<string, VillagerTradeState> = {
    farmer: createVillagerTradeState('farmer', 3),
    librarian: createVillagerTradeState('librarian', 2),
  };
  grantCount = 0;
  disposed = false;

  start(omen = 1): RaidState {
    const { state } = tickRaid(startRaid(0, 64, 0, omen));
    this.raidState = state;
    return state;
  }

  private maybeGrant(prev: RaidState['status'] | null | undefined, next: RaidState): void {
    if (this.disposed) return;
    if (!shouldGrantHeroOfTheVillage(prev, next.status)) return;
    const amp = heroAmplifierFromBadOmen(next.badOmenLevel);
    this.playerEffects.add(heroId, heroDurationSeconds(), amp);
    this.grantCount++;
  }

  clearWave(): RaidState | null {
    if (!this.raidState) return null;
    const prev = this.raidState.status;
    let state = this.raidState;
    const remaining = state.raidersRemaining;
    for (let i = 0; i < remaining; i++) state = recordRaiderDeath(state);
    const { state: next } = tickRaid(state);
    this.raidState = next;
    this.maybeGrant(prev, next);
    return next;
  }

  tick(): RaidState | null {
    if (!this.raidState) return null;
    const prev = this.raidState.status;
    const { state: next } = tickRaid(this.raidState);
    this.raidState = next;
    this.maybeGrant(prev, next);
    return next;
  }

  forceDefeat(): void {
    if (!this.raidState || this.raidState.status !== 'ACTIVE') return;
    const prev = this.raidState.status;
    this.raidState = forceRaidDefeat(this.raidState);
    this.maybeGrant(prev, this.raidState);
  }

  /** Hydrate an already-terminal VICTORY without a grant transition. */
  hydrateVictory(omen = 1): void {
    let state = this.start(omen);
    while (state.status === 'ACTIVE') {
      const prev = state;
      let next = prev;
      for (let i = 0; i < prev.raidersRemaining; i++) next = recordRaiderDeath(next);
      state = tickRaid(next).state;
    }
    // Simulate reload: replace effects and re-assign terminal state without grant.
    this.playerEffects.clear();
    this.grantCount = 0;
    this.raidState = state; // already VICTORY — no maybeGrant
  }

  getAmp(): number | null {
    const inst = this.playerEffects.get(heroId);
    if (!inst || inst.expired) return null;
    return inst.amplifier;
  }

  discountedOffers(profession: string): TradeOffer[] {
    const state = this.trades[profession];
    if (!state) return [];
    const amp = this.getAmp();
    if (amp === null) return [...state.offers];
    return state.offers.map((o) => applyHeroTradeDiscount(o, amp));
  }

  winAllWaves(): RaidState {
    this.start(1);
    let guard = 0;
    while (this.raidState?.status === 'ACTIVE' && guard++ < 20) {
      this.clearWave();
    }
    return this.raidState!;
  }
}

describe('live Hero of the Village composition (290)', () => {
  it('grants HOTV exactly once on VICTORY and never on further VICTORY ticks', () => {
    const owner = new HeroRaidOwner();
    const terminal = owner.winAllWaves();
    expect(terminal.status).toBe('VICTORY');
    expect(owner.grantCount).toBe(1);
    expect(owner.getAmp()).toBe(0); // omen 1 → amp 0
    const before = owner.grantCount;
    owner.tick();
    owner.tick();
    expect(owner.raidState?.status).toBe('VICTORY');
    expect(owner.grantCount).toBe(before);
  });

  it('maps omen 3 to amplifier 2 (Level III) at 2400s', () => {
    const owner = new HeroRaidOwner();
    owner.start(3);
    let guard = 0;
    while (owner.raidState?.status === 'ACTIVE' && guard++ < 30) owner.clearWave();
    expect(owner.raidState?.status).toBe('VICTORY');
    expect(owner.getAmp()).toBe(2);
    expect(owner.playerEffects.get(heroId)!.duration).toBe(2400);
  });

  it('DEFEAT grants nothing', () => {
    const owner = new HeroRaidOwner();
    owner.start(1);
    owner.forceDefeat();
    expect(owner.raidState?.status).toBe('DEFEAT');
    expect(owner.grantCount).toBe(0);
    expect(owner.getAmp()).toBeNull();
  });

  it('hydrated VICTORY does not re-grant', () => {
    const owner = new HeroRaidOwner();
    owner.hydrateVictory(2);
    expect(owner.raidState?.status).toBe('VICTORY');
    expect(owner.grantCount).toBe(0);
    expect(owner.getAmp()).toBeNull();
    owner.tick();
    expect(owner.grantCount).toBe(0);
  });

  it('discounts emerald buy prices while active and restores after clear', () => {
    const owner = new HeroRaidOwner();
    owner.winAllWaves();
    const live = owner.discountedOffers('librarian');
    const book = live.find((o) => o.result.item === 'book' && o.inputA.item === 'emerald')!;
    expect(book.inputA).toEqual({ item: 'emerald', count: 7 }); // 9 → 7 at amp 0
    owner.playerEffects.remove(heroId);
    const restored = owner.discountedOffers('librarian');
    const book2 = restored.find((o) => o.result.item === 'book' && o.inputA.item === 'emerald')!;
    expect(book2.inputA).toEqual({ item: 'emerald', count: 9 });
    // Catalog store unchanged
    expect(owner.trades.librarian!.offers.find((o) => o.result.item === 'book' && o.inputA.item === 'emerald')!.inputA.count).toBe(9);
  });

  it('expiry via tick restores catalog projection', () => {
    const owner = new HeroRaidOwner();
    owner.winAllWaves();
    // Force near-expiry then tick past it.
    owner.playerEffects.remove(heroId);
    owner.playerEffects.add(heroId, 0.01, 0);
    owner.playerEffects.tick(0.02);
    expect(owner.getAmp()).toBeNull();
    const book = owner.discountedOffers('librarian').find((o) => o.result.item === 'book' && o.inputA.item === 'emerald')!;
    expect(book.inputA.count).toBe(9);
  });
});
