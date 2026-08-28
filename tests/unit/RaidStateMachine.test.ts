import { describe, expect, it } from 'vitest';
import {
  startRaid,
  waveComposition,
  spawnWave,
  recordRaiderDeath,
  tickRaid,
  serializeRaid,
  deserializeRaid,
  RAID_BASE_WAVES,
  RAID_MAX_WAVES,
  RAID_TIMEOUT_TICKS,
  type RaidState,
  type RaidWaveEntry,
} from '../../src/simulation/RaidStateMachine';

const total = (wave: readonly RaidWaveEntry[]): number => wave.reduce((s, e) => s + e.count, 0);

describe('startRaid', () => {
  it('starts an ACTIVE raid with the base wave count at bad-omen level 1', () => {
    const raid = startRaid(0, 64, 0, 1);
    expect(raid.status).toBe('ACTIVE');
    expect(raid.totalWaves).toBe(RAID_BASE_WAVES);
    expect(raid.waveIndex).toBe(0);
    expect(raid.raidersRemaining).toBe(0);
    expect(raid.ticks).toBe(0);
    expect(raid).toMatchObject({ centerX: 0, centerY: 64, centerZ: 0 });
  });

  it('adds a wave per bad-omen level above 1', () => {
    expect(startRaid(0, 64, 0, 3).totalWaves).toBe(RAID_BASE_WAVES + 2);
  });

  it('clamps the wave count at RAID_MAX_WAVES', () => {
    expect(startRaid(0, 64, 0, 999).totalWaves).toBe(RAID_MAX_WAVES);
  });

  it('treats a negative bad-omen level as zero', () => {
    expect(startRaid(0, 64, 0, -5).badOmenLevel).toBe(0);
  });
});

describe('waveComposition', () => {
  it('is deterministic for identical inputs', () => {
    expect(waveComposition(2, 1)).toEqual(waveComposition(2, 1));
  });

  it('escalates with the wave index', () => {
    expect(total(waveComposition(2, 1))).toBeGreaterThan(total(waveComposition(0, 1)));
  });

  it('omits zero-count entries', () => {
    for (const entry of waveComposition(0, 1)) {
      expect(entry.count).toBeGreaterThan(0);
    }
    // Wave 0 has no vindicators or ravagers.
    expect(waveComposition(0, 1).some((e) => e.typeKey === 'vindicator')).toBe(false);
    expect(waveComposition(0, 1).some((e) => e.typeKey === 'ravager')).toBe(false);
  });

  it('adds a witch only at bad-omen level 3 or above', () => {
    expect(waveComposition(0, 2).some((e) => e.typeKey === 'witch')).toBe(false);
    expect(waveComposition(0, 3).some((e) => e.typeKey === 'witch')).toBe(true);
  });

  it('clamps negative inputs to zero rather than throwing', () => {
    expect(() => waveComposition(-3, -3)).not.toThrow();
    expect(waveComposition(-3, -3)).toEqual(waveComposition(0, 0));
  });
});

describe('spawnWave', () => {
  it('advances the wave index and seeds the raider count', () => {
    const raid = startRaid(0, 64, 0, 1);
    const { state, wave } = spawnWave(raid);

    expect(state.waveIndex).toBe(1);
    expect(wave.length).toBeGreaterThan(0);
    expect(state.raidersRemaining).toBe(total(wave));
    expect(state.raidersRemaining).toBeGreaterThan(0);
    // Purity: the input state is untouched.
    expect(raid.waveIndex).toBe(0);
  });

  it('refuses to spawn past the final wave', () => {
    const raid: RaidState = { ...startRaid(0, 64, 0, 1), waveIndex: RAID_BASE_WAVES };
    const { state, wave } = spawnWave(raid);

    expect(state).toBe(raid);
    expect(wave).toEqual([]);
  });

  it('refuses to spawn for a terminal raid', () => {
    const raid: RaidState = { ...startRaid(0, 64, 0, 1), status: 'VICTORY' };
    expect(spawnWave(raid).state).toBe(raid);
  });
});

