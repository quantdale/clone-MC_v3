import { describe, it, expect } from 'vitest';
import {
  DRINK_DURATION_TICKS,
  drinkStartDecision,
  isDrinkablePotion,
  potionStackKey,
  resolveDrinkOutcome,
  startDrink,
  tickDrink,
  type DrinkFrame,
  type DrinkState,
} from '../../src/simulation/PotionDrinking';
import { createPotionContents, type PotionKind } from '../../src/data/PotionItemData';
import { AWKWARD_BASE, WATER_BASE } from '../../src/inventory/BrewingRecipes';

/**
 * Drinkable potions (298): vanilla 32-tick use duration, cancel rules, and the
 * finishUsingItem outcome (instant effects at full potency, duration effects at
 * full duration, bottle return outside creative).
 */

const SPEED = createPotionContents({ customEffects: [{ typeId: 'minecraft:effect/speed', duration: 480, amplifier: 1 }] });

function potion(kind: PotionKind) {
  return createPotionContents({ kind, customEffects: [{ typeId: 'minecraft:effect/speed', duration: 60, amplifier: 0 }] });
}

describe('drinkStartDecision (298)', () => {
  const base = { canInteract: true, deathScreenOpen: false, depletesItems: true, stackCount: 1, isPotionItem: true, contents: SPEED };

  it('survival starts and consumes; creative starts without consuming', () => {
    expect(drinkStartDecision(base)).toEqual({ start: true, consume: true });
    expect(drinkStartDecision({ ...base, depletesItems: false })).toEqual({ start: true, consume: false });
  });

  it('base-only water and awkward potions are drinkable', () => {
    for (const b of [WATER_BASE, AWKWARD_BASE]) {
      expect(drinkStartDecision({ ...base, contents: createPotionContents({ base: b, customEffects: [] }) }).start).toBe(true);
    }
  });

  it('splash and lingering potions are not drinkable (thrown instead)', () => {
    expect(isDrinkablePotion(potion('NORMAL'))).toBe(true);
    expect(drinkStartDecision({ ...base, contents: potion('SPLASH') })).toEqual({ start: false, reason: 'NOT_DRINKABLE' });
    expect(drinkStartDecision({ ...base, contents: potion('LINGERING') })).toEqual({ start: false, reason: 'NOT_DRINKABLE' });
    expect(drinkStartDecision({ ...base, contents: null })).toEqual({ start: false, reason: 'NOT_DRINKABLE' });
  });

  it('spectators, the death screen, empty hands and non-potions refuse', () => {
    expect(drinkStartDecision({ ...base, canInteract: false })).toEqual({ start: false, reason: 'NO_INTERACT' });
    expect(drinkStartDecision({ ...base, deathScreenOpen: true })).toEqual({ start: false, reason: 'DEATH_SCREEN' });
    expect(drinkStartDecision({ ...base, stackCount: 0 })).toEqual({ start: false, reason: 'EMPTY_HAND' });
    expect(drinkStartDecision({ ...base, isPotionItem: false })).toEqual({ start: false, reason: 'NOT_POTION' });
  });
});

