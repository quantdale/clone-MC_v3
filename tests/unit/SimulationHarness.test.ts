import { describe, it, expect } from 'vitest';
import { SimulationHarness, type HarnessSystem } from '../../src/simulation/SimulationHarness';

class RecordingSystem implements HarnessSystem {
  ticks: number[] = [];
  tick(tick: number): void {
    this.ticks.push(tick);
  }
  snapshot(): unknown {
    return { ticks: [...this.ticks] };
  }
  restore(state: unknown): void {
    this.ticks = [...(state as { ticks: number[] }).ticks];
  }
}

describe('SimulationHarness', () => {
  it('steps exactly and ticks systems in registration order with exact tick numbers', () => {
    const order: string[] = [];
    const a: HarnessSystem = {
      tick: (t) => order.push(`a${t}`),
      snapshot: () => ({}),
      restore: () => {},
    };
    const b: HarnessSystem = {
      tick: (t) => order.push(`b${t}`),
      snapshot: () => ({}),
      restore: () => {},
    };
    const harness = new SimulationHarness({ systems: [a, b] });

    harness.step(2);

    expect(harness.tick).toBe(2);
    expect(order).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('step(0) and negative steps are no-ops', () => {
    const a = new RecordingSystem();
    const harness = new SimulationHarness({ systems: [a] });
    harness.step(0);
    harness.step(-3);
    expect(harness.tick).toBe(0);
    expect(a.ticks).toEqual([]);
  });

  it('snapshot/restore replays deterministically', () => {
    const make = (): SimulationHarness => {
      const a = new RecordingSystem();
      const b = new RecordingSystem();
      return new SimulationHarness({ systems: [a, b] });
    };

    // Run A: snapshot at 2, then 5 more steps.
    const runA = make();
    runA.step(2);
    const checkpoint = runA.snapshot();
    runA.step(5);
    const endA = runA.snapshot();

    // Run B: restore the checkpoint, then 5 steps — must equal run A's end state.
    const runB = make();
    runB.step(2);
    runB.restore(checkpoint);
    runB.step(5);
    expect(runB.snapshot()).toEqual(endA);
  });

  it('stepUntil stops at the predicate tick and respects maxSteps', () => {
    const a = new RecordingSystem();
    const harness = new SimulationHarness({ systems: [a] });

    const steps = harness.stepUntil((tick) => tick >= 4, 10);
    expect(steps).toBe(4);
    expect(harness.tick).toBe(4);

    const bounded = harness.stepUntil((tick) => tick >= 100, 2);
    expect(bounded).toBe(2);
    expect(harness.tick).toBe(6);
  });

  it('reset restores the initial tick and system states', () => {
    const a = new RecordingSystem();
    const harness = new SimulationHarness({ systems: [a] });
    harness.step(7);
    expect(a.ticks).toHaveLength(7);

    harness.reset();
    expect(harness.tick).toBe(0);
    expect(a.ticks).toEqual([]);
  });

  it('run leaves the harness unchanged afterward', () => {
    const a = new RecordingSystem();
    const harness = new SimulationHarness({ systems: [a] });
    harness.step(7);

    harness.run((h) => h.step(3));
    expect(harness.tick).toBe(7);
    expect(a.ticks).toHaveLength(7);
  });

  it('rejects malformed snapshots without mutation', () => {
    const a = new RecordingSystem();
    const harness = new SimulationHarness({ systems: [a] });
    harness.step(3);

    expect(() => harness.restore({ tick: 1, systems: [] })).toThrow(); // wrong count
    expect(() => harness.restore(null as unknown as { tick: number; systems: unknown[] })).toThrow();
    expect(() => harness.restore({ tick: 'x', systems: [{}] } as unknown as { tick: number; systems: unknown[] })).toThrow();

    expect(harness.tick).toBe(3);
    expect(a.ticks).toHaveLength(3);
  });
});
