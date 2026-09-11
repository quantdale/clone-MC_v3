import { describe, it, expect } from 'vitest';
import { XpOrbManager } from '../../src/simulation/XpOrbManager';
import { ExperienceSystem } from '../../src/player/ExperienceSystem';
import { CONFIG } from '../../src/config';
import { XP_ORB_TYPE_KEY } from '../../src/world/XpOrb';

function manager(): XpOrbManager {
  // No rng => exact spawn positions, deterministic ids.
  return new XpOrbManager();
}

describe('XpOrbManager spawn and validation', () => {
  it('mints sequential unique ids and stores the value', () => {
    const m = manager();
    const a = m.spawnXpOrb(7, 10.5, 64.5, 10.5);
    const b = m.spawnXpOrb(7, 10.5, 64.5, 10.5);
    expect([a.id, b.id]).toEqual([0, 1]);
    expect(m.getXpOrbs()).toHaveLength(2);
    expect(m.getXpOrbs().every((o) => o.value === 7)).toBe(true);
  });

  it('rejects a non-positive value and leaves the manager unchanged', () => {
    const m = manager();
    expect(() => m.spawnXpOrb(0, 0, 0, 0)).toThrow();
    expect(m.size).toBe(0);
  });

  it('places orbs at exact coordinates when no rng is supplied', () => {
    const m = manager();
    m.spawnXpOrb(3, 1.25, 64.5, 2.75);
    const o = m.getXpOrbs()[0]!;
    expect(o.x).toBe(1.25);
    expect(o.y).toBe(64.5);
    expect(o.z).toBe(2.75);
    expect(o.vx).toBe(0);
    expect(o.vy).toBe(0);
    expect(o.vz).toBe(0);
  });
});

describe('XpOrbManager attraction, movement, and collection', () => {
  it('collects a close orb into the experience system', () => {
    const m = manager();
    // value 5 is strictly below xpToNext(0)=7, so it lands as xp 5 at level 0.
    // (a value of exactly 7 would trigger a level-up to level 1, xp 0.)
    m.spawnXpOrb(5, 0, 64, 0);
    const exp = new ExperienceSystem();
    const collected = m.tickItemEntities(0.05, 0, 64, 0, exp);
    expect(collected).toBe(1);
    expect(exp.level).toBe(0);
    expect(exp.xp).toBe(5);
    expect(m.getXpOrbs()).toHaveLength(0);
  });

  it('never collects a distant orb', () => {
    const m = manager();
    m.spawnXpOrb(7, 100, 64, 0);
    const exp = new ExperienceSystem();
    const collected = m.tickItemEntities(0.05, 0, 64, 0, exp);
    expect(collected).toBe(0);
    expect(exp.xp).toBe(0);
    expect(m.getXpOrbs()).toHaveLength(1);
  });

  it('attracts a mid-range orb without overshooting', () => {
    const m = manager();
    m.spawnXpOrb(3, 5, 64, 0);
    const exp = new ExperienceSystem();
    const collected = m.tickItemEntities(0.1, 0, 64, 0, exp);
    const o = m.getXpOrbs()[0]!;
    expect(collected).toBe(0);
    expect(exp.xp).toBe(0);
    // moved by min(8*0.1, 5) = 0.8 toward the origin
    expect(o.x).toBeCloseTo(4.2, 6);
    expect(o.y).toBe(64);
    expect(o.z).toBe(0);
    expect(m.getXpOrbs()).toHaveLength(1);
  });

  it('advances ageTicks by round(dt*20)', () => {
    const m = manager();
    const o = m.spawnXpOrb(3, 100, 64, 0);
    m.tickItemEntities(0.05, 0, 0, 0, new ExperienceSystem());
    expect(o.ageTicks).toBe(1);
  });

  it('despawns an expired orb', () => {
    const m = manager();
    m.spawnXpOrb(3, 100, 0, 0);
    m.getXpOrbs()[0]!.ageTicks = CONFIG.xp.orbDespawnTicks;
    const collected = m.tickItemEntities(0.05, 0, 0, 0, new ExperienceSystem());
    expect(collected).toBe(0);
    expect(m.getXpOrbs()).toHaveLength(0);
  });
});

