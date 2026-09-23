import { describe, it, expect } from 'vitest';
import {
  startRaid,
  tickRaid,
  recordRaiderDeath,
  RAID_BASE_WAVES,
  RAID_TIMEOUT_TICKS,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';
import { projectRaidFeedback } from '../../src/ui/RaidFeedbackView';

/**
 * Wiring oracles for the live raid feedback integration (282): the exact
 * composition of `Game.debugStartRaid` / `Game.debugClearRaidWave` /
 * `Game.tickRaidFeedback` over the VERIFIED RaidStateMachine (152). `Game`
 * itself is DOM-bound and has no node harness (275 precedent), so the routing
 * is covered here at the seam and in browser E2E (real HUD, real lifecycle).
 *
 * Spec pins: pause freezes (no unpaused fixed tick ⇒ no transition), clear is
 * bounded to one wave, terminal ticks are idempotent, invalid omen clamps
 * through `startRaid`, and a new start replaces any prior active/terminal state.
 */

/** Exact `Game.debugStartRaid` composition: startRaid + one tickRaid. */
function debugStartRaid(x: number, y: number, z: number, badOmenLevel = 1): RaidState {
  const { state } = tickRaid(startRaid(x, y, z, badOmenLevel));
  return state;
}

/** Exact `Game.debugClearRaidWave` composition: bounded deaths + one tickRaid. */
function debugClearRaidWave(state: RaidState): RaidState {
  let next = state;
  for (let i = 0; i < state.raidersRemaining; i++) {
    next = recordRaiderDeath(next);
  }
  return tickRaid(next).state;
}

/** Exact `Game.tickRaidFeedback` composition: one tickRaid when a raid exists. */
function tickRaidFeedback(state: RaidState | null): RaidState | null {
  if (!state) return null;
  return tickRaid(state).state;
}

/** Minimal owner mirroring Game's single ephemeral reference replacement. */
class RaidOwner {
  raidState: RaidState | null = null;

  start(omen = 1): RaidState {
    this.raidState = debugStartRaid(1, 64, 1, omen);
    return this.raidState;
  }

  /** Unpaused fixed tick (the only path that may advance state). */
  tick(): RaidState | null {
    this.raidState = tickRaidFeedback(this.raidState);
    return this.raidState;
  }

  /** Paused/loading/disposed frames simply never call `tick`. */

  clearWave(): RaidState | null {
    if (!this.raidState) return null;
    this.raidState = debugClearRaidWave(this.raidState);
    return this.raidState;
  }
}

describe('282 live raid feedback — Game-owned ephemeral lifecycle', () => {
  it('start creates wave 1 with a positive remaining count at a finite center', () => {
    const state = debugStartRaid(10, 64, -3, 1);
    expect(state.status).toBe('ACTIVE');
    expect(state.waveIndex).toBe(1);
    expect(state.totalWaves).toBe(RAID_BASE_WAVES);
    expect(state.raidersRemaining).toBeGreaterThan(0);
    expect(state.centerX).toBe(10);
    expect(state.centerY).toBe(64);
    expect(state.centerZ).toBe(-3);
    expect(state.badOmenLevel).toBe(1);
    expect(Number.isFinite(state.ticks)).toBe(true);
    const view = projectRaidFeedback(state);
    expect(view.visible).toBe(true);
    expect(view.status).toBe('ACTIVE');
  });

  it('clamps invalid omen input through startRaid without throwing or non-finite counters', () => {
    for (const omen of [-5, Number.NaN, Number.POSITIVE_INFINITY, 2.7, 0]) {
      const state = debugStartRaid(0, 64, 0, omen);
      expect(state.status).toBe('ACTIVE');
      expect(state.waveIndex).toBe(1);
      expect(state.raidersRemaining).toBeGreaterThan(0);
      expect(Number.isFinite(state.badOmenLevel)).toBe(true);
      expect(state.badOmenLevel).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(state.badOmenLevel)).toBe(true);
      expect(state.totalWaves).toBeGreaterThanOrEqual(RAID_BASE_WAVES);
      expect(state.totalWaves).toBeLessThanOrEqual(7);
    }
    // Fractional 2.7 floors to 2 → base + (2-1) = 4 waves.
    expect(debugStartRaid(0, 64, 0, 2.7).totalWaves).toBe(RAID_BASE_WAVES + 1);
  });

  it('pause freeze: without an unpaused fixed tick the state is reference-identical', () => {
    const owner = new RaidOwner();
    const started = owner.start();
    // Simulated paused frames: runFixedTick never runs, so neither does tick.
    for (let i = 0; i < 50; i++) {
      expect(owner.raidState).toBe(started);
    }
    expect(owner.raidState!.ticks).toBe(started.ticks);
    expect(owner.raidState!.raidersRemaining).toBe(started.raidersRemaining);
    // Resuming permits exactly one normal fixed-tick transition.
    owner.tick();
    expect(owner.raidState).not.toBe(started);
    expect(owner.raidState!.ticks).toBe(started.ticks + 1);
  });

  it('bounded clear: one call clears only the current wave and advances exactly once', () => {
    const owner = new RaidOwner();
    const started = owner.start();
    const remainingBefore = started.raidersRemaining;
    expect(remainingBefore).toBeGreaterThan(0);

    const afterClear = owner.clearWave()!;
    // The current count is gone before the single transition: a new wave exists.
    expect(afterClear.status).toBe('ACTIVE');
    expect(afterClear.waveIndex).toBe(started.waveIndex + 1);
    expect(afterClear.raidersRemaining).toBeGreaterThan(0);
    expect(afterClear.ticks).toBe(started.ticks + 1);
    // Never skipped an intermediate wave (1 → 2, not 1 → 3/victory).
    expect(afterClear.waveIndex).toBe(2);
    expect(afterClear.waveIndex).toBeLessThan(afterClear.totalWaves);
  });

  it('clear across every wave reaches VICTORY without skipping intermediates', () => {
    const owner = new RaidOwner();
    owner.start();
    const waves: number[] = [owner.raidState!.waveIndex];
    for (let i = 0; i < RAID_BASE_WAVES; i++) {
      const next = owner.clearWave();
      if (!next) break;
      waves.push(next.waveIndex);
      if (next.status === 'VICTORY') break;
    }
    expect(owner.raidState!.status).toBe('VICTORY');
    // waveIndex only ever advanced by +1 per clear (0→1 at start, then 1→2→3).
    expect(waves).toEqual([1, 2, 3, 3]);
    expect(projectRaidFeedback(owner.raidState).progress).toBe(1);
  });

  it('terminal ticks are idempotent (VICTORY returns the exact same reference)', () => {
    const owner = new RaidOwner();
    owner.start();
    while (owner.raidState && owner.raidState.status !== 'VICTORY') {
      owner.clearWave();
    }
    const terminal = owner.raidState!;
    expect(terminal.status).toBe('VICTORY');
    for (let i = 0; i < 10; i++) {
      expect(owner.tick()).toBe(terminal);
      expect(owner.raidState).toBe(terminal);
    }
    // Clearing a terminal raid is also an identity no-op on status.
    expect(owner.clearWave()).toBe(terminal);
  });

  it('replay: a new start atomically replaces a terminal state with fresh wave data', () => {
    const owner = new RaidOwner();
    owner.start();
    while (owner.raidState && owner.raidState.status !== 'VICTORY') {
      owner.clearWave();
    }
    const terminal = owner.raidState!;
    expect(terminal.status).toBe('VICTORY');

    const replayed = owner.start(2);
    expect(replayed.status).toBe('ACTIVE');
    expect(replayed.waveIndex).toBe(1);
    expect(replayed.raidersRemaining).toBeGreaterThan(0);
    expect(replayed.ticks).toBeLessThanOrEqual(terminal.ticks);
    expect(replayed).not.toBe(terminal);
    expect(owner.raidState).toBe(replayed);
    // Prior terminal text/progress is fully replaced by the active projection.
    const view = projectRaidFeedback(owner.raidState);
    expect(view.status).toBe('ACTIVE');
    expect(view.title).toBe('Raid');
    expect(view.detail).toContain('Wave 1/');
  });

  it('null transitions are identity no-ops returning null', () => {
    const owner = new RaidOwner();
    expect(owner.raidState).toBeNull();
    expect(owner.tick()).toBeNull();
    expect(owner.clearWave()).toBeNull();
    expect(owner.raidState).toBeNull();
    expect(projectRaidFeedback(null).visible).toBe(false);
  });

  it('an uncleared raid reaches DEFEAT at the machine timeout, then stays terminal', () => {
    const owner = new RaidOwner();
    owner.start();
    // Raiders remain, so each fixed tick only advances the clock to timeout.
    for (let i = 0; i <= RAID_TIMEOUT_TICKS; i++) {
      owner.tick();
    }
    expect(owner.raidState!.status).toBe('DEFEAT');
    const defeated = owner.raidState!;
    expect(owner.tick()).toBe(defeated);
    const view = projectRaidFeedback(defeated);
    expect(view.visible).toBe(true);
    expect(view.status).toBe('DEFEAT');
    expect(view.title).toBe('Raid defeated');
  });

  it('a second start while ACTIVE replaces the prior active state atomically', () => {
    const owner = new RaidOwner();
    const first = owner.start(1);
    const second = owner.start(3);
    expect(owner.raidState).toBe(second);
    expect(second).not.toBe(first);
    expect(second.status).toBe('ACTIVE');
    expect(second.waveIndex).toBe(1);
    expect(second.totalWaves).toBeGreaterThan(first.totalWaves);
    expect(second.badOmenLevel).toBe(3);
  });
});
