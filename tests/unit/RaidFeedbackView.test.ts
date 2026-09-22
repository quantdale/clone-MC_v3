import { describe, it, expect } from 'vitest';
import { projectRaidFeedback } from '../../src/ui/RaidFeedbackView';
import {
  startRaid,
  tickRaid,
  RAID_BASE_WAVES,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';

function active(overrides: Partial<RaidState> = {}): RaidState {
  return {
    ...startRaid(0, 64, 0, 1),
    status: 'ACTIVE',
    waveIndex: 2,
    totalWaves: 3,
    raidersRemaining: 4,
    ...overrides,
  };
}

describe('projectRaidFeedback (282)', () => {
  it('is total for null: hidden, empty detail, progress 0, no throw', () => {
    const view = projectRaidFeedback(null);
    expect(view.visible).toBe(false);
    expect(view.status).toBe('NONE');
    expect(view.detail).toBe('');
    expect(view.progress).toBe(0);
    expect(view.title).toBe('');
    expect(view.ariaLabel).toBe('');
  });

  it('hides an INACTIVE state safely', () => {
    const view = projectRaidFeedback({ ...startRaid(0, 64, 0, 1), status: 'INACTIVE' });
    expect(view.visible).toBe(false);
    expect(view.status).toBe('NONE');
    expect(view.detail).toBe('');
    expect(view.progress).toBe(0);
  });

  it('shows active wave/total/remaining with clamped progress and raid label', () => {
    const view = projectRaidFeedback(active());
    expect(view.visible).toBe(true);
    expect(view.status).toBe('ACTIVE');
    expect(view.title).toBe('Raid');
    expect(view.detail).toBe('Wave 2/3 · 4 raiders remaining');
    expect(view.progress).toBeCloseTo(2 / 3, 10);
    expect(view.progress).toBeGreaterThanOrEqual(0);
    expect(view.progress).toBeLessThanOrEqual(1);
    expect(view.ariaLabel).toContain('Raid active');
    expect(view.ariaLabel).toContain('Wave 2/3');
  });

  it('clamps an active progress that would leave [0,1]', () => {
    const high = projectRaidFeedback(active({ waveIndex: 99, totalWaves: 3 }));
    expect(high.progress).toBe(1);
    const zero = projectRaidFeedback(active({ waveIndex: 0, totalWaves: 3 }));
    expect(zero.progress).toBe(0);
    const zeroTotal = projectRaidFeedback(active({ waveIndex: 1, totalWaves: 0 }));
    expect(zeroTotal.progress).toBe(0);
  });

  it('never emits a non-finite progress for hostile counters', () => {
    const hostile = projectRaidFeedback(
      active({ waveIndex: Number.NaN, totalWaves: Number.POSITIVE_INFINITY }),
    );
    expect(Number.isFinite(hostile.progress)).toBe(true);
    expect(hostile.progress).toBeGreaterThanOrEqual(0);
    expect(hostile.progress).toBeLessThanOrEqual(1);
  });

  it('renders VICTORY with full progress and all-waves-cleared detail', () => {
    const view = projectRaidFeedback({ ...active(), status: 'VICTORY' });
    expect(view.visible).toBe(true);
    expect(view.status).toBe('VICTORY');
    expect(view.title).toBe('Raid victory');
    expect(view.detail).toContain('All waves cleared');
    expect(view.progress).toBe(1);
  });

  it('renders DEFEAT with the reached wave and a clamped fraction', () => {
    const view = projectRaidFeedback({
      ...active({ waveIndex: 2, totalWaves: 3 }),
      status: 'DEFEAT',
    });
    expect(view.visible).toBe(true);
    expect(view.status).toBe('DEFEAT');
    expect(view.title).toBe('Raid defeated');
    expect(view.detail).toContain('wave 2');
    expect(view.progress).toBeCloseTo(2 / 3, 10);
  });

  it('is derived from a real started raid (wave 1 of base waves)', () => {
    let { state } = tickRaid(startRaid(1, 64, -1, 1));
    expect(state.status).toBe('ACTIVE');
    expect(state.waveIndex).toBe(1);
    expect(state.totalWaves).toBe(RAID_BASE_WAVES);
    expect(state.raidersRemaining).toBeGreaterThan(0);
    const view = projectRaidFeedback(state);
    expect(view.visible).toBe(true);
    expect(view.detail).toBe(
      `Wave 1/${RAID_BASE_WAVES} · ${state.raidersRemaining} raiders remaining`,
    );
    expect(view.progress).toBeCloseTo(1 / RAID_BASE_WAVES, 10);
  });
});
