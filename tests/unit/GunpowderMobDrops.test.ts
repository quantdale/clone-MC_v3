import { describe, it, expect } from 'vitest';
import {
  CREEPER_GUNPOWDER_MAX,
  WITCH_LOOT_ENTRIES,
  WITCH_ROLLS_MAX,
  WITCH_ROLLS_MIN,
  WITCH_TOTAL_WEIGHT,
  createScriptedRandom,
  normalizeLooting,
  pickWitchEntry,
  resolveCreeperDrops,
  resolveMobGunpowderDrops,
  resolveWitchDrops,
  uniformInt,
} from '../../src/simulation/GunpowderMobDrops';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import { TILE_INDEX } from '../../src/rendering/TextureAtlas';

/**
 * Vanilla gunpowder drops (297): the gunpowder item, creeper 0–2 (+looting),
 * witch 1–3 weighted rolls (missing items discarded), ghast absent, fixed RNG
 * draw order pinned with scripted sequences.
 */

const registry = createDefaultItemRegistry();

function seq(...values: number[]): () => number {
  const r = createScriptedRandom(values);
  if (!r) throw new Error('bad sequence');
  return r;
}

/** Scripted value landing on weight ticket `t` of the witch table (0..7). */
function ticket(t: number): number {
  return (t + 0.5) / WITCH_TOTAL_WEIGHT;
}

describe('gunpowder item (297)', () => {
  it('registers id 73 minecraft:gunpowder, stack 64, icon tile 75, not placeable/food', () => {
    const def = registry.getByKey('gunpowder')!;
    expect(def).toBeDefined();
    expect(def.id).toBe(ItemId.Gunpowder);
    expect(ItemId.Gunpowder).toBe(73);
    expect(def.name).toBe('Gunpowder');
    expect(def.stackSize).toBe(64);
    expect(def.iconTile).toBe(75);
    expect(def.placeBlock).toBeUndefined();
    expect(def.isFood ?? false).toBe(false);
    expect(def.maxDurability ?? 0).toBe(0);
    expect(registry.getByLegacyId(73)).toBe(def);
  });

  it('tile 75 is the gunpowder tile and no other atlas entry or item icon uses it', () => {
    expect(TILE_INDEX.gunpowder).toBe(75);
    const tileUsers = Object.entries(TILE_INDEX).filter(([, v]) => v === 75).map(([k]) => k);
    expect(tileUsers).toEqual(['gunpowder']);
    const itemUsers = registry.all().filter((d) => d.iconTile === 75).map((d) => d.key);
    expect(itemUsers).toEqual(['gunpowder']);
  });
});

describe('uniformInt / looting / scripted rng', () => {
  it('maps a draw onto an inclusive integer range', () => {
    expect(uniformInt(() => 0, 0, 2)).toBe(0);
    expect(uniformInt(() => 0.34, 0, 2)).toBe(1);
    expect(uniformInt(() => 0.999, 0, 2)).toBe(2);
    expect(uniformInt(() => 0.5, 3, 3)).toBe(3);
    expect(uniformInt(() => Number.NaN, 1, 3)).toBe(1); // defensive
    expect(uniformInt(() => 1, 1, 3)).toBe(3); // clamped below 1
  });

  it('normalizes looting to an integer in [0, 10]', () => {
    expect(normalizeLooting(undefined)).toBe(0);
    expect(normalizeLooting(-2)).toBe(0);
    expect(normalizeLooting(2.9)).toBe(2);
    expect(normalizeLooting(99)).toBe(10);
    expect(normalizeLooting(Number.NaN)).toBe(0);
  });

  it('createScriptedRandom cycles valid values and refuses invalid sequences', () => {
    const r = seq(0.1, 0.2);
    expect([r(), r(), r()]).toEqual([0.1, 0.2, 0.1]);
    expect(createScriptedRandom([])).toBeNull();
    expect(createScriptedRandom([1.5])).toBeNull();
    expect(createScriptedRandom([1])).toBeNull();
    expect(createScriptedRandom([-0.1])).toBeNull();
    expect(createScriptedRandom([Number.NaN])).toBeNull();
    expect(createScriptedRandom(['0.5' as unknown as number])).toBeNull();
  });
});

describe('creeper table (297)', () => {
  it('drops uniform 0–2 gunpowder; zero emits no stack', () => {
    expect(CREEPER_GUNPOWDER_MAX).toBe(2);
    expect(resolveCreeperDrops(registry, () => 0).stacks).toEqual([]);
    expect(resolveCreeperDrops(registry, () => 0).rolls).toEqual([{ itemKey: 'gunpowder', count: 0, dropped: 'zero-count' }]);
    expect(resolveCreeperDrops(registry, () => 0.5).stacks).toEqual([{ item: ItemId.Gunpowder, count: 1 }]);
    expect(resolveCreeperDrops(registry, () => 0.99).stacks).toEqual([{ item: ItemId.Gunpowder, count: 2 }]);
  });

  it('looting adds uniform 0..level (vanilla looting_enchant)', () => {
    expect(resolveCreeperDrops(registry, () => 0.99, 3).stacks).toEqual([{ item: ItemId.Gunpowder, count: 5 }]);
    expect(resolveCreeperDrops(registry, seq(0.99, 0), 3).stacks).toEqual([{ item: ItemId.Gunpowder, count: 2 }]);
  });

  it('looting 0 makes no extra rng draw', () => {
    let draws = 0;
    resolveCreeperDrops(registry, () => {
      draws++;
      return 0.5;
    });
    expect(draws).toBe(1);
  });

  it('distribution over a uniform grid is exactly one third each', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 300; i++) {
      const c = resolveCreeperDrops(registry, () => (i + 0.5) / 300).stacks[0]?.count ?? 0;
      counts[c]!++;
    }
    expect(counts).toEqual([100, 100, 100]);
  });
});

