import { describe, it, expect } from 'vitest';
import { createDefaultBossRegistry } from '../../src/simulation/BossFramework';
import { createWither, bossBarProgress } from '../../src/simulation/WitherBoss';
import { projectWitherBossBars, witherBossBarInputs } from '../../src/ui/WitherBossBarParity';

const def = createDefaultBossRegistry().getByKey('wither')!;

describe('WitherBossBarParity (276)', () => {
  it('maps a spawning wither through BossFramework color + charge progress', () => {
    const w = createWither(1, 0, 70, 0, def);
    const inputs = witherBossBarInputs([w], def);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.id).toBe('wither-1');
    expect(inputs[0]!.color).toBe(def.barColor);
    expect(inputs[0]!.progress).toBe(bossBarProgress(w));
    const views = projectWitherBossBars([w], def);
    expect(views[0]!.progress).toBeGreaterThanOrEqual(0);
    expect(views[0]!.progress).toBeLessThanOrEqual(1);
  });

  it('maps active damaged wither progress via bossBarSnapshot health fraction', () => {
    const base = createWither(2, 0, 70, 0, def);
    const half = {
      ...base,
      bossState: { ...base.bossState, status: 'ACTIVE' as const, health: def.maxHealth * 0.5, phaseIndex: 0 },
      invulnerableTicks: 0,
    };
    const views = projectWitherBossBars([half], def);
    expect(views[0]!.progress).toBeCloseTo(0.5, 5);

    const quarter = {
      ...half,
      bossState: { ...half.bossState, health: def.maxHealth * 0.25 },
    };
    const after = projectWitherBossBars([quarter], def);
    expect(after[0]!.progress).toBeCloseTo(0.25, 5);
    expect(after[0]!.progress).toBeLessThan(views[0]!.progress);
  });

  it('yields no bars when wither list is empty (bar should hide)', () => {
    expect(projectWitherBossBars([], def)).toEqual([]);
  });
});
