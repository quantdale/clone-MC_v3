import { describe, expect, it } from 'vitest';
import {
  BlockId,
  LAMP_SCHEMA,
  OPEN_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import {
  LAMP_OFF_DELAY_TICKS,
  lampShouldBeLit,
  scheduleLampOff,
  dueLampOffs,
  doorShouldBeOpen,
  trapdoorShouldBeOpen,
  lampStateProperties,
  doorStateProperties,
  trapdoorStateProperties,
} from '../../src/simulation/RedstoneConsumers';

describe('lamp registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with LAMP_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.RedstoneLamp);
    expect(def.key).toBe('redstone_lamp');
    expect(blockRegistry.getPropertySchema(BlockId.RedstoneLamp)).toBe(LAMP_SCHEMA);
    expect(def.defaultState).toEqual({ lit: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.RedstoneLamp);
    expect(item.key).toBe('redstone_lamp');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:redstone_lamp');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 2 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.RedstoneLamp);
    expect(states.length).toBe(2);
    const defaultState = stateRegistry.getDefaultState(BlockId.RedstoneLamp);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('lit')).toBe('false');
  });
});

describe('door registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with OPEN_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.Door);
    expect(def.key).toBe('door');
    expect(blockRegistry.getPropertySchema(BlockId.Door)).toBe(OPEN_SCHEMA);
    expect(def.defaultState).toEqual({ open: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Door);
    expect(item.key).toBe('door');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:door');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 2 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Door);
    expect(states.length).toBe(2);
    const defaultState = stateRegistry.getDefaultState(BlockId.Door);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('open')).toBe('false');
  });
});

describe('trapdoor registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with the same shared OPEN_SCHEMA instance and its default', () => {
    const def = blockRegistry.get(BlockId.Trapdoor);
    expect(def.key).toBe('trapdoor');
    expect(blockRegistry.getPropertySchema(BlockId.Trapdoor)).toBe(OPEN_SCHEMA);
    expect(blockRegistry.getPropertySchema(BlockId.Trapdoor)).toBe(blockRegistry.getPropertySchema(BlockId.Door));
    expect(def.defaultState).toEqual({ open: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Trapdoor);
    expect(item.key).toBe('trapdoor');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:trapdoor');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 2 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Trapdoor);
    expect(states.length).toBe(2);
    const defaultState = stateRegistry.getDefaultState(BlockId.Trapdoor);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('open')).toBe('false');
  });
});

describe('consumer predicates mirror the powered input', () => {
  it('return true when powered', () => {
    expect(lampShouldBeLit(true)).toBe(true);
    expect(doorShouldBeOpen(true)).toBe(true);
    expect(trapdoorShouldBeOpen(true)).toBe(true);
  });

  it('return false when unpowered', () => {
    expect(lampShouldBeLit(false)).toBe(false);
    expect(doorShouldBeOpen(false)).toBe(false);
    expect(trapdoorShouldBeOpen(false)).toBe(false);
  });
});

describe('lamp off-recheck scheduling', () => {
  it('is not due before its delay elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleLampOff(queue, 1, 2, 3, 0);
    expect(dueLampOffs(queue, LAMP_OFF_DELAY_TICKS - 1)).toEqual([]);
  });

  it('fires at its delay tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleLampOff(queue, 1, 2, 3, 0);
    const due = dueLampOffs(queue, LAMP_OFF_DELAY_TICKS);
    expect(due.length).toBe(1);
    expect(due[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('orders same-tick off-rechecks deterministically and repeatably', () => {
    function run() {
      const queue = new ScheduledTickQueue();
      scheduleLampOff(queue, 0, 0, 0, 0);
      scheduleLampOff(queue, 9, 9, 9, 0);
      return dueLampOffs(queue, LAMP_OFF_DELAY_TICKS).map((t) => `${t.x},${t.y},${t.z}`);
    }
    const first = run();
    expect(first).toEqual(['0,0,0', '9,9,9']);
    expect(run()).toEqual(first);
  });
});

describe('state projections', () => {
  it('lampStateProperties matches its schema', () => {
    const props = lampStateProperties(true);
    expect(props).toEqual({ lit: true });
    expect(LAMP_SCHEMA.legalValues('lit')).toContain(String(props.lit));
  });

  it('doorStateProperties matches its schema', () => {
    const props = doorStateProperties(true);
    expect(props).toEqual({ open: true });
    expect(OPEN_SCHEMA.legalValues('open')).toContain(String(props.open));
  });

  it('trapdoorStateProperties matches its schema', () => {
    const props = trapdoorStateProperties(false);
    expect(props).toEqual({ open: false });
    expect(OPEN_SCHEMA.legalValues('open')).toContain(String(props.open));
  });
});
