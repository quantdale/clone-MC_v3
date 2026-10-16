import { describe, it, expect } from 'vitest';
import {
  startBossFight,
  damageBoss,
} from '../../src/simulation/BossFramework';
import { ENDER_DRAGON_DEFINITION } from '../../src/simulation/EnderDragon';
import {
  END_EXIT_PORTAL_RING_SIZE,
  deserializeDragonCompletion,
  dragonCompletionIsDefeated,
  endExitDestination,
  endExitPortalCells,
  endExitPortalRemains,
  endExitPortalSpawns,
  markDragonDefeated,
  serializeDragonCompletion,
  type DragonCompletionRecord,
} from '../../src/simulation/EndExitProgression';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

describe('exit portal geometry', () => {
  it('is the 5x5 minus the four corners: 21 cells, corners absent', () => {
    const cells = endExitPortalCells(0, 64, 0);
    expect(END_EXIT_PORTAL_RING_SIZE).toBe(5);
    expect(cells.length).toBe(21);
    const set = new Set(cells.map(([x, y, z]) => key(x, y, z)));
    expect(set.size).toBe(21); // distinct
    expect(set.has(key(-2, 64, -2))).toBe(false); // corners absent
    expect(set.has(key(2, 64, 2))).toBe(false);
    expect(set.has(key(-2, 64, 2))).toBe(false);
    expect(set.has(key(2, 64, -2))).toBe(false);
    expect(set.has(key(0, 64, 0))).toBe(true); // interior present
    expect(set.has(key(-2, 64, 0))).toBe(true); // edge present
  });
});

describe('exit portal spawning and persistence', () => {
  it('spawns exactly when the gateway is open', () => {
    expect(endExitPortalSpawns(false)).toBe(false);
    expect(endExitPortalSpawns(true)).toBe(true);
  });

  it('a defeated completion record keeps the portal present', () => {
    const defeated: DragonCompletionRecord = { dragonKey: 'ender_dragon', defeated: true, defeatedTick: 5000 };
    const living: DragonCompletionRecord = { dragonKey: 'ender_dragon', defeated: false, defeatedTick: 0 };
    expect(endExitPortalRemains(defeated)).toBe(true);
    expect(endExitPortalRemains(living)).toBe(false);
    expect(endExitPortalRemains(null)).toBe(false);
  });
});

describe('return destination', () => {
  it('returns the overworld spawn unchanged when finite', () => {
    expect(endExitDestination([100, 64, -200])).toEqual([100, 64, -200]);
  });

  it('returns null for non-finite spawns', () => {
    expect(endExitDestination([Number.NaN, 64, 0])).toBeNull();
    expect(endExitDestination([0, Number.POSITIVE_INFINITY, 0])).toBeNull();
  });
});

describe('completion record', () => {
  it('markDragonDefeated produces a record exactly on defeat', () => {
    let boss = startBossFight(ENDER_DRAGON_DEFINITION);
    expect(markDragonDefeated(boss, 100)).toBeNull(); // not defeated
    boss = damageBoss(boss, ENDER_DRAGON_DEFINITION, 200).state;
    const record = markDragonDefeated(boss, 5000);
    expect(record).not.toBeNull();
    expect(record!.dragonKey).toBe('ender_dragon');
    expect(record!.defeated).toBe(true);
    expect(record!.defeatedTick).toBe(5000);
    expect(dragonCompletionIsDefeated(record!)).toBe(true);
  });

  it('serializes and deserializes round-trip', () => {
    const record: DragonCompletionRecord = { dragonKey: 'ender_dragon', defeated: true, defeatedTick: 42 };
    const serialized = serializeDragonCompletion(record);
    expect(serialized.version).toBe(1);
    expect(deserializeDragonCompletion(serialized)).toEqual(record);
  });

  it('rejects malformed payloads', () => {
    expect(() => deserializeDragonCompletion(null)).toThrow();
    expect(() => deserializeDragonCompletion({ version: 2 })).toThrow(/unsupported version/);
    expect(() => deserializeDragonCompletion({ version: 1, dragonKey: '', defeated: true, defeatedTick: 0 })).toThrow();
    expect(() => deserializeDragonCompletion({ version: 1, dragonKey: 'x', defeated: 'yes', defeatedTick: 0 })).toThrow();
    expect(() => deserializeDragonCompletion({ version: 1, dragonKey: 'x', defeated: true, defeatedTick: -1 })).toThrow();
  });
});
