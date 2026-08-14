import { describe, expect, it } from 'vitest';
import {
  AttributeRegistry,
  AttributeInstance,
  AttributeError,
  createDefaultAttributeRegistry,
  type AttributeDefinition,
  type Modifier,
} from '../../src/data/AttributeRegistry';
import { createResourceId } from '../../src/data/ResourceId';

const rid = (path: string) => createResourceId('test', path);

function def(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: rid('attr/test'),
    key: 'test',
    name: 'Test',
    min: 0,
    default: 10,
    max: 1000,
    ...overrides,
  };
}

function modifier(id: string, operation: Modifier['operation'], amount: number): Modifier {
  return { id: rid(id), operation, amount };
}

describe('attribute registry validation', () => {
  it('registers ordered finite ranges and rejects bad ranges', () => {
    const reg = new AttributeRegistry([def()]);
    expect(reg.size).toBe(1);
    expect(reg.has(def().id)).toBe(true);

    expect(() => new AttributeRegistry([def({ min: 5, default: 1, max: 10 })])).toThrow(AttributeError);
    expect(() => new AttributeRegistry([def({ min: 0, default: 10, max: 5 })])).toThrow(/INVALID_RANGE/);
    expect(() => new AttributeRegistry([def({ min: NaN, default: 10, max: 1000 })])).toThrow(/INVALID_RANGE/);
  });

  it('rejects a duplicate attribute id', () => {
    const d = def();
    expect(() => new AttributeRegistry([d, d])).toThrow(/DUPLICATE_ID/);
  });
});

describe('attribute instance effective value', () => {
  it('returns the base when there are no modifiers', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    expect(inst.value).toBe(10);
    expect(inst.baseValue).toBe(10);
  });

  it('clamps out-of-range base to the attribute bounds', () => {
    expect(new AttributeInstance(def({ default: -5 })).value).toBe(0);
    expect(new AttributeInstance(def({ default: 5000 })).value).toBe(1000);
  });

  it('applies ADD_VALUE', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    inst.addModifier(modifier('a', 'ADD_VALUE', 5));
    expect(inst.value).toBe(15);
  });

  it('applies ADD_BASE_FRACTION relative to the original base', () => {
    const inst = new AttributeInstance(def({ default: 20 }));
    inst.addModifier(modifier('a', 'ADD_BASE_FRACTION', 0.5));
    expect(inst.value).toBe(30); // 20 + 20*0.5
  });

  it('applies MULTIPLY_TOTAL', () => {
    const inst = new AttributeInstance(def({ default: 20 }));
    inst.addModifier(modifier('a', 'MULTIPLY_TOTAL', 0.5));
    expect(inst.value).toBe(30); // 20 * 1.5
  });

  it('applies the documented combined formula and is insertion-order independent', () => {
    const build = (order: Modifier[]) => {
      const inst = new AttributeInstance(def({ default: 10 }));
      for (const m of order) inst.addModifier(m);
      return inst.value;
    };
    const mods = [
      modifier('a', 'ADD_VALUE', 2), // +2 -> 12
      modifier('b', 'ADD_BASE_FRACTION', 0.5), // +10*0.5 -> 17
      modifier('c', 'MULTIPLY_TOTAL', 0.1), // *1.1 -> 18.7
    ];
    const expected = 18.7;
    expect(build(mods)).toBeCloseTo(expected);
    expect(build([...mods].reverse())).toBeCloseTo(expected);
    const [a, b, c] = mods;
    expect(build([c!, a!, b!])).toBeCloseTo(expected);
  });

  it('applies MULTIPLY_TOTAL in deterministic modifier-id order', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    // 'b' would be inserted first, but id order mandates 'a' < 'b'.
    inst.addModifier(modifier('b', 'MULTIPLY_TOTAL', 0.2)); // value *= 1.2
    inst.addModifier(modifier('a', 'MULTIPLY_TOTAL', 0.1)); // value *= 1.1
    // sorted: a then b -> 10 * 1.1 * 1.2 = 13.2
    expect(inst.value).toBeCloseTo(13.2);
  });

  it('clamps the final effective value to the attribute bounds', () => {
    const inst = new AttributeInstance(def({ default: 20 }));
    inst.addModifier(modifier('a', 'MULTIPLY_TOTAL', 100));
    expect(inst.value).toBe(1000); // 20*101 clamped to max
  });

  it('recomputes the cached value after a base change', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    inst.addModifier(modifier('a', 'ADD_VALUE', 5));
    expect(inst.value).toBe(15);
    inst.setBase(20);
    expect(inst.value).toBe(25);
  });
});

describe('attribute mutation and error handling', () => {
  it('rejects a duplicate modifier id and preserves the original', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    inst.addModifier(modifier('a', 'ADD_VALUE', 5));
    expect(() => inst.addModifier(modifier('a', 'ADD_VALUE', 99))).toThrow(/DUPLICATE_MODIFIER/);
    expect(inst.value).toBe(15);
    expect(inst.modifierCount).toBe(1);
  });

  it('rejects non-finite base at construction and on update', () => {
    expect(() => new AttributeInstance(def({ default: NaN }))).toThrow(/INVALID_VALUE/);
    expect(() => new AttributeInstance(def({ default: Infinity }))).toThrow(/INVALID_VALUE/);
    const inst = new AttributeInstance(def({ default: 10 }));
    expect(() => inst.setBase(NaN)).toThrow(/INVALID_VALUE/);
    expect(inst.baseValue).toBe(10);
  });

  it('rejects non-finite modifier amount and unknown operation', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    expect(() => inst.addModifier(modifier('a', 'ADD_VALUE', NaN))).toThrow(/INVALID_VALUE/);
    expect(() => inst.addModifier({ id: rid('x'), operation: 'BOGUS' as Modifier['operation'], amount: 1 })).toThrow(
      /INVALID_OPERATION/,
    );
  });

  it('removes and clears modifiers deterministically', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    inst.addModifier(modifier('a', 'ADD_VALUE', 5));
    inst.addModifier(modifier('b', 'ADD_VALUE', 3));
    expect(inst.value).toBe(18);
    expect(inst.removeModifier(rid('a'))).toBe(true);
    expect(inst.removeModifier(rid('missing'))).toBe(false);
    expect(inst.value).toBe(13);
    inst.clearModifiers();
    expect(inst.value).toBe(10);
    expect(inst.modifierCount).toBe(0);
  });

  it('keeps prior valid state after a failed add (atomicity)', () => {
    const inst = new AttributeInstance(def({ default: 10 }));
    inst.addModifier(modifier('a', 'ADD_VALUE', 5));
    try {
      inst.addModifier(modifier('a', 'ADD_VALUE', 99));
    } catch {
      // expected
    }
    expect(inst.value).toBe(15);
    expect(inst.modifiersList.map((m) => m.amount)).toEqual([5]);
  });
});

describe('default attribute registry', () => {
  it('provides the generic attribute domains', () => {
    const reg = createDefaultAttributeRegistry();
    expect(reg.has(createResourceId('minecraft', 'generic/max_health'))).toBe(true);
    expect(reg.size).toBe(6);
    const maxHealth = reg.get(createResourceId('minecraft', 'generic/max_health'));
    expect(new AttributeInstance(maxHealth).value).toBe(20);
  });
});
