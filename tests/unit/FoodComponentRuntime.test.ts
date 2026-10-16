import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { StatusEffectManager } from '../../src/data/StatusEffectManager';
import { createDefaultStatusEffectRegistry } from '../../src/data/StatusEffect';
import { createDefaultAttributeRegistry } from '../../src/data/AttributeRegistry';
import { resolveFoodConsume, applyConsumeEffects, type ConsumeEffects } from '../../src/player/FoodComponentRuntime';
import { type ItemTypeDefinition } from '../../src/inventory/ItemRegistry';

function baseDef(overrides: Partial<ItemTypeDefinition> = {}): ItemTypeDefinition {
  return {
    id: 13,
    resourceId: createResourceId('minecraft', 'apple'),
    key: 'apple',
    name: 'Apple',
    iconTile: 15,
    stackSize: 64,
    ...overrides,
  };
}

function newManager(): StatusEffectManager {
  return new StatusEffectManager(createDefaultStatusEffectRegistry(), createDefaultAttributeRegistry());
}

describe('resolveFoodConsume', () => {
  it('returns null for a non-food definition', () => {
    expect(resolveFoodConsume(baseDef({ isFood: false }))).toBeNull();
    expect(resolveFoodConsume(baseDef())).toBeNull();
  });

  it('returns explicit hunger/saturation and no effects for plain food', () => {
    const result: ConsumeEffects | null = resolveFoodConsume(
      baseDef({ isFood: true, foodHunger: 4, foodSaturation: 2 }),
    );
    expect(result).not.toBeNull();
    expect(result!.hunger).toBe(4);
    expect(result!.saturation).toBe(2);
    expect(result!.effects).toEqual([]);
  });

  it('defaults omitted nutrition to zero and clamps negatives', () => {
    const result = resolveFoodConsume(
      baseDef({ isFood: true, foodHunger: -5, foodSaturation: undefined }),
    );
    expect(result!.hunger).toBe(0);
    expect(result!.saturation).toBe(0);
  });

  it('keeps well-formed foodEffects rows', () => {
    const result = resolveFoodConsume(
      baseDef({
        isFood: true,
        foodEffects: [{ typeId: 'minecraft:effect/regeneration', duration: 5, amplifier: 0 }],
      }),
    );
    expect(result!.effects).toHaveLength(1);
    expect(result!.effects[0]!.typeId).toBe('minecraft:effect/regeneration');
  });

  it('drops malformed foodEffects rows (bad typeId, negative values, non-object)', () => {
    const result = resolveFoodConsume(
      baseDef({
        isFood: true,
        foodEffects: [
          { typeId: 'minecraft:effect/regeneration', duration: 5, amplifier: 0 },
          { typeId: '', duration: 1, amplifier: 0 },
          { typeId: 'minecraft:effect/poison', duration: -1, amplifier: 0 },
          { typeId: 'minecraft:effect/speed', duration: 1, amplifier: -2 },
          'not-an-object' as unknown as { typeId: string; duration: number; amplifier: number },
        ],
      }),
    );
    expect(result!.effects).toHaveLength(1);
    expect(result!.effects[0]!.typeId).toBe('minecraft:effect/regeneration');
  });
});

describe('applyConsumeEffects', () => {
  it('adds a registered effect with its duration and amplifier', () => {
    const mgr = newManager();
    applyConsumeEffects(mgr, [{ typeId: 'minecraft:effect/speed', duration: 60, amplifier: 1 }]);
    const inst = mgr.get(createResourceId('minecraft', 'effect/speed'));
    expect(inst).toBeDefined();
    expect(inst!.duration).toBe(60);
    expect(inst!.amplifier).toBe(1);
  });

  it('skips an unregistered typeId without throwing', () => {
    const mgr = newManager();
    expect(() =>
      applyConsumeEffects(mgr, [{ typeId: 'minecraft:effect/not_a_real_effect', duration: 1, amplifier: 0 }]),
    ).not.toThrow();
    expect(mgr.getAll()).toHaveLength(0);
  });

  it('skips a non-parseable typeId without throwing', () => {
    const mgr = newManager();
    expect(() => applyConsumeEffects(mgr, [{ typeId: '::', duration: 1, amplifier: 0 }])).not.toThrow();
    expect(mgr.getAll()).toHaveLength(0);
  });

  it('keeps the valid effects when mixed with invalid ones', () => {
    const mgr = newManager();
    applyConsumeEffects(mgr, [
      { typeId: 'minecraft:effect/regeneration', duration: 5, amplifier: 0 },
      { typeId: 'minecraft:effect/bogus', duration: 1, amplifier: 0 },
    ]);
    expect(mgr.getAll()).toHaveLength(1);
    expect(mgr.get(createResourceId('minecraft', 'effect/regeneration'))).toBeDefined();
  });

  it('is a no-op for an empty list', () => {
    const mgr = newManager();
    applyConsumeEffects(mgr, []);
    expect(mgr.getAll()).toHaveLength(0);
  });

  it('applies multiple distinct registered effects', () => {
    const mgr = newManager();
    applyConsumeEffects(mgr, [
      { typeId: 'minecraft:effect/speed', duration: 60, amplifier: 1 },
      { typeId: 'minecraft:effect/strength', duration: 30, amplifier: 2 },
    ]);
    expect(mgr.getAll()).toHaveLength(2);
  });
});
