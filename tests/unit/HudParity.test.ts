import { describe, it, expect } from 'vitest';
import { projectHud, type HudInputs } from '../../src/ui/HudParity';

const base = (overrides: Partial<HudInputs> = {}): HudInputs => ({
  health: 20,
  maxHealth: 20,
  hunger: 20,
  saturation: 5,
  armorPoints: 0,
  airLevel: 300,
  maxAir: 300,
  experienceLevel: 0,
  experienceProgress: 0,
  statusEffects: [],
  selectedSlot: 0,
  bossBars: [],
  ...overrides,
});

describe('bars', () => {
  it('projects hearts with half icons and clamps', () => {
    expect(projectHud(base({ health: 19 })).hearts).toEqual({ full: 9, half: true });
    expect(projectHud(base({ health: 20 })).hearts).toEqual({ full: 10, half: false });
    expect(projectHud(base({ health: 1 })).hearts).toEqual({ full: 0, half: true });
    expect(projectHud(base({ health: 21 })).hearts).toEqual({ full: 10, half: false });
    expect(projectHud(base({ health: -1 })).hearts).toEqual({ full: 0, half: false });
  });

  it('projects hunger shanks on the 0-20 scale', () => {
    expect(projectHud(base({ hunger: 13 })).hunger).toEqual({ full: 6, half: true });
    expect(projectHud(base({ hunger: 0 })).hunger).toEqual({ full: 0, half: false });
    expect(projectHud(base({ hunger: 30 })).hunger).toEqual({ full: 10, half: false });
  });

  it('projects armor icons on the 0-20 scale', () => {
    expect(projectHud(base({ armorPoints: 17 })).armor).toEqual({ full: 8, half: true });
    expect(projectHud(base({ armorPoints: 20 })).armor).toEqual({ full: 10, half: false });
    expect(projectHud(base({ armorPoints: -3 })).armor).toEqual({ full: 0, half: false });
  });
});

describe('air', () => {
  it('uses ceil bubbles with clamps', () => {
    expect(projectHud(base({ airLevel: 300 })).airBubbles).toBe(10);
    expect(projectHud(base({ airLevel: 31 })).airBubbles).toBe(2);
    expect(projectHud(base({ airLevel: 30 })).airBubbles).toBe(1);
    expect(projectHud(base({ airLevel: 1 })).airBubbles).toBe(1);
    expect(projectHud(base({ airLevel: 0 })).airBubbles).toBe(0);
    expect(projectHud(base({ airLevel: -5 })).airBubbles).toBe(0);
  });

  it('yields zero bubbles for a non-positive maxAir', () => {
    expect(projectHud(base({ airLevel: 10, maxAir: 0 })).airBubbles).toBe(0);
  });
});

describe('experience', () => {
  it('passes the level and clamps progress', () => {
    expect(projectHud(base({ experienceLevel: 5, experienceProgress: 0.5 })).experience).toEqual({
      level: 5,
      progress: 0.5,
    });
    expect(projectHud(base({ experienceLevel: 5, experienceProgress: 1.5 })).experience).toEqual({
      level: 5,
      progress: 1,
    });
    expect(projectHud(base({ experienceLevel: -2, experienceProgress: -0.2 })).experience).toEqual({
      level: 0,
      progress: 0,
    });
  });
});

describe('effects', () => {
  const effect = (durationTicks: number) => ({ id: 'speed', amplifier: 1, durationTicks });

  it('projects fractions and the blink threshold', () => {
    expect(projectHud(base({ statusEffects: [effect(0)] })).effects[0]).toMatchObject({
      remainingFraction: 0,
      blinking: true,
    });
    expect(projectHud(base({ statusEffects: [effect(199)] })).effects[0]).toMatchObject({
      blinking: true,
    });
    expect(projectHud(base({ statusEffects: [effect(200)] })).effects[0]).toMatchObject({
      remainingFraction: 200 / 600,
      blinking: false,
    });
    expect(projectHud(base({ statusEffects: [effect(600)] })).effects[0]).toMatchObject({
      remainingFraction: 1,
      blinking: false,
    });
    expect(projectHud(base({ statusEffects: [effect(601)] })).effects[0]).toMatchObject({
      remainingFraction: 1,
      blinking: false,
    });
  });

  it('passes ids and amplifiers and keeps empty lists empty', () => {
    const projected = projectHud(base({ statusEffects: [effect(300)] }));
    expect(projected.effects[0]).toMatchObject({ id: 'speed', amplifier: 1, durationTicks: 300 });
    expect(projectHud(base()).effects).toEqual([]);
  });
});

describe('selection and boss bars', () => {
  it('clamps the selected slot', () => {
    expect(projectHud(base({ selectedSlot: 8 })).selectedSlot).toBe(8);
    expect(projectHud(base({ selectedSlot: -1 })).selectedSlot).toBe(0);
    expect(projectHud(base({ selectedSlot: 9.6 })).selectedSlot).toBe(8);
  });

  it('clamps boss-bar progress and keeps empty lists empty', () => {
    const bars = [
      { id: 'dragon', progress: 0.4, color: 'pink' },
      { id: 'wither', progress: -0.5, color: 'black' },
      { id: 'raid', progress: 2, color: 'red' },
    ];
    expect(projectHud(base({ bossBars: bars })).bossBars).toEqual([
      { id: 'dragon', progress: 0.4, color: 'pink' },
      { id: 'wither', progress: 0, color: 'black' },
      { id: 'raid', progress: 1, color: 'red' },
    ]);
    expect(projectHud(base()).bossBars).toEqual([]);
  });
});

describe('totality', () => {
  it('never throws on malformed inputs', () => {
    const input = base({
      health: NaN,
      maxHealth: NaN,
      hunger: NaN,
      armorPoints: NaN,
      airLevel: NaN,
      maxAir: NaN,
      experienceLevel: NaN,
      experienceProgress: NaN,
      selectedSlot: NaN,
      statusEffects: [{ id: 'x', amplifier: NaN, durationTicks: NaN }],
      bossBars: [{ id: 'b', progress: NaN, color: '' }],
    });
    const out = projectHud(input);
    expect(out.hearts.full).toBeGreaterThanOrEqual(0);
    expect(out.airBubbles).toBeGreaterThanOrEqual(0);
    expect(out.experience.progress).toBeGreaterThanOrEqual(0);
    expect(out.selectedSlot).toBeGreaterThanOrEqual(0);
    expect(out.effects[0]).toBeDefined();
    expect(out.bossBars[0]).toBeDefined();
  });
});
