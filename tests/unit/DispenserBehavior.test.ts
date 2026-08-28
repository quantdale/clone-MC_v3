import { describe, it, expect } from 'vitest';
import {
  BlockId,
  DISPENSER_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import { offsetInDirection } from '../../src/simulation/RedstoneSignal';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import type { DispenserFacing } from '../../src/simulation/DispenserBehavior';
import {
  DISPENSER_EJECT_COOLDOWN_TICKS,
  DISPENSER_ITEM_BEHAVIORS,
  dispenseFromDispenser,
  dispenserOutputPosition,
  dispenserShouldTransfer,
  dispenserStateProperties,
  dueDispenserEjects,
  getDispenserBehavior,
  scheduleDispenserEject,
} from '../../src/simulation/DispenserBehavior';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

function slot(item: string | null, count = 0, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

const FACINGS: DispenserFacing[] = ['down', 'north', 'south', 'east', 'west'];

describe('dispenser registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with DISPENSER_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.Dispenser);
    expect(def.key).toBe('dispenser');
    expect(blockRegistry.getPropertySchema(BlockId.Dispenser)).toBe(DISPENSER_SCHEMA);
    expect(def.defaultState).toEqual({ facing: 'down', enabled: true });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Dispenser);
    expect(item.key).toBe('dispenser');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:dispenser');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 10 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Dispenser);
    expect(states.length).toBe(10); // 5 facings x 2 enabled

    const defaultState = stateRegistry.getDefaultState(BlockId.Dispenser);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('facing')).toBe('down');
    expect(defaultState.getProperty('enabled')).toBe('true');
  });
});

describe('dispenser behavior table', () => {
  it('returns the behavior for a known special item', () => {
    const b = getDispenserBehavior('minecraft:arrow');
    expect(b).not.toBeNull();
    expect(b!.behavior).toBe('shoot_projectile');
    expect(b!.projectile).toBe('arrow');
  });

  it('returns null for a plain item (dropper-style fallback)', () => {
    expect(getDispenserBehavior('stone')).toBeNull();
    expect(getDispenserBehavior(null)).toBeNull();
  });

  it('tables a representative initial set of special items', () => {
    const items = DISPENSER_ITEM_BEHAVIORS.map((e) => e.item);
    expect(items).toContain('minecraft:arrow');
    expect(items).toContain('minecraft:egg');
    expect(items).toContain('minecraft:snowball');
  });
});

describe('dispenserShouldTransfer', () => {
  it('is enabled (dispenses) when unpowered', () => {
    expect(dispenserShouldTransfer(false)).toBe(true);
  });

  it('is locked (does not dispense) when powered', () => {
    expect(dispenserShouldTransfer(true)).toBe(false);
  });
});

describe('dispenser output position', () => {
  it('output follows the given facing for all five facings', () => {
    for (const facing of FACINGS) {
      expect(dispenserOutputPosition(1, 2, 3, facing)).toEqual(offsetInDirection(1, 2, 3, facing));
    }
  });
});

describe('dispenseFromDispenser', () => {
  it('is a no-op (none) when the source is empty', () => {
    const source = [slot(null), slot(null)];
    const result = dispenseFromDispenser(source, [slot('stone', 1)], [9, 9, 9]);
    if (result.kind !== 'none') throw new Error('expected none');
    expect(result.moved).toBe(false);
    expect(result.source).toEqual(source);
  });

  it('performs a data-driven behavior for a special item, consuming one', () => {
    const source = [slot('minecraft:arrow', 5)];
    const result = dispenseFromDispenser(source, [slot('stone', 1)], [9, 9, 9]);
    expect(result.kind).toBe('behavior');
    if (result.kind !== 'behavior') throw new Error('expected behavior');
    expect(result.behavior.behavior).toBe('shoot_projectile');
    expect(result.behavior.projectile).toBe('arrow');
    expect(result.source[0]!.count).toBe(4);
  });

  it('delegates a plain item to a container push (merges)', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('stone', 10), slot(null)];
    const result = dispenseFromDispenser(source, destination, [9, 9, 9]);
    expect(result.kind).toBe('container');
    if (result.kind !== 'container') throw new Error('expected container');
    expect(result.destination[0]!.count).toBe(11);
    expect(result.source[0]!.count).toBe(4);
  });

  it('delegates a plain item to a world drop when facing no container', () => {
    const source = [slot('stone', 5)];
    const result = dispenseFromDispenser(source, null, [7, 8, 9]);
    expect(result.kind).toBe('drop');
    if (result.kind !== 'drop') throw new Error('expected drop');
    expect(result.drop.item).toBe('stone');
    expect(result.drop.position).toEqual([7, 8, 9]);
    expect(result.source[0]!.count).toBe(4);
  });

  it('does NOT spill a plain item into the world when facing a full container', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('stone', 64), slot('stone', 64)];
    const result = dispenseFromDispenser(source, destination, [9, 9, 9]);
    if (result.kind !== 'none') throw new Error('expected none');
    expect(result.moved).toBe(false);
    expect(result.source[0]!.count).toBe(5);
  });
});

describe('dispenser scheduling', () => {
  it('is not due before the cooldown elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleDispenserEject(queue, 1, 2, 3, 0);
    expect(dueDispenserEjects(queue, DISPENSER_EJECT_COOLDOWN_TICKS - 1)).toEqual([]);
  });

  it('fires at exactly the cooldown tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleDispenserEject(queue, 1, 2, 3, 0);
    const due = dueDispenserEjects(queue, DISPENSER_EJECT_COOLDOWN_TICKS);
    expect(due).toHaveLength(1);
    expect([due[0]!.x, due[0]!.y, due[0]!.z]).toEqual([1, 2, 3]);
    expect(due[0]!.tickTime).toBe(DISPENSER_EJECT_COOLDOWN_TICKS);
  });

  it('returns same-tick ejections in deterministic scheduling order, repeatably', () => {
    const build = (): number[][] => {
      const queue = new ScheduledTickQueue();
      scheduleDispenserEject(queue, 1, 0, 0, 0);
      scheduleDispenserEject(queue, 2, 0, 0, 0);
      return dueDispenserEjects(queue, DISPENSER_EJECT_COOLDOWN_TICKS).map((t) => [t.x, t.y, t.z]);
    };
    const first = build();
    const second = build();
    expect(first).toEqual([
      [1, 0, 0],
      [2, 0, 0],
    ]);
    expect(second).toEqual(first);
  });
});

describe('dispenserStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = dispenserStateProperties('down', true);
    expect(Object.keys(props).sort()).toEqual(['enabled', 'facing']);
    expect(props).toEqual({ facing: 'down', enabled: true });
    for (const [name, value] of Object.entries(props)) {
      expect(DISPENSER_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
