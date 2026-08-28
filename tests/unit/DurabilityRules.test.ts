import { describe, it, expect } from 'vitest';
import {
  applyDamage,
  getRemainingDurability,
  isBroken,
  repair,
} from '../../src/inventory/DurabilityRules';
import {
  DAMAGE_COMPONENT,
  type DamageComponentValue,
  emptyStackComponents,
} from '../../src/inventory/StackDataComponents';
import type { ItemStack } from '../../src/inventory/Inventory';

function tool(id: number, damage: number): ItemStack {
  return {
    id,
    count: 1,
    components: emptyStackComponents().with(DAMAGE_COMPONENT, { damage }),
  };
}

const PRISTINE_TOOL: ItemStack = { id: 20, count: 1 };
const NON_TOOL: ItemStack = { id: 1, count: 1 };

describe('DurabilityRules.getRemainingDurability', () => {
  it('returns full durability for a pristine tool', () => {
    expect(getRemainingDurability(59, PRISTINE_TOOL)).toBe(59);
  });

  it('reflects accumulated damage', () => {
    expect(getRemainingDurability(59, tool(20, 10))).toBe(49);
  });

  it('returns 0 for a non-tool', () => {
    expect(getRemainingDurability(0, NON_TOOL)).toBe(0);
  });

  it('returns 0 for a missing or empty stack', () => {
    expect(getRemainingDurability(59, undefined)).toBe(0);
    expect(getRemainingDurability(59, { id: 20, count: 0 })).toBe(0);
  });
});

describe('DurabilityRules.applyDamage', () => {
  it('applies a point of wear without breaking', () => {
    const result = applyDamage(59, PRISTINE_TOOL, 1);
    expect(result.broke).toBe(false);
    expect(result.stack.count).toBe(1);
    expect(result.stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(1);
  });

  it('breaks the tool when remaining reaches zero', () => {
    const result = applyDamage(3, tool(20, 2), 1);
    expect(result.broke).toBe(true);
    expect(result.stack.count).toBe(0);
    expect(result.stack.components).toBeUndefined();
  });

  it('is a no-op for non-tools', () => {
    const result = applyDamage(0, NON_TOOL, 5);
    expect(result.broke).toBe(false);
    expect(result.stack).toBe(NON_TOOL);
  });

  it('coerces a negative amount to one wear', () => {
    const result = applyDamage(59, PRISTINE_TOOL, -3);
    expect(result.broke).toBe(false);
    expect(result.stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(1);
  });

  it('does not mutate the input stack', () => {
    const before = tool(20, 2);
    const result = applyDamage(59, before, 1);
    expect(before.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(2);
    expect(result.stack).not.toBe(before);
  });
});

describe('DurabilityRules.applyDamage unbreaking (119)', () => {
  it('skips wear when the unbreaking roll clears the wear threshold', () => {
    // level 1 -> wear probability 0.5 -> skip when rng() >= 0.5.
    const before = tool(20, 2);
    const result = applyDamage(59, before, 1, 1, () => 0.9);
    expect(result.broke).toBe(false);
    expect(result.stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(2);
    expect(result.stack).toBe(before);
  });

  it('applies wear when the unbreaking roll falls below the threshold', () => {
    const result = applyDamage(59, PRISTINE_TOOL, 1, 1, () => 0.1);
    expect(result.broke).toBe(false);
    expect(result.stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(1);
  });

  it('wears normally without an rng even when unbreaking is set', () => {
    const result = applyDamage(59, PRISTINE_TOOL, 1, 3);
    expect(result.broke).toBe(false);
    expect(result.stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(1);
  });

  it('wears normally at unbreaking level 0', () => {
    const result = applyDamage(59, PRISTINE_TOOL, 1, 0, () => 0.99);
    expect(result.stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(1);
  });
});

describe('DurabilityRules.isBroken', () => {
  it('returns false for a full tool', () => {
    expect(isBroken(59, tool(20, 0))).toBe(false);
  });

  it('returns true for a depleted tool', () => {
    expect(isBroken(3, tool(20, 3))).toBe(true);
  });

  it('returns true for an empty stack', () => {
    expect(isBroken(59, { id: 20, count: 0 })).toBe(true);
  });

  it('returns false for a non-tool', () => {
    expect(isBroken(0, NON_TOOL)).toBe(false);
  });
});

describe('DurabilityRules.repair', () => {
  it('reduces accumulated damage', () => {
    const result = repair(59, tool(20, 10), 4);
    expect(result.count).toBe(1);
    expect(result.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(6);
  });

  it('clamps at pristine (no damage component remains)', () => {
    const result = repair(59, tool(20, 2), 10);
    expect(result.components?.has(DAMAGE_COMPONENT)).toBe(false);
    expect(getRemainingDurability(59, result)).toBe(59);
  });

  it('is a no-op for a pristine tool (same object)', () => {
    const result = repair(59, PRISTINE_TOOL, 5);
    expect(result).toBe(PRISTINE_TOOL);
  });

  it('is a no-op for a non-tool (same object)', () => {
    const result = repair(0, NON_TOOL, 5);
    expect(result).toBe(NON_TOOL);
  });

  it('does not mutate the input stack', () => {
    const before = tool(20, 10);
    const result = repair(59, before, 4);
    expect(before.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage).toBe(10);
    expect(result).not.toBe(before);
  });
});
