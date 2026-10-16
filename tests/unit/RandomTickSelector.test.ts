import { describe, it, expect } from 'vitest';
import { RandomTickSelector, hash32 } from '../../src/simulation/RandomTickSelector';
import { SECTION_VOLUME } from '../../src/math/SectionCoordinate';

describe('hash32', () => {
  it('is deterministic and varies with inputs', () => {
    expect(hash32(1, 2, 3, 4, 5)).toBe(hash32(1, 2, 3, 4, 5));
    expect(hash32(1, 2, 3, 4, 5)).not.toBe(hash32(1, 2, 3, 4, 6));
  });
});

describe('RandomTickSelector', () => {
  it('is deterministic and bounded for identical inputs', () => {
    const sel = new RandomTickSelector();
    const a = sel.selectForSection(0, 0, 0, 100, 42);
    const b = sel.selectForSection(0, 0, 0, 100, 42);

    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const index of a) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(SECTION_VOLUME);
    }
  });

  it('returns an empty array for count 0 or negative', () => {
    const sel = new RandomTickSelector();
    expect(sel.selectForSection(0, 0, 0, 1, 1, 0)).toEqual([]);
    expect(sel.selectForSection(0, 0, 0, 1, 1, -2)).toEqual([]);
    expect(sel.selectEligible(0, 0, 0, 1, 1, () => true, 0)).toEqual([]);
  });

  it('varies with tick and seed', () => {
    const sel = new RandomTickSelector();
    const tick10 = sel.selectForSection(0, 0, 0, 10, 1);
    const tick11 = sel.selectForSection(0, 0, 0, 11, 1);
    const seed2 = sel.selectForSection(0, 0, 0, 10, 2);

    expect(tick10).not.toEqual(tick11);
    expect(tick10).not.toEqual(seed2);
  });

  it('varies across sections and honors a requested count', () => {
    const sel = new RandomTickSelector();
    const s0 = sel.selectForSection(0, 0, 0, 5, 7);
    const s1 = sel.selectForSection(1, 0, 0, 5, 7);
    expect(s0).not.toEqual(s1);

    expect(sel.selectForSection(0, 0, 0, 5, 7, 5)).toHaveLength(5);
  });

  it('selectEligible returns only eligible positions', () => {
    const sel = new RandomTickSelector();
    const out = sel.selectEligible(0, 0, 0, 100, 42, (x) => x % 2 === 0);

    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
    for (const [x] of out) {
      expect(x % 2).toBe(0);
    }
  });

  it('never-true predicate terminates and returns empty', () => {
    const sel = new RandomTickSelector();
    const out = sel.selectEligible(0, 0, 0, 100, 42, () => false);
    expect(out).toEqual([]);
  });

  it('selectEligible with an always-true predicate returns the requested count', () => {
    const sel = new RandomTickSelector();
    const out = sel.selectEligible(0, 0, 0, 100, 42, () => true, 3);
    expect(out).toHaveLength(3);
    for (const [x, y, z] of out) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(16);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(16);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThan(16);
    }
  });
});
