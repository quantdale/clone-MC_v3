import { describe, expect, it } from 'vitest';
import { planRaidWaveSpawn } from '../../src/simulation/RaidWaveSpawnPlan';
import type { RaidWaveEntry } from '../../src/simulation/RaidStateMachine';

const RAIDER_KEYS = ['pillager', 'vindicator', 'ravager', 'witch'] as const;
const resolveAll = (key: string): boolean => (RAIDER_KEYS as readonly string[]).includes(key);
const center = { x: 10, y: 64, z: -3 };

describe('planRaidWaveSpawn (284)', () => {
  it('is pure and deterministic for identical inputs', () => {
    const roster: RaidWaveEntry[] = [
      { typeKey: 'pillager', count: 2 },
      { typeKey: 'vindicator', count: 1 },
    ];
    const a = planRaidWaveSpawn(center, 1, roster, resolveAll);
    const b = planRaidWaveSpawn(center, 1, roster, resolveAll);
    expect(a.ok).toBe(true);
    expect(a.placements).toEqual(b.placements);
    expect(a.placements).toHaveLength(3);
    expect(a.placements.map((p) => p.typeKey)).toEqual(['pillager', 'pillager', 'vindicator']);
    for (const p of a.placements) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
      expect(Number.isFinite(p.yaw)).toBe(true);
      expect(p.y).toBe(center.y);
    }
  });

  it('places flattened roster entries on a deterministic ring facing the center', () => {
    const roster: RaidWaveEntry[] = [{ typeKey: 'pillager', count: 4 }];
    const plan = planRaidWaveSpawn(center, 0, roster, resolveAll);
    expect(plan.ok).toBe(true);
    expect(plan.placements).toHaveLength(4);
    const radius = 2 + 0;
    for (let i = 0; i < 4; i++) {
      const angle = (2 * Math.PI * i) / 4;
      const p = plan.placements[i]!;
      expect(p.x).toBeCloseTo(center.x + radius * Math.cos(angle), 10);
      expect(p.z).toBeCloseTo(center.z + radius * Math.sin(angle), 10);
    }
    const r2 = planRaidWaveSpawn(center, 2, roster, resolveAll);
    expect(r2.placements[0]!.x).toBeCloseTo(center.x + 4 * Math.cos(0), 10);
  });

  it('fails closed on a non-finite center without throwing', () => {
    const roster: RaidWaveEntry[] = [{ typeKey: 'pillager', count: 1 }];
    expect(() => planRaidWaveSpawn({ x: NaN, y: 64, z: 0 }, 1, roster, resolveAll)).not.toThrow();
    const plan = planRaidWaveSpawn({ x: NaN, y: 64, z: 0 }, 1, roster, resolveAll);
    expect(plan.ok).toBe(false);
    expect(plan.placements).toHaveLength(0);
    const inf = planRaidWaveSpawn({ x: 0, y: Infinity, z: 0 }, 1, roster, resolveAll);
    expect(inf.ok).toBe(false);
    expect(inf.placements).toHaveLength(0);
  });

  it('fails the whole plan when any typeKey is unknown', () => {
    const roster: RaidWaveEntry[] = [
      { typeKey: 'pillager', count: 2 },
      { typeKey: 'not_a_raider', count: 1 },
    ];
    const plan = planRaidWaveSpawn(center, 1, roster, resolveAll);
    expect(plan.ok).toBe(false);
    expect(plan.placements).toHaveLength(0);
    expect(plan.skipped).toEqual([
      { typeKey: 'not_a_raider', count: 1, reason: 'UNKNOWN_TYPE' },
    ]);
  });

  it('fails on negative or non-finite counts', () => {
    const neg = planRaidWaveSpawn(center, 1, [{ typeKey: 'pillager', count: -1 }], resolveAll);
    expect(neg.ok).toBe(false);
    expect(neg.placements).toHaveLength(0);
    expect(neg.skipped[0]?.reason).toBe('INVALID_COUNT');
    const nan = planRaidWaveSpawn(center, 1, [{ typeKey: 'pillager', count: NaN }], resolveAll);
    expect(nan.ok).toBe(false);
    expect(nan.skipped[0]?.reason).toBe('INVALID_COUNT');
  });

  it('omits zero-count entries without failing and without emitting placements', () => {
    const roster: RaidWaveEntry[] = [
      { typeKey: 'vindicator', count: 0 },
      { typeKey: 'pillager', count: 2 },
    ];
    const plan = planRaidWaveSpawn(center, 1, roster, resolveAll);
    expect(plan.ok).toBe(true);
    expect(plan.placements).toHaveLength(2);
    expect(plan.placements.every((p) => p.typeKey === 'pillager')).toBe(true);
    expect(plan.skipped).toHaveLength(0);
  });

  it('treats an all-zero roster as an empty successful plan', () => {
    const plan = planRaidWaveSpawn(center, 0, [{ typeKey: 'pillager', count: 0 }], resolveAll);
    expect(plan.ok).toBe(true);
    expect(plan.placements).toHaveLength(0);
  });

  it('does not mutate the input roster or center', () => {
    const roster: RaidWaveEntry[] = [{ typeKey: 'pillager', count: 2 }];
    const snapshot = JSON.parse(JSON.stringify(roster));
    const c = { ...center };
    planRaidWaveSpawn(c, 1, roster, resolveAll);
    expect(roster).toEqual(snapshot);
    expect(c).toEqual(center);
  });
});
