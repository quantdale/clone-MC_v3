import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  BossRegistry,
  createDefaultBossRegistry,
  startBossFight,
  phaseForHealthFraction,
  damageBoss,
  healBoss,
  tickBossFight,
  bossBarSnapshot,
  serializeBoss,
  deserializeBoss,
  BOSS_SPAWN_TICKS,
  type BossDefinition,
  type BossPhase,
  type BossState,
} from '../../src/simulation/BossFramework';

const registry = createDefaultBossRegistry();
const dragon = registry.getByKey('ender_dragon')!;

function definition(overrides: Partial<BossDefinition> = {}): BossDefinition {
  return {
    id: createResourceId('test', 'boss/test'),
    key: 'test',
    name: 'Test Boss',
    maxHealth: 100,
    phases: [
      { name: 'one', healthThreshold: 1 },
      { name: 'two', healthThreshold: 0.5 },
    ],
    barColor: '#ffffff',
    ...overrides,
  };
}

describe('BossRegistry', () => {
  it('builds the default registry and looks up by key', () => {
    expect(registry.finalized).toBe(true);
    expect(registry.size).toBe(2);
    expect(dragon.maxHealth).toBeGreaterThan(0);
    expect(dragon.phases.length).toBeGreaterThanOrEqual(2);
    expect(registry.getByKey('wither')).toBeDefined();
    expect(registry.getByKey('nonexistent')).toBeUndefined();
  });

  it('rejects a non-positive maxHealth', () => {
    expect(() => new BossRegistry([definition({ maxHealth: 0 })])).toThrow();
    expect(() => new BossRegistry([definition({ maxHealth: -10 })])).toThrow();
  });

  it('rejects an empty phase list', () => {
    expect(() => new BossRegistry([definition({ phases: [] })])).toThrow();
  });

  it('rejects non-strictly-descending thresholds', () => {
    const ascending: BossPhase[] = [
      { name: 'one', healthThreshold: 1 },
      { name: 'two', healthThreshold: 1 },
    ];
    expect(() => new BossRegistry([definition({ phases: ascending })])).toThrow();
  });

  it('rejects a first threshold below 1', () => {
    const phases: BossPhase[] = [
      { name: 'one', healthThreshold: 0.9 },
      { name: 'two', healthThreshold: 0.4 },
    ];
    expect(() => new BossRegistry([definition({ phases })])).toThrow();
  });

  it('rejects a threshold outside [0, 1]', () => {
    const phases: BossPhase[] = [
      { name: 'one', healthThreshold: 1 },
      { name: 'two', healthThreshold: -0.2 },
    ];
    expect(() => new BossRegistry([definition({ phases })])).toThrow();
  });
});

describe('phaseForHealthFraction', () => {
  it('resolves full health to the first phase', () => {
    expect(phaseForHealthFraction(dragon, 1)).toBe(0);
  });

  it('enters a phase exactly at its threshold', () => {
    expect(phaseForHealthFraction(dragon, dragon.phases[1]!.healthThreshold)).toBe(1);
  });

  it('resolves below the last threshold to the last phase', () => {
    expect(phaseForHealthFraction(dragon, 0)).toBe(dragon.phases.length - 1);
  });

  it('clamps out-of-range fractions', () => {
    expect(phaseForHealthFraction(dragon, 5)).toBe(0);
    expect(phaseForHealthFraction(dragon, -5)).toBe(dragon.phases.length - 1);
  });
});

describe('startBossFight', () => {
  it('starts SPAWNING at full health in phase 0', () => {
    const state = startBossFight(dragon);
    expect(state).toEqual({
      bossKey: dragon.key,
      status: 'SPAWNING',
      health: dragon.maxHealth,
      phaseIndex: 0,
      ticks: 0,
    });
  });
});

describe('damageBoss', () => {
  it('reduces health without changing phase for a small hit', () => {
    const state = startBossFight(dragon);
    const result = damageBoss(state, dragon, 10);

    expect(result.state.health).toBe(dragon.maxHealth - 10);
    expect(result.phaseChanged).toBe(false);
    expect(result.defeated).toBe(false);
    // Purity: the input state is untouched.
    expect(state.health).toBe(dragon.maxHealth);
  });

  it('reports a phase change when crossing a threshold', () => {
    const state = startBossFight(dragon);
    // Drop below the second phase's threshold.
    const amount = dragon.maxHealth * (1 - dragon.phases[1]!.healthThreshold) + 1;
    const result = damageBoss(state, dragon, amount);

    expect(result.phaseChanged).toBe(true);
    expect(result.state.phaseIndex).toBeGreaterThan(state.phaseIndex);
  });

  it('defeats the boss exactly once', () => {
    const state = startBossFight(dragon);
    const first = damageBoss(state, dragon, dragon.maxHealth + 50);

    expect(first.state.health).toBe(0);
    expect(first.state.status).toBe('DEFEATED');
    expect(first.defeated).toBe(true);

    const second = damageBoss(first.state, dragon, 10);
    expect(second.state).toBe(first.state);
    expect(second.defeated).toBe(false);
  });

  it('is a no-op for a non-positive or non-finite amount', () => {
    const state = startBossFight(dragon);
    for (const amount of [0, -5, Number.NaN]) {
      const result = damageBoss(state, dragon, amount);
      expect(result.state).toBe(state);
      expect(result.phaseChanged).toBe(false);
      expect(result.defeated).toBe(false);
    }
  });

  it('keeps phaseIndex consistent with phaseForHealthFraction', () => {
    let state = startBossFight(dragon);
    for (let i = 0; i < 10; i++) {
      state = damageBoss(state, dragon, 15).state;
      expect(state.phaseIndex).toBe(phaseForHealthFraction(dragon, state.health / dragon.maxHealth));
    }
  });
});

