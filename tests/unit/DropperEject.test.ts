import { describe, it, expect } from 'vitest';
import {
  BlockId,
  DROPPER_SCHEMA,
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
import type { DropperFacing } from '../../src/simulation/DropperEject';
import {
  DROPPER_EJECT_COOLDOWN_TICKS,
  dropperOutputPosition,
  dropperShouldTransfer,
  dropperStateProperties,
  dueDropperEjects,
  ejectFromDropper,
  scheduleDropperEject,
} from '../../src/simulation/DropperEject';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

function slot(item: string | null, count = 0, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

const FACINGS: DropperFacing[] = ['down', 'north', 'south', 'east', 'west'];

describe('dropper registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with DROPPER_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.Dropper);
    expect(def.key).toBe('dropper');
    expect(blockRegistry.getPropertySchema(BlockId.Dropper)).toBe(DROPPER_SCHEMA);
    expect(def.defaultState).toEqual({ facing: 'down', enabled: true });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Dropper);
    expect(item.key).toBe('dropper');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:dropper');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 10 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Dropper);
    expect(states.length).toBe(10); // 5 facings x 2 enabled

    const defaultState = stateRegistry.getDefaultState(BlockId.Dropper);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('facing')).toBe('down');
    expect(defaultState.getProperty('enabled')).toBe('true');
  });
});

describe('dropperShouldTransfer', () => {
  it('is enabled (ejects) when unpowered', () => {
    expect(dropperShouldTransfer(false)).toBe(true);
  });

  it('is locked (does not eject) when powered', () => {
    expect(dropperShouldTransfer(true)).toBe(false);
  });
});

describe('dropper output position', () => {
  it('output follows the given facing for all five facings', () => {
    for (const facing of FACINGS) {
      expect(dropperOutputPosition(1, 2, 3, facing)).toEqual(offsetInDirection(1, 2, 3, facing));
    }
  });
});

describe('ejectFromDropper', () => {
  it('is a no-op (none) when the source is empty', () => {
    const source = [slot(null), slot(null)];
    const result = ejectFromDropper(source, [slot('stone', 1)], [9, 9, 9]);
    expect(result.kind).toBe('none');
    expect(result.moved).toBe(false);
    expect(result.source).toEqual(source);
  });

  it('pushes into a container, merging into an existing stack', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('stone', 10), slot(null)];
    const result = ejectFromDropper(source, destination, [9, 9, 9]);
    expect(result.kind).toBe('container');
    if (result.kind !== 'container') throw new Error('expected container');
    expect(result.moved).toBe(true);
    expect(result.destination[0]!.count).toBe(11);
    expect(result.destination[1]!.item).toBeNull();
    expect(result.source[0]!.count).toBe(4);
  });

  it('pushes into an empty slot when no mergeable slot exists', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('dirt', 10), slot(null)];
    const result = ejectFromDropper(source, destination, [9, 9, 9]);
    expect(result.kind).toBe('container');
    if (result.kind !== 'container') throw new Error('expected container');
    expect(result.destination[1]!.item).toBe('stone');
    expect(result.destination[1]!.count).toBe(1);
    expect(result.source[0]!.count).toBe(4);
  });

  it('does NOT spill into the world when facing a full container', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('stone', 64), slot('stone', 64)]; // no room
    const result = ejectFromDropper(source, destination, [9, 9, 9]);
    expect(result.kind).toBe('none');
    expect(result.moved).toBe(false);
    expect(result.source[0]!.count).toBe(5); // source untouched
  });

  it('drops into the world when facing no container', () => {
    const source = [slot('stone', 5)];
    const result = ejectFromDropper(source, null, [7, 8, 9]);
    expect(result.kind).toBe('drop');
    if (result.kind !== 'drop') throw new Error('expected drop');
    expect(result.moved).toBe(true);
    expect(result.drop.item).toBe('stone');
    expect(result.drop.count).toBe(1);
    expect(result.drop.position).toEqual([7, 8, 9]);
    expect(result.source[0]!.count).toBe(4);
  });
});

describe('dropper scheduling', () => {
  it('is not due before the cooldown elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleDropperEject(queue, 1, 2, 3, 0);
    expect(dueDropperEjects(queue, DROPPER_EJECT_COOLDOWN_TICKS - 1)).toEqual([]);
  });

  it('fires at exactly the cooldown tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleDropperEject(queue, 1, 2, 3, 0);
    const due = dueDropperEjects(queue, DROPPER_EJECT_COOLDOWN_TICKS);
    expect(due).toHaveLength(1);
    expect([due[0]!.x, due[0]!.y, due[0]!.z]).toEqual([1, 2, 3]);
    expect(due[0]!.tickTime).toBe(DROPPER_EJECT_COOLDOWN_TICKS);
  });

  it('returns same-tick ejections in deterministic scheduling order, repeatably', () => {
    const build = (): number[][] => {
      const queue = new ScheduledTickQueue();
      scheduleDropperEject(queue, 1, 0, 0, 0);
      scheduleDropperEject(queue, 2, 0, 0, 0);
      return dueDropperEjects(queue, DROPPER_EJECT_COOLDOWN_TICKS).map((t) => [t.x, t.y, t.z]);
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

describe('dropperStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = dropperStateProperties('down', true);
    expect(Object.keys(props).sort()).toEqual(['enabled', 'facing']);
    expect(props).toEqual({ facing: 'down', enabled: true });
    for (const [name, value] of Object.entries(props)) {
      expect(DROPPER_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
