import { describe, it, expect } from 'vitest';
import { createResourceId, type ResourceId } from '../../src/data/ResourceId';
import { RegistryError } from '../../src/data/Registry';
import { ToolKind } from '../../src/world/BlockRegistry';
import type { ItemTypeDefinition } from '../../src/inventory/ItemRegistry';
import {
  EnchantmentRegistry,
  createDefaultEnchantmentRegistry,
  enchantmentAppliesTo,
  validateEnchantmentList,
  serializeEnchantments,
  deserializeEnchantments,
} from '../../src/inventory/EnchantmentRegistry';

const R = (path: string): ResourceId => createResourceId('minecraft', path);

const FORTUNE = R('fortune');
const SILK_TOUCH = R('silk_touch');
const UNBREAKING = R('unbreaking');
const SHARPNESS = R('sharpness');
const SMITE = R('smite');
const BANE = R('bane_of_arthropods');
const PROTECTION = R('protection');
const FIRE_PROTECTION = R('fire_protection');
const BLAST_PROTECTION = R('blast_protection');
const PROJECTILE_PROTECTION = R('projectile_protection');

function item(partial: Partial<ItemTypeDefinition> & { id: number; key: string }): ItemTypeDefinition {
  return {
    resourceId: createResourceId('minecraft', partial.key),
    name: partial.key,
    iconTile: 0,
    stackSize: 1,
    ...partial,
  };
}

function expectRegistryError(fn: () => unknown, reason: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(RegistryError);
  expect((thrown as RegistryError).reason).toBe(reason);
}

describe('EnchantmentRegistry — definition registry', () => {
  it('resolves a seeded definition by resource id, key, and legacy id', () => {
    const registry = createDefaultEnchantmentRegistry();
    const byResource = registry.getByResourceId(FORTUNE);
    expect(byResource.key).toBe('fortune');
    expect(byResource.maxLevel).toBe(3);
    expect(byResource.targets).toContain('pickaxe');
    expect(byResource.targets).toContain('axe');
    expect(byResource.targets).toContain('shovel');

    const byKey = registry.getByKey('silk_touch');
    expect(byKey?.key).toBe('silk_touch');

    // legacy numeric id (Fortune === 2)
    expect(registry.get(2).key).toBe('fortune');
    expect(registry.getByLegacyId(2)?.key).toBe('fortune');
    expect(registry.all().length).toBe(11);
  });

  it('throws MISSING_ID for an unknown resource id', () => {
    const registry = createDefaultEnchantmentRegistry();
    expectRegistryError(() => registry.getByResourceId(R('nonexistent')), 'MISSING_ID');
    expectRegistryError(() => registry.get(999), 'MISSING_ID');
  });

  it('rejects duplicate legacy ids at construction', () => {
    expectRegistryError(
      () =>
        new EnchantmentRegistry([
          {
            id: 1,
            resourceId: R('dup'),
            key: 'dup',
            name: 'Dup',
            maxLevel: 1,
            targets: ['all'],
            incompatibleWith: [],
          },
          {
            id: 1,
            resourceId: R('dup2'),
            key: 'dup2',
            name: 'Dup2',
            maxLevel: 1,
            targets: ['all'],
            incompatibleWith: [],
          },
        ]),
      'DUPLICATE_ID',
    );
  });
});

describe('EnchantmentRegistry — symmetric conflict rules', () => {
  it('fortune and silk_touch conflict in both directions', () => {
    const registry = createDefaultEnchantmentRegistry();
    expect(registry.areIncompatible(FORTUNE, SILK_TOUCH)).toBe(true);
    expect(registry.areIncompatible(SILK_TOUCH, FORTUNE)).toBe(true);
    // non-conflicting neighbor
    expect(registry.areIncompatible(FORTUNE, UNBREAKING)).toBe(false);
  });

  it('the sharpness group is pairwise exclusive', () => {
    const registry = createDefaultEnchantmentRegistry();
    const group = [SHARPNESS, SMITE, BANE];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        expect(registry.areIncompatible(group[i]!, group[j]!)).toBe(true);
      }
    }
    expect(registry.areIncompatible(SHARPNESS, UNBREAKING)).toBe(false);
  });

  it('the armor protection group is pairwise exclusive', () => {
    const registry = createDefaultEnchantmentRegistry();
    const group = [PROTECTION, FIRE_PROTECTION, BLAST_PROTECTION, PROJECTILE_PROTECTION];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        expect(registry.areIncompatible(group[i]!, group[j]!)).toBe(true);
      }
    }
    expect(registry.areIncompatible(PROTECTION, UNBREAKING)).toBe(false);
  });
});