describe('healBoss', () => {
  it('restores an earlier phase when healed above a threshold', () => {
    const damaged = damageBoss(startBossFight(dragon), dragon, dragon.maxHealth * 0.8).state;
    expect(damaged.phaseIndex).toBeGreaterThan(0);

    const healed = healBoss(damaged, dragon, dragon.maxHealth * 0.8);
    expect(healed.phaseIndex).toBe(0);
  });

  it('caps healing at maxHealth', () => {
    const damaged = damageBoss(startBossFight(dragon), dragon, 50).state;
    expect(healBoss(damaged, dragon, 9999).health).toBe(dragon.maxHealth);
  });

  it('never revives a defeated boss', () => {
    const defeated = damageBoss(startBossFight(dragon), dragon, dragon.maxHealth).state;
    expect(defeated.status).toBe('DEFEATED');

    const healed = healBoss(defeated, dragon, 100);
    expect(healed).toBe(defeated);
    expect(healed.status).toBe('DEFEATED');
  });

  it('is a no-op for a non-positive amount', () => {
    const damaged = damageBoss(startBossFight(dragon), dragon, 50).state;
    expect(healBoss(damaged, dragon, 0)).toBe(damaged);
    expect(healBoss(damaged, dragon, -10)).toBe(damaged);
  });
});

describe('tickBossFight', () => {
  it('promotes SPAWNING to ACTIVE after BOSS_SPAWN_TICKS', () => {
    let state = startBossFight(dragon);
    for (let i = 0; i < BOSS_SPAWN_TICKS - 1; i++) {
      state = tickBossFight(state);
    }
    expect(state.status).toBe('SPAWNING');

    state = tickBossFight(state);
    expect(state.status).toBe('ACTIVE');
    expect(state.ticks).toBe(BOSS_SPAWN_TICKS);
  });

  it('leaves a defeated boss unchanged', () => {
    const defeated = damageBoss(startBossFight(dragon), dragon, dragon.maxHealth).state;
    expect(tickBossFight(defeated)).toBe(defeated);
  });
});

describe('bossBarSnapshot', () => {
  it('projects half health as half progress with the right phase name', () => {
    const state = damageBoss(startBossFight(dragon), dragon, dragon.maxHealth / 2).state;
    const snapshot = bossBarSnapshot(state, dragon);

    expect(snapshot.progress).toBeCloseTo(0.5);
    expect(snapshot.name).toBe(dragon.name);
    expect(snapshot.color).toBe(dragon.barColor);
    expect(snapshot.phaseName).toBe(dragon.phases[phaseForHealthFraction(dragon, 0.5)]!.name);
  });

  it('reports zero progress for a defeated boss', () => {
    const defeated = damageBoss(startBossFight(dragon), dragon, dragon.maxHealth).state;
    expect(bossBarSnapshot(defeated, dragon).progress).toBe(0);
  });
});

describe('serializeBoss / deserializeBoss', () => {
  it('round-trips a boss state losslessly', () => {
    const state = damageBoss(tickBossFight(startBossFight(dragon)), dragon, 42).state;
    expect(deserializeBoss(serializeBoss(state))).toEqual(state);
  });

  it('rejects an unsupported schema version', () => {
    const payload = { ...serializeBoss(startBossFight(dragon)), schemaVersion: 2 };
    expect(() => deserializeBoss(payload)).toThrow();
  });

  it('rejects an unknown status', () => {
    const payload = { ...serializeBoss(startBossFight(dragon)), status: 'RESTING' };
    expect(() => deserializeBoss(payload)).toThrow();
  });

  it('rejects a negative health', () => {
    const payload = { ...serializeBoss(startBossFight(dragon)), health: -1 };
    expect(() => deserializeBoss(payload)).toThrow();
  });

  it('rejects a negative phaseIndex or ticks', () => {
    const base = serializeBoss(startBossFight(dragon));
    expect(() => deserializeBoss({ ...base, phaseIndex: -1 })).toThrow();
    expect(() => deserializeBoss({ ...base, ticks: -1 })).toThrow();
  });

  it('rejects an empty bossKey and non-object payloads', () => {
    const base = serializeBoss(startBossFight(dragon));
    expect(() => deserializeBoss({ ...base, bossKey: '' })).toThrow();
    expect(() => deserializeBoss(null)).toThrow();
    expect(() => deserializeBoss('boss')).toThrow();
  });
});

describe('full fight lifecycle', () => {
  it('drives a boss from spawn through every phase to defeat', () => {
    let state: BossState = startBossFight(dragon);
    for (let i = 0; i < BOSS_SPAWN_TICKS; i++) state = tickBossFight(state);
    expect(state.status).toBe('ACTIVE');

    const seenPhases = new Set<number>([state.phaseIndex]);
    let guard = 0;
    while (state.status !== 'DEFEATED' && guard++ < 1000) {
      const result = damageBoss(state, dragon, 5);
      state = result.state;
      seenPhases.add(state.phaseIndex);
    }

    expect(state.status).toBe('DEFEATED');
    expect(state.health).toBe(0);
    expect(seenPhases.size).toBe(dragon.phases.length);
  });
});
