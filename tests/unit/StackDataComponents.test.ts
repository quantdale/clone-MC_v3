import { describe, it, expect } from 'vitest';
import {
  StackComponentRegistry,
  StackComponentMap,
  DAMAGE_COMPONENT,
  damageComponentType,
  createDefaultStackComponentRegistry,
  emptyStackComponents,
  type StackComponentType,
  type DamageComponentValue,
} from '../../src/inventory/StackDataComponents';
import { createResourceId, resourceIdToString } from '../../src/data/ResourceId';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';

const customType = (path: string): StackComponentType => ({
  id: createResourceId('test', path),
  description: path,
  validate: () => true,
});

describe('stack-data components', () => {
  // --- component registry ---
  it('registers base component types and rejects duplicates', () => {
    const reg = createDefaultStackComponentRegistry();
    expect(reg.has(DAMAGE_COMPONENT)).toBe(true);
    expect(reg.get(DAMAGE_COMPONENT).description).toBe(damageComponentType.description);

    expect(
      () => new StackComponentRegistry([customType('dup'), customType('dup')]),
    ).toThrow(/DUPLICATE_ID/);
  });

  // --- damage component validation ---
  it('accepts legal damage values and rejects illegal ones', () => {
    const reg = createDefaultStackComponentRegistry();
    expect(new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 0 }]]).has(DAMAGE_COMPONENT)).toBe(true);
    expect(new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 42 }]]).get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(42);

    for (const bad of [{ damage: -1 }, { damage: NaN }, {}, { damage: 'x' }, null, 5, { damage: 1.5 }]) {
      expect(() => new StackComponentMap(reg, [[DAMAGE_COMPONENT, bad as never]])).toThrow(/INVALID_ID/);
    }
  });

  it('default damage value is zero, matching current full-durability tools', () => {
    expect(damageComponentType.defaultValue).toEqual({ damage: 0 });
  });

  // --- map construction / unknown component ---
  it('rejects unknown component types on construction', () => {
    const reg = createDefaultStackComponentRegistry();
    expect(() => new StackComponentMap(reg, [[createResourceId('test', 'ghost'), 1]])).toThrow(/MISSING_ID/);
  });

  it('rejects an illegal value on with()', () => {
    const reg = createDefaultStackComponentRegistry();
    const map = new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 1 }]]);
    expect(() => map.with(DAMAGE_COMPONENT, { damage: -5 } as never)).toThrow(/INVALID_ID/);
  });

  // --- map mutation semantics ---
  it('with() returns a new map and leaves the source unchanged', () => {
    const reg = createDefaultStackComponentRegistry();
    const base = new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 3 }]]);
    const damaged = base.with(DAMAGE_COMPONENT, { damage: 10 });
    expect(damaged.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(10);
    expect(base.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(3);
  });

  it('without() removes a component', () => {
    const reg = createDefaultStackComponentRegistry();
    const map = new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 3 }]]);
    const removed = map.without(DAMAGE_COMPONENT);
    expect(removed.has(DAMAGE_COMPONENT)).toBe(false);
    expect(map.has(DAMAGE_COMPONENT)).toBe(true);
  });

  it('stores frozen values that cannot be mutated', () => {
    const reg = createDefaultStackComponentRegistry();
    const map = new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 3 }]]);
    const value = map.get<DamageComponentValue>(DAMAGE_COMPONENT);
    expect(Object.isFrozen(value)).toBe(true);
    expect(map.copy().equals(map)).toBe(true);
  });

  // --- equality / determinism ---
  it('compares maps for deep equality', () => {
    const reg = createDefaultStackComponentRegistry();
    const a = new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 3 }]]);
    const b = new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 3 }]]);
    const c = new StackComponentMap(reg, [[DAMAGE_COMPONENT, { damage: 4 }]]);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('iterates entries in deterministic ResourceId order', () => {
    const a = customType('aaa');
    const b = customType('bbb');
    const reg = new StackComponentRegistry([a, b]);
    const map = new StackComponentMap(reg, [
      [b.id, 2],
      [a.id, 1],
    ]);
    const order = map.entries().map(([id]) => resourceIdToString(id));
    expect(order).toEqual([resourceIdToString(a.id), resourceIdToString(b.id)]);
  });

  // --- compatibility / scope ---
  it('empty stack components carry nothing', () => {
    expect(emptyStackComponents().has(DAMAGE_COMPONENT)).toBe(false);
    expect(emptyStackComponents().entries()).toEqual([]);
  });

  it('is additive: current item registry keeps its durability metadata (migration is 009)', () => {
    const items = createDefaultItemRegistry();
    // Current tools still declare maxDurability; the damage component is the future carrier.
    expect(items.get(ItemId.WoodenPickaxe).maxDurability ?? 0).toBeGreaterThan(0);
    expect(items.get(ItemId.StonePickaxe).maxDurability ?? 0).toBeGreaterThan(0);
    // And the component framework already exists for them.
    expect(createDefaultStackComponentRegistry().has(DAMAGE_COMPONENT)).toBe(true);
  });
});
