import { describe, expect, it } from 'vitest';
import { createBadOmen, type VillageContext } from '../../src/simulation/BadOmenRules';
import { heroAmplifierFromBadOmen, shouldGrantHeroOfTheVillage } from '../../src/simulation/HeroOfTheVillage';
import {
  RAID_ESCALATION_RADIUS,
  escalateRaid,
  isRaidInVillage,
  raidWavesForOmen,
  resolveVillageOmenAction,
} from '../../src/simulation/RaidEscalation';
import {
  RAID_MAX_WAVES,
  recordRaiderDeath,
  startRaid,
  tickRaid,
  waveComposition,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';

const village = (over: Partial<VillageContext> = {}): VillageContext => ({
  centerX: 8,
  centerY: 64,
  centerZ: 8,
  containsPlayer: true,
  ...over,
});

/** An ACTIVE raid with wave 1 spawned and some progress on the clock. */
function activeRaid(level: number, x = 8, y = 64, z = 8): RaidState {
  let s = tickRaid(startRaid(x, y, z, level)).state;
  for (let i = 0; i < 37; i++) s = tickRaid(s).state;
  return recordRaiderDeath(s);
}

describe('raidWavesForOmen (294)', () => {
  it('matches the 152 startRaid wave table for every level', () => {
    expect([0, 1, 2, 3, 4, 5].map(raidWavesForOmen)).toEqual([3, 3, 4, 5, 6, 7]);
    for (let l = 0; l <= 5; l++) expect(raidWavesForOmen(l)).toBe(startRaid(0, 0, 0, l).totalWaves);
    expect(raidWavesForOmen(99)).toBe(RAID_MAX_WAVES);
    expect(raidWavesForOmen(Number.NaN)).toBe(3);
  });
});

describe('escalateRaid (294)', () => {
  it.each([
    [1, 1, 2, 3, 4],
    [1, 2, 3, 3, 5],
    [2, 5, 5, 4, 7],
    [3, 1, 4, 5, 6],
    [4, 4, 5, 6, 7],
  ])('raid %i + player %i → level %i, waves %i → %i', (raidLevel, player, after, wavesBefore, wavesAfter) => {
    const raid = activeRaid(raidLevel);
    expect(raid.totalWaves).toBe(wavesBefore);
    const r = escalateRaid(raid, player);
    expect(r.applied).toBe(true);
    expect(r.levelBefore).toBe(raidLevel);
    expect(r.levelAfter).toBe(after);
    expect(r.wavesBefore).toBe(wavesBefore);
    expect(r.wavesAfter).toBe(wavesAfter);
    expect(r.state.badOmenLevel).toBe(after);
    expect(r.state.totalWaves).toBe(wavesAfter);
  });

  it('keeps status, center, wave progress, remaining raiders and the clock', () => {
    const raid = activeRaid(1, 3, 70, -9);
    const { state } = escalateRaid(raid, 2);
    for (const k of ['status', 'centerX', 'centerY', 'centerZ', 'waveIndex', 'raidersRemaining', 'ticks'] as const) {
      expect(state[k]).toBe(raid[k]);
    }
    expect(Object.keys(state).sort()).toEqual(Object.keys(raid).sort());
    expect(state.status).toBe('ACTIVE');
    expect(raid.badOmenLevel).toBe(1); // input not mutated
  });

  it('at the cap the escalation still applies (omen consumed) without changing level or waves', () => {
    const raid = activeRaid(5);
    const r = escalateRaid(raid, 3);
    expect(r.applied).toBe(true);
    expect(r.state.badOmenLevel).toBe(5);
    expect(r.state.totalWaves).toBe(7);
  });

  it('never shrinks an already larger wave total', () => {
    const raid: RaidState = { ...activeRaid(1), totalWaves: 6 };
    const r = escalateRaid(raid, 1); // table(2) = 4 < 6
    expect(r.state.totalWaves).toBe(6);
    expect(r.state.badOmenLevel).toBe(2);
  });

  it('terminal/inactive raids and invalid player levels are not applied (same object)', () => {
    const raid = activeRaid(2);
    for (const status of ['VICTORY', 'DEFEAT', 'INACTIVE'] as const) {
      const s = { ...raid, status };
      const r = escalateRaid(s, 2);
      expect(r.applied).toBe(false);
      expect(r.state).toBe(s);
    }
    for (const bad of [0, -3, 0.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const r = escalateRaid(raid, bad);
      expect(r.applied).toBe(false);
      expect(r.state).toBe(raid);
    }
    // Oversized player levels clamp to the cap.
    expect(escalateRaid(raid, 1e9).state.badOmenLevel).toBe(5);
  });

  it('later waves use the escalated level in the unchanged composition table (witch from level 3)', () => {
    let s = escalateRaid(activeRaid(1), 2).state;
    // clear the current wave; the next wave is rolled at the escalated level
    while (s.raidersRemaining > 0) s = recordRaiderDeath(s);
    const { state, spawned } = tickRaid(s);
    expect(spawned).toEqual(waveComposition(1, 3));
    expect(spawned!.some((e) => e.typeKey === 'witch')).toBe(true);
    expect(state.waveIndex).toBe(2);
  });

  it('an escalated raid needs the extra waves before VICTORY and grants HOTV at the escalated level', () => {
    let s = escalateRaid(activeRaid(1), 2).state; // level 3, 5 waves
    let prev: RaidState['status'] = s.status;
    let waves = s.waveIndex;
    let hero: number | null = null;
    for (let guard = 0; guard < 50 && s.status === 'ACTIVE'; guard++) {
      while (s.raidersRemaining > 0) s = recordRaiderDeath(s);
      prev = s.status;
      s = tickRaid(s).state;
      waves = Math.max(waves, s.waveIndex);
      if (shouldGrantHeroOfTheVillage(prev, s.status)) hero = heroAmplifierFromBadOmen(s.badOmenLevel);
    }
    expect(s.status).toBe('VICTORY');
    expect(waves).toBe(5);
    expect(hero).toBe(2); // level 3 → HOTV III (amplifier 2)
    // Escalated to the cap → HOTV V.
    let c = escalateRaid(activeRaid(2), 5).state;
    while (c.status === 'ACTIVE') {
      while (c.raidersRemaining > 0) c = recordRaiderDeath(c);
      c = tickRaid(c).state;
    }
    expect(heroAmplifierFromBadOmen(c.badOmenLevel)).toBe(4);
  });
});

describe('isRaidInVillage (294)', () => {
  it('requires an ACTIVE raid strictly within 96 blocks (3D)', () => {
    const v = village();
    expect(RAID_ESCALATION_RADIUS).toBe(96);
    expect(isRaidInVillage(activeRaid(1, 8, 64, 8), v)).toBe(true);
    expect(isRaidInVillage(activeRaid(1, 8 + 95.9, 64, 8), v)).toBe(true);
    expect(isRaidInVillage(activeRaid(1, 8 + 96, 64, 8), v)).toBe(false);
    expect(isRaidInVillage(activeRaid(1, 8, 64 + 96, 8), v)).toBe(false);
    expect(isRaidInVillage(activeRaid(1, 8 + 60, 64 + 60, 8 + 60), v)).toBe(false); // 3D ≈ 103.9
    expect(isRaidInVillage({ ...activeRaid(1), status: 'VICTORY' }, v)).toBe(false);
    expect(isRaidInVillage({ ...activeRaid(1), centerX: Number.NaN }, v)).toBe(false);
    expect(isRaidInVillage(null, v)).toBe(false);
    expect(isRaidInVillage(undefined, v)).toBe(false);
  });
});

describe('resolveVillageOmenAction (294)', () => {
  it('keeps the 285 NONE decisions and their precedence', () => {
    const raid = activeRaid(1);
    expect(resolveVillageOmenAction(createBadOmen(0), village(), raid)).toEqual({ kind: 'NONE', reason: 'NO_OMEN' });
    expect(resolveVillageOmenAction(createBadOmen(2), null, raid)).toEqual({ kind: 'NONE', reason: 'NO_VILLAGE' });
    expect(resolveVillageOmenAction(createBadOmen(2), village({ containsPlayer: false }), raid)).toEqual({
      kind: 'NONE',
      reason: 'NOT_INSIDE',
    });
    expect(resolveVillageOmenAction(createBadOmen(2), village({ centerZ: Number.NaN }), raid)).toEqual({
      kind: 'NONE',
      reason: 'INVALID_CENTER',
    });
  });

  it('escalates an ACTIVE raid in the village with a before/after preview', () => {
    expect(resolveVillageOmenAction(createBadOmen(2), village(), activeRaid(1, 10, 64, 8))).toEqual({
      kind: 'ESCALATE_RAID',
      centerX: 8,
      centerY: 64,
      centerZ: 8,
      badOmenLevel: 2,
      raidLevelBefore: 1,
      raidLevelAfter: 3,
      totalWavesBefore: 3,
      totalWavesAfter: 5,
    });
  });

  it('starts a raid when there is none, it finished, or it is 96+ blocks away', () => {
    const start = { kind: 'START_RAID', centerX: 8, centerY: 64, centerZ: 8, badOmenLevel: 2 };
    expect(resolveVillageOmenAction(createBadOmen(2), village(), null)).toEqual(start);
    expect(resolveVillageOmenAction(createBadOmen(2), village(), { ...activeRaid(1), status: 'VICTORY' })).toEqual(start);
    expect(resolveVillageOmenAction(createBadOmen(2), village(), { ...activeRaid(1), status: 'DEFEAT' })).toEqual(start);
    expect(resolveVillageOmenAction(createBadOmen(2), village(), activeRaid(1, 8 + 200, 64, 8))).toEqual(start);
  });
});
