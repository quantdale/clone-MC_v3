import { describe, it, expect } from 'vitest';
import {
  createDefaultBossRegistry,
  startBossFight,
  damageBoss,
  healBoss,
} from '../../src/simulation/BossFramework';
import {
  DRAGON_CRYSTAL_SUMMON_FRACTIONS,
  ENDER_DRAGON_BITE_DAMAGE,
  ENDER_DRAGON_BITE_RANGE,
  ENDER_DRAGON_DEFINITION,
  ENDER_DRAGON_MAX_HEALTH,
  END_CRYSTAL_HEAL_PER_TICK,
  MAX_END_CRYSTALS,
  dragonDamageTowardsPlayer,
  dragonDefeated,
  dragonReturnGatewayOpen,
  endCrystalHealAmount,
  summonEndCrystals,
} from '../../src/simulation/EnderDragon';

describe('ender dragon definition', () => {
  it('is vanilla-keyed data over the boss framework', () => {
    expect(ENDER_DRAGON_DEFINITION.key).toBe('ender_dragon');
    expect(ENDER_DRAGON_DEFINITION.name).toBe('Ender Dragon');
    expect(ENDER_DRAGON_DEFINITION.maxHealth).toBe(ENDER_DRAGON_MAX_HEALTH);
    expect(ENDER_DRAGON_MAX_HEALTH).toBe(200);
    // Phases at 100% / 50% / 20% health.
    expect(ENDER_DRAGON_DEFINITION.phases.map((p) => p.healthThreshold)).toEqual([1, 0.5, 0.2]);
    expect(DRAGON_CRYSTAL_SUMMON_FRACTIONS).toEqual([0.8, 0.5, 0.2]);
    expect(MAX_END_CRYSTALS).toBe(10);
    expect(END_CRYSTAL_HEAL_PER_TICK).toBe(1);
    expect(ENDER_DRAGON_BITE_DAMAGE).toBe(3);
    expect(ENDER_DRAGON_BITE_RANGE).toBe(4);
  });

  it('the default boss registry already carries a vanilla-keyed dragon (153)', () => {
    const registry = createDefaultBossRegistry();
    const builtin = registry.getByKey('ender_dragon');
    expect(builtin).not.toBeUndefined();
    expect(builtin!.maxHealth).toBe(200);
  });
});

describe('dragon fight lifecycle (153 composition)', () => {
  it('sores SPAWNING, transitions phases on damage, and defeats at 0 health', () => {
    let boss = startBossFight(ENDER_DRAGON_DEFINITION);
    expect(boss.status).toBe('SPAWNING');
    expect(boss.phaseIndex).toBe(0);

    // Damage to 100 (50%): phase 1.
    let r = damageBoss(boss, ENDER_DRAGON_DEFINITION, 100);
    expect(r.phaseChanged).toBe(true);
    expect(r.state.phaseIndex).toBe(1);
    boss = r.state;

    // Damage to 40 (20%): phase 2.
    r = damageBoss(boss, ENDER_DRAGON_DEFINITION, 60);
    expect(r.phaseChanged).toBe(true);
    expect(r.state.phaseIndex).toBe(2);
    boss = r.state;

    // Defeat: 40 -> 0.
    r = damageBoss(boss, ENDER_DRAGON_DEFINITION, 40);
    expect(r.defeated).toBe(true);
    expect(r.state.status).toBe('DEFEATED');
    expect(r.state.health).toBe(0);
    // A defeated boss never revives and further damage is a no-op.
    const after = damageBoss(r.state, ENDER_DRAGON_DEFINITION, 10);
    expect(after.defeated).toBe(false);
    expect(after.state.status).toBe('DEFEATED');
  });

  it('healing back above a threshold restores the earlier phase', () => {
    let boss = startBossFight(ENDER_DRAGON_DEFINITION);
    boss = damageBoss(boss, ENDER_DRAGON_DEFINITION, 170).state; // down to 30 (15%, phase 2)
    expect(boss.phaseIndex).toBe(2);
    const healed = healBoss(boss, ENDER_DRAGON_DEFINITION, 60); // up to 90 (>50%)
    expect(healed.health).toBe(90);
    expect(healed.phaseIndex).toBe(1);
  });
});

describe('end crystals', () => {
  it('summons more crystals as the dragon weakens', () => {
    expect(summonEndCrystals(1)).toBe(1);
    expect(summonEndCrystals(0.9)).toBe(1);
    expect(summonEndCrystals(0.8)).toBe(1); // first wave
    expect(summonEndCrystals(0.5)).toBe(4);
    expect(summonEndCrystals(0.2)).toBe(7);
    expect(summonEndCrystals(0)).toBe(MAX_END_CRYSTALS);
    // Non-finite input clamps to fraction 0 (fully summoned).
    expect(summonEndCrystals(Number.NaN)).toBe(MAX_END_CRYSTALS);
  });

  it('a live crystal heals 1 per tick; none heals 0', () => {
    expect(endCrystalHealAmount(1)).toBe(1);
    expect(endCrystalHealAmount(4)).toBe(1);
    expect(endCrystalHealAmount(0)).toBe(0);
  });
});

describe('dragon attack', () => {
  it('bites for 3 damage only within range', () => {
    expect(dragonDamageTowardsPlayer(0)).toBe(ENDER_DRAGON_BITE_DAMAGE);
    expect(dragonDamageTowardsPlayer(3.9)).toBe(ENDER_DRAGON_BITE_DAMAGE);
    expect(dragonDamageTowardsPlayer(4)).toBe(0); // range is exclusive
    expect(dragonDamageTowardsPlayer(10)).toBe(0);
  });
});

describe('victory and return gateway (182 composition)', () => {
  it('the return gateway opens exactly on defeat', () => {
    let boss = startBossFight(ENDER_DRAGON_DEFINITION);
    expect(dragonDefeated(boss)).toBe(false);
    expect(dragonReturnGatewayOpen(boss)).toBe(false);
    boss = damageBoss(boss, ENDER_DRAGON_DEFINITION, ENDER_DRAGON_MAX_HEALTH).state;
    expect(dragonDefeated(boss)).toBe(true);
    expect(dragonReturnGatewayOpen(boss)).toBe(true);
  });
});
