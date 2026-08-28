import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  createCatalogExpansion,
  createEnchantmentDefinition,
  createPotionDefinition,
  createStatusEffectDefinition,
  effectById,
  enchantmentById,
  potionById,
  potionsForEffect,
} from '../../src/data/EnchantmentPotionExpansion';

describe('creation', () => {
  it('builds each kind with explicit fields and defaults', () => {
    const sharpness = createEnchantmentDefinition({
      id: 'minecraft:sharpness_alt',
      name: 'enchantment.sharpness_alt',
      maxLevel: 5,
      appliesTo: ['minecraft:sword'],
    });
    expect(sharpness).toMatchObject({ maxLevel: 5, appliesTo: ['minecraft:sword'], incompatible: [] });

    const unbreaking = createEnchantmentDefinition({
      id: 'minecraft:unbreaking_alt',
      name: 'enchantment.unbreaking_alt',
      appliesTo: ['minecraft:tool'],
    });
    expect(unbreaking.maxLevel).toBe(1);

    const speed = createStatusEffectDefinition({
      id: 'minecraft:speed_alt',
      name: 'effect.speed_alt',
      beneficial: true,
    });
    expect(speed.maxAmplifier).toBe(3);

    const potion = createPotionDefinition({
      id: 'minecraft:swiftness_alt',
      name: 'item.swiftness_alt',
      effectId: 'minecraft:speed_alt',
      durationTicks: 3600,
      amplifier: 0,
    });
    expect(potion).toMatchObject({ effectId: 'minecraft:speed_alt', durationTicks: 3600, amplifier: 0 });
  });
});

describe('rejections', () => {
  it('rejects invalid ids and prefixed paths for every kind', () => {
    expect(() =>
      createEnchantmentDefinition({ id: 'Bad Id', name: 'x', appliesTo: ['a'] }),
    ).toThrow('EnchantmentPotion: id must be a valid namespaced id');
    expect(() =>
      createEnchantmentDefinition({ id: 'minecraft:enchantment/sharpness', name: 'x', appliesTo: ['a'] }),
    ).toThrow("EnchantmentPotion: id path must not start with 'enchantment/'");
    expect(() =>
      createStatusEffectDefinition({ id: 'minecraft:effect/speed', name: 'x', beneficial: true }),
    ).toThrow("EnchantmentPotion: id path must not start with 'effect/'");
    expect(() =>
      createPotionDefinition({ id: 'minecraft:potion/swift', name: 'x', effectId: 'e', durationTicks: 1, amplifier: 0 }),
    ).toThrow("EnchantmentPotion: id path must not start with 'potion/'");
  });

  it('rejects empty names and bad enchantment fields', () => {
    expect(() =>
      createEnchantmentDefinition({ id: 'minecraft:a', name: '', appliesTo: ['a'] }),
    ).toThrow('EnchantmentPotion: name must be a non-empty string');
    for (const maxLevel of [0, 1.5]) {
      expect(() =>
        createEnchantmentDefinition({ id: 'minecraft:a', name: 'x', maxLevel, appliesTo: ['a'] }),
      ).toThrow('EnchantmentPotion: maxLevel must be a positive integer');
    }
    expect(() =>
      createEnchantmentDefinition({ id: 'minecraft:a', name: 'x', appliesTo: [] }),
    ).toThrow('EnchantmentPotion: appliesTo must not be empty');
    expect(() =>
      createEnchantmentDefinition({ id: 'minecraft:a', name: 'x', appliesTo: [''] }),
    ).toThrow('EnchantmentPotion: appliesTo must be non-empty strings');
    expect(() =>
      createEnchantmentDefinition({ id: 'minecraft:a', name: 'x', appliesTo: ['a'], incompatible: [''] }),
    ).toThrow('EnchantmentPotion: incompatible must be non-empty strings');
  });

  it('rejects bad effect and potion fields', () => {
    expect(() =>
      createStatusEffectDefinition({ id: 'minecraft:a', name: 'x', beneficial: 'yes' as never }),
    ).toThrow('EnchantmentPotion: beneficial must be a boolean');
    for (const maxAmplifier of [-1, 1.5]) {
      expect(() =>
        createStatusEffectDefinition({ id: 'minecraft:a', name: 'x', beneficial: true, maxAmplifier }),
      ).toThrow('EnchantmentPotion: maxAmplifier must be an integer >= 0');
    }
    expect(() =>
      createPotionDefinition({ id: 'minecraft:a', name: 'x', effectId: '', durationTicks: 1, amplifier: 0 }),
    ).toThrow('EnchantmentPotion: effectId must be a non-empty string');
    for (const durationTicks of [0, 1.5]) {
      expect(() =>
        createPotionDefinition({ id: 'minecraft:a', name: 'x', effectId: 'e', durationTicks, amplifier: 0 }),
      ).toThrow('EnchantmentPotion: durationTicks must be a positive integer');
    }
    for (const amplifier of [-1, 1.5]) {
      expect(() =>
        createPotionDefinition({ id: 'minecraft:a', name: 'x', effectId: 'e', durationTicks: 1, amplifier }),
      ).toThrow('EnchantmentPotion: amplifier must be an integer >= 0');
    }
  });
});

