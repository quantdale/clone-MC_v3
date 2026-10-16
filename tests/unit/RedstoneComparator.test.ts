import { describe, expect, it } from 'vitest';
import {
  BlockId,
  COMPARATOR_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import { MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH } from '../../src/simulation/RedstoneSignal';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import {
  COMPARATOR_UPDATE_DELAY_TICKS,
  cycleComparatorMode,
  resolveComparatorOutput,
  comparatorIsPowered,
  scheduleComparatorUpdate,
  dueComparatorUpdates,
  comparatorStateProperties,
} from '../../src/simulation/RedstoneComparator';

describe('comparator registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with COMPARATOR_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.RedstoneComparator);
    expect(def.key).toBe('redstone_comparator');
    expect(blockRegistry.getPropertySchema(BlockId.RedstoneComparator)).toBe(COMPARATOR_SCHEMA);
    expect(def.defaultState).toEqual({ facing: 'north', mode: 'compare', powered: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.RedstoneComparator);
    expect(item.key).toBe('redstone_comparator');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:redstone_comparator');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 16 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.RedstoneComparator);
    expect(states.length).toBe(16); // 4 facings x 2 modes x 2 powered

    const defaultState = stateRegistry.getDefaultState(BlockId.RedstoneComparator);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('facing')).toBe('north');
    expect(defaultState.getProperty('mode')).toBe('compare');
    expect(defaultState.getProperty('powered')).toBe('false');
  });
});

describe('cycleComparatorMode', () => {
  it('toggles both ways and returns to the original after two calls', () => {
    expect(cycleComparatorMode('compare')).toBe('subtract');
    expect(cycleComparatorMode('subtract')).toBe('compare');
    expect(cycleComparatorMode(cycleComparatorMode('compare'))).toBe('compare');
  });
});

describe('resolveComparatorOutput — compare mode', () => {
  it('passes through when the front input is above the side input', () => {
    expect(resolveComparatorOutput('compare', 10, 4)).toBe(10);
  });

  it('passes through at the exact equal boundary', () => {
    expect(resolveComparatorOutput('compare', 7, 7)).toBe(7);
  });

  it('yields zero when the front input is below the side input', () => {
    expect(resolveComparatorOutput('compare', 3, 5)).toBe(MIN_SIGNAL_STRENGTH);
  });
});

describe('resolveComparatorOutput — subtract mode', () => {
  it('passes through a positive difference', () => {
    expect(resolveComparatorOutput('subtract', 10, 4)).toBe(6);
  });

  it('floors a negative difference at zero', () => {
    expect(resolveComparatorOutput('subtract', 3, 8)).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('returns zero for an equal front and side input', () => {
    expect(resolveComparatorOutput('subtract', 5, 5)).toBe(MIN_SIGNAL_STRENGTH);
  });
});

describe('resolveComparatorOutput — input clamping', () => {
  it('clamps an out-of-range front input before comparing', () => {
    expect(resolveComparatorOutput('compare', 99, 4)).toBe(MAX_SIGNAL_STRENGTH);
  });

  it('clamps an out-of-range side input before subtracting', () => {
    expect(resolveComparatorOutput('subtract', 10, -5)).toBe(10);
  });

  it('clamps a non-finite input to the minimum', () => {
    expect(resolveComparatorOutput('subtract', Number.NaN, 0)).toBe(MIN_SIGNAL_STRENGTH);
    expect(resolveComparatorOutput('compare', 5, Number.NaN)).toBe(5);
  });
});

describe('comparatorIsPowered', () => {
  it('reads unpowered at zero', () => {
    expect(comparatorIsPowered(MIN_SIGNAL_STRENGTH)).toBe(false);
  });

  it('reads powered above zero', () => {
    expect(comparatorIsPowered(1)).toBe(true);
    expect(comparatorIsPowered(MAX_SIGNAL_STRENGTH)).toBe(true);
  });
});

describe('output scheduling', () => {
  it('is not due before its delay elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleComparatorUpdate(queue, 1, 2, 3, 0);
    expect(dueComparatorUpdates(queue, COMPARATOR_UPDATE_DELAY_TICKS - 1)).toEqual([]);
  });

  it('fires at its delay tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleComparatorUpdate(queue, 1, 2, 3, 0);
    const due = dueComparatorUpdates(queue, COMPARATOR_UPDATE_DELAY_TICKS);
    expect(due.length).toBe(1);
    expect(due[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('orders same-tick updates deterministically and repeatably', () => {
    function run() {
      const queue = new ScheduledTickQueue();
      scheduleComparatorUpdate(queue, 0, 0, 0, 0);
      scheduleComparatorUpdate(queue, 9, 9, 9, 0);
      return dueComparatorUpdates(queue, COMPARATOR_UPDATE_DELAY_TICKS).map((t) => `${t.x},${t.y},${t.z}`);
    }
    const first = run();
    expect(first).toEqual(['0,0,0', '9,9,9']);
    expect(run()).toEqual(first);
  });
});

describe('comparatorStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = comparatorStateProperties('west', 'subtract', true);
    expect(Object.keys(props).sort()).toEqual(['facing', 'mode', 'powered']);
    expect(props).toEqual({ facing: 'west', mode: 'subtract', powered: true });
    for (const [name, value] of Object.entries(props)) {
      expect(COMPARATOR_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
