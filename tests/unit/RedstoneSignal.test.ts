import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  OPPOSITE_DIRECTION,
  offsetInDirection,
  clampSignal,
  attenuate,
  strongestSignalFrom,
  getDirectPower,
  getIndirectPower,
  isBlockPowered,
  MIN_SIGNAL_STRENGTH,
  MAX_SIGNAL_STRENGTH,
  type Direction,
  type RedstonePowerSource,
} from '../../src/simulation/RedstoneSignal';

/** A source emitting nothing anywhere, with nothing conductive. */
function emptySource(overrides: Partial<RedstonePowerSource> = {}): RedstonePowerSource {
  return {
    getWeakPower: () => 0,
    getStrongPower: () => 0,
    isConductive: () => false,
    ...overrides,
  };
}

const at = (x: number, y: number, z: number) => (px: number, py: number, pz: number) =>
  px === x && py === y && pz === z;

describe('direction vocabulary', () => {
  it('OPPOSITE_DIRECTION is involutive', () => {
    for (const d of DIRECTIONS) {
      expect(OPPOSITE_DIRECTION[OPPOSITE_DIRECTION[d]]).toBe(d);
    }
  });

  it('offsets round-trip through the opposite direction', () => {
    for (const d of DIRECTIONS) {
      const [x, y, z] = offsetInDirection(3, 4, 5, d);
      expect(offsetInDirection(x, y, z, OPPOSITE_DIRECTION[d])).toEqual([3, 4, 5]);
    }
  });

  it('follows the Minecraft axis convention', () => {
    expect(offsetInDirection(0, 0, 0, 'north')).toEqual([0, 0, -1]);
    expect(offsetInDirection(0, 0, 0, 'south')).toEqual([0, 0, 1]);
    expect(offsetInDirection(0, 0, 0, 'east')).toEqual([1, 0, 0]);
    expect(offsetInDirection(0, 0, 0, 'west')).toEqual([-1, 0, 0]);
    expect(offsetInDirection(0, 0, 0, 'up')).toEqual([0, 1, 0]);
    expect(offsetInDirection(0, 0, 0, 'down')).toEqual([0, -1, 0]);
  });

  it('moves exactly one block along exactly one axis', () => {
    for (const d of DIRECTIONS) {
      const [x, y, z] = offsetInDirection(0, 0, 0, d);
      expect(Math.abs(x) + Math.abs(y) + Math.abs(z)).toBe(1);
    }
  });
});

