import { describe, it, expect } from 'vitest';
import {
  RedstoneAutomationHarness,
  AutomationError,
  REDSTONE_CONSTANTS,
} from '../support/RedstoneAutomationHarness';

const { TORCH_UPDATE_DELAY_TICKS, BURNOUT_TOGGLE_LIMIT, BURNOUT_RECOVERY_TICKS } = REDSTONE_CONSTANTS;

describe('redstone-automation: torch-burnout circuit (3.5)', () => {
  it('exactly 8 toggles does not burn out; the 9th does', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'w1' });
    h.buildCircuit('torch-burnout');
    // A toggle fires every TORCH_UPDATE_DELAY_TICKS; 8 toggles land by tick 8*2=16.
    h.step(8 * TORCH_UPDATE_DELAY_TICKS);
    expect(h.isTorchBurnedOut(1)).toBe(false);
    // One more toggle (9th, at tick 18) trips burnout.
    h.step(TORCH_UPDATE_DELAY_TICKS);
    expect(h.isTorchBurnedOut(1)).toBe(true);
    expect(h.isTorchLit(0, 64, 0)).toBe(false);
  });

  it('a burnt-out torch stays unlit, then recovers after BURNOUT_RECOVERY_TICKS of quiet', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'w2' });
    h.buildCircuit('torch-burnout');
    h.step((BURNOUT_TOGGLE_LIMIT + 1) * TORCH_UPDATE_DELAY_TICKS); // burnt out at tick 18
    expect(h.isTorchBurnedOut(1)).toBe(true);
    // Stop driving the oscillator; the torch must stay unlit through the window.
    h.setTorchDriven(false);
    h.step(BURNOUT_RECOVERY_TICKS - 1);
    expect(h.isTorchBurnedOut(1)).toBe(true);
    // After a full quiet recovery window since the last toggle, burnout clears.
    h.step(1);
    expect(h.isTorchBurnedOut(1)).toBe(false);
  });

  it('a healthy torch is unaffected by a saveReload round-trip', async () => {
    const h = new RedstoneAutomationHarness({ worldId: 'w3' });
    h.buildCircuit('torch-burnout');
    h.step(4 * TORCH_UPDATE_DELAY_TICKS); // 4 toggles, healthy
    expect(h.isTorchBurnedOut(1)).toBe(false);
    const hashBefore = h.stateHash();
    await h.saveReload();
    expect(h.isTorchBurnedOut(1)).toBe(false);
    expect(h.isTorchLit(0, 64, 0)).toBe(true); // 4 toggles (even) → lit again
    expect(h.stateHash()).toBe(hashBefore);
  });

  it('a burnt-out torch state and toggle history survive saveReload with correct recovery', async () => {
    const h = new RedstoneAutomationHarness({ worldId: 'w4' });
    h.buildCircuit('torch-burnout');
    h.step((BURNOUT_TOGGLE_LIMIT + 1) * TORCH_UPDATE_DELAY_TICKS); // burnt out
    expect(h.isTorchBurnedOut(1)).toBe(true);
    await h.saveReload();
    expect(h.isTorchBurnedOut(1)).toBe(true); // still burnt out immediately after reload
    h.setTorchDriven(false);
    h.step(BURNOUT_RECOVERY_TICKS);
    expect(h.isTorchBurnedOut(1)).toBe(false); // recovers after the quiet window
  });

  it('a burnt-out torch survives cycleChunk and recovers with correct timing', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'w5' });
    h.buildCircuit('torch-burnout');
    h.step((BURNOUT_TOGGLE_LIMIT + 1) * TORCH_UPDATE_DELAY_TICKS); // burnt out at tick 18
    expect(h.isTorchBurnedOut(1)).toBe(true);
    h.cycleChunk(0, 0);
    expect(h.isTorchBurnedOut(1)).toBe(true); // preserved across chunk cycle
    h.setTorchDriven(false);
    h.step(BURNOUT_RECOVERY_TICKS);
    expect(h.isTorchBurnedOut(1)).toBe(false);
  });
});

describe('redstone-automation: determinism + harness invariants (2.x / 3.6 / 4.1)', () => {
  it('same input rerun produces an identical stateHash', () => {
    const run = () => {
      const h = new RedstoneAutomationHarness({ worldId: 'det' });
      h.buildCircuit('torch-burnout');
      h.step((BURNOUT_TOGGLE_LIMIT + 1) * TORCH_UPDATE_DELAY_TICKS);
      return h;
    };
    expect(run().stateHash()).toBe(run().stateHash());
  });

  it('stateHash is stable for unchanged state', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'stable' });
    h.buildCircuit('torch-burnout');
    const a = h.stateHash();
    const b = h.stateHash();
    expect(a).toBe(b);
    h.step(2);
    expect(h.stateHash()).not.toBe(a);
  });

  it('stepUntil budget exhaustion returns false and leaves the predicate false', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'budget' });
    h.buildCircuit('torch-burnout');
    const met = h.stepUntil(() => false, 5);
    expect(met).toBe(false);
    expect(h.snapshot().tick).toBe(5);
  });

  it('a malformed snapshot is rejected atomically (harness unchanged)', () => {
    const h = new RedstoneAutomationHarness({ worldId: 'bad' });
    h.buildCircuit('torch-burnout');
    h.step(4);
    const before = h.snapshot();
    const bad = { ...before, version: 2 } as unknown as Parameters<RedstoneAutomationHarness['restore']>[0];
    let code = '';
    try {
      h.restore(bad);
    } catch (e) {
      code = e instanceof AutomationError ? e.code : '';
    }
    expect(code).toBe('malformed_snapshot');
    expect(h.snapshot()).toEqual(before);
  });

  it('restore(snapshot()) is idempotent', () => {
    const a = new RedstoneAutomationHarness({ worldId: 'idem' });
    a.buildCircuit('torch-burnout');
    a.step((BURNOUT_TOGGLE_LIMIT + 1) * TORCH_UPDATE_DELAY_TICKS);
    const snap = a.snapshot();
    const b = new RedstoneAutomationHarness({ worldId: 'idem' });
    b.restore(snap);
    expect(b.stateHash()).toBe(a.stateHash());
  });
});