describe('XpOrbManager 037 serialization', () => {
  it('round-trips two orbs field-for-field', () => {
    const m = manager();
    const a = m.spawnXpOrb(7, 1.25, 2.5, 3.75);
    const b = m.spawnXpOrb(3, 4, 5, 6);
    a.ageTicks = 5;
    b.ageTicks = 10;
    const serialized = m.serializeAll();
    expect(serialized.every((r) => r.typeKey === XP_ORB_TYPE_KEY)).toBe(true);

    const restored = manager();
    restored.deserializeAll(serialized);
    const got = restored.getXpOrbs();
    expect(got).toHaveLength(2);
    expect(got[0]!.id).toBe(0);
    expect(got[0]!.value).toBe(7);
    expect(got[0]!.x).toBeCloseTo(1.25, 6);
    expect(got[0]!.y).toBeCloseTo(2.5, 6);
    expect(got[0]!.z).toBeCloseTo(3.75, 6);
    expect(got[0]!.ageTicks).toBe(5);
    expect(got[1]!.id).toBe(1);
    expect(got[1]!.value).toBe(3);
    expect(got[1]!.x).toBe(4);
    expect(got[1]!.y).toBe(5);
    expect(got[1]!.z).toBe(6);
    expect(got[1]!.ageTicks).toBe(10);
  });

  it('rejects one bad record atomically and leaves the manager unchanged', () => {
    const m = manager();
    m.spawnXpOrb(5, 1, 1, 1);
    expect(m.size).toBe(1);
    const good = m.serializeAll()[0]!;
    const goodData = good.data as Record<string, unknown>;
    const bad = { ...good, data: { ...goodData, value: 'not-a-number' } };
    expect(() => m.deserializeAll([good, bad])).toThrow();
    expect(m.size).toBe(1);
  });
});

describe('XpOrbManager deserializeAll fail-closed (264 R-4)', () => {
  function record(overrides: Record<string, unknown> = {}): unknown {
    return {
      schemaVersion: 1,
      typeKey: XP_ORB_TYPE_KEY,
      x: 1,
      y: 64,
      z: 1,
      data: {
        id: 0,
        value: 5,
        x: 1.5,
        y: 64.5,
        z: 1.5,
        vx: 0,
        vy: 0,
        vz: 0,
        ageTicks: 0,
        ...overrides,
      },
    };
  }

  it('rejects a duplicate id pair naming the id and index', () => {
    const m = manager();
    m.spawnXpOrb(5, 1, 1, 1);
    expect(() => m.deserializeAll([record({ id: 7 }), record({ id: 7 })])).toThrow(
      /duplicate xp-orb id 7 at index 1/,
    );
    expect(m.size).toBe(1);
    expect(m.getXpOrbs().map((o) => o.id)).toEqual([0]);
  });

  it('rejects a late duplicate in a longer batch and stays empty', () => {
    const m = manager();
    expect(() =>
      m.deserializeAll([record({ id: 1 }), record({ id: 2 }), record({ id: 1 })]),
    ).toThrow(/duplicate xp-orb id 1 at index 2/);
    expect(m.size).toBe(0);
  });

  it('leaves a populated manager untouched when a late record is malformed', () => {
    const m = manager();
    m.spawnXpOrb(5, 1, 1, 1);
    m.spawnXpOrb(3, 2, 2, 2);
    const good = record({ id: 2 });
    const bad = record({ id: 3, value: 0 });
    expect(() => m.deserializeAll([good, bad])).toThrow(/malformed xp-orb/);
    expect(m.getXpOrbs().map((o) => o.id)).toEqual([0, 1]);
  });

  it('round-trips ticked orbs field-for-field with mint continuity', () => {
    const m = manager();
    m.spawnXpOrb(7, 1.25, 2.5, 3.75);
    m.spawnXpOrb(3, 4, 5, 6);
    const restored = manager();
    expect(restored.deserializeAll(m.serializeAll())).toBe(2);
    expect(restored.getXpOrbs()).toEqual(m.getXpOrbs());
    expect(restored.spawnXpOrb(1, 0, 0, 0).id).toBe(2);
  });

  it('survives an unload/reload cycle (serialize → clear → deserialize)', () => {
    const m = manager();
    m.spawnXpOrb(7, 1.25, 2.5, 3.75);
    const snap = m.serializeAll();
    m.clear();
    expect(m.deserializeAll(snap)).toBe(1);
    expect(m.getXpOrbs().map((o) => [o.id, o.value])).toEqual([[0, 7]]);
  });
});