describe('clampSignal', () => {
  it('passes in-range values through', () => {
    expect(clampSignal(7)).toBe(7);
    expect(clampSignal(MIN_SIGNAL_STRENGTH)).toBe(MIN_SIGNAL_STRENGTH);
    expect(clampSignal(MAX_SIGNAL_STRENGTH)).toBe(MAX_SIGNAL_STRENGTH);
  });

  it('clamps out-of-range values to the bounds', () => {
    expect(clampSignal(-5)).toBe(MIN_SIGNAL_STRENGTH);
    expect(clampSignal(99)).toBe(MAX_SIGNAL_STRENGTH);
  });

  it('treats non-finite input as no signal', () => {
    expect(clampSignal(Number.NaN)).toBe(MIN_SIGNAL_STRENGTH);
    expect(clampSignal(Number.POSITIVE_INFINITY)).toBe(MIN_SIGNAL_STRENGTH);
    expect(clampSignal(Number.NEGATIVE_INFINITY)).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('truncates fractional values', () => {
    expect(clampSignal(7.9)).toBe(7);
  });
});

describe('attenuate', () => {
  it('preserves the signal at distance zero', () => {
    expect(attenuate(15, 0)).toBe(15);
  });

  it('decays one per block', () => {
    expect(attenuate(15, 4)).toBe(11);
    expect(attenuate(9, 1)).toBe(8);
  });

  it('floors at the minimum', () => {
    expect(attenuate(3, 99)).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('treats a non-positive or non-finite distance as zero', () => {
    expect(attenuate(10, -5)).toBe(10);
    expect(attenuate(10, Number.NaN)).toBe(10);
  });

  it('clamps the input signal first', () => {
    expect(attenuate(99, 4)).toBe(MAX_SIGNAL_STRENGTH - 4);
  });
});

describe('strongestSignalFrom', () => {
  it('returns the maximum', () => {
    expect(strongestSignalFrom([3, 11, 7])).toBe(11);
  });

  it('reads an empty list as unpowered', () => {
    expect(strongestSignalFrom([])).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('clamps out-of-domain entries', () => {
    expect(strongestSignalFrom([99, 2])).toBe(MAX_SIGNAL_STRENGTH);
    expect(strongestSignalFrom([-5, -2])).toBe(MIN_SIGNAL_STRENGTH);
  });
});

describe('getDirectPower', () => {
  it('reads a single strongly-powered neighbour', () => {
    // The block below (0,-1,0) emits strong power upward into the origin.
    const below = at(0, -1, 0);
    const source = emptySource({
      getStrongPower: (x, y, z, d) => (below(x, y, z) && d === 'up' ? 9 : 0),
    });
    expect(getDirectPower(source, 0, 0, 0)).toBe(9);
  });

  it('takes the strongest of several neighbours', () => {
    const source = emptySource({
      getStrongPower: (x, y, z, d) => {
        if (at(0, -1, 0)(x, y, z) && d === 'up') return 4;
        if (at(1, 0, 0)(x, y, z) && d === 'west') return 12;
        return 0;
      },
    });
    expect(getDirectPower(source, 0, 0, 0)).toBe(12);
  });

  it('ignores weak power entirely', () => {
    const source = emptySource({ getWeakPower: () => MAX_SIGNAL_STRENGTH });
    expect(getDirectPower(source, 0, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('clamps an out-of-domain source value', () => {
    const source = emptySource({ getStrongPower: () => 99 });
    expect(getDirectPower(source, 0, 0, 0)).toBe(MAX_SIGNAL_STRENGTH);
  });

  it('makes exactly six source queries', () => {
    let calls = 0;
    const source = emptySource({
      getStrongPower: () => {
        calls++;
        return 0;
      },
    });
    getDirectPower(source, 0, 0, 0);
    expect(calls).toBe(6);
  });
});

describe('getIndirectPower', () => {
  /**
   * Origin (0,0,0) has a conductive neighbour east at (1,0,0), which is itself strongly powered
   * from its far side by (2,0,0) emitting west.
   */
  function conductedSource(conductive: boolean, strength = 10): RedstonePowerSource {
    return emptySource({
      getStrongPower: (x, y, z, d) => (at(2, 0, 0)(x, y, z) && d === 'west' ? strength : 0),
      isConductive: (x, y, z) => conductive && at(1, 0, 0)(x, y, z),
    });
  }

  it('re-emits a conductive neighbour\'s own strong power', () => {
    const source = conductedSource(true);
    expect(getDirectPower(source, 0, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
    expect(getIndirectPower(source, 0, 0, 0)).toBe(10);
  });

  it('conducts nothing through a non-conductive neighbour', () => {
    const source = conductedSource(false);
    expect(getIndirectPower(source, 0, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('prefers direct power when it is higher', () => {
    const source = emptySource({
      getStrongPower: (x, y, z, d) => {
        if (at(0, -1, 0)(x, y, z) && d === 'up') return 13; // direct into the origin
        if (at(2, 0, 0)(x, y, z) && d === 'west') return 5; // conducted via (1,0,0)
        return 0;
      },
      isConductive: (x, y, z) => at(1, 0, 0)(x, y, z),
    });
    expect(getIndirectPower(source, 0, 0, 0)).toBe(13);
  });

  it('is never below direct power', () => {
    const sources: RedstonePowerSource[] = [
      emptySource(),
      conductedSource(true),
      conductedSource(false),
      emptySource({ getStrongPower: () => 7, isConductive: () => true }),
    ];
    for (const source of sources) {
      expect(getIndirectPower(source, 0, 0, 0)).toBeGreaterThanOrEqual(getDirectPower(source, 0, 0, 0));
    }
  });

  it('terminates with every neighbour conductive (no infinite recursion)', () => {
    const source = emptySource({ isConductive: () => true, getStrongPower: () => 6 });
    expect(() => getIndirectPower(source, 0, 0, 0)).not.toThrow();
    expect(getIndirectPower(source, 0, 0, 0)).toBe(6);
  });
});

describe('isBlockPowered', () => {
  it('is false with no power anywhere', () => {
    expect(isBlockPowered(emptySource(), 0, 0, 0)).toBe(false);
  });

  it('is true at a power of one', () => {
    const source = emptySource({
      getStrongPower: (x, y, z, d: Direction) => (at(0, -1, 0)(x, y, z) && d === 'up' ? 1 : 0),
    });
    expect(isBlockPowered(source, 0, 0, 0)).toBe(true);
  });

  it('is true when only conducted power reaches the position', () => {
    const source = emptySource({
      getStrongPower: (x, y, z, d) => (at(2, 0, 0)(x, y, z) && d === 'west' ? 8 : 0),
      isConductive: (x, y, z) => at(1, 0, 0)(x, y, z),
    });
    expect(getDirectPower(source, 0, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
    expect(isBlockPowered(source, 0, 0, 0)).toBe(true);
  });
});
