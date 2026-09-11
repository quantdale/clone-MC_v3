import { describe, it, expect } from 'vitest';
import {
  describeAdvancement,
  describeAdvancementCriterion,
  describeAdvancements,
  humanizeAdvancementKey,
} from '../../src/simulation/AdvancementView';
import { coreProgressionAdvancements } from '../../src/simulation/CoreProgressionAdvancements';
import { createDefaultAdvancementProgresses } from '../../src/simulation/AdvancementSave';
import { applyTriggerToProgresses } from '../../src/simulation/AdvancementSave';

const CATALOG = coreProgressionAdvancements();
const KEYS = [
  'minecraft:stone_age',
  'minecraft:acquire_hardware',
  'minecraft:iron_tools',
  'minecraft:diamonds',
  'minecraft:enter_the_nether',
  'minecraft:enter_the_end',
  'minecraft:free_the_end',
];

describe('humanizeAdvancementKey', () => {
  it('strips namespaces and title-cases words', () => {
    expect(humanizeAdvancementKey('wooden_pickaxe')).toBe('Wooden Pickaxe');
    expect(humanizeAdvancementKey('minecraft:the_nether')).toBe('The Nether');
    expect(humanizeAdvancementKey('diamond')).toBe('Diamond');
  });
});

describe('describeAdvancementCriterion', () => {
  it('pins the four catalog description shapes', () => {
    expect(
      describeAdvancementCriterion({ type: 'obtain_item', itemKey: 'wooden_pickaxe' }),
    ).toBe('Obtain Wooden Pickaxe');
    expect(
      describeAdvancementCriterion({ type: 'dimension_enter', dimensionKey: 'minecraft:the_nether' }),
    ).toBe('Enter the Nether');
    expect(
      describeAdvancementCriterion({ type: 'dimension_enter', dimensionKey: 'minecraft:the_end' }),
    ).toBe('Enter the End');
    expect(describeAdvancementCriterion({ type: 'boss_defeat', bossKey: 'ender_dragon' })).toBe(
      'Defeat the Ender Dragon',
    );
  });

  it('falls back to humanized keys for future shapes', () => {
    expect(describeAdvancementCriterion({ type: 'kill_mob', mobKey: 'wither' })).toBe(
      'Defeat Wither',
    );
    expect(
      describeAdvancementCriterion({ type: 'dimension_enter', dimensionKey: 'minecraft:the_moon' }),
    ).toBe('Enter The Moon');
  });
});

describe('describeAdvancements', () => {
  it('returns all 7 rows in chain order with titles, descriptions, and 0/1 progress', () => {
    const rows = describeAdvancements(CATALOG, createDefaultAdvancementProgresses(CATALOG));
    expect(rows.map((r) => r.key)).toEqual(KEYS);
    expect(rows[0]).toMatchObject({
      title: 'Stone Age',
      description: 'Obtain Wooden Pickaxe',
      achieved: false,
      achievedTick: null,
      achievedCount: 0,
      totalCount: 1,
      remaining: 1,
    });
    expect(rows[4]).toMatchObject({ title: 'We Need to Go Deeper', description: 'Enter the Nether' });
    expect(rows[6]).toMatchObject({ title: 'Free the End', description: 'Defeat the Ender Dragon' });
    for (const row of rows) {
      expect(row.description.length).toBeGreaterThan(0);
      expect(row.title.length).toBeGreaterThan(0);
    }
  });

  it('reflects completion with counts and tick', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const { progresses } = applyTriggerToProgresses(
      store,
      CATALOG,
      { type: 'obtain_item', itemKey: 'diamond' },
      77,
    );
    const rows = describeAdvancements(CATALOG, progresses);
    const diamonds = rows.find((r) => r.key === 'minecraft:diamonds')!;
    expect(diamonds).toMatchObject({
      achieved: true,
      achievedTick: 77,
      achievedCount: 1,
      totalCount: 1,
      remaining: 0,
    });
    expect(rows[0]!.achieved).toBe(false);
  });

  it('describeAdvancement counts remaining honestly', () => {
    const store = createDefaultAdvancementProgresses(CATALOG);
    const row = describeAdvancement(CATALOG[0]!, store[0]!);
    expect(row.remaining).toBe(1);
    expect(row.achievedCount).toBe(0);
  });
});
