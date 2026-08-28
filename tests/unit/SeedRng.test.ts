import { describe, it, expect } from 'vitest';
import { SeedRng, createNamedRng } from '../../src/simulation/SeedRng';

function drawSequence(rng: SeedRng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

describe('SeedRng', () => {
  it('is deterministic for the same seed', () => {
    expect(drawSequence(new SeedRng(42), 100)).toEqual(drawSequence(new SeedRng(42), 100));
  });

  it('differs across seeds', () => {
    expect(drawSequence(new SeedRng(1), 20)).not.toEqual(drawSequence(new SeedRng(2), 20));
  });

  it('createNamedRng isolates streams by name and reproduces them', () => {
    const a1 = drawSequence(createNamedRng(7, 'a'), 100);
    const a2 = drawSequence(createNamedRng(7, 'a'), 100);
    const b = drawSequence(createNamedRng(7, 'b'), 100);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });

  it('respects typed draw ranges over 1000 draws', () => {
    const rng = createNamedRng(7, 'ranges');
    for (let i = 0; i < 1000; i++) {
      const i5 = rng.nextInt(5);
      expect(i5).toBeGreaterThanOrEqual(0);
      expect(i5).toBeLessThan(5);

      const r = rng.nextIntInclusive(-3, 3);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThanOrEqual(3);

      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('nextBoolean yields booleans', () => {
    const rng = createNamedRng(7, 'bools');
    for (let i = 0; i < 100; i++) {
      expect(typeof rng.nextBoolean()).toBe('boolean');
    }
  });

  it('fork is deterministic from the same parent state and advances the parent', () => {
    const p1 = createNamedRng(7, 'parent');
    const p2 = createNamedRng(7, 'parent');

    const c1 = p1.fork('child');
    const c2 = p2.fork('child');

    expect(drawSequence(c1, 50)).toEqual(drawSequence(c2, 50));
    // Both parents advanced by exactly one draw.
    expect(p1.next()).toBe(p2.next());
  });

  it('forks with different names differ', () => {
    const p = createNamedRng(7, 'parent');
    const a = p.fork('a');
    const q = createNamedRng(7, 'parent');
    const b = q.fork('b');
    expect(drawSequence(a, 50)).not.toEqual(drawSequence(b, 50));
  });

  it('exposes state as uint32; equal states produce equal draws', () => {
    const rng = createNamedRng(7, 'state');
    const state = rng.state;
    expect(state).toBeGreaterThanOrEqual(0);
    expect(state).toBeLessThanOrEqual(0xffffffff);

    const twin = new SeedRng(state);
    expect(rng.next()).toBe(twin.next());
  });

  it('throws RangeError on invalid arguments', () => {
    const rng = new SeedRng(1);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(-1)).toThrow(RangeError);
    expect(() => rng.nextIntInclusive(5, 2)).toThrow(RangeError);
  });
});