describe('catalog', () => {
  const enchantment = createEnchantmentDefinition({ id: 'minecraft:a', name: 'e.a', appliesTo: ['x'] });
  const effect = createStatusEffectDefinition({ id: 'minecraft:e', name: 's.e', beneficial: true });
  const potionP = createPotionDefinition({ id: 'minecraft:p', name: 'p.p', effectId: 'minecraft:e', durationTicks: 1, amplifier: 0 });
  const potionQ = createPotionDefinition({ id: 'minecraft:q', name: 'p.q', effectId: 'minecraft:other', durationTicks: 1, amplifier: 0 });

  it('groups by kind preserving registration order', () => {
    const expansion = createCatalogExpansion({
      enchantments: [enchantment],
      effects: [effect],
      potions: [potionP, potionQ],
    });
    expect(expansion.enchantments).toEqual([enchantment]);
    expect(expansion.effects).toEqual([effect]);
    expect(expansion.potions).toEqual([potionP, potionQ]);
  });

  it('looks up by string and ResourceId, undefined when missing', () => {
    const expansion = createCatalogExpansion({ enchantments: [enchantment], effects: [effect], potions: [potionP] });
    expect(enchantmentById(expansion, 'minecraft:a')).toEqual(enchantment);
    expect(effectById(expansion, createResourceId('minecraft', 'e'))).toEqual(effect);
    expect(potionById(expansion, 'minecraft:p')).toEqual(potionP);
    expect(potionById(expansion, 'minecraft:nope')).toBeUndefined();
  });

  it('filters potions by effect reference including dangling ids', () => {
    const expansion = createCatalogExpansion({ potions: [potionP, potionQ] });
    expect(potionsForEffect(expansion, 'minecraft:e')).toEqual([potionP]);
    expect(potionsForEffect(expansion, 'minecraft:other')).toEqual([potionQ]);
    expect(potionsForEffect(expansion, 'minecraft:missing')).toEqual([]);
  });

  it('rejects per-kind duplicates and supports empty catalogs', () => {
    expect(() => createCatalogExpansion({ enchantments: [enchantment, enchantment] })).toThrow(
      'EnchantmentPotion: duplicate enchantment id minecraft:a',
    );
    expect(() => createCatalogExpansion({ effects: [effect, effect] })).toThrow(
      'EnchantmentPotion: duplicate effect id minecraft:e',
    );
    expect(() => createCatalogExpansion({ potions: [potionP, potionP] })).toThrow(
      'EnchantmentPotion: duplicate potion id minecraft:p',
    );
    const empty = createCatalogExpansion({});
    expect(empty.enchantments).toEqual([]);
    expect(empty.effects).toEqual([]);
    expect(empty.potions).toEqual([]);
  });
});
