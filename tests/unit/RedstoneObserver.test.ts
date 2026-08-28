import { describe, expect, it } from 'vitest';
import {
  BlockId,
  OBSERVER_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import { DIRECTIONS, offsetInDirection, OPPOSITE_DIRECTION, MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH } from '../../src/simulation/RedstoneSignal';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import {
  OBSERVER_PULSE_START_DELAY_TICKS,
  OBSERVER_PULSE_DURATION_TICKS,
  observedNeighborPosition,
  emissionNeighborPosition,
  scheduleObserverPulseStart,
  dueObserverPulseStarts,
  scheduleObserverPulseEnd,
  dueObserverPulseEnds,
  observerSignalStrength,
  observerStateProperties,
} from '../../src/simulation/RedstoneObserver';

describe('observer registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with OBSERVER_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.Observer);
    expect(def.key).toBe('observer');
    expect(blockRegistry.getPropertySchema(BlockId.Observer)).toBe(OBSERVER_SCHEMA);
    expect(def.defaultState).toEqual({ facing: 'north', powered: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Observer);
    expect(item.key).toBe('observer');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:observer');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 12 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Observer);
    expect(states.length).toBe(12); // 6 facings x 2 powered

    const defaultState = stateRegistry.getDefaultState(BlockId.Observer);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('facing')).toBe('north');
    expect(defaultState.getProperty('powered')).toBe('false');
  });
});

describe('observed and emission neighbour positions', () => {
  it('derive from offsetInDirection/OPPOSITE_DIRECTION for every facing, and are never equal', () => {
    for (const facing of DIRECTIONS) {
      const observed = observedNeighborPosition(5, 10, -3, facing);
      const emitted = emissionNeighborPosition(5, 10, -3, facing);
      expect(observed).toEqual(offsetInDirection(5, 10, -3, facing));
      expect(emitted).toEqual(offsetInDirection(5, 10, -3, OPPOSITE_DIRECTION[facing]));
      expect(observed).not.toEqual(emitted);
    }
  });
});

describe('pulse-start scheduling', () => {
  it('is not due before its delay elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleObserverPulseStart(queue, 1, 2, 3, 0);
    expect(dueObserverPulseStarts(queue, OBSERVER_PULSE_START_DELAY_TICKS - 1)).toEqual([]);
  });

  it('fires at its delay tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleObserverPulseStart(queue, 1, 2, 3, 0);
    const due = dueObserverPulseStarts(queue, OBSERVER_PULSE_START_DELAY_TICKS);
    expect(due.length).toBe(1);
    expect(due[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('orders same-tick pulse-starts deterministically and repeatably', () => {
    function run() {
      const queue = new ScheduledTickQueue();
      scheduleObserverPulseStart(queue, 0, 0, 0, 0);
      scheduleObserverPulseStart(queue, 9, 9, 9, 0);
      return dueObserverPulseStarts(queue, OBSERVER_PULSE_START_DELAY_TICKS).map((t) => `${t.x},${t.y},${t.z}`);
    }
    const first = run();
    expect(first).toEqual(['0,0,0', '9,9,9']);
    expect(run()).toEqual(first);
  });
});

describe('pulse-end scheduling', () => {
  it('is not due before its duration elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleObserverPulseEnd(queue, 1, 2, 3, 10);
    expect(dueObserverPulseEnds(queue, 10 + OBSERVER_PULSE_DURATION_TICKS - 1)).toEqual([]);
  });

  it('fires at its due tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleObserverPulseEnd(queue, 1, 2, 3, 10);
    const due = dueObserverPulseEnds(queue, 10 + OBSERVER_PULSE_DURATION_TICKS);
    expect(due.length).toBe(1);
    expect(due[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });
});

describe('observerSignalStrength', () => {
  it('reads full signal while powered', () => {
    expect(observerSignalStrength(true)).toBe(MAX_SIGNAL_STRENGTH);
  });

  it('reads no signal while unpowered', () => {
    expect(observerSignalStrength(false)).toBe(MIN_SIGNAL_STRENGTH);
  });
});

describe('observerStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = observerStateProperties('up', true);
    expect(Object.keys(props).sort()).toEqual(['facing', 'powered']);
    expect(props).toEqual({ facing: 'up', powered: true });
    for (const [name, value] of Object.entries(props)) {
      expect(OBSERVER_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