describe('recordRaiderDeath', () => {
  it('decrements the remaining raider count', () => {
    const raid: RaidState = { ...startRaid(0, 64, 0, 1), raidersRemaining: 3 };
    expect(recordRaiderDeath(raid).raidersRemaining).toBe(2);
  });

  it('floors the counter at zero', () => {
    const raid: RaidState = { ...startRaid(0, 64, 0, 1), raidersRemaining: 0 };
    expect(recordRaiderDeath(raid).raidersRemaining).toBe(0);
  });

  it('leaves a terminal raid unchanged', () => {
    const raid: RaidState = { ...startRaid(0, 64, 0, 1), status: 'VICTORY', raidersRemaining: 3 };
    expect(recordRaiderDeath(raid)).toBe(raid);
  });
});

describe('tickRaid', () => {
  it('spawns the next wave when the current one is cleared', () => {
    const raid = startRaid(0, 64, 0, 1);
    const { state, spawned } = tickRaid(raid);

    expect(state.waveIndex).toBe(1);
    expect(spawned).not.toBeNull();
    expect(spawned!.length).toBeGreaterThan(0);
    expect(state.raidersRemaining).toBeGreaterThan(0);
    expect(state.ticks).toBe(1);
  });

  it('does not interrupt a wave still in progress', () => {
    const raid: RaidState = { ...startRaid(0, 64, 0, 1), waveIndex: 1, raidersRemaining: 4 };
    const { state, spawned } = tickRaid(raid);

    expect(spawned).toBeNull();
    expect(state.waveIndex).toBe(1);
    expect(state.raidersRemaining).toBe(4);
    expect(state.ticks).toBe(1);
  });

  it('reaches VICTORY once the final wave is cleared', () => {
    const raid: RaidState = {
      ...startRaid(0, 64, 0, 1),
      waveIndex: RAID_BASE_WAVES,
      raidersRemaining: 0,
    };
    const { state, spawned } = tickRaid(raid);

    expect(state.status).toBe('VICTORY');
    expect(spawned).toBeNull();
  });

  it('reaches DEFEAT once the timeout is exceeded', () => {
    const raid: RaidState = {
      ...startRaid(0, 64, 0, 1),
      waveIndex: 1,
      raidersRemaining: 2,
      ticks: RAID_TIMEOUT_TICKS,
    };
    expect(tickRaid(raid).state.status).toBe('DEFEAT');
  });

  it('leaves a terminal raid unchanged', () => {
    const raid: RaidState = { ...startRaid(0, 64, 0, 1), status: 'DEFEAT' };
    const { state, spawned } = tickRaid(raid);

    expect(state).toBe(raid);
    expect(spawned).toBeNull();
  });

  it('drives a full raid from start to VICTORY', () => {
    let state = startRaid(0, 64, 0, 1);
    let guard = 0;

    while (state.status === 'ACTIVE' && guard++ < 1000) {
      const result = tickRaid(state);
      state = result.state;
      // Clear each spawned wave immediately.
      while (state.raidersRemaining > 0) {
        state = recordRaiderDeath(state);
      }
    }

    expect(state.status).toBe('VICTORY');
    expect(state.waveIndex).toBe(RAID_BASE_WAVES);
  });
});

describe('serializeRaid / deserializeRaid', () => {
  it('round-trips a raid state losslessly', () => {
    const raid: RaidState = { ...startRaid(1, 64, -3, 4), waveIndex: 2, raidersRemaining: 5, ticks: 77 };
    expect(deserializeRaid(serializeRaid(raid))).toEqual(raid);
  });

  it('rejects an unsupported schema version', () => {
    const payload = { ...serializeRaid(startRaid(0, 64, 0, 1)), schemaVersion: 2 };
    expect(() => deserializeRaid(payload)).toThrow();
  });

  it('rejects an unknown status', () => {
    const payload = { ...serializeRaid(startRaid(0, 64, 0, 1)), status: 'PENDING' };
    expect(() => deserializeRaid(payload)).toThrow();
  });

  it('rejects a waveIndex exceeding totalWaves', () => {
    const payload = { ...serializeRaid(startRaid(0, 64, 0, 1)), waveIndex: 99 };
    expect(() => deserializeRaid(payload)).toThrow();
  });

  it('rejects a non-finite center coordinate', () => {
    const payload = { ...serializeRaid(startRaid(0, 64, 0, 1)), centerX: Number.NaN };
    expect(() => deserializeRaid(payload)).toThrow();
  });

  it('rejects a negative raider count', () => {
    const payload = { ...serializeRaid(startRaid(0, 64, 0, 1)), raidersRemaining: -1 };
    expect(() => deserializeRaid(payload)).toThrow();
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeRaid(null)).toThrow();
    expect(() => deserializeRaid('raid')).toThrow();
  });
});
