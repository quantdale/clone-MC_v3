import { describe, it, expect } from 'vitest';
import {
  BlockId,
  HOPPER_SCHEMA,
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
import type { HopperFacing } from '../../src/simulation/HopperTransfer';
import {
  HOPPER_TRANSFER_COOLDOWN_TICKS,
  dueHopperTransfers,
  hopperIntakePosition,
  hopperOutputPosition,
  hopperShouldTransfer,
  hopperStateProperties,
  scheduleHopperTransfer,
  transferOneItem,
} from '../../src/simulation/HopperTransfer';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

function slot(item: string | null, count = 0, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

const FACINGS: HopperFacing[] = ['down', 'north', 'south', 'east', 'west'];

describe('hopper registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with HOPPER_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.Hopper);
    expect(def.key).toBe('hopper');
    expect(blockRegistry.getPropertySchema(BlockId.Hopper)).toBe(HOPPER_SCHEMA);
    expect(def.defaultState).toEqual({ facing: 'down', enabled: true });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Hopper);
    expect(item.key).toBe('hopper');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:hopper');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 10 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Hopper);
    expect(states.length).toBe(10); // 5 facings x 2 enabled

    const defaultState = stateRegistry.getDefaultState(BlockId.Hopper);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('facing')).toBe('down');
    expect(defaultState.getProperty('enabled')).toBe('true');
  });
});

describe('transferOneItem', () => {
  it('is a no-op when the source is empty', () => {
    const source = [slot(null), slot(null)];
    const destination = [slot('stone', 1), slot(null)];
    const result = transferOneItem(source, destination);
    expect(result.moved).toBe(false);
    expect(result.source).toEqual(source);
    expect(result.destination).toEqual(destination);
  });

  it('is a no-op that does not deplete the source when the destination is full', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('dirt', 64), slot('stone', 64)];
    const result = transferOneItem(source, destination);
    expect(result.moved).toBe(false);
    expect(result.source[0]!.count).toBe(5); // source untouched
    expect(result.destination[1]!.count).toBe(64);
  });

  it('prefers merging into an existing stack over an empty slot', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('stone', 10), slot(null)];
    const result = transferOneItem(source, destination);
    expect(result.moved).toBe(true);
    expect(result.destination[0]!.count).toBe(11);
    expect(result.destination[1]!.item).toBeNull();
    expect(result.source[0]!.count).toBe(4);
  });

  it('uses an empty slot when no mergeable slot exists', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('dirt', 10), slot(null)];
    const result = transferOneItem(source, destination);
    expect(result.moved).toBe(true);
    expect(result.destination[0]!.count).toBe(10); // unchanged
    expect(result.destination[1]!.item).toBe('stone');
    expect(result.destination[1]!.count).toBe(1);
    expect(result.source[0]!.count).toBe(4);
  });

  it('decrements the source by exactly one on a successful transfer', () => {
    const source = [slot('stone', 5)];
    const destination = [slot('stone', 1), slot(null)];
    const result = transferOneItem(source, destination);
    expect(result.moved).toBe(true);
    expect(result.source[0]!.count).toBe(4);
  });
});

describe('hopperShouldTransfer', () => {
  it('is enabled (transfers) when unpowered', () => {
    expect(hopperShouldTransfer(false)).toBe(true);
  });

  it('is locked (does not transfer) when powered', () => {
    expect(hopperShouldTransfer(true)).toBe(false);
  });
});

describe('intake and output positions', () => {
  it('intake is always straight up regardless of facing', () => {
    for (const facing of FACINGS) {
      // hopperIntakePosition ignores facing by design.
      void facing;
      expect(hopperIntakePosition(1, 2, 3)).toEqual(offsetInDirection(1, 2, 3, 'up'));
      expect(hopperIntakePosition(10, 20, 30)).toEqual([10, 21, 30]);
    }
  });

  it('output follows the given facing for all five facings', () => {
    for (const facing of FACINGS) {
      expect(hopperOutputPosition(1, 2, 3, facing)).toEqual(offsetInDirection(1, 2, 3, facing));
    }
  });
});

describe('hopper scheduling', () => {
  it('is not due before the cooldown elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleHopperTransfer(queue, 1, 2, 3, 0);
    const due = dueHopperTransfers(queue, HOPPER_TRANSFER_COOLDOWN_TICKS - 1);
    expect(due).toEqual([]);
  });

  it('fires at exactly the cooldown tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleHopperTransfer(queue, 1, 2, 3, 0);
    const due = dueHopperTransfers(queue, HOPPER_TRANSFER_COOLDOWN_TICKS);
    expect(due).toHaveLength(1);
    expect([due[0]!.x, due[0]!.y, due[0]!.z]).toEqual([1, 2, 3]);
    expect(due[0]!.tickTime).toBe(HOPPER_TRANSFER_COOLDOWN_TICKS);
  });

  it('returns same-tick transfers in deterministic scheduling order, repeatably', () => {
    const build = (): number[][] => {
      const queue = new ScheduledTickQueue();
      scheduleHopperTransfer(queue, 1, 0, 0, 0);
      scheduleHopperTransfer(queue, 2, 0, 0, 0);
      return dueHopperTransfers(queue, HOPPER_TRANSFER_COOLDOWN_TICKS).map((t) => [
        t.x,
        t.y,
        t.z,
      ]);
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

describe('hopperStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = hopperStateProperties('down', true);
    expect(Object.keys(props).sort()).toEqual(['enabled', 'facing']);
    expect(props).toEqual({ facing: 'down', enabled: true });
    for (const [name, value] of Object.entries(props)) {
      expect(HOPPER_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
