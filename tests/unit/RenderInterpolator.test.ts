import { describe, it, expect } from 'vitest';
import { RenderInterpolator, alphaFromAccumulator } from '../../src/engine/RenderInterpolator';
import { TICK_MS } from '../../src/engine/SimulationClock';

describe('alphaFromAccumulator', () => {
  it('clamps to [0, 1] and maps TICK_MS to 1', () => {
    expect(alphaFromAccumulator(-25)).toBe(0);
    expect(alphaFromAccumulator(0)).toBe(0);
    expect(alphaFromAccumulator(TICK_MS / 2)).toBe(0.5);
    expect(alphaFromAccumulator(TICK_MS)).toBe(1);
    expect(alphaFromAccumulator(2 * TICK_MS)).toBe(1);
    expect(alphaFromAccumulator(NaN)).toBe(0);
  });
});

describe('RenderInterpolator', () => {
  it('returns previous at alpha 0, current at alpha 1, blends in between', () => {
    const interp = new RenderInterpolator();
    interp.setState([0, 0, 0]);
    interp.setState([10, 20, 30]);

    expect(interp.interpolate(0)).toEqual([0, 0, 0]);
    expect(interp.interpolate(0.5)).toEqual([5, 10, 15]);
    expect(interp.interpolate(1)).toEqual([10, 20, 30]);
  });

  it('clamps out-of-range alpha', () => {
    const interp = new RenderInterpolator();
    interp.setState([0]);
    interp.setState([10]);
    expect(interp.interpolate(-1)).toEqual([0]);
    expect(interp.interpolate(2)).toEqual([10]);
  });

  it('renders the current state when there is no previous snapshot', () => {
    const interp = new RenderInterpolator();
    interp.setState([1, 2, 3]);
    expect(interp.hasState).toBe(true);
    expect(interp.interpolate(0.7)).toEqual([1, 2, 3]);
  });

  it('reset clears history; the next setState behaves like the first', () => {
    const interp = new RenderInterpolator();
    interp.setState([0, 0, 0]);
    interp.setState([10, 20, 30]);
    interp.reset();
    expect(interp.hasState).toBe(false);

    interp.setState([9, 9, 9]);
    expect(interp.hasState).toBe(true);
    expect(interp.interpolate(0.5)).toEqual([9, 9, 9]);
  });

  it('falls back to current on component-count mismatch', () => {
    const interp = new RenderInterpolator();
    interp.setState([0, 0]);
    interp.setState([1, 2, 3]);
    expect(interp.interpolate(0.5)).toEqual([1, 2, 3]);
  });

  it('does not mutate caller snapshots', () => {
    const interp = new RenderInterpolator();
    const a = [0, 0, 0];
    const b = [4, 5, 6];
    interp.setState(a);
    interp.setState(b);
    a[0] = 999;
    b[0] = 999;

    expect(interp.interpolate(0)).toEqual([0, 0, 0]); // previous unchanged by caller mutation
    expect(interp.interpolate(1)).toEqual([4, 5, 6]);
  });
});

describe('RenderInterpolator teleport latch (hardening 2026-08-23)', () => {
  it('renders the post-teleport snapshot unblended, then resumes blending', () => {
    const interp = new RenderInterpolator();
    interp.setState([0, 0, 0], 1);
    interp.setState([10, 10, 10], 2);
    // Respawn: the tick body notifies the teleport, then the SAME tick's
    // post-physics pose is set. The old latch was consumed by that setState
    // and the renderer blended death-spot -> spawn for one tick.
    interp.notifyTeleport();
    interp.setState([100, 50, 100], 3);

    expect(interp.interpolate(0)).toEqual([100, 50, 100]);
    expect(interp.interpolate(0.5)).toEqual([100, 50, 100]);
    expect(interp.interpolate(1)).toEqual([100, 50, 100]);

    // The following pair blends normally again.
    interp.setState([110, 50, 100], 4);
    expect(interp.interpolate(0.5)).toEqual([105, 50, 100]);
  });

  it('keeps blending when notifyTeleport is not called', () => {
    const interp = new RenderInterpolator();
    interp.setState([0, 0, 0], 1);
    interp.setState([10, 0, 0], 2);
    expect(interp.interpolate(0.5)).toEqual([5, 0, 0]);
  });
});