describe('EnchantmentRegistry — applicability predicates', () => {
  it('efficiency applies to a pickaxe', () => {
    const registry = createDefaultEnchantmentRegistry();
    const def = registry.getByKey('efficiency')!;
    const pick = item({ id: 20, key: 'wooden_pickaxe', toolKind: ToolKind.Pickaxe });
    expect(registry.appliesTo(def, pick)).toBe(true);
    expect(enchantmentAppliesTo(def.targets, pick)).toBe(true);
  });

  it('efficiency does not apply to food', () => {
    const registry = createDefaultEnchantmentRegistry();
    const def = registry.getByKey('efficiency')!;
    const apple = item({ id: 13, key: 'apple', isFood: true });
    expect(registry.appliesTo(def, apple)).toBe(false);
  });

  it('unbreaking applies to armor via the all target', () => {
    const registry = createDefaultEnchantmentRegistry();
    const def = registry.getByKey('unbreaking')!;
    const chest = item({ id: 25, key: 'chest', defensePoints: 2 });
    expect(registry.appliesTo(def, chest)).toBe(true);
  });

  it('a weapon enchantment does not apply to a plain tool', () => {
    const registry = createDefaultEnchantmentRegistry();
    const def = registry.getByKey('sharpness')!;
    const pick = item({ id: 20, key: 'wooden_pickaxe', toolKind: ToolKind.Pickaxe });
    expect(registry.appliesTo(def, pick)).toBe(false);
  });
});

describe('EnchantmentRegistry — instance validation', () => {
  it('accepts a valid list', () => {
    const registry = createDefaultEnchantmentRegistry();
    const list = [
      { id: FORTUNE, level: 2 },
      { id: UNBREAKING, level: 1 },
    ];
    expect(validateEnchantmentList(list, registry)).toBe(true);
  });

  it('rejects an out-of-range level', () => {
    const registry = createDefaultEnchantmentRegistry();
    const list = [{ id: FORTUNE, level: 9 }];
    expectRegistryError(() => validateEnchantmentList(list, registry), 'LEVEL_OUT_OF_RANGE');
  });

  it('rejects a conflicting pair', () => {
    const registry = createDefaultEnchantmentRegistry();
    const list = [
      { id: FORTUNE, level: 1 },
      { id: SILK_TOUCH, level: 1 },
    ];
    expectRegistryError(() => validateEnchantmentList(list, registry), 'ENCHANTMENT_CONFLICT');
  });

  it('rejects an unknown enchantment id', () => {
    const registry = createDefaultEnchantmentRegistry();
    const list = [{ id: R('nonexistent'), level: 1 }];
    expectRegistryError(() => validateEnchantmentList(list, registry), 'UNKNOWN_ENCHANTMENT');
  });

  it('does not mutate its input', () => {
    const registry = createDefaultEnchantmentRegistry();
    const list = [{ id: FORTUNE, level: 2 }];
    const snapshot = JSON.stringify(list);
    validateEnchantmentList(list, registry);
    expect(JSON.stringify(list)).toBe(snapshot);
  });
});

describe('EnchantmentRegistry — persistence envelope', () => {
  it('round-trips exactly', () => {
    const registry = createDefaultEnchantmentRegistry();
    const instances = [
      { id: FORTUNE, level: 3 },
      { id: UNBREAKING, level: 2 },
    ];
    const snapshot = serializeEnchantments(instances);
    expect(snapshot.version).toBe(1);
    const back = deserializeEnchantments(snapshot, registry);
    expect(back).toEqual(instances);
  });

  it('rejects a bad version', () => {
    const registry = createDefaultEnchantmentRegistry();
    expectRegistryError(
      () => deserializeEnchantments({ version: 2, entries: [] } as never, registry),
      'INVALID_SNAPSHOT',
    );
  });

  it('rejects a non-object snapshot', () => {
    const registry = createDefaultEnchantmentRegistry();
    expectRegistryError(() => deserializeEnchantments(null as never, registry), 'INVALID_SNAPSHOT');
    expectRegistryError(() => deserializeEnchantments(42 as never, registry), 'INVALID_SNAPSHOT');
  });

  it('rejects an unknown id in a batch atomically', () => {
    const registry = createDefaultEnchantmentRegistry();
    const snapshot = {
      version: 1,
      entries: [
        { id: 'minecraft:fortune', level: 1 },
        { id: 'minecraft:nonexistent', level: 1 },
      ],
    };
    expectRegistryError(() => deserializeEnchantments(snapshot, registry), 'UNKNOWN_ENCHANTMENT');
  });

  it('rejects an out-of-range level during deserialize', () => {
    const registry = createDefaultEnchantmentRegistry();
    const snapshot = {
      version: 1,
      entries: [{ id: 'minecraft:fortune', level: 99 }],
    };
    expectRegistryError(() => deserializeEnchantments(snapshot, registry), 'LEVEL_OUT_OF_RANGE');
  });

  it('rejects a malformed entry', () => {
    const registry = createDefaultEnchantmentRegistry();
    const snapshot = {
      version: 1,
      entries: [{ id: 5, level: 'one' }],
    };
    expectRegistryError(() => deserializeEnchantments(snapshot as never, registry), 'INVALID_ENTRY');
  });
});