describe('tickDrink (298)', () => {
  const key = potionStackKey(52, SPEED);
  const frame: DrinkFrame = {
    useHeld: true,
    inputAvailable: true,
    selectedSlot: 3,
    selectedStackKey: key,
    canInteract: true,
    deathScreenOpen: false,
  };

  it('finishes on exactly the 32nd held tick (vanilla 1.6 s)', () => {
    expect(DRINK_DURATION_TICKS).toBe(32);
    let state: DrinkState = startDrink(3, key);
    for (let i = 1; i < DRINK_DURATION_TICKS; i++) {
      const r = tickDrink(state, frame);
      expect(r.kind).toBe('continue');
      if (r.kind !== 'continue') return;
      state = r.state;
      expect(state.ticksUsed).toBe(i);
    }
    const last = tickDrink(state, frame);
    expect(last.kind).toBe('finish');
    if (last.kind === 'finish') expect(last.state.ticksUsed).toBe(32);
  });

  it('cancels on release, lost input, slot/stack change, mode and death screen', () => {
    const s = { ...startDrink(3, key), ticksUsed: 20 };
    expect(tickDrink(s, { ...frame, useHeld: false })).toEqual({ kind: 'cancel', reason: 'released' });
    expect(tickDrink(s, { ...frame, inputAvailable: false })).toEqual({ kind: 'cancel', reason: 'unlocked' });
    expect(tickDrink(s, { ...frame, selectedSlot: 4 })).toEqual({ kind: 'cancel', reason: 'slot-changed' });
    expect(tickDrink(s, { ...frame, selectedStackKey: null })).toEqual({ kind: 'cancel', reason: 'stack-changed' });
    expect(tickDrink(s, { ...frame, selectedStackKey: potionStackKey(52, potion('NORMAL')) })).toEqual({
      kind: 'cancel',
      reason: 'stack-changed',
    });
    expect(tickDrink(s, { ...frame, canInteract: false })).toEqual({ kind: 'cancel', reason: 'no-interact' });
    expect(tickDrink(s, { ...frame, deathScreenOpen: true })).toEqual({ kind: 'cancel', reason: 'death-screen' });
  });

  it('never mutates the input state', () => {
    const s = startDrink(3, key);
    tickDrink(s, frame);
    expect(s.ticksUsed).toBe(0);
  });

  it('stack keys distinguish contents and item ids', () => {
    expect(potionStackKey(52, SPEED)).toBe(potionStackKey(52, createPotionContents({ customEffects: [...SPEED.customEffects] })));
    expect(potionStackKey(52, SPEED)).not.toBe(potionStackKey(53, SPEED));
  });
});

describe('resolveDrinkOutcome (298)', () => {
  it('duration effects apply at full duration and amplifier; survival returns a bottle', () => {
    expect(resolveDrinkOutcome(SPEED, true)).toEqual({
      heal: 0,
      damage: 0,
      effects: [{ typeId: 'minecraft:effect/speed', durationSeconds: 480, amplifier: 1 }],
      consumePotion: true,
      returnBottle: true,
    });
  });

  it('creative keeps the potion and gets no bottle', () => {
    const o = resolveDrinkOutcome(SPEED, false);
    expect(o.consumePotion).toBe(false);
    expect(o.returnBottle).toBe(false);
    expect(o.effects).toHaveLength(1);
  });

  it('instant health heals 4 << amp and instant damage deals 6 << amp at full potency', () => {
    const heal = createPotionContents({ customEffects: [{ typeId: 'minecraft:effect/instant_health', duration: 0, amplifier: 1 }] });
    expect(resolveDrinkOutcome(heal, true)).toMatchObject({ heal: 8, damage: 0, effects: [] });
    const harm = createPotionContents({ customEffects: [{ typeId: 'minecraft:effect/harming', duration: 0, amplifier: 0 }] });
    expect(resolveDrinkOutcome(harm, true)).toMatchObject({ heal: 0, damage: 6, effects: [] });
  });

  it('water/awkward bottles have no effect but still return a bottle', () => {
    for (const b of [WATER_BASE, AWKWARD_BASE]) {
      expect(resolveDrinkOutcome(createPotionContents({ base: b, customEffects: [] }), true)).toEqual({
        heal: 0,
        damage: 0,
        effects: [],
        consumePotion: true,
        returnBottle: true,
      });
    }
  });

  it('zero-duration non-instant effects (placeholder bottles) apply nothing; mixed potions keep order', () => {
    const mixed = createPotionContents({
      customEffects: [
        { typeId: 'minecraft:effect/speed', duration: 0, amplifier: 0 },
        { typeId: 'minecraft:effect/regeneration', duration: 45, amplifier: 0 },
        { typeId: 'minecraft:effect/instant_health', duration: 0, amplifier: 0 },
        { typeId: 'minecraft:effect/poison', duration: 22.5, amplifier: 2 },
      ],
    });
    expect(resolveDrinkOutcome(mixed, true)).toMatchObject({
      heal: 4,
      effects: [
        { typeId: 'minecraft:effect/regeneration', durationSeconds: 45, amplifier: 0 },
        { typeId: 'minecraft:effect/poison', durationSeconds: 22.5, amplifier: 2 },
      ],
    });
  });
});
