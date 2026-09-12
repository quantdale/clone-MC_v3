import { describe, expect, it } from 'vitest';
import {
  CAN_DESTROY_COMPONENT,
  CAN_PLACE_ON_COMPONENT,
  canDestroyComponentType,
  canPlaceOnComponentType,
  createDefaultStackComponentRegistry,
  StackComponentMap,
} from '../../src/inventory/StackDataComponents';
import {
  canBreakHeld,
  canPlaceHeld,
  getHeldPermissionSet,
  splitPermissionKeys,
  type BlockTagLookup,
} from '../../src/simulation/AdventurePermissions';

const registry = createDefaultStackComponentRegistry();

function stackWith(componentId: typeof CAN_DESTROY_COMPONENT, value: unknown) {
  const map = new StackComponentMap(registry).with(
    componentId,
    value as Record<string, boolean>,
  );
  return { components: map };
}

function lookupOf(entries: ReadonlyMap<string, ReadonlySet<string>>): BlockTagLookup {
  return (tagId: string) => entries.get(tagId);
}

const TAGS = new Map<string, ReadonlySet<string>>([
  ['minecraft:logs', new Set(['minecraft:oak_log', 'minecraft:birch_log'])],
  ['minecraft:mineable', new Set(['minecraft:stone', 'minecraft:oak_log'])],
]);

describe('adventure declaration component types (266)', () => {
  it('registers both ids in the default registry', () => {
    expect(registry.has(CAN_DESTROY_COMPONENT)).toBe(true);
    expect(registry.has(CAN_PLACE_ON_COMPONENT)).toBe(true);
  });

  it.each([canDestroyComponentType, canPlaceOnComponentType])(
    'validates only flat true-records ($description)',
    (type) => {
      expect(type.validate({ 'minecraft:stone': true })).toBe(true);
      expect(type.validate({ 'minecraft:stone': true, '#minecraft:logs': true })).toBe(true);
      expect(type.validate({})).toBe(true);
      expect(type.validate(null)).toBe(false);
      expect(type.validate('minecraft:stone')).toBe(false);
      expect(type.validate(['minecraft:stone'])).toBe(false);
      expect(type.validate({ 'minecraft:stone': false })).toBe(false);
      expect(type.validate({ '': true })).toBe(false);
      expect(type.validate({ 'minecraft:stone': 1 })).toBe(false);
    },
  );

  it('stores declarations through StackComponentMap.with', () => {
    const stack = stackWith(CAN_DESTROY_COMPONENT, { 'minecraft:stone': true });
    expect(stack.components.get(CAN_DESTROY_COMPONENT)).toEqual({ 'minecraft:stone': true });
  });
});

describe('splitPermissionKeys', () => {
  it('splits direct ids from #-prefixed tags', () => {
    expect(
      splitPermissionKeys({ 'minecraft:stone': true, '#minecraft:logs': true }),
    ).toEqual({ directIds: ['minecraft:stone'], tagIds: ['minecraft:logs'] });
  });

  it('skips bare #, false values, and empty keys', () => {
    expect(
      splitPermissionKeys({ '#': true, 'minecraft:dirt': false, '': true } as never),
    ).toEqual({ directIds: [], tagIds: [] });
  });

  it('yields empty lists for non-object values', () => {
    for (const v of [undefined, null, 42, 'x', ['minecraft:stone']]) {
      expect(splitPermissionKeys(v)).toEqual({ directIds: [], tagIds: [] });
    }
  });
});

describe('getHeldPermissionSet', () => {
  const lookup = lookupOf(TAGS);

  it('returns empty for null/absent stacks and missing components', () => {
    expect(getHeldPermissionSet(null, CAN_DESTROY_COMPONENT, lookup).size).toBe(0);
    expect(getHeldPermissionSet(undefined, CAN_DESTROY_COMPONENT, lookup).size).toBe(0);
    expect(getHeldPermissionSet({}, CAN_DESTROY_COMPONENT, lookup).size).toBe(0);
    expect(
      getHeldPermissionSet(
        stackWith(CAN_PLACE_ON_COMPONENT, { 'minecraft:stone': true }),
        CAN_DESTROY_COMPONENT,
        lookup,
      ).size,
    ).toBe(0);
  });

  it('unions direct ids with resolved tag members, deduped', () => {
    const stack = stackWith(CAN_DESTROY_COMPONENT, {
      'minecraft:stone': true,
      '#minecraft:logs': true,
    });
    expect(getHeldPermissionSet(stack, CAN_DESTROY_COMPONENT, lookup)).toEqual(
      new Set(['minecraft:stone', 'minecraft:oak_log', 'minecraft:birch_log']),
    );
  });

  it('skips unknown tags and survives a throwing lookup', () => {
    const stack = stackWith(CAN_DESTROY_COMPONENT, {
      '#minecraft:nope': true,
      'minecraft:dirt': true,
    });
    expect(getHeldPermissionSet(stack, CAN_DESTROY_COMPONENT, lookup)).toEqual(
      new Set(['minecraft:dirt']),
    );
    const throwing: BlockTagLookup = () => {
      throw new Error('boom');
    };
    expect(getHeldPermissionSet(stack, CAN_DESTROY_COMPONENT, throwing)).toEqual(new Set());
  });
});

describe('canBreakHeld / canPlaceHeld composition (266 over 194)', () => {
  const lookup = lookupOf(TAGS);
  const destroyStack = stackWith(CAN_DESTROY_COMPONENT, {
    'minecraft:stone': true,
    '#minecraft:logs': true,
  });
  const placeStack = stackWith(CAN_PLACE_ON_COMPONENT, { 'minecraft:dirt': true });

  it('survival and creative always allow regardless of declarations', () => {
    for (const mode of ['survival', 'creative'] as const) {
      expect(canBreakHeld(mode, null, 'minecraft:bedrock', lookup)).toBe(true);
      expect(canPlaceHeld(mode, {}, 'minecraft:bedrock', lookup)).toBe(true);
    }
  });

  it('spectator always denies regardless of declarations', () => {
    expect(canBreakHeld('spectator', destroyStack, 'minecraft:stone', lookup)).toBe(false);
    expect(canPlaceHeld('spectator', placeStack, 'minecraft:dirt', lookup)).toBe(false);
  });

  it('adventure allows declared blocks (direct and via tag)', () => {
    expect(canBreakHeld('adventure', destroyStack, 'minecraft:stone', lookup)).toBe(true);
    expect(canBreakHeld('adventure', destroyStack, 'minecraft:oak_log', lookup)).toBe(true);
    expect(canPlaceHeld('adventure', placeStack, 'minecraft:dirt', lookup)).toBe(true);
  });

  it('adventure denies undeclared blocks, empty hands, and cross-kind declarations', () => {
    expect(canBreakHeld('adventure', destroyStack, 'minecraft:dirt', lookup)).toBe(false);
    expect(canBreakHeld('adventure', null, 'minecraft:stone', lookup)).toBe(false);
    expect(canBreakHeld('adventure', {}, 'minecraft:stone', lookup)).toBe(false);
    // A CanPlaceOn declaration does not grant breaking and vice versa.
    expect(canBreakHeld('adventure', placeStack, 'minecraft:dirt', lookup)).toBe(false);
    expect(canPlaceHeld('adventure', destroyStack, 'minecraft:stone', lookup)).toBe(false);
  });
});
