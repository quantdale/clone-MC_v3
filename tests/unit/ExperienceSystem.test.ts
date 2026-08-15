import { describe, it, expect } from 'vitest';
import {
  ExperienceSystem,
  computeXpToNext,
  type ExperienceSnapshot,
} from '../../src/player/ExperienceSystem';

describe('computeXpToNext leveling cost curve', () => {
  it('returns the low-tier cost 2*level + 7', () => {
    expect(computeXpToNext(0)).toBe(7);
    expect(computeXpToNext(1)).toBe(9);
    expect(computeXpToNext(15)).toBe(37);
  });

  it('is continuous at the level-16 boundary', () => {
    expect(computeXpToNext(16)).toBe(42);
    expect(computeXpToNext(17)).toBe(47);
  });

  it('is continuous at the level-31 boundary', () => {
    expect(computeXpToNext(30)).toBe(112);
    expect(computeXpToNext(31)).toBe(121);
  });

  it('clamps a negative or non-integer level to 0', () => {
    expect(computeXpToNext(-3)).toBe(7);
    expect(computeXpToNext(2.5)).toBe(7);
  });
});

describe('ExperienceSystem.addXp accrual and level advance', () => {
  it('crosses a single level', () => {
    const sys = new ExperienceSystem();
    sys.xp = 5; // xpToNext is 7 at level 0
    sys.addXp(5);
    expect(sys.level).toBe(1);
    expect(sys.xp).toBe(3);
    expect(sys.xpToNext).toBe(9);
  });

  it('crosses multiple levels in one call', () => {
    const sys = new ExperienceSystem();
    sys.addXp(50);
    // costs consumed stepping 0->1->2->3->4 = 7+9+11+13 = 40; remainder 10
    expect(sys.level).toBe(4);
    expect(sys.xp).toBe(10);
    expect(sys.xpToNext).toBe(15);
  });

  it('ignores non-integer and negative input without throwing', () => {
    const sys = new ExperienceSystem();
    expect(() => sys.addXp(1.5)).not.toThrow();
    expect(() => sys.addXp(-3)).not.toThrow();
    expect(sys.level).toBe(0);
    expect(sys.xp).toBe(0);
  });
});

describe('ExperienceSystem snapshot and restore', () => {
  it('round-trips an exact leveled state', () => {
    const src = new ExperienceSystem();
    src.level = 7;
    src.xp = 4;
    src.xpToNext = computeXpToNext(7);
    const snapshot: ExperienceSnapshot = src.snapshot();
    expect(snapshot).toEqual({ version: 1, level: 7, xp: 4 });

    const restored = new ExperienceSystem();
    expect(restored.restore(snapshot)).toBe(true);
    expect(restored.level).toBe(7);
    expect(restored.xp).toBe(4);
    expect(restored.xpToNext).toBe(computeXpToNext(7));
  });

  it('rejects the wrong version and leaves state unchanged', () => {
    const sys = new ExperienceSystem();
    const ok = sys.restore({ version: 2, level: 3, xp: 1 });
    expect(ok).toBe(false);
    expect(sys.level).toBe(0);
    expect(sys.xp).toBe(0);
  });

  it('rejects negative xp and leaves state unchanged', () => {
    const sys = new ExperienceSystem();
    const ok = sys.restore({ version: 1, level: 2, xp: -1 });
    expect(ok).toBe(false);
    expect(sys.level).toBe(0);
    expect(sys.xp).toBe(0);
  });

  it('rejects a non-integer level', () => {
    const sys = new ExperienceSystem();
    const ok = sys.restore({ version: 1, level: 2.5, xp: 1 });
    expect(ok).toBe(false);
  });

  it('clamps out-of-range xp into [0, xpToNext)', () => {
    const sys = new ExperienceSystem();
    // level 0 -> xpToNext 7; xp 99 should clamp to 6
    const ok = sys.restore({ version: 1, level: 0, xp: 99 });
    expect(ok).toBe(true);
    expect(sys.level).toBe(0);
    expect(sys.xp).toBe(6);
  });
});
