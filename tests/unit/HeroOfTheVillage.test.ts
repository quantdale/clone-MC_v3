import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import {
  createDefaultStatusEffectRegistry,
} from '../../src/data/StatusEffect';
import { StatusEffectManager } from '../../src/data/StatusEffectManager';
import {
  applyHeroTradeDiscount,
  discountEmeraldCount,
  HERO_OF_THE_VILLAGE_DURATION_SECONDS,
  HERO_OF_THE_VILLAGE_MAX_AMPLIFIER,
  heroAmplifierFromBadOmen,
  heroDurationSeconds,
  shouldGrantHeroOfTheVillage,
} from '../../src/simulation/HeroOfTheVillage';
import { createVillagerTradeState } from '../../src/simulation/VillagerTrading';

const heroId = createResourceId('minecraft', 'effect/hero_of_the_village');

describe('HeroOfTheVillage pure rules (290)', () => {
  it('maps Bad Omen levels to amplifiers 0..4', () => {
    expect(heroAmplifierFromBadOmen(Number.NaN)).toBe(0);
    expect(heroAmplifierFromBadOmen(-3)).toBe(0);
    expect(heroAmplifierFromBadOmen(0)).toBe(0);
    expect(heroAmplifierFromBadOmen(1)).toBe(0);
    expect(heroAmplifierFromBadOmen(2)).toBe(1);
    expect(heroAmplifierFromBadOmen(3)).toBe(2);
    expect(heroAmplifierFromBadOmen(4)).toBe(3);
    expect(heroAmplifierFromBadOmen(5)).toBe(4);
    expect(heroAmplifierFromBadOmen(99)).toBe(HERO_OF_THE_VILLAGE_MAX_AMPLIFIER);
    expect(heroAmplifierFromBadOmen(2.9)).toBe(1);
  });

  it('pins duration to 2400 seconds (40 min @ 20 TPS)', () => {
    expect(heroDurationSeconds()).toBe(2400);
    expect(HERO_OF_THE_VILLAGE_DURATION_SECONDS).toBe(2400);
  });

  it('applies vanilla-like emerald discount with floor 1', () => {
    // amp 0 → 30%: floor(3*0.3)=0 → 3 unchanged; 1 → 1; 10 → 10-3 = 7
    expect(discountEmeraldCount(3, 0)).toBe(3);
    expect(discountEmeraldCount(1, 0)).toBe(1);
    expect(discountEmeraldCount(9, 0)).toBe(7); // 9 - floor(2.7) = 7
    expect(discountEmeraldCount(10, 0)).toBe(7);
    // amp 4 → 55%: 36 → 36 - floor(19.8) = 17; 3 → 3 - floor(1.65) = 2
    expect(discountEmeraldCount(36, 4)).toBe(17);
    expect(discountEmeraldCount(3, 4)).toBe(2);
    expect(discountEmeraldCount(0, 0)).toBe(0);
    expect(discountEmeraldCount(Number.NaN, 0)).toBe(0);
  });

  it('discounts only emerald inputs on an offer', () => {
    const state = createVillagerTradeState('librarian', 2);
    const book = state.offers.find((o) => o.result.item === 'book' && o.inputA.item === 'emerald')!;
    expect(book.inputA).toEqual({ item: 'emerald', count: 9 });
    const discounted = applyHeroTradeDiscount(book, 0);
    expect(discounted.inputA).toEqual({ item: 'emerald', count: 7 }); // 9 - floor(2.7)
    expect(discounted.result).toEqual(book.result);
    expect(discounted.usesRemaining).toBe(book.usesRemaining);

    const paper = state.offers.find((o) => o.inputA.item === 'paper')!;
    expect(applyHeroTradeDiscount(paper, 0)).toBe(paper); // identity — no emerald input
    expect(applyHeroTradeDiscount(book, null)).toBe(book);
    expect(applyHeroTradeDiscount(book, undefined)).toBe(book);

    // Higher amp does discount the 3-emerald farmer apple offer.
    const farmer = createVillagerTradeState('farmer', 3);
    const apple = farmer.offers.find((o) => o.result.item === 'apple')!;
    expect(applyHeroTradeDiscount(apple, 4).inputA.count).toBe(2);
  });

  it('grant predicate is true only on non-VICTORY → VICTORY', () => {
    expect(shouldGrantHeroOfTheVillage(null, 'VICTORY')).toBe(true);
    expect(shouldGrantHeroOfTheVillage(undefined, 'VICTORY')).toBe(true);
    expect(shouldGrantHeroOfTheVillage('ACTIVE', 'VICTORY')).toBe(true);
    expect(shouldGrantHeroOfTheVillage('DEFEAT', 'VICTORY')).toBe(true);
    expect(shouldGrantHeroOfTheVillage('VICTORY', 'VICTORY')).toBe(false);
    expect(shouldGrantHeroOfTheVillage('ACTIVE', 'DEFEAT')).toBe(false);
    expect(shouldGrantHeroOfTheVillage('ACTIVE', 'ACTIVE')).toBe(false);
    expect(shouldGrantHeroOfTheVillage(null, 'DEFEAT')).toBe(false);
  });

  it('default registry accepts amp 4 and 2400s duration', () => {
    const mgr = new StatusEffectManager(
      createDefaultStatusEffectRegistry(),
      createDefaultAttributeRegistry(),
    );
    const inst = mgr.add(heroId, 2400, 4);
    expect(inst.amplifier).toBe(4);
    expect(inst.duration).toBe(2400);
  });
});