describe('witch table (297)', () => {
  it('matches the vanilla pool: 7 entries, stick weight 2, total weight 8, 1–3 rolls', () => {
    expect(WITCH_LOOT_ENTRIES.map((e) => [e.itemKey, e.weight])).toEqual([
      ['glowstone_dust', 1],
      ['sugar', 1],
      ['redstone', 1],
      ['spider_eye', 1],
      ['glass_bottle', 1],
      ['gunpowder', 1],
      ['stick', 2],
    ]);
    expect(WITCH_TOTAL_WEIGHT).toBe(8);
    expect([WITCH_ROLLS_MIN, WITCH_ROLLS_MAX]).toEqual([1, 3]);
  });

  it('weighted pick walks the entries in order (gunpowder = ticket 5, stick = 6–7)', () => {
    const picks = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => pickWitchEntry(() => ticket(t)).itemKey);
    expect(picks).toEqual(['glowstone_dust', 'sugar', 'redstone', 'spider_eye', 'glass_bottle', 'gunpowder', 'stick', 'stick']);
  });

  it('draw order: rolls, then per roll pick + count', () => {
    // 1 roll -> gunpowder -> count 2
    const r = resolveWitchDrops(registry, seq(0, ticket(5), 0.99));
    expect(r.stacks).toEqual([{ item: ItemId.Gunpowder, count: 2 }]);
    expect(r.rolls).toEqual([{ itemKey: 'gunpowder', count: 2 }]);
  });

  it('3 rolls merge same-item stacks and keep first-seen order', () => {
    // 3 rolls: gunpowder×1, stick×2, gunpowder×2
    const r = resolveWitchDrops(registry, seq(0.99, ticket(5), 0.5, ticket(7), 0.99, ticket(5), 0.99));
    expect(r.stacks).toEqual([
      { item: ItemId.Gunpowder, count: 3 },
      { item: ItemId.Stick, count: 2 },
    ]);
    expect(r.rolls).toHaveLength(3);
  });

  it('rolls landing on missing items are discarded, not re-rolled', () => {
    const r = resolveWitchDrops(registry, seq(0, ticket(1), 0.99)); // 1 roll -> sugar ×2
    expect(r.stacks).toEqual([]);
    expect(r.rolls).toEqual([{ itemKey: 'sugar', count: 2, dropped: 'missing-item' }]);
    for (const key of ['glowstone_dust', 'sugar', 'spider_eye', 'glass_bottle']) {
      expect(registry.getByKey(key)).toBeUndefined();
    }
    for (const key of ['redstone', 'gunpowder', 'stick']) {
      expect(registry.getByKey(key)).toBeDefined();
    }
  });

  it('redstone rolls drop real redstone', () => {
    const r = resolveWitchDrops(registry, seq(0, ticket(2), 0.5));
    expect(r.stacks).toEqual([{ item: ItemId.Redstone, count: 1 }]);
  });

  it('looting adds 0..level per entry', () => {
    const r = resolveWitchDrops(registry, seq(0, ticket(5), 0.99, 0.99), 2);
    expect(r.stacks).toEqual([{ item: ItemId.Gunpowder, count: 4 }]);
  });

  it('exact vanilla gunpowder odds: 1/8 per roll over a uniform ticket grid', () => {
    let gunpowderRolls = 0;
    for (let t = 0; t < 8; t++) {
      const r = resolveWitchDrops(registry, seq(0, ticket(t), 0.99));
      if (r.rolls[0]!.itemKey === 'gunpowder') gunpowderRolls++;
    }
    expect(gunpowderRolls).toBe(1);
  });

  it('counts stay within vanilla bounds under Math.random', () => {
    for (let i = 0; i < 500; i++) {
      const r = resolveWitchDrops(registry, Math.random);
      expect(r.rolls.length).toBeGreaterThanOrEqual(1);
      expect(r.rolls.length).toBeLessThanOrEqual(3);
      for (const roll of r.rolls) expect(roll.count).toBeLessThanOrEqual(2);
      for (const s of r.stacks) expect([ItemId.Gunpowder, ItemId.Redstone, ItemId.Stick]).toContain(s.item);
    }
  });
});

describe('resolveMobGunpowderDrops dispatch (297)', () => {
  it('routes creeper/witch and returns nothing for ghast (absent) and others', () => {
    expect(resolveMobGunpowderDrops('creeper', registry, () => 0.99).stacks).toEqual([{ item: ItemId.Gunpowder, count: 2 }]);
    expect(resolveMobGunpowderDrops('witch', registry, seq(0, ticket(5), 0.99)).stacks).toEqual([
      { item: ItemId.Gunpowder, count: 2 },
    ]);
    for (const key of ['ghast', 'pillager', 'zombie', '']) {
      expect(resolveMobGunpowderDrops(key, registry, () => 0.99)).toEqual({ stacks: [], rolls: [] });
    }
  });
});
