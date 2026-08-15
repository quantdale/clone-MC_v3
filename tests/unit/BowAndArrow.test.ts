import { describe, it, expect } from 'vitest';
import {
  bowPullProgress,
  computeArrowSpeed,
  computeFireVelocity,
  computeArrowDamage,
  canFireBow,
  LandedArrowTracker,
  DEFAULT_ARROW_SPEED,
} from '../../src/simulation/BowAndArrow';

describe('bowPullProgress', () => {
  it('matches the vanilla curve at 0, 20, and beyond (clamped)', () => {
    expect(bowPullProgress(0)).toBe(0);
    expect(bowPullProgress(20)).toBe(1);
    expect(bowPullProgress(40)).toBe(1);
  });

  it('is strictly between 0 and 1 for a partial draw', () => {
    const p = bowPullProgress(10);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe('computeFireVelocity', () => {
  it('scales a normalized direction by the charge-derived speed', () => {
    const result = computeFireVelocity(1, 0, 0, 1);
    expect(result).toEqual({ vx: DEFAULT_ARROW_SPEED, vy: 0, vz: 0 });
  });

  it('normalizes a non-unit direction before scaling', () => {
    const result = computeFireVelocity(2, 0, 0, 1);
    expect(result.vx).toBeCloseTo(DEFAULT_ARROW_SPEED);
    expect(result.vy).toBe(0);
    expect(result.vz).toBe(0);
  });

  it('returns zero velocity for a zero-length direction', () => {
    expect(computeFireVelocity(0, 0, 0, 1)).toEqual({ vx: 0, vy: 0, vz: 0 });
  });

  it('produces a magnitude equal to computeArrowSpeed for a partial draw', () => {
    const pullProgress = 0.4;
    const result = computeFireVelocity(0, 1, 0, pullProgress);
    const magnitude = Math.sqrt(result.vx ** 2 + result.vy ** 2 + result.vz ** 2);
    expect(magnitude).toBeCloseTo(computeArrowSpeed(pullProgress));
  });
});

describe('computeArrowDamage', () => {
  it('is non-negative and increases with speed', () => {
    const low = computeArrowDamage(1);
    const high = computeArrowDamage(5);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it('is zero for zero speed', () => {
    expect(computeArrowDamage(0)).toBe(0);
  });
});

describe('canFireBow', () => {
  it('gates on ammo count without infinite ammo', () => {
    expect(canFireBow(0)).toBe(false);
    expect(canFireBow(1)).toBe(true);
    expect(canFireBow(-1)).toBe(false);
  });

  it('always allows firing with infinite ammo regardless of count', () => {
    expect(canFireBow(0, true)).toBe(true);
    expect(canFireBow(-5, true)).toBe(true);
  });
});

describe('LandedArrowTracker', () => {
  it('adds, gets, and removes an arrow', () => {
    const tracker = new LandedArrowTracker();
    const id = tracker.addLandedArrow(1, 2, 3, 100, 7);
    expect(tracker.getArrow(id)).toEqual({ id, x: 1, y: 2, z: 3, landedTick: 100, ownerId: 7 });
    expect(tracker.size).toBe(1);
    expect(tracker.removeArrow(id)).toBe(true);
    expect(tracker.getArrow(id)).toBeUndefined();
    expect(tracker.removeArrow(id)).toBe(false);
  });

  it('clear() empties the tracker and resets id minting', () => {
    const tracker = new LandedArrowTracker();
    tracker.addLandedArrow(0, 0, 0, 0, null);
    tracker.clear();
    expect(tracker.size).toBe(0);
    const id = tracker.addLandedArrow(0, 0, 0, 0, null);
    expect(id).toBe(0);
  });

  it('collectNearby collects and removes an arrow within delay and radius', () => {
    const tracker = new LandedArrowTracker();
    const id = tracker.addLandedArrow(0, 0, 0, 100, null);

    const collected = tracker.collectNearby(1, 0, 0, 110, 1.5, 10);

    expect(collected).toEqual([id]);
    expect(tracker.getArrow(id)).toBeUndefined();
  });

  it('does not collect an arrow still within the pickup delay', () => {
    const tracker = new LandedArrowTracker();
    const id = tracker.addLandedArrow(0, 0, 0, 100, null);

    const collected = tracker.collectNearby(0, 0, 0, 105, 1.5, 10);

    expect(collected).toEqual([]);
    expect(tracker.getArrow(id)).toBeDefined();
  });

  it('does not collect an arrow outside the pickup radius', () => {
    const tracker = new LandedArrowTracker();
    const id = tracker.addLandedArrow(0, 0, 0, 100, null);

    const collected = tracker.collectNearby(100, 0, 0, 200, 1.5, 10);

    expect(collected).toEqual([]);
    expect(tracker.getArrow(id)).toBeDefined();
  });
});
